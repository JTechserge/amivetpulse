-- Phase 6 Lot 3 — Resserrement des politiques RLS permissives
--
-- VALIDÉ AVANT EXÉCUTION : présenter à l'admin avant tout déploiement.
-- Chaque bloc DROPPING est identifié avec la migration d'origine.
--
-- Pré-requis : get_my_role() doit exister (20240515000001_fix_rls_recursion.sql).
--              user_profiles.person_id doit être renseigné pour chaque compte ASV.
--
-- Ordre d'exécution : cet ordre est sans importance (chaque bloc est indépendant).


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. app_security — supprimer l'update anon direct (dangereux)
--    La policy "allow anon update" créée dans 20240201 laisse n'importe qui
--    écrire directement dans la table via la clé anon (PATCH REST).
--    Les fonctions security definer (change_gate_password, complete_password_reset…)
--    tournent en tant que postgres → bypass RLS automatique → elles n'ont jamais
--    eu besoin de cette policy. On peut la supprimer sans casser le flux.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon update" ON app_security;

-- Seuls les appels internes aux Edge Functions (service_role) peuvent maintenant
-- écrire. Aucune policy SELECT non plus (la table est délibérément illisible en direct).


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. monthly_signatures — restreindre insert à son propre person_id
--    La migration 20240501 a créé deux policies dangereuses :
--    "authenticated insert monthly_signatures" WITH CHECK (true) → tout compte peut
--    signer à la place de n'importe qui.
--    "authenticated delete monthly_signatures" USING (true) → tout compte peut
--    supprimer la signature d'un collègue (faille juridique eIDAS).
--    La policy correcte de delete existe déjà en 20240515 (get_my_role vet/admin).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated insert monthly_signatures" ON monthly_signatures;
DROP POLICY IF EXISTS "authenticated delete monthly_signatures" ON monthly_signatures;
-- Recréer INSERT avec restriction sur le person_id propriétaire
DROP POLICY IF EXISTS "owner insert signature" ON monthly_signatures;
CREATE POLICY "owner insert signature" ON monthly_signatures
  FOR INSERT TO authenticated WITH CHECK (
    person_id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );
-- La politique "vet admin delete signatures" (20240515) est conservée telle quelle.


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. email_settings — restreindre l'écriture à l'admin
--    Actuellement (20240401) tout utilisateur authentifié peut modifier
--    l'adresse email d'envoi, le nom de la clinique, etc.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth insert email_settings" ON email_settings;
DROP POLICY IF EXISTS "auth update email_settings" ON email_settings;

CREATE POLICY "admin insert email_settings" ON email_settings
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "admin update email_settings" ON email_settings
  FOR UPDATE USING (get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. cp_adjustments — remplacer anon par auth + restreindre écriture à l'admin
--    Actuellement (20240601) ouvert à tous sans authentification.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON cp_adjustments;
DROP POLICY IF EXISTS "allow anon write"  ON cp_adjustments;
DROP POLICY IF EXISTS "allow anon update" ON cp_adjustments;

CREATE POLICY "auth read cp_adjustments" ON cp_adjustments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin insert cp_adjustments" ON cp_adjustments
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "admin update cp_adjustments" ON cp_adjustments
  FOR UPDATE USING (get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. announcements — remplacer anon par auth + restreindre écriture à l'admin
--    Actuellement (20240701) ouvert à tous sans authentification.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON announcements;
DROP POLICY IF EXISTS "allow anon write"  ON announcements;
DROP POLICY IF EXISTS "allow anon update" ON announcements;
DROP POLICY IF EXISTS "allow anon delete" ON announcements;

CREATE POLICY "auth read announcements" ON announcements
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin insert announcements" ON announcements
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "admin update announcements" ON announcements
  FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY "admin delete announcements" ON announcements
  FOR DELETE USING (get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. announcement_reads — remplacer anon par auth + restreindre insert à soi
--    Permet à chaque utilisateur de marquer ses propres lectures.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"  ON announcement_reads;
DROP POLICY IF EXISTS "allow anon write" ON announcement_reads;

CREATE POLICY "auth read announcement_reads" ON announcement_reads
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "owner insert read_receipt" ON announcement_reads
  FOR INSERT TO authenticated WITH CHECK (
    person_id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. push_subscriptions — remplacer anon par auth + restreindre à son propre user_name
--    user_name = person_id de l'abonné ; un compte ne peut gérer que son propre
--    abonnement push. Lecture générale pour les Edge Functions d'envoi.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON push_subscriptions;
DROP POLICY IF EXISTS "allow anon write"  ON push_subscriptions;
DROP POLICY IF EXISTS "allow anon update" ON push_subscriptions;
DROP POLICY IF EXISTS "allow anon delete" ON push_subscriptions;

CREATE POLICY "auth read push_subscriptions" ON push_subscriptions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "owner upsert push_subscription" ON push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (
    user_name = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "owner update push_subscription" ON push_subscriptions
  FOR UPDATE USING (
    user_name = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "owner delete push_subscription" ON push_subscriptions
  FOR DELETE USING (
    user_name = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. medical_visits — remplacer anon par auth + restreindre écriture à admin/vet
--    Données médicales confidentielles — ASV ne peut que lire.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow anon read"   ON medical_visits;
DROP POLICY IF EXISTS "allow anon write"  ON medical_visits;
DROP POLICY IF EXISTS "allow anon update" ON medical_visits;
DROP POLICY IF EXISTS "allow anon delete" ON medical_visits;

CREATE POLICY "auth read medical_visits" ON medical_visits
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "vet admin insert medical_visits" ON medical_visits
  FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'vet'));

CREATE POLICY "vet admin update medical_visits" ON medical_visits
  FOR UPDATE USING (get_my_role() IN ('admin', 'vet'));

CREATE POLICY "vet admin delete medical_visits" ON medical_visits
  FOR DELETE USING (get_my_role() IN ('admin', 'vet'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. planning_data — limitation documentée
--    La table est un singleton JSON (une seule ligne 'singleton'). La granularité
--    RLS par personne est impossible : toute restriction UPDATE bloquerait les ASV
--    qui ont besoin de sauvegarder leurs propres changements (congés, pointages).
--    État actuel (20240401) : auth.role() = 'authenticated' sur read + update — mieux
--    que l'anon initial, mais toujours non-granulaire. La vraie protection est :
--      a) l'authentification obligatoire (sans session = aucun accès)
--      b) la future validation côté Edge Function si un refactoring de table est lancé
--    Aucune modification dans ce lot.
-- ─────────────────────────────────────────────────────────────────────────────
-- (aucune requête — décision documentée volontairement)


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. calendar_sync_tokens — déjà protégé en 20240515 (get_my_role)
--     Aucune modification supplémentaire dans ce lot.
-- ─────────────────────────────────────────────────────────────────────────────
-- (aucune requête — déjà correct)


-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION post-exécution recommandée :
--   1. Dashboard → Gérer les collaborateurs → invite + connexion ASV test
--   2. Connexion ASV → vue hebdomadaire → saisir un congé → vérifier sauvegardé
--   3. Annonces → test lecture et marquage lu
--   4. ⚙️ → Synchronisation calendrier → vérifier que le lien se génère
--   5. Vérifier qu'un ASV ne peut PAS POST directement sur monthly_signatures
--      avec un person_id différent du sien (doit recevoir 401/403)
-- ─────────────────────────────────────────────────────────────────────────────
