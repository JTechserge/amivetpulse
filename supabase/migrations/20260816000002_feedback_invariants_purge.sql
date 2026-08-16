-- Signalements — vérification automatisée de la RLS + rétention 15 jours.
-- À exécuter dans Supabase → SQL Editor → New query → Run,
-- APRÈS 20260816000001_feedback.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rétention — 15 jours
--
-- Décision de Jérémie du 16/08/2026 : « garde les tickets de signalement
-- 15 jours ». La règle porte sur `created_at`, donc elle s'applique AUSSI aux
-- signalements non soldés : un problème signalé et jamais traité disparaîtra
-- au bout de 15 jours. C'est la lecture littérale de la consigne ; si ce n'est
-- pas l'intention, restreindre le DELETE aux statuts 'corrige' et 'rejete'.
--
-- Les sauvegardes quotidiennes (scripts/backup-supabase.mjs) incluent
-- `feedback` : l'historique n'est pas perdu pour autant, il sort seulement de
-- la base vive.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION purge_old_feedback(retention_days INT DEFAULT 15)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted INT;
BEGIN
  -- Un appel à 0 jour viderait la table entière : refuser plutôt qu'obéir.
  IF retention_days IS NULL OR retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days doit valoir au moins 1 (reçu : %)', retention_days;
  END IF;

  DELETE FROM feedback
   WHERE created_at < NOW() - make_interval(days => retention_days);

  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- Purge réservée au service_role : aucun utilisateur connecté, admin compris,
-- ne doit pouvoir effacer des signalements en masse depuis le front.
REVOKE ALL ON FUNCTION purge_old_feedback(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_old_feedback(INT) FROM anon;
REVOKE ALL ON FUNCTION purge_old_feedback(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_old_feedback(INT) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Invariants de sécurité — ajout des contrôles `feedback`
--
-- Reprend à l'identique les invariants de 20260714000003 et y ajoute cinq
-- contrôles sur feedback. Purement introspectif : lit pg_policies et pg_proc,
-- n'écrit rien, ne tente aucune insertion.
--
-- CE QUE ÇA COUVRE : la forme des politiques — présence, portée, absence de
-- politique inconditionnelle, WITH CHECK d'insertion lié à auth.uid().
-- CE QUE ÇA NE COUVRE PAS : la preuve qu'un utilisateur ne peut effectivement
-- pas lire le signalement d'un autre. Ça reste la check-list manuelle en fin
-- de 20260816000001_feedback.sql, qui exige deux comptes réels.
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- ── feedback ──────────────────────────────────────────────────────────────
  UNION ALL
  SELECT
    'feedback — RLS activée',
    COALESCE((SELECT relrowsecurity FROM pg_class
              WHERE oid = 'public.feedback'::regclass), FALSE),
    NULL

  UNION ALL
  SELECT
    'feedback — 5 politiques, toutes limitées à authenticated',
    (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='feedback') = 5
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='feedback'
         AND NOT (roles @> ARRAY['authenticated']::name[])
    ),
    (SELECT count(*)::text || ' politique(s) : ' || COALESCE(string_agg(policyname, ', '), '—')
       FROM pg_policies WHERE schemaname='public' AND tablename='feedback')

  UNION ALL
  SELECT
    'feedback — aucune politique inconditionnelle',
    NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='feedback'
         AND (btrim(COALESCE(qual,'')) = 'true' OR btrim(COALESCE(with_check,'')) = 'true')
    ),
    COALESCE(
      (SELECT string_agg(policyname, ', ') FROM pg_policies
        WHERE schemaname='public' AND tablename='feedback'
          AND (btrim(COALESCE(qual,'')) = 'true' OR btrim(COALESCE(with_check,'')) = 'true')),
      'aucune'
    )

  UNION ALL
  SELECT
    'feedback — insertion liée à auth.uid() et au statut nouveau',
    EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='feedback' AND cmd='INSERT'
         AND with_check LIKE '%auth.uid()%'
         AND with_check LIKE '%nouveau%'
    ),
    COALESCE(
      (SELECT with_check FROM pg_policies
        WHERE schemaname='public' AND tablename='feedback' AND cmd='INSERT'),
      'POLICY INSERT ABSENTE'
    )

  UNION ALL
  SELECT
    'feedback — purge réservée au service_role',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='purge_old_feedback')
    AND NOT has_function_privilege('authenticated', 'public.purge_old_feedback(int)', 'EXECUTE'),
    NULL
$$;
GRANT EXECUTE ON FUNCTION verify_security_invariants() TO authenticated;
