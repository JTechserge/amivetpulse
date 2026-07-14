-- Fix fonctions calendar après migration token_hash (20260713000002)
-- get_calendar_feed_access cherchait token= (NULL partout) → 403 systématique
-- get_calendar_sync_status avait changé de type → settings.js cassé
-- generate_calendar_sync_token ne préservait pas previous_token_hash → stale cassé

-- 1. Colonne previous_token_hash pour le mécanisme "stale" (jeton révoqué/remplacé)
ALTER TABLE calendar_sync_tokens
  ADD COLUMN IF NOT EXISTS previous_token_hash TEXT;

-- 2. generate_calendar_sync_token : hash + préserver previous_token_hash
CREATE OR REPLACE FUNCTION generate_calendar_sync_token(p_person_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE new_token TEXT;
BEGIN
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
GRANT EXECUTE ON FUNCTION generate_calendar_sync_token(TEXT) TO anon, authenticated;

-- 3. revoke_calendar_sync_token : token_hash → previous_token_hash
CREATE OR REPLACE FUNCTION revoke_calendar_sync_token(p_person_id TEXT)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  UPDATE calendar_sync_tokens
  SET previous_token_hash = token_hash,
      token_hash          = NULL,
      token               = NULL,
      previous_token      = NULL,
      updated_at          = NOW()
  WHERE person_id = p_person_id;
$$;
GRANT EXECUTE ON FUNCTION revoke_calendar_sync_token(TEXT) TO anon, authenticated;

-- 4. get_calendar_feed_access : comparer les hashes SHA-256
CREATE OR REPLACE FUNCTION get_calendar_feed_access(p_person_id TEXT, p_token TEXT)
RETURNS TABLE(status TEXT, sync_presence BOOLEAN, sync_absences BOOLEAN, color TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT
    CASE WHEN token_hash = encode(digest(p_token, 'sha256'), 'hex') THEN 'active' ELSE 'stale' END,
    sync_presence, sync_absences, color
  FROM calendar_sync_tokens
  WHERE person_id = p_person_id
    AND (
      token_hash            = encode(digest(p_token, 'sha256'), 'hex')
      OR previous_token_hash = encode(digest(p_token, 'sha256'), 'hex')
    );
$$;
GRANT EXECUTE ON FUNCTION get_calendar_feed_access(TEXT, TEXT) TO anon, authenticated;

-- 5. get_calendar_sync_status : has_token boolean + préférences (sans le plain token)
-- DROP obligatoire car le type de retour change
DROP FUNCTION IF EXISTS get_calendar_sync_status(TEXT);
CREATE OR REPLACE FUNCTION get_calendar_sync_status(p_person_id TEXT)
RETURNS TABLE(has_token BOOLEAN, sync_presence BOOLEAN, sync_absences BOOLEAN, color TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT token_hash IS NOT NULL, sync_presence, sync_absences, color
  FROM calendar_sync_tokens WHERE person_id = p_person_id;
$$;
GRANT EXECUTE ON FUNCTION get_calendar_sync_status(TEXT) TO anon, authenticated;
