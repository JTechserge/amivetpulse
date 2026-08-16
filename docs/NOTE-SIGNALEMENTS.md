# Note de conception — Signalements (Phase 0)

Chantier : `docs/PROMPT-SIGNALEMENTS.md` · Méthode : skill CC · État : **en attente d'accord**

## 1. Le problème en une phrase

Quand un utilisateur rencontre un bug ou une gêne dans Amivet Pulse, il n'existe aucun canal dans l'application pour le dire, donc l'information se perd ou transite par oral.

## 2. État actuel — fichiers réellement concernés

| Fichier | Rôle dans le chantier |
|---|---|
| `supabase/migrations/20260713000001_tighten_rls.sql` | modèle de RLS durcie (`get_my_role()`), référence à imiter |
| `supabase/migrations/20240515000001_fix_rls_recursion.sql` | définit `get_my_role()` (`security definer`) |
| `src/announcements.js` (321 l.) | modèle de module contenu-utilisateur : fetch PostgREST, rendu `escapeHTML`, modale |
| `src/auth.js` | `supabaseHeaders()` — transmet bien le JWT utilisateur, donc `auth.uid()` est exploitable en RLS |
| `src/app.js` (1145 l.) | `effectiveRole()` l.299, `canAccessDashboard()` l.307, `canAccessSettings()` l.311, câblage des vues |
| `src/index.html` | `header-actions` l.62 — seul emplacement visible par **tous** les rôles |
| `src/dashboard.js` (962 l.) | sous-onglets `.sub-tab` l.101-112, où loger « Signalements » |
| `src/utils.js` | `escapeHTML()` l.10 |
| `public/sw.js` | `CACHE_VERSION = 'amivet-v5'` — seule notion de version existante |
| `scripts/` | 4 scripts Node existants ; accueillera `feedback-digest.mjs` |

Rien nommé `feedback` ou `signalement` n'existe dans `src/`, `supabase/`, `scripts/`, `tests/`. Chantier entièrement neuf.

## 3. Cinq corrections au cahier (à valider avant d'écrire une ligne)

**a. ~~Le bouton ne peut pas vivre dans le menu ⚙️.~~ — CORRIGÉ au lot 3 : le cahier avait raison.** `canAccessSettings()` (app.js:311) ne conditionne que les *sections* internes du menu (personnalisation, synchronisation, données, collaborateurs). Le bouton ⚙️ et le menu lui-même sont rendus pour **tous** les rôles (`initSettingsMenu`, settings.js:1463), aucune CSS ne les masque, et la partie basse — Notifications, Guide/FAQ, Mon compte, déconnexion — est déjà visible par une ASV. → Point d'entrée retenu : entrée « 🚩 Signaler un problème » dans la section **Aide** du menu ⚙️, sous le guide utilisateur, hors de tout garde-fou de rôle.

**b. « Réservé à l'admin » ne s'exprime pas avec `canAccessDashboard()`.** Cette garde s'appuie sur `effectiveRole()`, qui renvoie `vet` pour un associé : le tableau de bord est donc visible par les associés, pas seulement par Jérémie. Le sous-onglet Signalements doit se garder sur le **rôle réel** : `store.currentUser.role === 'admin'`. Effet de bord accepté : un admin passé en mode ASV perd la vue (le dashboard entier disparaît déjà dans ce mode) — cohérent.

**c. `clinic_id` sans table `clinics` ne prépare rien de vérifiable.** Aucune occurrence de `clinic_id` dans le dépôt, et aucun contexte de clinique dans `user_profiles`. La colonne est gardée (coût nul), mais **la RLS ne s'appuiera pas dessus** : sans clinique portée par le profil utilisateur, un prédicat `clinic_id` serait décoratif. À écrire noir sur blanc pour ne pas croire le portage VetPulse acquis.

**d. `app_version` n'existe pas.** `package.json` est figé à `1.0.0`, jamais incrémenté. Sans constante injectée au build (Vite `define`, ex. `__APP_VERSION__` = SHA court ou `CACHE_VERSION`), le champ vaudrait la même chose pour tout le monde et ne servirait à rien. → Injection Vite au lot 3, sinon on retire le champ.

