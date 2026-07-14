-- Fonction d'introspection pour scripts/verify-prod.mjs
-- Appelée en service_role depuis le script Node — aucun usage frontend.
-- Permet de vérifier les invariants de sécurité après chaque déploiement SQL.

CREATE OR REPLACE FUNCTION verify_security_invariants()
RETURNS TABLE(invariant TEXT, ok BOOLEAN, detail TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    'block direct writes (planning_data)' AS invariant,
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'planning_data'
        AND policyname = 'block direct writes'
        AND permissive = 'RESTRICTIVE'
    ) AS ok,
    COALESCE(
      (SELECT permissive || ' · cmd=' || cmd || ' · with_check=' || COALESCE(with_check::text,'null')
       FROM pg_policies
       WHERE schemaname='public' AND tablename='planning_data' AND policyname='block direct writes'),
      'POLICY ABSENTE'
    ) AS detail

  UNION ALL
  SELECT
    'fonction check_rate_limit',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='check_rate_limit'),
    NULL

  UNION ALL
  SELECT
    'fonction get_calendar_feed_access',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='get_calendar_feed_access'),
    NULL

  UNION ALL
  SELECT
    'calendar_sync_tokens.token = NULL partout',
    NOT EXISTS (SELECT 1 FROM calendar_sync_tokens WHERE token IS NOT NULL),
    NULL
$$;
GRANT EXECUTE ON FUNCTION verify_security_invariants() TO authenticated;
