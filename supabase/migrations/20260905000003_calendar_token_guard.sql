-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 2 — Tokens de flux calendrier : dériver l'identité, fermer anon
--
-- ÉTAT CORRIGÉ. Quatre fonctions de GESTION du lien ICS étaient GRANT à `anon`
-- et faisaient confiance au p_person_id de l'appelant : la clé publique
-- suffisait à générer, révoquer ou reconfigurer le flux calendrier de n'importe
-- quel vétérinaire — donc à lire son planning sans compte.
--
-- MODÈLE RETENU (option C, décision du 05/09/2026) : propriétaire OU vet/admin.
-- Contrairement aux identifiants CalDAV du lot 1 — un secret personnel, réservé
-- à son titulaire — le lien ICS est un jeton de lecture d'un planning déjà
-- partagé entre les deux associés. Ce choix aligne les fonctions sur la policy
-- « owner or vet reads token » que calendar_sync_tokens porte déjà depuis
-- 20240515000001_fix_rls_recursion.sql:36-43 : la base et les fonctions disent
-- désormais la même chose.
--
-- DEUX FONCTIONS DE VÉRIFICATION, traitées différemment des quatre de gestion :
--
--   · verify_calendar_sync_token — AUCUN appelant dans tout le dépôt (src/,
--     supabase/functions/, scripts/, tests/). Fermée à anon ET authenticated :
--     du code mort ne doit pas garder de surface. La fonction est conservée
--     plutôt que supprimée — elle ne coûte rien fermée, et un DROP se
--     réattribuerait anon au prochain CREATE (cf. ALTER DEFAULT PRIVILEGES,
--     lot 1).
--
--   · get_calendar_feed_access — seule fonction légitimement appelée sans
--     session, par l'Edge Function calendar-feed (flux ICS public par jeton).
--     Elle passe malgré tout en service_role : calendar-feed détient déjà
--     SERVICE_ROLE_KEY (calendar-feed/index.ts:8) et s'en sert dix lignes plus
--     bas pour lire planning_data. La bascule est donc gratuite, et elle retire
--     la dernière fonction calendrier atteignable avec la clé publique.
--     ⚠ CETTE MIGRATION ET LE REDÉPLOIEMENT DE calendar-feed VONT ENSEMBLE :
--       appliquer l'une sans l'autre casse le flux ICS (403 → « Vérification
--       impossible », 502). Voir l'ordre d'application en fin de fichier.
--
-- Idempotent : CREATE OR REPLACE partout, aucun changement de signature ni de
-- type de retour. Rejouable sans effet de bord.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. generate_calendar_sync_token — propriétaire ou vet/admin
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_calendar_sync_token(p_person_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller TEXT := my_person_id();
  new_token TEXT;
BEGIN
  IF v_caller IS NULL
     OR (p_person_id IS DISTINCT FROM v_caller AND get_my_role() NOT IN ('admin', 'vet')) THEN
    RAISE EXCEPTION 'Lien calendrier : acces refuse.' USING ERRCODE = '42501';
  END IF;

  new_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO calendar_sync_tokens (person_id, token_hash, updated_at)
  VALUES (p_person_id, encode(digest(new_token, 'sha256'), 'hex'), NOW())
  ON CONFLICT (person_id) DO UPDATE
    SET previous_token_hash = calendar_sync_tokens.token_hash,
        token_hash          = encode(digest(new_token, 'sha256'), 'hex'),
        token               = NULL,
        updated_at          = NOW();
  RETURN new_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION generate_calendar_sync_token(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION generate_calendar_sync_token(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. revoke_calendar_sync_token — propriétaire ou vet/admin
--    Passe de LANGUAGE sql à plpgsql pour pouvoir refuser explicitement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION revoke_calendar_sync_token(p_person_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller TEXT := my_person_id();
BEGIN
  IF v_caller IS NULL
     OR (p_person_id IS DISTINCT FROM v_caller AND get_my_role() NOT IN ('admin', 'vet')) THEN
    RAISE EXCEPTION 'Lien calendrier : acces refuse.' USING ERRCODE = '42501';
  END IF;

  UPDATE calendar_sync_tokens
  SET previous_token_hash = token_hash,
      token_hash          = NULL,
      token               = NULL,
      previous_token      = NULL,
      updated_at          = NOW()
  WHERE person_id = p_person_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION revoke_calendar_sync_token(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION revoke_calendar_sync_token(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_calendar_sync_status — propriétaire ou vet/admin
--    Ne renvoie pas le jeton en clair (has_token booléen) : inchangé.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_calendar_sync_status(p_person_id TEXT)
RETURNS TABLE(has_token BOOLEAN, sync_presence BOOLEAN, sync_absences BOOLEAN, color TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller TEXT := my_person_id();
BEGIN
  IF v_caller IS NULL
     OR (p_person_id IS DISTINCT FROM v_caller AND get_my_role() NOT IN ('admin', 'vet')) THEN
    RAISE EXCEPTION 'Statut calendrier : acces refuse.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT t.token_hash IS NOT NULL, t.sync_presence, t.sync_absences, t.color
    FROM calendar_sync_tokens t
    WHERE t.person_id = p_person_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION get_calendar_sync_status(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_calendar_sync_status(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. update_calendar_sync_preferences — propriétaire ou vet/admin
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_calendar_sync_preferences(
  p_person_id     text,
  p_sync_presence boolean,
  p_sync_absences boolean,
  p_color         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller text := my_person_id();
BEGIN
  IF v_caller IS NULL
     OR (p_person_id IS DISTINCT FROM v_caller AND get_my_role() NOT IN ('admin', 'vet')) THEN
    RAISE EXCEPTION 'Preferences calendrier : acces refuse.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO calendar_sync_tokens (person_id, sync_presence, sync_absences, color, updated_at)
  VALUES (p_person_id, p_sync_presence, p_sync_absences, p_color, now())
  ON CONFLICT (person_id) DO UPDATE
    SET sync_presence = p_sync_presence,
        sync_absences = p_sync_absences,
        color         = p_color,
        updated_at    = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION update_calendar_sync_preferences(text, boolean, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION update_calendar_sync_preferences(text, boolean, boolean, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. verify_calendar_sync_token — code mort, fermée à tous
--    Corps inchangé (vérification de hash pure, aucun effet de bord). Si un
--    appelant réapparaît un jour, c'est le GRANT qu'il faudra rouvrir
--    explicitement — pas un oubli qui l'aura laissé ouvert.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION verify_calendar_sync_token(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. get_calendar_feed_access — service_role uniquement
--    Corps inchangé. Seul calendar-feed l'appelle, et elle passe en service_role
--    dans le même lot. service_role n'est pas soumis aux GRANT : aucun GRANT à
--    lui accorder ici, il suffit de retirer les autres.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION get_calendar_feed_access(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- ORDRE D'APPLICATION — la migration et le redéploiement vont ENSEMBLE.
--
--   1. Déployer d'abord calendar-feed (il bascule sur SERVICE_ROLE_KEY et
--      continue de fonctionner avec l'ancien GRANT anon encore en place) :
--        npx supabase functions deploy calendar-feed --project-ref ubowqtowyqmpraoxbaoo
--   2. Puis appliquer cette migration.
--
--   L'ordre inverse coupe le flux ICS entre les deux étapes (les téléphones
--   abonnés reçoivent « Vérification impossible », 502).
--
-- VÉRIFICATION — après application :
--
--   SELECT p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
--   FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE  n.nspname = 'public'
--     AND  p.proname IN ('generate_calendar_sync_token', 'revoke_calendar_sync_token',
--                        'get_calendar_sync_status', 'update_calendar_sync_preferences',
--                        'verify_calendar_sync_token', 'get_calendar_feed_access')
--   ORDER  BY 1;
--   -- ATTENDU : anon = false PARTOUT.
--   --           authenticated = true pour les 4 fonctions de gestion,
--   --           false pour verify_calendar_sync_token et get_calendar_feed_access.
--
-- PUIS, dans l'application :
--   1. ⚙️ → Synchronisation calendrier → générer son lien, changer la couleur,
--      révoquer → doit fonctionner
--   2. Même chose sur le bloc de l'autre vétérinaire → doit fonctionner aussi
--      (modèle C : vet/admin gère le lien ICS de ses associés)
--   3. Ouvrir un lien ICS déjà abonné dans un navigateur → le calendrier se
--      télécharge toujours (c'est ce que teste la bascule service_role)
--   4. Révoquer un lien puis le rouvrir → calendrier vide, pas une erreur
-- ═════════════════════════════════════════════════════════════════════════════
