# Amivet Pulse (CalendrierAmivet)

PWA de planning et de suivi des heures pour **une** clinique vétérinaire — celle de Jérémie, **en production**. C'est le dépôt dont VetPulse (`~/Projets/VeterinairePulseRH`) est la version SaaS multi-cliniques. Les deux partagent un passé commun et divergent depuis le 03/08/2026.

## Stack

Vite 8 · JavaScript vanilla en modules ES (pas de framework) · vitest 4 · Playwright · eslint 10 (`eslint-plugin-no-unsanitized`) · Supabase (Postgres + Edge Functions Deno) · jspdf + html2canvas.

Déployée sur GitHub Pages via `.github/workflows/deploy.yml`, base path **`/amivetpulse/`**.

## Commandes

```
npm run lint            # eslint src/ scripts/ --max-warnings=0
npm run test:unit       # vitest (tests/unit/**)
npm test                # playwright test
npm run build           # vite build
./run-tnr.command       # TNR complet, écrit dans .tnr/latest.log
```

Les TNR des quatre projets tournent automatiquement à 7h45 (agent launchd `com.jeremie.tnr-daily`). Pour forcer un run : `echo "$(date)" > ~/Projets/.tnr-trigger`.

Référence sur run vert : **344 tests unitaires / 12 fichiers + 30 Playwright**. Une chute sous cette valeur sans commit qui l'explique est une régression en soi.

## Invariants non négociables

- **`tests/unit/asv-hours-contract.test.js` ne s'assouplit jamais.** Il vérifie que `src/lib/` et `supabase/functions/_shared/` restent d'accord. S'il casse, le front et l'Edge Function ont divergé, ce qui produirait des récapitulatifs email faux. **Enjeu de paie** : réaligner le code, jamais relâcher l'assertion.
- **Ne jamais réparer un test en affaiblissant son assertion**, ni en recopiant la logique de production dans le test. Cette erreur avait produit 45 tests tautologiques ici même, supprimés le 31/07/2026 — ne pas la réintroduire. Dans le doute, laisser rouge et le signaler.
- **Lint à `--max-warnings=0`** avec `no-unsanitized` : un warning d'injection HTML fait tomber tout le TNR. Corriger le code, jamais désactiver la règle.
- **Playwright est volontairement limité** à ce qui exige un navigateur : DOM, localStorage après `init()`, assets servis (manifest, sw.js, icônes), CSS bundlé, absence d'erreur console. Toute la logique métier se teste en unitaire.
- **Il n'existe pas de compte de test Supabase.** Ne pas inventer de tests de connexion réelle ni de credentials sans en parler à Jérémie.
- Une règle métier enfouie dans une fonction non exportée d'un gros module (`src/calendar.js`, `src/settings.js`) s'**extrait dans `src/lib/`** et se teste — elle ne se duplique pas dans le fichier de test.

## Conventions

- Commits en français, style conventionnel (`fix(heures): …`, `chore(deps): …`). **Commits locaux uniquement — jamais de `git push`.**
- Logique métier partagée dans `src/lib/` : `asv-hours.js`, `planning-auth.js`, `leave-utils.js`, `pdf-generator.js`.
- `_travail/` et `_legacy/` sont hors périmètre : ne jamais proposer d'en committer le contenu.
- `.claude/worktrees/` contient des worktrees git périmés pointant vers l'ancien emplacement iCloud. Leurs branches sont dans le dépôt, rien n'est perdu. **Ne pas les purger sans validation.**
- Garde-fous anti-doublons iCloud (`* ?.*` dans `.gitignore`) : ne pas les retirer, même si le projet a quitté iCloud.

## Documentation à lire selon la tâche

| Tâche | Lire d'abord |
|---|---|
| Déploiement, exploitation | `docs/EXPLOITATION.md`, `docs/RUNBOOK-DEPLOIEMENT.md` |
| Sécurité, RLS, secrets | `docs/SECURITE.md` |
| Sauvegardes | `docs/SAUVEGARDES.md` |
| Rôle vétérinaire non associé | `docs/PROMPT-ROLE-VET-NON-ASSOCIE.md` |
| Dette ouverte, ce qui reste à corriger | `docs/DETTE.md` (par index, jamais en entier) |

## Attention particulière

Ce dépôt est **en production dans une vraie clinique**. Une régression sur le calcul des heures se traduit par une erreur de paie réelle. Toute modification touchant aux heures, aux congés ou aux jours fériés se valide par les tests unitaires avant d'être commitée, et se signale explicitement dans le message de commit.
