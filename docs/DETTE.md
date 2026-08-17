# Dette identifiée

Journal de dette technique et fonctionnelle d'Amivet Pulse. Il se remplit
chantier après chantier : on n'y déverse pas un audit du dépôt.

Une dette y est écrite en quatre points — ce qui est faux, où, la conséquence
concrète, le coût de la laisser. S'il en manque un, c'est un ressenti, pas une
dette.

Ce qui touche la **paie**, une **preuve juridique** ou la **fiscalité** n'est pas
une dette : c'est un défaut bloquant, signalé comme tel.

## Dette restante

### Constatée par le chantier « correction automatique des signalements » (2026-08-17)

#### Des constantes de paie sans aucune occurrence dans les tests

- **Quoi** : `HALFDAY_HOURS`, `CLINIC_M_H`, `CLINIC_AM_H` (désormais dans
  `src/lib/pay-constants.js`) n'apparaissent dans aucun fichier de `tests/`.
- **Où** : `src/lib/pay-constants.js` ; seul consommateur de `HALFDAY_HOURS` :
  `src/dashboard-stats.js`.
- **Conséquence** : une valeur de paie modifiée là passe les 486 tests en vert —
  régression de paie silencieuse possible. Touche la paie : défaut signalé
  comme bloquant, pas seulement consigné.
- **Coût de laisser** : nul à court terme si le lot 3 du chantier (la frontière
  testée sur `pay-constants.js`) est livré ; rédhibitoire si le chantier
  s'arrête avant le lot 3.

#### Quatre constantes exportées que rien n'utilise

- **Quoi** : `CLINIC_HOURS`, `CLINIC_M_H`, `CLINIC_AM_H` et
  `CP_REFERENCE_START_MONTH` sont exportées et utilisées nulle part.
- **Où** : `src/lib/pay-constants.js` (déplacées telles quelles depuis
  `src/config.js` par le lot 1, qui était un déplacement pur).
- **Conséquence** : lecteur et outillage croient à une couverture qui n'existe
  pas ; modifier ces valeurs ne change rien à l'application, ce qui masque
  l'endroit où les horaires cliniques sont réellement codés.
- **Coût de laisser** : faible ; à trancher (supprimer ou brancher) lors du
  lot 3 qui posera la frontière sur ce fichier.

#### Le roster ASV par défaut donne à Carla une teinte inexistante

- **Quoi** : `present: PRESENT_SHADES[3]` alors que `PRESENT_SHADES` a trois
  entrées (indices 0-2) → `undefined`.
- **Où** : `src/config.js`, tableau `ASV_PEOPLE`, entrée `carla`.
- **Conséquence** : dans l'effectif par défaut (avant chargement du roster
  distant, donc au premier démarrage ou hors ligne), le style « présent » de
  Carla est indéfini.
- **Coût de laisser** : cosmétique et borné au roster par défaut ; corrigible
  en une ligne mais hors du périmètre du lot 1 (déplacement pur).

### Constatée par le chantier « suppression définitive d'un collaborateur » (2026-08-16)

#### La purge n'a pas de preuve d'effet

**Ce qui est faux.** `tests/unit/collaborator-purge-contract.test.js` prouve que
le code *demande* les 9 suppressions. Il ne prouve pas que Supabase les
*exécute* : une policy RLS restrictive ou une contrainte peut en refuser une.

**Où.** L'action `purge` de `supabase/functions/manage-users/index.ts`, face aux
policies des 9 tables.

**Conséquence.** Une purge peut échouer en production alors que le TNR est vert.
Depuis le lot B l'échec est au moins bruyant — les erreurs sont lues et la purge
s'interrompt avant l'effectif — mais l'écart entre « le code le demande » et
« la base le fait » n'est levé par aucun test.

**Coût de la laisser.** Il n'existe pas de compte de test Supabase (`CLAUDE.md`)
et en créer un n'est pas une décision technique. En attendant, la preuve reste
manuelle : `scripts/verif-purge-collaborateur.sql`, à rejouer après toute
migration touchant une table purgée.

