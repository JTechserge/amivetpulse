-- ============================================================
-- PURGE DONNÉES DE PROD — base saine, profils conservés
-- À exécuter dans Supabase SQL Editor (projet ubowqtowyqmpraoxbaoo)
-- ============================================================

-- 1. Réinitialise tous les créneaux de présence/absence/congés
--    (singleton row conservée, JSON remis à vide)
UPDATE planning_data
SET data = '{}'::jsonb, updated_at = NOW()
WHERE id = 'singleton';

-- 2. Supprime toutes les signatures de feuilles de présence
DELETE FROM monthly_signatures;

-- 3. Supprime tous les entretiens annuels
DELETE FROM annual_interviews;

-- 4. Supprime les tokens de signature (usage unique, périmés)
DELETE FROM signature_tokens;

-- 5. Vide les modules RH (nouveaux, peuvent contenir des données de test)
DELETE FROM cp_adjustments;
DELETE FROM medical_visits;
DELETE FROM announcements; -- cascade → supprime aussi announcement_reads

-- ============================================================
-- CONSERVÉ : user_profiles, email_settings, calendar_sync_tokens
-- ============================================================

-- Vérification finale
SELECT 'planning_data'   AS table_name, (data = '{}'::jsonb)::text AS vide FROM planning_data
UNION ALL
SELECT 'monthly_signatures',   COUNT(*)::text FROM monthly_signatures
UNION ALL
SELECT 'annual_interviews',    COUNT(*)::text FROM annual_interviews
UNION ALL
SELECT 'signature_tokens',     COUNT(*)::text FROM signature_tokens
UNION ALL
SELECT 'cp_adjustments',       COUNT(*)::text FROM cp_adjustments
UNION ALL
SELECT 'medical_visits',       COUNT(*)::text FROM medical_visits
UNION ALL
SELECT 'announcements',        COUNT(*)::text FROM announcements
UNION ALL
SELECT 'announcement_reads',   COUNT(*)::text FROM announcement_reads
UNION ALL
SELECT 'user_profiles',        COUNT(*)::text FROM user_profiles;
