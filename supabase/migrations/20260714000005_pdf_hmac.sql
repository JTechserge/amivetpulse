-- Colonne pour le HMAC-SHA256 du PDF signé.
-- Calculé par upload-signed-pdf avec PDF_SIGNING_SECRET (secret Edge Function).
-- Permet à l'admin de vérifier qu'un PDF n'a pas été altéré après signature.
ALTER TABLE monthly_signatures
  ADD COLUMN IF NOT EXISTS pdf_hmac TEXT;