**e. L'ordre des lots suppose une migration appliquée.** L'agent n'applique pas la migration (action manuelle Jérémie, cf. `docs/RUNBOOK-DEPLOIEMENT.md`). Le lot 3 code donc contre une table absente. → Jérémie applique la migration **entre le lot 2 et le lot 3**, sinon le lot 3 ne se valide qu'en unitaire.

## 4. Schéma visé — présenté, non appliqué

```sql
CREATE TABLE feedback (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    TEXT        NOT NULL DEFAULT 'amivet',   -- prêt multi-tenant, hors RLS (cf. 3.c)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reported_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL,
  screen       TEXT,                    -- vue + sous-onglet courants
  app_version  TEXT,
  user_agent   TEXT,
  message      TEXT        NOT NULL CHECK (length(message) BETWEEN 5 AND 2000),
  severity     TEXT        NOT NULL DEFAULT 'normal'
               CHECK (severity IN ('bloquant','normal','confort')),
  status       TEXT        NOT NULL DEFAULT 'nouveau'
               CHECK (status IN ('nouveau','en_cours','corrige','rejete','decision_humaine')),
  admin_note   TEXT,
  resolved_at  TIMESTAMPTZ
);
```

**RLS — conception neuve, l'inverse d'`announcements`.** Le piège : le front écrit en PostgREST direct avec le JWT utilisateur. Sans `WITH CHECK`, n'importe qui poste un signalement au nom d'un autre, ou s'auto-attribue `status='corrige'`. C'est exactement ce que `announcements` ne contraint pas — donc **rien n'est réutilisé ici**.

```sql
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- INSERT : chacun pour soi, et seulement à l'état neuf
CREATE POLICY "own insert feedback" ON feedback FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid()
              AND status = 'nouveau'
              AND admin_note IS NULL
              AND resolved_at IS NULL);

-- SELECT : le sien, ou tout si admin
CREATE POLICY "own select feedback"   ON feedback FOR SELECT TO authenticated
  USING (reported_by = auth.uid());
CREATE POLICY "admin select feedback" ON feedback FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

-- UPDATE / DELETE : admin seul (aucun UPDATE utilisateur)
CREATE POLICY "admin update feedback" ON feedback FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "admin delete feedback" ON feedback FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');
```

Tests d'isolation exigés au lot 2 : un utilisateur ne lit jamais le signalement d'un autre ; un utilisateur ne peut ni forger `reported_by`, ni poser `status='corrige'`, ni écrire `admin_note`.

## 5. Invariants touchés

**Aucun invariant heures/paie n'est touché** — vérifié : `asv-hours-contract.test.js` porte sur `src/lib/asv-hours.js` ↔ `supabase/functions/_shared/asv-hours.ts`, que ce chantier n'ouvre pas. Le chantier n'écrit que du code neuf, plus un sous-onglet dans `src/dashboard.js` (fichier qui rend aussi les récapitulatifs d'heures → régression indirecte possible, couverte par le TNR).