**Pourquoi elle survit au solde du 16/08/2026.** Les deux autres dettes se
refermaient par du code ; celle-ci non. Elle demande un compte de test sur le
projet Supabase de production — un arbitrage de Jérémie sur un risque
d'exploitation, pas un lot de développement. Elle reste donc ouverte, seule,
tant que cet arbitrage n'est pas rendu.

#### Supprimer une ASV ne vaut que pour le poste où on appuie

**Ce qui est faux.** Le 💣 retire la personne de `PEOPLE` **et** de `ASV_PEOPLE`
depuis le lot A, mais `ASV_PEOPLE` n'est persisté nulle part ailleurs que dans
le `localStorage` du poste. Une ASV supprimée reste donc présente sur tous les
autres appareils, et rien ne viendra les corriger : il n'y a pas de source
partagée à synchroniser.

**Où.** `ASV_ROSTER_KEY` (`src/config.js:146`), lu et écrit par `src/state.js`.
Aucune table `asv_roster` n'existe dans `supabase/migrations/`.

**Conséquence.** Une personne partie continue d'apparaître dans l'effectif ASV
des autres postes, donc dans les écrans qui s'en servent. L'admin croit la
suppression faite — elle l'est, sur son écran. Pour un vétérinaire le problème
ne se pose pas : `vet_roster` est partagée.

**Coût de la laisser.** Contournement immédiat et sûr : refaire le geste sur
chaque poste, ce qui est écrit dans `docs/EXPLOITATION.md`. Le coût réel est
qu'aucun correctif sur le 💣 ne réglera ce point — il ne se ferme que par la
migration du roster ASV vers une table partagée, chantier sorti du périmètre le
16/08/2026 (§8 amendé de la note). Tant qu'il n'est pas ouvert, cette dette est
**la limite structurelle** de la suppression d'un collaborateur.

### Constatée par le chantier « migration du roster ASV vers table partagée » (2026-08-16)

#### Rien n'oblige les modales à passer par le sélecteur partagé

**Ce qui manque.** Le lot C1 a supprimé le décalage entre le balisage des cases
« jours travaillés » et le sélecteur qui les relit, en faisant venir les deux de
la même source. `tests/unit/asv-time-fraction.test.js` verrouille cet accord —
mais à l'intérieur de `src/lib/time-fraction.js` seulement. Aucun test ne
constate que `src/settings.js` *appelle* effectivement ces fonctions.

**Où.** Les cinq points d'appel de `src/settings.js` (rendu des deux modales
lignes 538 et 754, lectures lignes 587, 788 et 816) face aux helpers
`dayCheckboxesHtml` / `daySelector` / `checkedDaySelector`.

**Conséquence.** Une modification future qui réécrirait une classe en dur dans
`settings.js` reproduirait exactement le défaut C1 sans faire rougir le TNR :
aucune case trouvée à la relecture, fraction enregistrée à 0, donc CP acquis et
cible annuelle à zéro pour l'ASV concernée. C'est un chemin de régression vers
une **erreur de paie**, pas un défaut actif — le code d'aujourd'hui est correct
et vérifié.

**Coût de la laisser.** Faible aujourd'hui : cinq appels, tous justes, tous
touchés à l'instant. Il croît avec `settings.js`, qui est déjà un gros module.
Le fermer proprement suppose soit un test de structure sur `settings.js`, soit
l'extraction du câblage des modales dans `src/lib/` — un lot en soi, pas une
retouche. Laissée ouverte volontairement pour ne pas ajouter un garde-fou de
plus au garde-fou du lot C1.

**Ne pas confondre** avec la limite déjà assumée « les chemins authentifiés ne
sont couverts par aucun test automatisé » (§ Limites acceptées) : celle-ci porte
sur le bout en bout à travers le login, celle-là sur l'accord interne au front,
qui est atteignable sans compte de test.

#### Une fraction nulle déjà stockée reste invisible

**Ce qui manque.** Le lot C3a pose une garde **en écriture** : les modales ne
peuvent plus faire enregistrer une fraction ≤ 0. Elle ne regarde pas les données
déjà en place. Un roster amorcé anciennement sur un poste qui porterait un zéro
ne déclencherait toujours aucune alerte.

