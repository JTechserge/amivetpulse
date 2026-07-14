-- Phase 7 Lot 1 — Verrouillage des écritures directes sur planning_data
--
-- Contexte : planning_data est un singleton JSON. Depuis Phase 6, n'importe quel
-- compte authentifié pouvait PATCH la ligne entière directement via l'API REST.
-- Solution retenue : toutes les écritures passent désormais par l'Edge Function
-- save-planning, qui vérifie les droits côté serveur et écrit en service_role.
--
-- À VALIDER AVANT EXÉCUTION.
-- Dépend de : save-planning Edge Function déployée ET de la migration 20260713000001.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Impact :
--  - Lecture : inchangée (la policy "auth read planning_data" est conservée)
--  - Écriture authenticated directe (PATCH REST) : bloquée silencieusement
--    (PostgreSQL filtre la ligne via RLS → 0 lignes modifiées → HTTP 204,
--     mais la donnée n'est PAS écrite — comportement vérifié en prod le 14/07/2026)
--  - Écriture via save-planning (service_role) : autorisée (service_role bypass RLS)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Supprimer les policies d'écriture authenticated (INSERT + UPDATE).
-- La policy de lecture "auth read planning_data" est intentionnellement conservée :
-- le front lit encore planning_data directement via REST pour syncFromSupabase().
DROP POLICY IF EXISTS "auth update planning_data" ON planning_data;
DROP POLICY IF EXISTS "auth insert planning_data" ON planning_data;

-- Filet de sécurité : supprimer aussi d'éventuels vestiges anon écriture.
DROP POLICY IF EXISTS "allow anon update" ON planning_data;
DROP POLICY IF EXISTS "allow anon write" ON planning_data;

-- 2. Policy RESTRICTIVE explicite (belt-and-suspenders).
-- Bloque INSERT et UPDATE même si une future policy permissive était ajoutée par erreur.
-- USING (true) laisse le SELECT intact.
-- WITH CHECK (false) refuse tout INSERT et UPDATE pour authenticated.
-- service_role contourne toujours RLS → save-planning n'est pas affecté.
-- Note : CREATE POLICY ne supporte pas IF NOT EXISTS en PostgreSQL (aucune version).
-- On fait précéder d'un DROP pour rendre la migration idempotente.
DROP POLICY IF EXISTS "block direct writes" ON planning_data;
CREATE POLICY "block direct writes" ON planning_data
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION post-exécution :
--
-- 1. Lecture directe → HTTP 200 (inchangé)
--
-- 2. Test d'écriture directe depuis la console DevTools (connecté en tant qu'ASV) :
--    const session = JSON.parse(sessionStorage.getItem('amivet_auth_session'));
--    await fetch('.../planning_data?id=eq.singleton', {
--      method: 'PATCH', headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}`,
--      'Content-Type': 'application/json' }, body: JSON.stringify({ data: { MARQUEUR: true } })
--    });
--    const r = await fetch('.../planning_data?id=eq.singleton&select=data', { headers: ... });
--    console.log(!!( await r.json())[0]?.data?.MARQUEUR);  // doit afficher false
--
-- 3. Écriture via l'app (admin ou ASV selon droits) → sauvegarde sans erreur
-- ─────────────────────────────────────────────────────────────────────────────
