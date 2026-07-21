-- Push CalDAV iCloud : stockage des identifiants par vétérinaire.
-- Les colonnes sont ajoutées à calendar_sync_tokens (déjà en place pour le flux ICS).
-- Le mot de passe d'application n'est JAMAIS renvoyé au frontend : seule la Edge Function
-- caldav-push y accède via service_role.

ALTER TABLE calendar_sync_tokens
  ADD COLUMN IF NOT EXISTS caldav_apple_id    text,
  ADD COLUMN IF NOT EXISTS caldav_app_password text,
  ADD COLUMN IF NOT EXISTS caldav_calendar_url text;

-- Sauvegarde des identifiants (appelée depuis le frontend, anon key + JWT).
-- Pas de vérification d'identité ici : le frontend transmet le person_id de l'utilisateur
-- connecté, cohérent avec le pattern des autres fonctions de ce module (generate, revoke…).
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
BEGIN
  INSERT INTO calendar_sync_tokens
    (person_id, caldav_apple_id, caldav_app_password, caldav_calendar_url, updated_at)
  VALUES
    (p_person_id, p_apple_id, p_app_password, p_calendar_url, now())
  ON CONFLICT (person_id) DO UPDATE
    SET caldav_apple_id    = EXCLUDED.caldav_apple_id,
        caldav_app_password = EXCLUDED.caldav_app_password,
        caldav_calendar_url = EXCLUDED.caldav_calendar_url,
        updated_at          = now();
END;
$$;
GRANT EXECUTE ON FUNCTION save_caldav_credentials(text, text, text, text) TO anon, authenticated;

-- Statut d'affichage (frontend) : ne retourne JAMAIS le mot de passe.
CREATE OR REPLACE FUNCTION get_caldav_status(p_person_id text)
RETURNS TABLE(apple_id text, calendar_url text, is_configured boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    caldav_apple_id,
    caldav_calendar_url,
    (caldav_apple_id IS NOT NULL
     AND caldav_app_password IS NOT NULL
     AND caldav_calendar_url IS NOT NULL)
  FROM calendar_sync_tokens
  WHERE person_id = p_person_id;
$$;
GRANT EXECUTE ON FUNCTION get_caldav_status(text) TO anon, authenticated;

-- Suppression des identifiants (désactivation du push).
CREATE OR REPLACE FUNCTION clear_caldav_credentials(p_person_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE calendar_sync_tokens
  SET caldav_apple_id     = NULL,
      caldav_app_password  = NULL,
      caldav_calendar_url  = NULL,
      updated_at           = now()
  WHERE person_id = p_person_id;
$$;
GRANT EXECUTE ON FUNCTION clear_caldav_credentials(text) TO anon, authenticated;

-- Lecture complète des identifiants (Edge Function uniquement, via service_role).
-- PAS de GRANT à anon/authenticated : le mot de passe ne doit jamais traverser le frontend.
CREATE OR REPLACE FUNCTION get_caldav_credentials(p_person_id text)
RETURNS TABLE(apple_id text, app_password text, calendar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT caldav_apple_id, caldav_app_password, caldav_calendar_url
  FROM calendar_sync_tokens
  WHERE person_id = p_person_id
    AND caldav_apple_id IS NOT NULL
    AND caldav_app_password IS NOT NULL
    AND caldav_calendar_url IS NOT NULL;
$$;
-- Aucun GRANT : accessible uniquement via service_role (Edge Functions).