**Où.** `src/dashboard-stats.js:666-673` — la projection de fin d'année et
l'alerte « heures dépassant la modulation » sont toutes deux gardées par
`target > 0`, donc s'éteignent en silence quand la cible est nulle. Et
`src/state.js:61` : le repli `?? 1.0` en lecture ne rattrape qu'un champ
**absent**, jamais un zéro stocké.

**Conséquence.** Zéro CP acquis pour la personne concernée, sans aucun signe à
l'écran. **Aucun cas connu aujourd'hui** : le relevé exhaustif du 16/08 donne
`1`, `1`, `0,75` et la valeur de Carla réparée — il n'existe qu'un poste
d'administration, et il est propre. C'est un risque résiduel, pas un défaut
actif.

**Coût de la laisser.** Faible et borné tant qu'un seul poste porte le roster. Il
croîtrait avec le nombre de postes, mais l'échéance qui le referme est déjà au
programme : la migration vers la table partagée donne une source unique, où un
contrôle serveur remplace avantageusement un marqueur d'affichage. Les marqueurs
ont été explicitement écartés du lot C3a pour cette raison — voir
`docs/NOTE-ROSTER-ASV.md`, § « Ce qui ne sera pas fait ».

#### L'interface ne sait pas saisir la fraction de Carla, ni corriger une fraction fausse

**Ce qui manque.** Aucun chemin de l'écran « Temps de travail contractuel » ne
produit la fraction contractuelle de Carla — `(7 + 25/60) / 35 = 0,2119047…`.
« Personnalisé » n'accepte qu'un pourcentage **entier**, donc au mieux `0,21`. Et
la garde `unchanged` de `resolveTimeFraction` rend la fraction courante
**intacte** dès que le pourcentage arrondi et les jours n'ont pas bougé :
re-saisir 21 % sur une valeur fausse de `0,20714` ne change donc rien,
silencieusement. « Certains jours » + samedi, lui, calcule le samedi avec
`ASV_STD_SAT_SECOND` (7,0 h) et non `ASV_STD_SAT_CARLA` (7 h 25) : il écrirait
`0,2` et un `workingDays: [6]` — plus faux qu'avant.

**Où.** `src/lib/time-fraction.js` : `fractionFromPercent` (lignes 122-127),
`fractionFromDays` (106-114), et la garde `unchanged` de `resolveTimeFraction`
(163-170). Écran correspondant : `buildTimeFractionUI` (`src/settings.js:748-775`),
dont le champ est un `number` `min=10 step=5`.

**Conséquence.** Le contrat d'une ASV qui ne tombe pas sur un pourcentage entier
n'est pas saisissable dans l'application, et une fraction fausse qui s'affiche
sur le même pourcentage arrondi que la valeur juste n'est **pas réparable par la
fiche**. C'est exactement ce qui s'est passé pour Carla : la réparation du 16/08
a dû se faire à la console, en supprimant son entrée du `localStorage` pour
laisser `loadASVRoster()` la ré-amorcer depuis la constante. La garde `unchanged`
reste un bon choix — elle protège la valeur précise contre une saisie qui ne la
distingue pas — mais elle n'a aucune porte de sortie.

**Coût de la laisser.** Nul tant que Carla est la seule ASV à contrat non rond et
que sa valeur est juste, ce qui est le cas depuis le 16/08. Il devient bloquant à
deux échéances : l'arrivée d'une ASV à horaire atypique, et la migration du
roster vers la table partagée, qui met la donnée côté serveur et retire le
recours à la console sur `localStorage`. Le fermer suppose une saisie en heures
et minutes plutôt qu'en pourcentage, ou un chemin explicite « rétablir la valeur
contractuelle » — un lot en soi, pas une retouche.

## Clos par le chantier « migration du roster ASV vers table partagée » (2026-08-16)

### 🔴 La fraction de temps de Carla est figée à 7,25 h dans le localStorage de production

**Ce qui est faux.** La `timeFraction` de Carla vaut `0.20714285714285716` sur le
poste relevé, soit exactement `7.25 / 35`. Sa valeur contractuelle est
`ASV_STD_SAT_CARLA / 35 = (7 + 25/60) / 35 = 0,2119047…`, soit 7 h 25. C'est la
confusion « 7h25 » / « 7,25 h » corrigée **dans le code** le 03/08 par `5475ef0` —
mais ce correctif n'a jamais touché les données déjà écrites.

