-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 4 — Mot de passe partagé : supprimer les six fonctions et leurs colonnes
--
-- ÉTAT CORRIGÉ. L'application s'ouvrait autrefois derrière un mot de passe
-- unique, partagé entre tous les collaborateurs, vérifié par six fonctions
-- SECURITY DEFINER toutes GRANT à `anon` (20240201000001_password_security.sql).
-- L'authentification est passée aux comptes Supabase individuels depuis, mais
-- les six fonctions sont restées en place, ouvertes à la clé publique :
--
--   · verify_gate_password(text)                  — oracle de mot de passe
--   · change_gate_password(text, text)            — écriture du hash partagé
--   · request_password_reset(text, timestamptz)   — pose un token choisi par
--                                                   l'appelant
--   · get_pending_password_reset()                — RENVOIE ce token à anon
--   · mark_password_reset_email_sent()
--   · complete_password_reset(text, text)         — remplace le mot de passe
--
-- La combinaison des deux dernières lignes est la plus lourde : `anon` pouvait
-- poser un token, se le faire relire, puis l'échanger contre un changement de
-- mot de passe, sans jamais connaître l'ancien. Ce chemin n'ouvre plus rien
-- puisque le mot de passe partagé n'est plus une porte d'entrée — mais une
-- fonction morte GRANT à anon reste une surface, et celle-ci écrit en base.
--
-- AUCUN APPELANT dans tout le dépôt (`src/`, `scripts/`, `.github/`,
-- `supabase/functions/`, `tests/`) : le script GitHub Actions qui envoyait les
-- e-mails de réinitialisation toutes les 5 minutes n'existe plus. Les six
-- fonctions sont donc SUPPRIMÉES, pas seulement révoquées — contrairement à
-- `verify_calendar_sync_token` au lot 2, qui est conservée fermée parce qu'un
-- DROP suivi d'un futur CREATE réattribuerait anon. Ici il n'y aura pas de
-- futur CREATE : la fonctionnalité est retirée, pas mise en sommeil.
--
-- COLONNES. Une fois les six fonctions parties, plus aucun chemin ne lit ni
-- n'écrit le hash : la table n'a plus de policy depuis 20260905000001 (lot 0),
-- et il n'y en a jamais eu en lecture. Les cinq colonnes deviennent des données
-- mortes — mais des données mortes SENSIBLES, que `scripts/backup-supabase.mjs`
-- exporte chaque nuit dans un fichier JSON conservé hors base. C'est la raison
-- de leur suppression : un hash salé d'un mot de passe abandonné n'a aucune
-- valeur pour l'application et en garde une pour qui lit une sauvegarde.
--
-- LA TABLE, ELLE, RESTE. `tests/unit/backup-restore-contract.test.js` exige que
-- toute table du schéma figure dans les deux scripts de sauvegarde ; la retirer
-- imposerait de toucher ce garde-fou, ce que ce lot ne fait pas. Elle survit
-- donc réduite à `id` et `updated_at`.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Les six fonctions ────────────────────────────────────────────────────
-- Les signatures sont nécessaires : DROP FUNCTION ne se contente pas du nom
-- lorsqu'une surcharge est possible. Les GRANT à anon disparaissent avec elles.

DROP FUNCTION IF EXISTS verify_gate_password(text);
DROP FUNCTION IF EXISTS change_gate_password(text, text);
DROP FUNCTION IF EXISTS request_password_reset(text, timestamptz);
DROP FUNCTION IF EXISTS get_pending_password_reset();
DROP FUNCTION IF EXISTS mark_password_reset_email_sent();
DROP FUNCTION IF EXISTS complete_password_reset(text, text);

-- ── 2. Les colonnes mortes de app_security ──────────────────────────────────
-- Ordre volontaire : les fonctions d'abord, les colonnes ensuite. L'inverse
-- ferait échouer chaque appel restant sur une colonne absente au lieu d'une
-- fonction absente — même résultat, message plus obscur.

ALTER TABLE app_security DROP COLUMN IF EXISTS password_hash;
ALTER TABLE app_security DROP COLUMN IF EXISTS password_salt;
ALTER TABLE app_security DROP COLUMN IF EXISTS reset_token;
ALTER TABLE app_security DROP COLUMN IF EXISTS reset_token_expires_at;
ALTER TABLE app_security DROP COLUMN IF EXISTS reset_email_pending;

-- ═════════════════════════════════════════════════════════════════════════════
-- CONSÉQUENCE SUR LES SAUVEGARDES — à connaître avant une restauration
--
--   Une sauvegarde prise AVANT cette migration contient, pour `app_security`,
--   des colonnes qui n'existent plus. `scripts/restore-supabase.mjs` la
--   signalera en rouge (« column does not exist ») et POURSUIVRA : l'erreur est
--   attrapée par table (restore-supabase.mjs:110-117), elle n'interrompt pas la
--   restauration des autres tables. Aucune donnée utile n'est perdue — la ligne
--   ne portait plus que le hash d'un mot de passe abandonné.
--
--   Si l'on veut une restauration propre depuis une sauvegarde ancienne :
--   supprimer `app_security.json` du dossier de sauvegarde avant de lancer le
--   script, il sera simplement ignoré (« fichier absent dans le backup »).
--
-- VÉRIFICATION — après application :
--
--   SELECT p.proname
--   FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE  n.nspname = 'public'
--     AND  p.proname IN ('verify_gate_password', 'change_gate_password',
--                        'request_password_reset', 'get_pending_password_reset',
--                        'mark_password_reset_email_sent', 'complete_password_reset');
--   -- ATTENDU : 0 ligne.
--
--   SELECT column_name FROM information_schema.columns
--   WHERE  table_schema = 'public' AND table_name = 'app_security'
--   ORDER  BY 1;
--   -- ATTENDU : exactement `id` et `updated_at`.
--
-- PUIS, dans l'application :
--   1. Se connecter avec un compte — l'écran de connexion ne passe plus par
--      verify_gate_password depuis le passage aux comptes individuels, il doit
--      fonctionner à l'identique.
--   2. ⚙️ → aucun écran ne propose plus de « changer le mot de passe partagé » ;
--      si un tel bouton apparaît quelque part, c'est du code mort à retirer.
-- ═════════════════════════════════════════════════════════════════════════════
