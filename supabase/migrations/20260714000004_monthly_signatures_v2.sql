-- Phase PDF — monthly_signatures v2 + bucket Storage signed-sheets
--
-- Changements :
--   1. Nouvelles colonnes : id (uuid PK), status, pdf_path, rejected_at, rejected_by
--   2. Nouvelle PK : id uuid autonome (remplace (person_id, year, month))
--      → conserve l'historique complet : feuilles rejetées + re-signatures
--   3. Index unique partiel : une seule feuille 'signed' active par (person_id, year, month)
--   4. RLS resserrée : plus d'insert/delete direct — tout passe par service_role (Edge Function)
--   5. Bucket Storage privé signed-sheets

-- =========================================================
-- 1. Nouvelles colonnes
-- =========================================================
ALTER TABLE monthly_signatures
  ADD COLUMN IF NOT EXISTS id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS status       text        NOT NULL DEFAULT 'signed',
  ADD COLUMN IF NOT EXISTS pdf_path     text,
  ADD COLUMN IF NOT EXISTS rejected_at  timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by  uuid        REFERENCES auth.users(id);

-- =========================================================
-- 2. Remplacer la PK composite (person_id, year, month) par id uuid
-- =========================================================
ALTER TABLE monthly_signatures DROP CONSTRAINT IF EXISTS monthly_signatures_pkey;
ALTER TABLE monthly_signatures ADD PRIMARY KEY (id);

-- =========================================================
-- 3. Index unique partiel : une seule feuille 'signed' par ASV+mois
--    Les feuilles 'rejected' ne sont pas contraintes → historique complet
-- =========================================================
DROP INDEX IF EXISTS monthly_signatures_active_unique;
CREATE UNIQUE INDEX monthly_signatures_active_unique
  ON monthly_signatures (person_id, year, month)
  WHERE status = 'signed';

-- =========================================================
-- 4. Contrainte de statut
-- =========================================================
ALTER TABLE monthly_signatures
  DROP CONSTRAINT IF EXISTS monthly_signatures_status_check;
ALTER TABLE monthly_signatures
  ADD CONSTRAINT monthly_signatures_status_check
  CHECK (status IN ('signed', 'rejected'));

-- =========================================================
-- 5. RLS resserrée
--    - SELECT : tout utilisateur authentifié (vet/admin/asv)
--    - INSERT / UPDATE : service_role uniquement (Edge Function confirm-signature + reject)
--      → service_role bypasse RLS, donc aucune policy explicite n'est nécessaire
--    - DELETE : interdit (les feuilles sont conservées en soft-delete status='rejected')
-- =========================================================
DROP POLICY IF EXISTS "allow anon read"                         ON monthly_signatures;
DROP POLICY IF EXISTS "authenticated insert monthly_signatures" ON monthly_signatures;
DROP POLICY IF EXISTS "authenticated delete monthly_signatures" ON monthly_signatures;

CREATE POLICY "authenticated read monthly_signatures"
  ON monthly_signatures FOR SELECT
  TO authenticated
  USING (true);

-- Aucune policy INSERT, UPDATE, DELETE pour les clients → writes réservés au service_role

-- =========================================================
-- 6. Bucket Storage privé : signed-sheets
--    Fichiers : PDF des feuilles de présence signées
--    Chemin   : {person_id}/{year}-{month_0indexed:02d}-{signature_id}.pdf
--    Limite   : 5 Mo par fichier (amplement suffisant pour un PDF A4 une page)
-- =========================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signed-sheets',
  'signed-sheets',
  false,
  5242880,                   -- 5 Mo
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture : vétérinaires et admins uniquement
-- (les ASV ne voient pas l'archive — voir Lot 6 / dashboard)
DROP POLICY IF EXISTS "vet and admin can read signed sheets" ON storage.objects;
CREATE POLICY "vet and admin can read signed sheets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'signed-sheets'
    AND (auth.jwt() ->> 'role') IN ('vet', 'admin')
  );

-- Aucune policy INSERT/UPDATE/DELETE pour les clients
-- → seul service_role (Edge Function) peut uploader les PDF
