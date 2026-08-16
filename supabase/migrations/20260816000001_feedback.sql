-- Module Signalements — remontée de problèmes par les utilisateurs
-- À exécuter dans Supabase → SQL Editor → New query → Run.
--
-- ⚠️ La RLS de cette table est l'INVERSE de celle d'`announcements` :
--    annonces  → l'admin écrit, tout le monde lit.
--    feedback  → chacun écrit la sienne, chacun relit les siennes, l'admin lit tout.
--    Rien n'est repris d'`announcements` : ses politiques n'ont aucun WITH CHECK,
--    ce qui ici permettrait de poster au nom d'un autre. Conception neuve.
--
-- Le front écrit en PostgREST direct avec le JWT de l'utilisateur
-- (cf. src/auth.js → supabaseHeaders). Toute contrainte doit donc vivre dans
-- la RLS : le client n'est pas de confiance.

CREATE TABLE IF NOT EXISTS feedback (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Prêt multi-tenant (portage VetPulse). Volontairement ABSENT de la RLS :
  -- tant que user_profiles ne porte pas de clinique, un prédicat sur cette
  -- colonne serait décoratif. Ne pas croire l'isolation inter-cliniques acquise.
  clinic_id    TEXT        NOT NULL DEFAULT 'amivet',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Auteur réel, imposé par la RLS (= auth.uid()). La suppression du compte
  -- efface ses signalements : ils n'ont aucune valeur probante, contrairement
  -- aux feuilles signées.
  reported_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Rôle RÉEL au moment du signalement (pas le mode d'affichage d'un admin
  -- qui consulte en ASV — cette information va dans `screen`).
  role         TEXT        NOT NULL CHECK (role IN ('admin','vet','vet_employe','asv')),

  screen       TEXT,                    -- vue + sous-onglet courants
  app_version  TEXT,
  user_agent   TEXT,

  message      TEXT        NOT NULL CHECK (length(btrim(message)) BETWEEN 5 AND 2000),

  severity     TEXT        NOT NULL DEFAULT 'normal'
               CHECK (severity IN ('bloquant','normal','confort')),

  status       TEXT        NOT NULL DEFAULT 'nouveau'
               CHECK (status IN ('nouveau','en_cours','corrige','rejete','decision_humaine')),

  admin_note   TEXT,
  resolved_at  TIMESTAMPTZ
);

-- Liste admin filtrée par statut, la plus récente d'abord.
CREATE INDEX IF NOT EXISTS feedback_status_created_idx ON feedback (status, created_at DESC);
-- Relecture de ses propres signalements.
CREATE INDEX IF NOT EXISTS feedback_reported_by_idx    ON feedback (reported_by);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- INSERT — chacun pour soi, et seulement à l'état neuf.
-- Sans ce WITH CHECK, un utilisateur pourrait forger `reported_by` (signaler au
-- nom d'un collègue) ou naître directement en 'corrige' avec une note d'admin.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own insert feedback" ON feedback;
CREATE POLICY "own insert feedback" ON feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    reported_by = auth.uid()
    AND status = 'nouveau'
    AND admin_note IS NULL
    AND resolved_at IS NULL
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT — deux politiques permissives, donc évaluées en OU :
-- l'auteur relit les siens, l'admin lit tout. Un ASV ne voit jamais le
-- signalement d'un autre ASV.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own select feedback" ON feedback;
CREATE POLICY "own select feedback" ON feedback
  FOR SELECT TO authenticated
  USING (reported_by = auth.uid());

DROP POLICY IF EXISTS "admin select feedback" ON feedback;
CREATE POLICY "admin select feedback" ON feedback
  FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE / DELETE — admin seul. Aucun UPDATE utilisateur : personne ne peut
-- classer son propre signalement en 'corrige'.
-- get_my_role() est `security definer` (20240515000001) : pas de récursion RLS.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin update feedback" ON feedback;
CREATE POLICY "admin update feedback" ON feedback
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin delete feedback" ON feedback;
CREATE POLICY "admin delete feedback" ON feedback
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION D'ISOLATION
--
-- Il n'existe pas de compte de test Supabase sur ce projet (cf. CLAUDE.md) :
-- aucun test automatisé ne peut prouver que Postgres applique bien ces
-- politiques. `tests/unit/feedback-rls.test.js` verrouille le TEXTE des
-- politiques contre un affaiblissement ; seul un essai sous une vraie identité
-- prouve leur EFFET.
--
-- ➜ Utiliser `scripts/feedback-rls-check.sql` : il fait tout ce qui suit
--   automatiquement, choisit les comptes lui-même et annule tout par ROLLBACK.
--
-- Le détail ci-dessous est conservé pour comprendre ce qui est vérifié, et
-- pour le cas où l'on voudrait rejouer une étape isolément avec ses propres
-- UUID (un ASV, un admin) :
--
--   -- 1. Les politiques sont bien en place et aucune n'est ouverte
--   SELECT policyname, cmd, qual, with_check
--     FROM pg_policies WHERE tablename = 'feedback';
--   -- attendu : 5 lignes, aucune avec qual = 'true' ni with_check = 'true'
--
--   -- 2. Un utilisateur ne peut pas signaler au nom d'un autre
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<UUID_ASV>","role":"authenticated"}';
--   INSERT INTO feedback (reported_by, role, message)
--     VALUES ('<UUID_ADMIN>', 'asv', 'tentative usurpation');
--   -- attendu : ERROR new row violates row-level security policy
--
--   -- 3. Un utilisateur ne peut pas se classer 'corrige'
--   INSERT INTO feedback (reported_by, role, message, status)
--     VALUES ('<UUID_ASV>', 'asv', 'tentative auto-classement', 'corrige');
--   -- attendu : ERROR new row violates row-level security policy
--
--   -- 4. Un insert légitime passe
--   INSERT INTO feedback (reported_by, role, message)
--     VALUES ('<UUID_ASV>', 'asv', 'le bouton semaine ne repond pas');
--   -- attendu : 1 ligne insérée
--
--   -- 5. L'ASV ne lit que le sien
--   SELECT count(*) FROM feedback;   -- attendu : ses signalements uniquement
--
--   -- 6. L'ASV ne peut rien modifier
--   UPDATE feedback SET status = 'corrige';   -- attendu : 0 ligne affectée
--
--   -- 7. L'admin lit tout et peut classer
--   SET LOCAL request.jwt.claims = '{"sub":"<UUID_ADMIN>","role":"authenticated"}';
--   SELECT count(*) FROM feedback;                        -- attendu : tout
--   UPDATE feedback SET status = 'en_cours' WHERE id = '<UUID_LIGNE>';  -- attendu : 1
--
-- Nettoyer ensuite les lignes de test.
-- ═════════════════════════════════════════════════════════════════════════════
