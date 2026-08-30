Méthode : skills EC (Économie de Contexte) d'abord, puis CC (Chef de Chantier).

# Note de conception — correction automatique des signalements

Projet : **Amivet Pulse**, dépôt `/Users/jeremie/Projets/CalendrierAmivet`, branche
`main`. PWA en production dans une clinique vétérinaire en exercice.

Phase 0, écrite le 16/08/2026, **révisée le 17/08/2026 après passage au
contradicteur indépendant** (skill AV, mode DOSSIER). Les trois objections ont
été vérifiées dans le dépôt et retenues : elles ont changé le découpage, pas
seulement la rédaction. **Rien n'est implémenté** tant que Jérémie n'a pas
validé.

## 1. Le problème

Un signalement ne se corrige aujourd'hui que si Jérémie ouvre une session et colle
le digest à la main ; il veut que le maximum se corrige tout seul.

## 2. L'état actuel

| Fichier | Rôle dans le chantier |
|---|---|
| `scripts/feedback-digest.mjs` | produit le digest, déterministe, lecture seule |
| `scripts/feedback-purge.mjs` + `com.jeremie.feedback-daily.plist` | job launchd 8h05, digest puis purge |
| `supabase/migrations/20260816000001_feedback.sql` | table `feedback`, statuts, RLS |
| `docs/EXPLOITATION.md` §Signalements | les garde-fous écrits, que ce chantier amende |
| `.github/workflows/deploy.yml` | déploie sur `push` vers `main` touchant `src/**` |
| `src/config.js` | **le point dur** — voir §4 |
| `run-tnr.command` | **ne peut pas servir de barrière** — voir §4 |

**Ce qui existe déjà** : la collecte, le classement du digest, la rétention
15 jours.

**Ce qui n'existe pas, contrairement à la première version de cette note :**

1. **Le marquage « décision humaine requise » n'est pas un filtre.**
   `scripts/feedback-digest.mjs:42-43` le dit dans son propre commentaire : « une
   alerte de lecture, pas un filtre ». `isSensitive()` ne sert qu'à l'affichage
   et au comptage. C'était un humain qui lisait la ligne.
2. **Aucun test ne tourne en intégration continue.** `deploy.yml` n'exécute que
   `npm ci` et `npm run build`. Le seul workflow déclenché sur `pull_request`
   est `security.yml` — CodeQL, gitleaks, `npm audit` — dont aucun ne voit une
   erreur de paie.
3. **`run-tnr.command` sort toujours 0.** Le verdict `status=FAIL` n'existe que
   comme texte dans `.tnr/latest.log` ; le script finit sur `cp`, `echo`,
   `sleep 5`. Aucun appelant ne peut se brancher sur son code de retour.
4. **Le mode planifié n'est pas démontré sur cette machine.**
   `docs/EXPLOITATION.md:99-104` : pas de précédent de run Claude planifié,
   `claude` absent du PATH du plist TNR, authentification dans le Trousseau
   macOS — inaccessible hors session déverrouillée. **À prouver par un
   `launchctl kickstart` avant tout le reste.**

## 3. Le point qui décide de tout : il n'y a pas d'étape intermédiaire

`deploy.yml` se déclenche sur tout push vers `main` touchant `src/**`. Ni
pré-production, ni recette, ni validation entre le push et l'écran des
salariées. **« Correction automatique » signifie donc « déploiement automatique
en production dans une clinique en exercice ».** C'est la définition du
chantier, pas une objection — mais tout le reste en découle.

Trois façons d'ouvrir le robinet, pas deux :

- **A — la routine pousse sur `main`.** Aucun filet.
- **B — branche + PR + auto-merge si la CI est verte.** Attention : **cette CI
  n'existe pas**. La construire (lint + vitest + Playwright sur `pull_request`)
  fait partie du chantier, ce n'est pas un acquis.
- **C — branche + PR, sans auto-merge.** Jérémie clique « Merge » depuis son
  téléphone. Supprime le geste que le §1 identifie comme le problème — ouvrir
  une session, coller le digest — sans jamais déployer sans relecture.