**Où.** Clé `amivet_asv_roster` du `localStorage`, entrée `carla`, sur tout poste
amorcé avant le 03/08/2026. Relevé du 16/08 archivé hors dépôt sous
`roster-macbookair-chrome-2026-08-16.json`. Le repli de `src/state.js:79` dérive
désormais la valeur correctement, mais il ne s'exécute que si la clé est absente
ou si Carla manque du tableau — donc jamais sur un poste déjà amorcé.

**Conséquence.** 2,247 % de CP acquis en moins pour Carla, en continu depuis le
03/08 au moins : `timeFraction` proratise les congés payés acquis et la cible
annuelle du tableau de bord. **Défaut de paie actif en production**, et non un
chemin de régression comme la dette précédente. Il est invisible à l'œil : la
valeur est positive, plausible, et l'interface ne l'affiche qu'arrondie à 21 %.
La feuille de présence signée, elle, a bien été réparée par `5475ef0` — le dégât
restant est borné aux CP acquis et à la cible de modulation.

**Aucun préjudice réalisé à ce jour (tranché le 16/08/2026).** L'application est
en **dry run côté ASV** — Jérémie en est le seul utilisateur, les ASV n'y ont
encore rien saisi — et **aucune paie ASV n'a jamais été calculée depuis cet
outil**. Le défaut n'a donc encore rien payé de faux : il est actif dans les
données, mais son effet n'a jamais été encaissé. Ce qui le maintient en 🔴 n'est
plus le préjudice, c'est l'**échéance** : il doit être réparé **avant la première
paie ASV réelle**. Ce constat classe C3b comme correctif de fond et **non comme
rattrapage** — il n'y a aucune période passée à recalculer.

**Coût de la laisser.** Il s'accumule à chaque mois de CP acquis, et devient plus
difficile à dater : une fois C1 déployé, l'archive du 16/08 est la seule pièce
qui prouve que la valeur précédait le push. La réparation est triviale en
elle-même — réécrire la fraction dérivée de la constante — mais elle relève du
lot C3b (re-saisie après déploiement), pas d'une migration. Le dry run offre une
fenêtre de réparation sans coût ; elle se referme le jour où l'outil sert à
payer.

**Ne pas confondre** avec le défaut du lot C1 (`0,21`, fraction reconstruite
depuis son affichage arrondi) : ici la valeur est `0,207`, elle vient d'un bug
antérieur et distinct. Conséquence pour le lot C3a : une règle de détection qui
cherche « `timeFraction` présent et ≤ 0 » **ne voit pas** ce cas, qui est
pourtant le seul défaut réellement constaté en production à ce jour.

**Réparé le 16/08/2026 (lot C3b).** Sur le poste qui fait foi (MacBook Air /
Chrome), l'entrée `carla` a été retirée du tableau `amivet_asv_roster` à la
console, puis l'application rouverte : `loadASVRoster()` (`src/state.js:69-82`)
l'a ré-amorcée depuis la constante. Vérifié sur place — `timeFraction` vaut
`0.2119047619047619`, strictement égal à `(7 + 25/60) / 35`, et `saturdayOnly`
est préservé. La re-saisie par la fiche, telle que prévue au cadrage, s'est
révélée **impossible** : voir la dette ouverte « L'interface ne sait pas saisir
la fraction de Carla ». Aucun rattrapage de paie n'était dû, aucune paie ASV
n'ayant jamais été calculée depuis cet outil.

## Clos par le chantier « solde de la dette de la suppression définitive » (2026-08-16)

### 🔴 Rien ne relie les listes de sauvegarde et de restauration aux migrations

**Trou ponctuel bouché le 16/08/2026 ; la cause demeure.**

**Ce qui est faux.** Trois listes de tables coexistent — celle de la sauvegarde,
celle de la restauration, celle des migrations — sans qu'aucun mécanisme ne les
tienne d'accord. Elles avaient déjà divergé sur trois points, chacun silencieux :

- `forecast_signatures` (migration `20260730000001`) et `vet_roster` (migration
  `20260803000001`) — les deux tables les plus récentes du schéma — n'étaient
  **dans aucun des deux scripts** ;
