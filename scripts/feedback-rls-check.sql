-- ═══════════════════════════════════════════════════════════════════════════
-- Vérification COMPORTEMENTALE de la RLS de `feedback`.
--
-- À coller tel quel dans Supabase → SQL Editor → New query → Run.
-- Tout le bloc est encadré par BEGIN … ROLLBACK : rien n'est écrit en base,
-- même si un test échoue. Les lignes insérées pour l'essai disparaissent avec
-- la transaction.
--
-- Pourquoi ce fichier existe : verify_security_invariants() ne contrôle que la
-- FORME des politiques (introspection de pg_policies). Il ne prouve pas qu'un
-- utilisateur est réellement empêché de lire le signalement d'un collègue.
-- Seule une tentative sous l'identité d'un vrai compte le prouve, et c'est ce
-- que fait ce script.
--
-- Il choisit lui-même deux comptes existants (une ASV et l'admin) : aucun UUID
-- à substituer, aucun compte de test à créer.
--
-- Lecture du résultat : la table finale doit afficher `ok = true` sur les
-- HUIT lignes. Un seul `false` = fuite ou régression, à traiter avant tout
-- autre travail.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _fb_check (ordre INT, controle TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  u_asv     UUID;
  u_admin   UUID;
  id_autre  UUID;
  n         INT;
  touched   INT;
BEGIN
  -- ── Comptes réels ────────────────────────────────────────────────────────
  SELECT id INTO u_asv   FROM user_profiles WHERE role = 'asv'   LIMIT 1;
  SELECT id INTO u_admin FROM user_profiles WHERE role = 'admin' LIMIT 1;

  IF u_asv IS NULL OR u_admin IS NULL OR u_asv = u_admin THEN
    INSERT INTO _fb_check VALUES (0, 'prérequis : une ASV et un admin distincts', FALSE,
      'comptes introuvables — vérification impossible');
    RETURN;
  END IF;
  INSERT INTO _fb_check VALUES (0, 'prérequis : une ASV et un admin distincts', TRUE, NULL);

  -- Ligne appartenant à l'admin, posée en tant que propriétaire (hors RLS).
  -- Elle sert de cible aux tests de lecture et de modification croisées.
  INSERT INTO feedback (reported_by, role, message)
       VALUES (u_admin, 'admin', '[test RLS] ligne de l''admin')
    RETURNING id INTO id_autre;

  -- ── 1. Usurpation d'auteur ───────────────────────────────────────────────
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u_asv, 'role', 'authenticated')::text, TRUE);
    SET LOCAL ROLE authenticated;

    INSERT INTO feedback (reported_by, role, message)
         VALUES (u_admin, 'asv', '[test RLS] usurpation');

    RESET ROLE;
    INSERT INTO _fb_check VALUES (1, 'insertion au nom d''un autre', FALSE,
      'ACCEPTÉE — le WITH CHECK reported_by = auth.uid() ne protège pas');
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _fb_check VALUES (1, 'insertion au nom d''un autre', TRUE, 'refusée par la RLS');
    WHEN foreign_key_violation THEN
      RESET ROLE;
      INSERT INTO _fb_check VALUES (1, 'insertion au nom d''un autre', FALSE,
        'refus par clé étrangère, pas par la RLS — test non concluant');
  END;

  -- ── 2. Auto-classement en « corrigé » ────────────────────────────────────
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u_asv, 'role', 'authenticated')::text, TRUE);
    SET LOCAL ROLE authenticated;

    INSERT INTO feedback (reported_by, role, message, status)
         VALUES (u_asv, 'asv', '[test RLS] auto-classement', 'corrige');

    RESET ROLE;
    INSERT INTO _fb_check VALUES (2, 'naissance directe en « corrigé »', FALSE,
      'ACCEPTÉE — un signalement peut naître déjà soldé et échapper au digest');
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO _fb_check VALUES (2, 'naissance directe en « corrigé »', TRUE, 'refusée par la RLS');
  END;

  -- ── 3. Insertion légitime ────────────────────────────────────────────────
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u_asv, 'role', 'authenticated')::text, TRUE);
    SET LOCAL ROLE authenticated;

    INSERT INTO feedback (reported_by, role, message)
         VALUES (u_asv, 'asv', '[test RLS] signalement légitime');

    RESET ROLE;
    INSERT INTO _fb_check VALUES (3, 'insertion légitime par son auteur', TRUE, 'acceptée');
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO _fb_check VALUES (3, 'insertion légitime par son auteur', FALSE,
        'REFUSÉE (' || SQLSTATE || ') — la politique est trop stricte : ' || SQLERRM);
  END;

  -- ── 4. Lecture croisée ───────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_asv, 'role', 'authenticated')::text, TRUE);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM feedback WHERE reported_by <> u_asv;
  RESET ROLE;
  INSERT INTO _fb_check VALUES (4, 'lecture du signalement d''un collègue', n = 0,
    CASE WHEN n = 0 THEN 'aucune ligne étrangère visible'
         ELSE n || ' ligne(s) d''autrui visibles — FUITE' END);

  -- ── 5. Lecture de ses propres signalements ───────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_asv, 'role', 'authenticated')::text, TRUE);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM feedback WHERE reported_by = u_asv;
  RESET ROLE;
  INSERT INTO _fb_check VALUES (5, 'relecture de ses propres signalements', n >= 1,
    n || ' ligne(s) visible(s)');

  -- ── 6. Modification par l'auteur ─────────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_asv, 'role', 'authenticated')::text, TRUE);
  SET LOCAL ROLE authenticated;
  UPDATE feedback SET status = 'corrige' WHERE id = id_autre;
  GET DIAGNOSTICS touched = ROW_COUNT;
  RESET ROLE;
  INSERT INTO _fb_check VALUES (6, 'classement d''un signalement par un non-admin', touched = 0,
    CASE WHEN touched = 0 THEN 'aucune ligne modifiée'
         ELSE touched || ' ligne(s) modifiée(s) — FUITE' END);

  -- ── 7. L'admin voit tout ─────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role', 'authenticated')::text, TRUE);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM feedback;
  RESET ROLE;
  INSERT INTO _fb_check VALUES (7, 'lecture complète par l''admin', n >= 2,
    n || ' ligne(s) visible(s)');
END $$;

SELECT ordre, controle, ok, detail FROM _fb_check ORDER BY ordre;

-- Rien n'est conservé : les lignes « [test RLS] » disparaissent avec ce ROLLBACK.
ROLLBACK;