Le gain de B sur C se réduit à **un clic**. Le risque de B sur C est
l'intégralité du §4. La première version de cette note posait l'arbitrage entre
A et B et recommandait B ; le contradicteur a montré que le vrai arbitrage est
entre **B et C**. Recommandation révisée : **C d'abord**, B seulement si le taux
d'erreur mesuré au lot 4 le justifie.

## 4. La frontière : elle ne peut pas s'écrire dans ce dépôt en l'état

C'était le garde-fou central de la première version — « par chemin de fichier,
mécaniquement ». Le dépôt le réfute.

**`src/config.js` mélange les libellés et les constantes de paie.** Dans le même
fichier : `SLOT_LABELS` (l.166), `MONTH_NAMES` (l.225) — et
`ANNUAL_FULLTIME_HOURS` (l.196), `HALFDAY_HOURS` (l.197), `WEEKLY_MAX_HOURS`
(l.198), `ASV_STD_SAT_SECOND` (l.200), `CP_DAYS_PER_MONTH` (l.130),
`ASV_STD_SAT_CARLA` (l.52). Le signalement le plus banal qui soit — « il y a une
faute dans un nom de mois » — atterrit dans le fichier qui porte les constantes
de paie. Un filtre par chemin ne sait pas trancher ça : il autorise ou il
interdit le fichier entier.

**Et la liste interdite serait plus étroite que le garde-fou qu'elle remplace.**
`EXPLOITATION.md:111-114` protège « heures, congés, signatures ou RLS » **par
sujet**. Une liste de chemins laisse dehors `src/lib/leave-utils.js`,
`src/signatures.js`, `src/forecast-signatures.js`, `src/leave-blocks.js`,
`src/annual-view.js` — et les deux gros modules que `CLAUDE.md` désigne
nommément comme porteurs de règles métier enfouies, `src/calendar.js` et
`src/settings.js`.

**Le filet invoqué ne couvre pas le trou.** `asv-hours-contract.test.js`
n'importe que `src/lib/asv-hours.js` et `ASV_STD_SAT_CARLA` : il ne peut pas
rougir sur un diff dans `src/calendar.js` ou `src/dashboard-stats.js`. Et
`HALFDAY_HOURS` comme `CLINIC_AM_H` n'ont aucune occurrence dans `tests/` — une
valeur modifiée là passe les 486 tests en vert.

**Conséquence sur le découpage** : le préalable n'est pas le lot « frontière »,
c'est **extraire les constantes de paie de `src/config.js`**. Sans cette
extraction, le lot frontière produirait un test vert garantissant une frontière
fausse — exactement ce que `CLAUDE.md` interdit.

## 5. Le schéma de données, et où est vraiment le coût de sécurité

**Aucune migration.** `feedback.status` accepte déjà `nouveau`, `en_cours`,
`corrige`, `rejete`, `decision_humaine` (migration `20260816000001`, l.42-43),
plus `admin_note` et `resolved_at`.

**Correction de la première version.** Elle désignait la clé `service_role`
comme « le vrai coût de sécurité du chantier ». C'est faux : cette clé est déjà
posée sur la machine (`~/.amivet-feedback.env`) et déjà utilisée en écriture
destructive tous les matins par `feedback-purge.mjs`. Le connecteur Supabase que
Jérémie vient d'ajouter réduit encore ce point pour une session interactive.

**Le coût réellement nouveau est celui que la note écartait en une phrase : un
droit de `push` sur `main` accordé à un processus non interactif.**

**Et la trace s'autodétruit.** `20260816000002_feedback_invariants_purge.sql`
purge sur `created_at` **sans condition de statut** : l'`admin_note` par laquelle
la routine justifie sa décision disparaît 15 jours après le signalement. Trois
semaines après un correctif douteux, le commit reste, le *pourquoi* n'existe
plus. À traiter, ou à assumer explicitement.

## 6. Ce qui change pour l'utilisateur final

Les salariées verront des correctifs apparaître sans que personne ne les ait
relus. Et, un jour, une régression apparaîtra de la même façon.