- `feedback` était sauvegardée depuis le 16/08 mais **absente de la
  restauration** : une sauvegarde qu'on ne sait pas réinjecter.

Le job passait au vert tous les jours à 2 h 59 en sauvegardant un schéma
incomplet. Rien ne le signalait : une migration qui crée une table n'oblige à
rien.

**Où.** [scripts/backup-supabase.mjs:26-43](../scripts/backup-supabase.mjs#L26-L43)
et [scripts/restore-supabase.mjs:34-52](../scripts/restore-supabase.mjs#L34-L52),
confrontés à `supabase/migrations/`.

**Conséquence.** `forecast_signatures` fait partie des 9 `PURGE_TARGETS` de la
suppression définitive. Supprimer un collaborateur détruisait donc ses signatures
de prévisionnel alors qu'**aucune sauvegarde ne les contenait**, et que le §6 de
[NOTE-SUPPRESSION-COLLABORATEUR.md](NOTE-SUPPRESSION-COLLABORATEUR.md)
exclut explicitement corbeille, undo et journal d'audit. La perte était
définitive et silencieuse. Le §7 arbitre la perte de preuve en s'appuyant sur
un second palier de confirmation ; cet arbitrage tenait pour `monthly_signatures`,
qui est sauvegardée, mais pas pour `forecast_signatures`, qui ne l'était pas.
Pour `vet_roster`, la conséquence est moindre : un effectif perdu se ressaisit.

**Ce qui a été fait le 16/08/2026 (premier passage).** Les trois manques sont
comblés : `vet_roster` et `forecast_signatures` ajoutées aux deux scripts,
`feedback` ajoutée à la restauration. C'était le trou, pas la cause.

**Ce qui restait — le coût de le laisser.** Aucun verrou ne reliait les listes aux
migrations, donc la prochaine table créée aurait rejoué exactement le même
scénario, en silence, et ne se serait découverte qu'au moment d'une restauration
ratée. Le verrou manquant était un test de contrat sur le modèle de
`tests/unit/collaborator-purge-contract.test.js` : lire les `CREATE TABLE` des
migrations, exiger que chaque table figure dans les deux scripts ou soit
exemptée par écrit. **Non fait — c'est un garde-fou que le chantier en cours n'a
pas demandé, il se décide à part.**

**Clos le 16/08/2026.** Le verrou existe :
[tests/unit/backup-restore-contract.test.js](../tests/unit/backup-restore-contract.test.js).
Il lit les `CREATE TABLE` des migrations, les deux listes de tables et
`PURGE_TARGETS`, et refuse quatre situations : une table du schéma absente d'un
des deux scripts sans exemption écrite ; un écart entre la liste de sauvegarde
et celle de restauration ; un script qui nomme une table inexistante ; une table
détruite par la purge qui ne serait pas sauvegardée **et** réinjectable. La
seule exemption est `rate_limit_log`, motivée dans le test.

Sa capacité à mordre a été vérifiée par mutation, pas seulement par un run vert :
retirer `forecast_signatures` de la sauvegarde fait tomber 3 assertions, retirer
`feedback` de la restauration en fait tomber 2, et ajouter une migration créant
une table que personne n'inscrit aux scripts en fait tomber 2 — les trois
divergences historiques, chacune rattrapée.

### Un échec de suppression du compte auth laisse un compte orphelin inatteignable

**Ce qui est faux.** La purge retire la ligne d'effectif **avant** de supprimer
le compte auth. Le commentaire du code justifie cet ordre pour que la purge
reste rejouable — mais ce raisonnement s'arrête à `vet_roster` et ne couvre pas
les deux gestes qui le suivent. Si `deleteUser` échoue, l'effectif est déjà
parti : plus aucun écran ne montre la personne, donc plus aucun bouton ne
permet de relancer la purge.

**Où.** L'action `purge` de `supabase/functions/manage-users/index.ts`, dans le
bloc qui suivait la suppression de `vet_roster`.

**Conséquence.** Mesurée, mais réelle. Le compte peut encore s'authentifier
auprès de Supabase et obtenir un JWT valide. L'application, elle, le rejette :
`user_profiles` a disparu par cascade et le chargement du profil retourne `null`
([src/app.js:281](../src/app.js#L281)), donc aucune session applicative ne s'ouvre.
Reste un compte capable d'obtenir un jeton, qu'aucun écran ne signale et que
seule une intervention en base peut retirer.

**Coût de la laisser.** Faible tant que le cas ne se produit pas — il suppose
un échec réseau ou une panne Supabase pile entre deux appels. Le jour où il
survient, le diagnostic part de zéro : rien dans l'interface ne dit qu'un
compte orphelin existe.

**Clos le 16/08/2026.** L'ordre est inversé : le compte auth part **avant** la
ligne d'effectif. Un `deleteUser` qui échoue laisse donc la personne visible
dans l'effectif, avec son bouton de purge — la purge reste relançable et aucun
compte orphelin ne se crée. Trois points complètent l'inversion :

- `user_profiles` est supprimé **après** le compte, jamais avant : cette ligne
  porte le bouton de purge des comptes, et la retirer d'abord aurait fait
  disparaître le moyen de rejouer la purge alors même que le compte survivait.
  Elle part de toute façon par cascade (`id references auth.users on delete
  cascade`), la suppression explicite n'est qu'une ceinture ;
- un compte auth déjà absent (404) est traité comme un succès, sans quoi une
  purge interrompue après la suppression du compte n'aurait jamais pu atteindre
  la ligne d'effectif restée en place ;
- l'invariant d'ordre est verrouillé dans
  [tests/unit/collaborator-purge-contract.test.js](../tests/unit/collaborator-purge-contract.test.js),
  dont l'assertion d'origine — « le compte auth après l'effectif » — a été
  remplacée par son inverse strict, motivé en commentaire, et non assouplie.

**Déployé le 16/08/2026.** `supabase functions deploy manage-users` sur le
projet `ubowqtowyqmpraoxbaoo` : la production exécute le nouvel ordre. Vérifié
au retour — la fonction répond `HTTP 200` et le CORS reste restreint à
`https://jtechserge.github.io`.

## Limites acceptées (décision du 16/08/2026)

Ce qui suit est assumé, pas oublié. Ne pas le reproposer comme dette sans
élément nouveau.

- **Aucune corbeille, aucun undo, aucun journal d'audit** des suppressions (§6
  de la note). Le garde-fou est le double palier de confirmation quand un mois
  est signé, plus la sauvegarde quotidienne — dont la complétude est désormais
  verrouillée par `tests/unit/backup-restore-contract.test.js`.
- **Les chemins authentifiés ne sont couverts par aucun test automatisé.** Sans
  compte de test Supabase, ni Playwright ni vitest ne peuvent franchir le login.
  C'est la contrainte qui rend nécessaires les scripts de vérification manuelle.
- **Le littéral `ancien-collaborateur` est dupliqué** entre le front
  (`src/lib/collaborator-removal.js`) et la Edge Function Deno. Aucun import
  n'est possible entre les deux ; le test de contrat compare les fichiers.
- **La fenêtre de confirmation ne chiffre pas les données distantes** (visites
  médicales, ajustements de CP, prévisionnel signé…) : les compter exigerait
  autant de requêtes que de tables. Elle les nomme sans les compter.
- **`feedback` n'est pas dans `PURGE_TARGETS`** : `reported_by` est en
  `ON DELETE CASCADE` sur `auth.users`, la table part avec le compte. Le test de
  contrat ne la voit pas — il ne connaît que `person_id`, `user_name` et
  `author_id` — d'où le contrôle explicite dans le script de vérification.
- **`rate_limit_log` n'est ni sauvegardée ni restaurée** : journal éphémère de
  limitation de débit, sans état métier, qui se reconstitue seul. C'est la seule
  exemption du contrat sauvegarde/restauration.

## Limites acceptées (décision du 17/08/2026)

- **La purge de `feedback` à 15 jours efface l'`admin_note` sans condition de
  statut** : la justification d'un correctif automatique disparaît de la base
  15 jours après le signalement. Assumé : la justification de référence vit
  dans la description de la PR du correctif (immuable, jamais purgée) ;
  l'`admin_note` n'est qu'une copie jetable. Décision Q4 du chantier
  « correction automatique des signalements ».
