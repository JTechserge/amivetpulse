-- Complément migration 20260713000002 — parties manquantes seulement
-- Idempotent : sûr à rejouer même si certaines parties existent déjà.
-- À jouer après confirmation que token_hash = true et tokens = NULL (✅ vérifié).
-- La table rate_limit_log et la fonction check_rate_limit n'ont pas été créées
-- (timeout réseau sur la Partie 1). Les fonctions Partie 2 sont incluses en CREATE OR REPLACE.

-- ─── PARTIE 1 : Rate limiting (non exécutée) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         BIGSERIAL PRIMARY KEY,
  key        TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_key_time
  ON rate_limit_log (key, created_at);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key      TEXT,
  p_max      INT,
  p_window_s INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cnt INT;
BEGIN
  DELETE FROM rate_limit_log
  WHERE key = p_key AND created_at < NOW() - (p_window_s || ' seconds')::INTERVAL;

  SELECT COUNT(*) INTO cnt FROM rate_limit_log
  WHERE key = p_key AND created_at >= NOW() - (p_window_s || ' seconds')::INTERVAL;

  IF cnt >= p_max THEN RETURN FALSE; END IF;

  INSERT INTO rate_limit_log (key) VALUES (p_key);
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INT, INT) TO authenticated;

-- ─── PARTIE 2 : Fonctions token hash (CREATE OR REPLACE = idempotent) ────────

CREATE OR REPLACE FUNCTION generate_calendar_sync_token(p_person_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE new_token TEXT;
BEGIN
  new_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO calendar_sync_tokens (person_id, token_hash, updated_at)
  VALUES (p_person_id, encode(digest(new_token, 'sha256'), 'hex'), NOW())
  ON CONFLICT (person_id) DO UPDATE
    SET token_hash = encode(digest(new_token, 'sha256'), 'hex'),
        token      = NULL,
        updated_at = NOW();
  RETURN new_token;
END;
$$;
GRANT EXECUTE ON FUNCTION generate_calendar_sync_token(TEXT) TO anon, authenticated;

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
