-- Phase 7 Lot 1 — Verrouillage des écritures directes sur planning_data
--
-- Contexte : planning_data est un singleton JSON. Depuis Phase 6, n'importe quel
-- compte authentifié pouvait PATCH la ligne entière directement via l'API REST.
-- Solution retenue : toutes les écritures passent désormais par l'Edge Function
-- save-planning, qui vérifie les droits côté serveur et écrit en service_role.
-- Cette migration retire les policies d'écriture authenticated.
--
-- À VALIDER AVANT EXÉCUTION.
-- Dépend de : save-planning Edge Function déployée ET de la migration 20260713000001.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Impact :
--  - Lecture : inchangée (la policy "auth read planning_data" est conservée)
--  - Écriture authenticated directe (PATCH REST) : bloquée → 403
--  - Écriture via save-planning (service_role) : autorisée (service_role bypass RLS)
-- ─────────────────────────────────────────────────────────────────────────────

-- Supprimer les policies d'écriture authenticated (INSERT + UPDATE).
-- La policy de lecture "auth read planning_data" est intentionnellement conservée :
-- le front lit encore planning_data directement via REST pour syncFromSupabase().
DROP POLICY IF EXISTS "auth update planning_data" ON planning_data;
DROP POLICY IF EXISTS "auth insert planning_data" ON planning_data;

-- Filet de sécurité : supprimer aussi d'éventuels vestiges anon écriture.
DROP POLICY IF EXISTS "allow anon update" ON planning_data;
DROP POLICY IF EXISTS "allow anon write" ON planning_data;

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION post-exécution recommandée (à faire en tant que compte ASV de test) :
--
-- 1. Lecture directe (doit fonctionner) :
--    GET /rest/v1/planning_data?id=eq.singleton&select=data  → HTTP 200
--
-- 2. Écriture directe (doit être bloquée) :
--    PATCH /rest/v1/planning_data?id=eq.singleton  avec Authorization: Bearer <token_asv>
--    → HTTP 403 "new row violates row-level security policy"
--
-- 3. Écriture via l'app (doit fonctionner) :
--    Modifier un slot dans le calendrier → sauvegarde sans erreur → données persistées
--    (la sauvegarde passe par save-planning qui écrit en service_role)
-- ─────────────────────────────────────────────────────────────────────────────
