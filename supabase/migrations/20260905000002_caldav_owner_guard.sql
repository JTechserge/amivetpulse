-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 1 — Chaîne CalDAV : dériver l'identité de auth.uid(), fermer anon
--
-- ÉTAT CORRIGÉ. 20260721000001_caldav_credentials.sql:12-13 assumait par écrit
-- l'absence de contrôle : « Pas de vérification d'identité ici : le frontend
-- transmet le person_id de l'utilisateur connecté ». Les trois fonctions étaient
-- GRANT à `anon` : la clé publique suffisait donc à écrire les identifiants
-- iCloud de n'importe quel vétérinaire, puis à faire émettre par l'infra
-- Supabase des requêtes authentifiées vers iCloud (Edge Function caldav-push).
--
-- MODÈLE RETENU (décision du 05/09/2026, option C) :
--   · écriture des identifiants (save, clear) → PROPRIÉTAIRE STRICT.
--     Le mot de passe d'application Apple est un secret personnel ; qu'un associé
--     puisse l'écraser est le cœur de la faille.
--   · lecture du statut (get_caldav_status) → propriétaire OU vet/admin.
--     Aligné sur la policy « owner or vet reads token » que calendar_sync_tokens
--     porte déjà depuis 20240515000001_fix_rls_recursion.sql:36-43. Ne renvoie
--     jamais le mot de passe (inchangé).
--
-- get_caldav_credentials n'est pas touchée : elle n'a aucun GRANT et reste
-- réservée au service_role (Edge Function). C'est déjà le bon état.
--
-- Idempotent : CREATE OR REPLACE partout, aucun changement de signature ni de
-- type de retour, donc aucun DROP FUNCTION nécessaire. Rejouable sans effet
-- de bord. CREATE OR REPLACE conserve les ACL : les REVOKE viennent après.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Helper — le person_id de l'appelant, dérivé du JWT et de lui seul.
-- Pendant de get_my_role() (20240515000001_fix_rls_recursion.sql:9-17), même
-- forme : SECURITY DEFINER + STABLE, pour être appelable depuis les policies
-- comme depuis les fonctions sans récursion RLS.
-- Retourne NULL si aucune session, ou si le profil n'a pas de person_id —
-- les appelants traitent NULL comme un refus, jamais comme un joker.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_person_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT person_id FROM user_profiles WHERE id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION my_person_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION my_person_id() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- save_caldav_credentials — propriétaire strict.
-- Le corps métier (INSERT … ON CONFLICT) est repris tel quel : ce lot ne change
-- que l'autorisation.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION save_caldav_credentials(
  p_person_id    text,
  p_apple_id     text,
  p_app_password text,
  p_calendar_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller text := my_person_id();
BEGIN
  -- NULL (pas de session, ou profil sans person_id) est un refus, pas un joker.
  IF v_caller IS NULL OR p_person_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Identifiants CalDAV : action reservee au proprietaire du compte.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO calendar_sync_tokens
    (person_id, caldav_apple_id, caldav_app_password, caldav_calendar_url, updated_at)
  VALUES
    (p_person_id, p_apple_id, p_app_password, p_calendar_url, now())
  ON CONFLICT (person_id) DO UPDATE
    SET caldav_apple_id     = EXCLUDED.caldav_apple_id,
        caldav_app_password = EXCLUDED.caldav_app_password,
        caldav_calendar_url = EXCLUDED.caldav_calendar_url,
        updated_at          = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION save_caldav_credentials(text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION save_caldav_credentials(text, text, text, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- clear_caldav_credentials — propriétaire strict.
-- Passe de LANGUAGE sql à plpgsql pour pouvoir refuser explicitement (RAISE).
-- Signature et type de retour inchangés : CREATE OR REPLACE suffit.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION clear_caldav_credentials(p_person_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller text := my_person_id();
BEGIN
  IF v_caller IS NULL OR p_person_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Identifiants CalDAV : action reservee au proprietaire du compte.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE calendar_sync_tokens
  SET caldav_apple_id     = NULL,
      caldav_app_password = NULL,
      caldav_calendar_url = NULL,
      updated_at          = now()
  WHERE person_id = p_person_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION clear_caldav_credentials(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION clear_caldav_credentials(text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- get_caldav_status — propriétaire OU vet/admin.
-- Ne renvoie toujours PAS le mot de passe : seulement l'Apple ID, l'URL du
-- calendrier et le booléen de configuration. Un refus lève, il ne renvoie pas
-- silencieusement zéro ligne — sinon « pas configuré » et « pas le droit »
-- deviendraient indiscernables côté écran.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_caldav_status(p_person_id text)
RETURNS TABLE(apple_id text, calendar_url text, is_configured boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller text := my_person_id();
BEGIN
  IF v_caller IS NULL
     OR (p_person_id IS DISTINCT FROM v_caller AND get_my_role() NOT IN ('admin', 'vet')) THEN
    RAISE EXCEPTION 'Statut CalDAV : acces refuse.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      t.caldav_apple_id,
      t.caldav_calendar_url,
      (t.caldav_apple_id        IS NOT NULL
       AND t.caldav_app_password IS NOT NULL
       AND t.caldav_calendar_url IS NOT NULL)
    FROM calendar_sync_tokens t
    WHERE t.person_id = p_person_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION get_caldav_status(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_caldav_status(text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Fermeture par défaut du schéma public.
-- Supabase accorde EXECUTE à anon sur les nouvelles fonctions de `public`.
-- CREATE OR REPLACE conserve les ACL, mais tout DROP + CREATE ultérieur
-- réattribuerait anon SANS que personne ne le voie. Cette ligne coupe la source
-- du problème plutôt que ses symptômes.
-- Ne rétroagit PAS sur les fonctions existantes : les REVOKE ci-dessus et ceux
-- des lots 2 et 4 restent nécessaires.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;


-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION — à passer immédiatement après, dans le même SQL Editor.
--
--   SELECT p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
--   FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE  n.nspname = 'public'
--     AND  p.proname IN ('save_caldav_credentials', 'get_caldav_status',
--                        'clear_caldav_credentials', 'my_person_id')
--   ORDER  BY 1;
--   -- ATTENDU : anon = false partout, authenticated = true partout.
--
-- PRÉALABLE BLOQUANT — à passer AVANT cette migration :
--   SELECT id, role, person_id FROM user_profiles ORDER BY role, person_id NULLS FIRST;
--   -- Un person_id NULL sur un compte vet ou admin signifie que ce compte sera
--   -- enfermé DEHORS de son propre écran de synchro. Corriger d'abord.
--
-- PUIS, dans l'application :
--   1. ⚙️ → Synchronisation calendrier → son propre bloc : activer, puis
--      désactiver le push iCloud → doit fonctionner
--   2. Le bloc CalDAV de l'AUTRE vétérinaire : statut lisible, aucun bouton
--      d'écriture (cf. src/settings.js, même lot)
--   3. Enregistrer un planning → la synchro CalDAV part toujours
--      (save-planning → caldav-push, service_role, inchangé par ce lot)
-- ═════════════════════════════════════════════════════════════════════════════