Invariants **réellement** engagés : lint `--max-warnings=0` avec `no-unsanitized` (le message est du texte utilisateur libre → `escapeHTML` obligatoire, `white-space:pre-wrap`, jamais d'`innerHTML` non échappé) ; policies RLS (nouvelle table, à documenter dans `docs/SECURITE.md`).

## 6. Ce qui change pour l'utilisateur

Tous les rôles : un bouton dans l'en-tête ouvre une modale « message + sévérité », envoie, confirme par un toast. Trois champs à remplir au maximum, le reste est capturé. Admin : un sous-onglet « 🚩 Signalements » dans le tableau de bord, filtrable par statut, avec changement de statut et note.

## 7. Ce qui ne sera PAS fait

Pas de capture d'écran. Pas de pièce jointe. Pas de fil de discussion ni de réponse à l'auteur. Pas de notification push ni d'email à la soumission. Pas de RLS multi-tenant réelle (cf. 3.c). Pas d'auto-application ni d'auto-déploiement d'un correctif. Pas de purge automatique des vieux signalements.

## 8. Risques

| Risque | Nature | Traitement |
|---|---|---|
| Un signalement lisible par un autre utilisateur | fuite de données | RLS §4 + tests d'isolation au lot 2, bloquants |
| XSS via le champ `message` | sécurité | `escapeHTML` systématique + lint `no-unsanitized` |
| Un correctif « automatique » casse un calcul de paie | **erreur de paie** | jamais d'application auto ; liste noire de fichiers intouchables (lot 5) |
| Run Claude quotidien qui dérive sans supervision | coût / intégrité du dépôt | worktree dédié, jamais `main`, jamais de push, `--allowedTools` restreint |
| Contexte capturé = donnée personnelle (rôle, UA, horodatage) | RGPD | mention dans `docs/SECURITE.md` + durée de conservation à fixer |

## 9. Question ouverte n°1 — arbitrage Jérémie

**(a) Automatisation complète** (correctif poussé en prod sans relecture) contredit trois invariants du dépôt : commits locaux uniquement, jamais de `git push` par l'agent, enjeu de paie. **(b) Automatisation encadrée** : collecte + triage + branche préparée, Jérémie relit et pousse.

→ **Recommandation : (b).** Le gain de (a) est de quelques minutes par jour ; le coût d'un seul faux positif sur un calcul d'heures est une erreur de paie réelle dans une clinique en production. À trancher par Jérémie ; le choix est consigné ici.

## 10. Question ouverte n°2 — faisabilité du run headless

Établi :

- `claude` v2.1.214 présent à `/Users/jeremie/.local/bin/claude` — **absent du PATH du plist TNR** (`/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:…`) : à corriger dans le plist du nouveau job.
- **Pas de `~/.claude/.credentials.json`** ni d'`ANTHROPIC_API_KEY` dans l'environnement → l'authentification vit vraisemblablement dans le Trousseau macOS. **C'est le point de fragilité n°1** : un job launchd n'accède au trousseau que dans une session utilisateur ouverte et déverrouillée.
- Le commentaire du plist TNR évoque « la tâche Claude de 8h00 » : **elle n'existe pas** (aucun plist, pas de crontab). Il n'y a donc **aucun précédent** de run Claude planifié sur cette machine — l'analogie du cahier avec le TNR ne tient pas.

Non établi : le run headless réel. Le sandbox bash de cette session n'a pas de réseau, le spike ne peut pas y tourner. **Le spike est la première chose à faire après accord**, hors sandbox : `claude -p` minimal lisant un signalement factice et écrivant un fichier de triage, lancé via `launchctl kickstart` pour reproduire le contexte réel — pas depuis un terminal, où le trousseau est trivialement disponible et le test ne prouverait rien.

→ **Recommandation : ne pas conditionner le chantier au headless.** Les lots 1-4 ont une valeur propre. Le lot 5 se scinde : **5a** `scripts/feedback-digest.mjs` (déterministe, sans risque, planifiable comme le TNR) ; **5b** triage Claude, headless si le spike passe, sinon semi-automatique (Jérémie colle le digest dans une session le matin).

## 11. Définition de « terminé »

TNR vert (référence : 344 unitaires / 12 fichiers + 30 Playwright, plus les tests neufs) · migration `feedback` + tests d'isolation présentés · bouton de soumission tous rôles fonctionnel · sous-onglet admin fonctionnel et invisible pour les non-admins · digest quotidien générant un fichier réel depuis la table · `docs/SECURITE.md` (RLS + données personnelles) et `docs/EXPLOITATION.md` (procédure + garde-fous) à jour · commits locaux, rien qui traîne · passation FS écrite.

**Actions manuelles restant à Jérémie :** exécuter la migration dans le SQL Editor Supabase (entre lots 2 et 3) · installer le plist du digest · décider chaque jour quelles branches pousser · fixer la durée de conservation des signalements.
