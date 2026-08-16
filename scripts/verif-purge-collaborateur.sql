-- Contrôle d'effet de la suppression définitive d'un collaborateur.
-- À exécuter dans Supabase → SQL Editor → New query → Run.
--
-- POURQUOI CE SCRIPT EXISTE
-- Le test de contrat (tests/unit/collaborator-purge-contract.test.js) prouve que
-- le CODE demande les 9 suppressions. Il ne prouve pas que Supabase les EXÉCUTE :
-- une policy RLS restrictive ou une contrainte peut refuser une ligne. Il n'existe
-- pas de compte de test Supabase (CLAUDE.md), donc aucun test automatisé ne peut
-- établir la preuve d'effet. C'est ce script qui la donne, à la main, en prod.
--
-- MODE D'EMPLOI
--   1. Renseigner les deux identifiants ci-dessous.
--   2. Exécuter le bloc A AVANT la suppression, et garder le résultat.
--   3. Supprimer le collaborateur depuis l'interface (Réglages → 💣).
--   4. Réexécuter le bloc A. Toutes les lignes doivent être à 0.
--   5. Exécuter le bloc B : les annonces doivent avoir survécu, anonymisées.
--
-- Le bloc A avant suppression sert à prouver qu'il y avait quelque chose à
-- supprimer. Un « 0 partout » sur une ligne vierge ne démontre rien.

-- ---------------------------------------------------------------------------
-- Identifiants de la personne contrôlée — À RENSEIGNER
-- ---------------------------------------------------------------------------
-- person_id : la clé métier (ex. 'test-veto'), celle du roster et des plannings.
-- user_id   : l'UUID du compte auth. Le retrouver avec :
--     SELECT id, person_id, role, display_name FROM user_profiles;

-- ===========================================================================
-- BLOC A — empreinte de la personne, table par table
-- Avant purge : au moins une ligne non nulle attendue.
-- Après purge : TOUT doit être à 0.
-- ===========================================================================
WITH params AS (
  SELECT
    'REMPLACER-person-id'::text                            AS person_id,
    '00000000-0000-0000-0000-000000000000'::uuid           AS user_id
)
-- Les 9 tables de PURGE_TARGETS (supabase/functions/manage-users/index.ts).
-- L'ordre reproduit celui de la purge : du plus périphérique vers l'effectif.
SELECT 'push_subscriptions'  AS objet, count(*) AS lignes FROM push_subscriptions,  params WHERE user_name = params.person_id
UNION ALL
SELECT 'announcement_reads',  count(*) FROM announcement_reads,  params WHERE person_id = params.person_id
UNION ALL
SELECT 'medical_visits',      count(*) FROM medical_visits,      params WHERE person_id = params.person_id
UNION ALL
SELECT 'cp_adjustments',      count(*) FROM cp_adjustments,      params WHERE person_id = params.person_id
UNION ALL
SELECT 'forecast_signatures', count(*) FROM forecast_signatures, params WHERE person_id = params.person_id
UNION ALL
SELECT 'monthly_signatures',  count(*) FROM monthly_signatures,  params WHERE person_id = params.person_id
UNION ALL
SELECT 'signature_tokens',    count(*) FROM signature_tokens,    params WHERE person_id = params.person_id
UNION ALL
SELECT 'annual_interviews',   count(*) FROM annual_interviews,   params WHERE person_id = params.person_id
UNION ALL
SELECT 'calendar_sync_tokens (dont identifiants CalDAV)', count(*) FROM calendar_sync_tokens, params WHERE person_id = params.person_id
UNION ALL
-- Effectif : supprimé en DERNIER par la purge, et son échec est fatal.
SELECT 'vet_roster (effectif)', count(*) FROM vet_roster, params WHERE id = params.person_id
UNION ALL
-- Profil et compte auth. user_profiles est en ON DELETE CASCADE sur auth.users
-- (migration 20240401000001) : il part avec le compte, pas besoin d'autre contrôle.
SELECT 'user_profiles', count(*) FROM user_profiles, params WHERE id = params.user_id
UNION ALL
SELECT 'auth.users (compte)', count(*) FROM auth.users, params WHERE id = params.user_id
UNION ALL
-- feedback n'est pas dans PURGE_TARGETS : reported_by est en ON DELETE CASCADE
-- sur auth.users (migration 20260816000001). Vérifié ici parce qu'une cascade
-- qui ne se déclenche pas ne dit rien — elle ne lève aucune erreur.
SELECT 'feedback (par cascade auth)', count(*) FROM feedback, params WHERE reported_by = params.user_id
ORDER BY 1;

-- ===========================================================================
-- BLOC B — les annonces SURVIVENT à leur auteur, anonymisées
-- Décision du 16/08/2026 : une consigne de service reste utile à la clinique
-- après un départ. Seul l'auteur est anonymisé.
-- ===========================================================================
-- Attendu APRÈS purge :
--   - 0 ligne portant encore l'ancien person_id ;
--   - les annonces de la personne toujours présentes, author_id = 'ancien-collaborateur' ;
--   - l'interface les affiche signées « Ancien collaborateur » (src/announcements.js).
WITH params AS (
  SELECT 'REMPLACER-person-id'::text AS person_id
)
SELECT
  a.author_id,
  count(*) AS annonces,
  min(a.created_at) AS plus_ancienne,
  max(a.created_at) AS plus_recente
FROM announcements a, params
WHERE a.author_id = params.person_id       -- doit être vide après purge
   OR a.author_id = 'ancien-collaborateur' -- doit contenir les annonces reprises
GROUP BY a.author_id
ORDER BY 1;

-- ===========================================================================
-- BLOC C — filet : un person_id qui traînerait ailleurs dans le schéma
-- ===========================================================================
-- Liste toute colonne nommée person_id / user_name / author_id sur le schéma
-- public. Le test de contrat impose que chacune soit purgée ou exemptée par
-- écrit ; ce bloc sert à confirmer en base qu'aucune table nouvelle n'est
-- apparue depuis le dernier run vert.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('person_id', 'user_name', 'author_id')
ORDER BY table_name, column_name;
