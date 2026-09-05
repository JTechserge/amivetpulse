-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 0 — Fermer toutes les policies RLS atteignables par `anon`
--
-- POURQUOI CE FICHIER EXISTE ALORS QUE 20260713000001_tighten_rls_idempotent
-- FAIT DÉJÀ PRESQUE LA MÊME CHOSE :
--
--   1. L'idempotent de juillet couvre 8 tables. Il en manque DEUX :
--      `planning_data` (traitée par 20260714000001_lock_planning_writes) et
--      `calendar_sync_tokens` (traitée par 20240401000001_auth_user_profiles).
--      Aucun fichier unique ne garantit aujourd'hui l'état « zéro policy anon ».
--
--   2. docs/SECURITE.md marque 20260713000001 « déployé — À REJOUER » : il a été
--      corrigé après coup pour un `IF NOT EXISTS` invalide. Une migration qui a
--      planté en route laisse les DROP suivants non exécutés. On ne sait donc pas
--      quelles policies anon survivent réellement en production — c'est ce que
--      mesure la requête A1 du constat.
--
--   3. Les migrations sont appliquées à la main dans le SQL Editor
--      (supabase/migrations/README.md). Un enchaînement de deux fichiers dans le
--      bon ordre est plus fragile qu'un fichier unique auto-suffisant.
--
-- Ce fichier est donc DÉLIBÉRÉMENT redondant avec l'idempotent de juillet : il
-- rejoue son contenu et le complète, pour qu'UN SEUL passage suffise à garantir
-- l'état final, quel que soit l'état de départ.
--
-- Entièrement idempotent : DROP POLICY IF EXISTS avant chaque CREATE POLICY
-- (PostgreSQL ne supporte CREATE POLICY IF NOT EXISTS dans aucune version).
-- Rejouable autant de fois que nécessaire, sans effet de bord.
--
-- 27 policies « allow anon … » ont été créées entre janvier et juillet 2024 sur
-- 10 tables. Une policy créée SANS clause `TO` s'applique à PUBLIC, donc à anon :
-- c'est le cas des 27. Elles sont toutes supprimées ci-dessous, et chaque table
-- conserve un chemin de lecture pour les comptes authentifiés.
--
-- HORS PÉRIMÈTRE : les GRANT EXECUTE sur les fonctions (lots 1, 2 et 4).
-- Ce fichier ne touche qu'aux policies de tables.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. app_security — aucune policy, par conception
--    La table ne doit être atteignable que par les fonctions SECURITY DEFINER.
--    Aucune policy de remplacement : c'est volontaire (cf. 20260713000001:13-18).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon update" ON app_security;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. planning_data — lecture authentifiée, écriture bloquée (service_role seul)
--    Complète 20260714000001_lock_planning_writes, qui ne supprimait pas
--    "allow anon read" (créée en 20240101000001:21).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON planning_data;
DROP POLICY IF EXISTS "allow anon update" ON planning_data;
DROP POLICY IF EXISTS "allow anon write"  ON planning_data;

DROP POLICY IF EXISTS "auth read planning_data" ON planning_data;
CREATE POLICY "auth read planning_data" ON planning_data
  FOR SELECT USING (auth.role() = 'authenticated');