## 7. Ce qui ne sera pas fait

- Aucun correctif automatique dans la zone interdite du §4.
- Aucune migration, aucune policy RLS écrite par la routine.
- Aucun déploiement d'Edge Function : elles restent manuelles.
- Pas de `--force`, pas de réécriture d'historique, pas de suppression de test.

## 8. Les risques

1. **Erreur de paie — bloquant.** Voir §4 : le garde-fou prévu n'existe pas
   encore et ne peut pas exister avant l'extraction des constantes.
2. **La routine embarque le travail en vol de Jérémie.** L'arbre porte
   régulièrement des fichiers modifiés non commités, et plusieurs sessions
   partagent l'index git. Une routine qui fait `git add`/`commit` à 8h05 les
   emporte dans sa branche, la CI passe, l'auto-merge fusionne. **La routine doit
   travailler dans un worktree ou un clone dédié** — absent de la première
   version.
3. **Régression silencieuse** : aucun chemin authentifié n'est couvert par un
   test (pas de compte de test Supabase).
4. **Boucle** : une routine qui échoue à marquer un signalement le reprend
   indéfiniment.
5. **Fuite** : un token de push non interactif sur la machine.

## 9. Définition de « terminé »

1. Une routine planifiée tourne seule et produit, sans intervention : une PR
   prête à fusionner, ou un signalement classé avec sa note.
2. La frontière du §4 est **du code testé**, posée **après** l'extraction des
   constantes de paie.
3. Une CI qui exécute lint + vitest + Playwright sur `pull_request` **existe et
   bloque le merge**. Sans elle, il n'y a aucune barrière.
4. La routine travaille dans un arbre isolé, jamais celui de Jérémie.
5. `EXPLOITATION.md` et `SECURITE.md` amendés.
6. Un arrêt d'urgence documenté et **essayé une fois**.
7. Palier 3 vert, dette consignée, commits locaux, passation FS.

## 10. Découpage révisé

- **Lot 0 — prouver que ça peut démarrer.** Un `launchctl kickstart` qui montre
  qu'un run Claude planifié aboutit sur cette machine (§2.4). Si ça échoue, tout
  le chantier tombe : à faire avant d'écrire une ligne.
- **Lot 1 — extraire les constantes de paie de `src/config.js`** vers un module
  dédié, sans changement de comportement, prouvé par les tests existants. C'est
  ce qui rend la frontière écrivable.
- **Lot 2 — la CI qui bloque.** lint + vitest + Playwright sur `pull_request`,
  requis pour merger. Répare au passage un trou qui existe indépendamment de ce
  chantier.
- **Lot 3 — la frontière**, en code, testée.
- **Lot 4 — arbre isolé, écriture dans `feedback` idempotente, arrêt d'urgence.**
- **Lot 5 — la routine en lecture seule** : elle écrit ce qu'elle *aurait* fait,
  ne pousse rien, pendant une durée que Jérémie fixe. Seule façon de mesurer son
  taux d'erreur avant de lui donner la main.
- **Lot 6 — ouverture du robinet** (voie C, puis B si le lot 5 le justifie),
  documentation et passation.

## 11. Ce qui reste à trancher par Jérémie

1. **Voie C ou B** au §3. Recommandation révisée : C.
2. **Le lot 1 est-il accepté ?** Toucher `src/config.js` sur une application de
   paie n'est pas anodin — mais c'est le seul chemin vers une frontière vraie.
3. **La durée du lot 5 à blanc.**
4. **La purge à 15 jours efface la justification des correctifs** (§5) : on la
   corrige, ou on l'assume ?

## 12. Traces

- Note passée au contradicteur indépendant (skill AV, mode DOSSIER, Opus) le
  17/08/2026. Trois objections, **toutes retenues et vérifiées dans le dépôt**.
  Elles ont ajouté deux lots (0 et 1), changé la recommandation du §3 de B vers
  C, et invalidé la « barrière technique » annoncée au §9.3 de la version
  initiale — `run-tnr.command` sort toujours 0.
