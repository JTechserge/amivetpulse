-- Phase 6 Lot 5 — Rate limiting + hash des tokens calendar-feed
--
-- VALIDÉ AVANT EXÉCUTION : présenter à l'admin avant tout déploiement.
-- Dépend de l'extension pgcrypto (déjà activée en 20240201).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PARTIE 1 : Rate limiting des Edge Functions e-mail
-- Protège manage-users (invitations), request-signature (emails ASV)
-- et send-leave-recap contre les appels en boucle.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         BIGSERIAL PRIMARY KEY,
  key        TEXT        NOT NULL,  -- ex. 'invite:<ip>' ou 'signature:<person_id>'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour purger et compter rapidement par fenêtre de temps.
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_key_time ON rate_limit_log (key, created_at);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;
-- Les Edge Functions passent en service_role (bypass RLS) → aucune policy nécessaire.
-- Le tableau n'a pas besoin d'être accessible via la clé anon.

-- Fonction appelée par les Edge Functions avant chaque envoi d'email.
-- Retourne TRUE si sous le quota, FALSE si dépassé (et ne log pas).
-- Appels typiques :
--   check_rate_limit('invite:' || client_ip, 10, 3600)    → max 10 invitations/h par IP
--   check_rate_limit('signature:' || person_id, 20, 3600) → max 20 demandes/h par ASV
--   check_rate_limit('recap:' || person_id, 5, 3600)      → max 5 récaps/h par ASV
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key      TEXT,
  p_max      INT,
  p_window_s INT   -- fenêtre en secondes
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt INT;
BEGIN
  -- Nettoyer les entrées expirées pour cette clé (évite la croissance infinie).
  DELETE FROM rate_limit_log
  WHERE key = p_key AND created_at < NOW() - (p_window_s || ' seconds')::INTERVAL;

  SELECT COUNT(*) INTO cnt FROM rate_limit_log
  WHERE key = p_key AND created_at >= NOW() - (p_window_s || ' seconds')::INTERVAL;

  IF cnt >= p_max THEN
    RETURN FALSE;
  END IF;

  INSERT INTO rate_limit_log (key) VALUES (p_key);
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INT, INT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTIE 2 : Hash SHA-256 des tokens calendar-feed
--
-- Contexte : calendar_sync_tokens.token est stocké en clair (hex 48 cars).
-- Un dump de la table suffit à accéder aux plannings de tous les vétérinaires.
-- Solution : stocker le SHA-256 ; ne jamais écrire ni relire le plain token.
--
-- Impact UX : les tokens existants sont invalidés → les vétérinaires doivent
-- régénérer leur lien dans ⚙️ → Synchronisation calendrier → Générer mon lien.
-- À communiquer avant l'exécution.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ajouter la colonne hash (text pour stocker le hex du digest).
ALTER TABLE calendar_sync_tokens
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- 2. Backfill : hacher les tokens existants.
--    Les anciens tokens restent dans la colonne 'token' mais la vérification
--    passera désormais via token_hash — ce qui invalide les anciens liens
--    (le hash du plain token ne correspondra plus à rien en DB).
--    Note : on pourrait faire UPDATE ... SET token_hash = encode(digest(token,'sha256'),'hex')
--    pour migrer sans interruption, mais si 'token' est compromis, les hashes
--    recalculés le seraient aussi. On préfère invalider proprement.
UPDATE calendar_sync_tokens SET token = NULL, token_hash = NULL;

-- 3. Remplacer generate_calendar_sync_token :
--    - génère un token aléatoire (48 hex chars = 24 bytes de base)
--    - stocke UNIQUEMENT son sha256 en base
--    - retourne le plain token UNE SEULE FOIS à l'appelant
--      (settings.js construit le lien iCal immédiatement, ne le relit pas depuis la DB)
CREATE OR REPLACE FUNCTION generate_calendar_sync_token(p_person_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_token TEXT;
BEGIN
  new_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO calendar_sync_tokens (person_id, token_hash, updated_at)
  VALUES (p_person_id, encode(digest(new_token, 'sha256'), 'hex'), NOW())
  ON CONFLICT (person_id) DO UPDATE
    SET token_hash = encode(digest(new_token, 'sha256'), 'hex'),
        token      = NULL,  -- colonne legacy, toujours NULL désormais
        updated_at = NOW();
  RETURN new_token;
END;
$$;
GRANT EXECUTE ON FUNCTION generate_calendar_sync_token(TEXT) TO anon, authenticated;

-- 4. Remplacer verify_calendar_sync_token par une comparaison de hashes.
CREATE OR REPLACE FUNCTION verify_calendar_sync_token(p_person_id TEXT, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT token_hash = encode(digest(p_token, 'sha256'), 'hex')
  FROM calendar_sync_tokens
  WHERE person_id = p_person_id AND token_hash IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION verify_calendar_sync_token(TEXT, TEXT) TO anon, authenticated;

-- 5. get_calendar_sync_token_for_display n'a plus de sens : le plain token n'est
--    plus stocké. Remplacer par une fonction qui indique seulement si un lien est actif.
-- DROP requis : CREATE OR REPLACE ne peut pas changer le type de retour d'une fonction existante.
DROP FUNCTION IF EXISTS get_calendar_sync_status(TEXT);
CREATE OR REPLACE FUNCTION get_calendar_sync_status(p_person_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT token_hash IS NOT NULL FROM calendar_sync_tokens WHERE person_id = p_person_id;
$$;
GRANT EXECUTE ON FUNCTION get_calendar_sync_status(TEXT) TO anon, authenticated;

-- get_calendar_sync_token_for_display reste mais retourne NULL désormais
-- (les appels existants dans settings.js vérifient token != null pour afficher le lien —
-- ils ne pourront plus reconstruire l'URL pour les tokens déjà générés,
-- mais le flux "Générer mon lien" reste fonctionnel).


-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION post-exécution recommandée :
--   1. settings.js → ⚙️ → Synchronisation calendrier → révoquer + régénérer
--      → vérifier que le nouveau lien fonctionne dans Apple Calendrier
--   2. calendar-feed Edge Function → appel direct avec un token valide
--      → doit retourner un ICS
--   3. Vérifier que le token n'apparaît plus dans la colonne `token` (NULL)
--   4. Edge Functions manage-users / request-signature → tester le rate limit
-- ─────────────────────────────────────────────────────────────────────────────