-- Policy RESTRICTIVE : bloque INSERT/UPDATE même si une policy permissive était
-- ajoutée par erreur plus tard. service_role contourne RLS → save-planning intact.
DROP POLICY IF EXISTS "block direct writes" ON planning_data;
CREATE POLICY "block direct writes" ON planning_data
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (true) WITH CHECK (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. calendar_sync_tokens — lecture propriétaire ou vet/admin
--    Les écritures passent par des fonctions SECURITY DEFINER (lots 1 et 2) :
--    aucune policy d'écriture n'est nécessaire.
--    Cette policy est la référence du modèle C retenu pour les RPC.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon insert" ON calendar_sync_tokens;
DROP POLICY IF EXISTS "allow anon update" ON calendar_sync_tokens;
DROP POLICY IF EXISTS "allow anon read"   ON calendar_sync_tokens;

DROP POLICY IF EXISTS "owner or vet reads token" ON calendar_sync_tokens;
CREATE POLICY "owner or vet reads token" ON calendar_sync_tokens
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      person_id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
      OR get_my_role() IN ('admin', 'vet')
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. monthly_signatures — insertion réservée au propriétaire (preuve juridique)
--    "vet admin delete signatures" (20240515) est conservée telle quelle.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON monthly_signatures;
DROP POLICY IF EXISTS "allow anon insert" ON monthly_signatures;
DROP POLICY IF EXISTS "allow anon delete" ON monthly_signatures;
DROP POLICY IF EXISTS "authenticated insert monthly_signatures" ON monthly_signatures;
DROP POLICY IF EXISTS "authenticated delete monthly_signatures" ON monthly_signatures;

DROP POLICY IF EXISTS "auth read signatures" ON monthly_signatures;
CREATE POLICY "auth read signatures" ON monthly_signatures
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "owner insert signature" ON monthly_signatures;
CREATE POLICY "owner insert signature" ON monthly_signatures
  FOR INSERT TO authenticated WITH CHECK (
    person_id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. email_settings — écriture réservée à l'admin
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON email_settings;
DROP POLICY IF EXISTS "allow anon update" ON email_settings;
DROP POLICY IF EXISTS "auth insert email_settings" ON email_settings;
DROP POLICY IF EXISTS "auth update email_settings" ON email_settings;

DROP POLICY IF EXISTS "auth read email_settings" ON email_settings;
CREATE POLICY "auth read email_settings" ON email_settings
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admin insert email_settings" ON email_settings;
CREATE POLICY "admin insert email_settings" ON email_settings
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin update email_settings" ON email_settings;
CREATE POLICY "admin update email_settings" ON email_settings
  FOR UPDATE USING (get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. cp_adjustments — écriture réservée à l'admin
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON cp_adjustments;
DROP POLICY IF EXISTS "allow anon write"  ON cp_adjustments;
DROP POLICY IF EXISTS "allow anon update" ON cp_adjustments;

DROP POLICY IF EXISTS "auth read cp_adjustments" ON cp_adjustments;
CREATE POLICY "auth read cp_adjustments" ON cp_adjustments
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admin insert cp_adjustments" ON cp_adjustments;
CREATE POLICY "admin insert cp_adjustments" ON cp_adjustments
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin update cp_adjustments" ON cp_adjustments;
CREATE POLICY "admin update cp_adjustments" ON cp_adjustments
  FOR UPDATE USING (get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. announcements — écriture réservée à l'admin
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON announcements;
DROP POLICY IF EXISTS "allow anon write"  ON announcements;
DROP POLICY IF EXISTS "allow anon update" ON announcements;
DROP POLICY IF EXISTS "allow anon delete" ON announcements;

DROP POLICY IF EXISTS "auth read announcements" ON announcements;
CREATE POLICY "auth read announcements" ON announcements
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admin insert announcements" ON announcements;
CREATE POLICY "admin insert announcements" ON announcements
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin update announcements" ON announcements;
CREATE POLICY "admin update announcements" ON announcements
  FOR UPDATE USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin delete announcements" ON announcements;
CREATE POLICY "admin delete announcements" ON announcements
  FOR DELETE USING (get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. announcement_reads — accusé de lecture posé pour soi uniquement
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"  ON announcement_reads;
DROP POLICY IF EXISTS "allow anon write" ON announcement_reads;

DROP POLICY IF EXISTS "auth read announcement_reads" ON announcement_reads;
CREATE POLICY "auth read announcement_reads" ON announcement_reads
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "owner insert read_receipt" ON announcement_reads;
CREATE POLICY "owner insert read_receipt" ON announcement_reads
  FOR INSERT TO authenticated WITH CHECK (
    person_id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. push_subscriptions — chaque compte ne gère que son propre abonnement
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON push_subscriptions;
DROP POLICY IF EXISTS "allow anon write"  ON push_subscriptions;
DROP POLICY IF EXISTS "allow anon update" ON push_subscriptions;
DROP POLICY IF EXISTS "allow anon delete" ON push_subscriptions;

DROP POLICY IF EXISTS "auth read push_subscriptions" ON push_subscriptions;
CREATE POLICY "auth read push_subscriptions" ON push_subscriptions
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "owner upsert push_subscription" ON push_subscriptions;
CREATE POLICY "owner upsert push_subscription" ON push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (
    user_name = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "owner update push_subscription" ON push_subscriptions;
CREATE POLICY "owner update push_subscription" ON push_subscriptions
  FOR UPDATE USING (
    user_name = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "owner delete push_subscription" ON push_subscriptions;
CREATE POLICY "owner delete push_subscription" ON push_subscriptions
  FOR DELETE USING (
    user_name = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. medical_visits — DONNÉES DE SANTÉ.
--     Lecture authentifiée, écriture réservée à admin/vet.
--     C'est la table dont l'exposition anon serait la plus grave du dépôt.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON medical_visits;
DROP POLICY IF EXISTS "allow anon write"  ON medical_visits;
DROP POLICY IF EXISTS "allow anon update" ON medical_visits;
DROP POLICY IF EXISTS "allow anon delete" ON medical_visits;

DROP POLICY IF EXISTS "auth read medical_visits" ON medical_visits;
CREATE POLICY "auth read medical_visits" ON medical_visits
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "vet admin insert medical_visits" ON medical_visits;
CREATE POLICY "vet admin insert medical_visits" ON medical_visits
  FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'vet'));

DROP POLICY IF EXISTS "vet admin update medical_visits" ON medical_visits;
CREATE POLICY "vet admin update medical_visits" ON medical_visits
  FOR UPDATE USING (get_my_role() IN ('admin', 'vet'));

DROP POLICY IF EXISTS "vet admin delete medical_visits" ON medical_visits;
CREATE POLICY "vet admin delete medical_visits" ON medical_visits
  FOR DELETE USING (get_my_role() IN ('admin', 'vet'));


-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION — à passer immédiatement après, dans le même SQL Editor.
--
--   SELECT tablename, policyname, roles::text, cmd
--   FROM   pg_policies
--   WHERE  schemaname = 'public' AND roles::text[] && ARRAY['anon', 'public']
--   ORDER  BY tablename, policyname;
--   -- ATTENDU : 0 ligne.
--
--   SELECT c.relname, c.relrowsecurity
--   FROM   pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE  n.nspname = 'public' AND c.relkind = 'r'
--   ORDER  BY c.relrowsecurity, c.relname;
--   -- ATTENDU : relrowsecurity = true partout. Un `false` signale une table nue,
--   --           que ce fichier ne corrige PAS (aucune policy ne s'applique si la
--   --           RLS est désactivée). Le signaler avant d'aller plus loin.
--
-- PUIS, dans l'application (aucun de ces gestes ne doit régresser) :
--   1. Connexion ASV → vue hebdomadaire → saisir un congé → vérifier la sauvegarde
--   2. Annonces → lecture + marquage lu
--   3. Visites médicales → lecture ; création par un vet
--   4. ⚙️ → Synchronisation calendrier → le lien se génère toujours
--   5. Notifications push → l'abonnement se pose et se retire
-- ═════════════════════════════════════════════════════════════════════════════
