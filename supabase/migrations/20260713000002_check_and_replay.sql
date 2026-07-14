-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 0 — Vérification : coller UNIQUEMENT ce bloc dans le SQL Editor.
-- Si tout affiche TRUE / OK, la migration est déjà passée → arrêter ici.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'rate_limit_log'
  )                                        AS "table rate_limit_log créée",

  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_rate_limit'
  )                                        AS "fonction check_rate_limit créée",

  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'calendar_sync_tokens'
      AND column_name  = 'token_hash'
  )                                        AS "colonne token_hash ajoutée",

  NOT EXISTS (
    SELECT 1 FROM calendar_sync_tokens WHERE token IS NOT NULL
  )                                        AS "tokens mis à NULL (liens invalidés)";
