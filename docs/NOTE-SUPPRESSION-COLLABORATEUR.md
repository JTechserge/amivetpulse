Méthode : skill CC (Chef de Chantier).

# Note de conception — Suppression définitive d'un collaborateur

Phase 0, révisée après arbitrage du 16/08/2026. Aucune ligne de code, aucune migration écrite à ce stade.

**Décisions déjà prises par Jérémie :**
1. Garde-fou sur l'historique signé : **avertissement renforcé** (suppression libre si rien n'a jamais été signé ; compte exact affiché et seconde confirmation sinon). Pas de blocage.
2. Roster ASV en `localStorage` par appareil : **rédhibitoire**. On le migre vers une table partagée **avant** de toucher au 💣.

## 1. Le problème

Le bouton 💣 « Suppression définitive » de la gestion des collaborateurs efface une partie des données mais **laisse la personne dans l'effectif** : sa ligne reste dans le calendrier, dans le tableau de bord et dans la liste des collaborateurs.

## 2. L'état actuel

### Deux boutons 💣 différents, aux comportements différents

**A — ligne avec compte** (`data-purge-user`, [settings.js:349](src/settings.js#L349), handler [settings.js:498-544](src/settings.js#L498-L544)) :
1. supprime les clés de `store.DATA.slots` contenant le `person_id` ;
2. `splice` dans `ASV_PEOPLE` **uniquement** → un vétérinaire reste dans `PEOPLE` **et dans la table partagée `vet_roster`** ;
3. appelle l'Edge Function `manage-users` action `purge`.

**B — ligne « Sans compte »** (`data-purge-local`, [settings.js:365](src/settings.js#L365), handler [settings.js:557-584](src/settings.js#L557-L584)) — **c'est le cas de la capture, « test vétérinaire · Vétérinaire salarié · Sans compte »** :
1. supprime les slots locaux ;
2. `splice` dans `ASV_PEOPLE` uniquement → pour un vétérinaire salarié, **aucun retrait** : ni de `PEOPLE`, ni de `vet_roster` ;
3. **aucun appel distant.**

Le titre de la confirmation dit d'ailleurs « Retirer du planning », pas « supprimer » : le bouton fait ce qu'il annonce, mais ce n'est pas ce qui est attendu.

### Ce que la purge distante atteint aujourd'hui

[`supabase/functions/manage-users/index.ts:226-250`](supabase/functions/manage-users/index.ts#L226-L250) — quatre tables + le compte :
`monthly_signatures`, `signature_tokens`, `annual_interviews`, `calendar_sync_tokens`, puis `user_profiles` et le compte `auth`.

### Ce qu'aucune des deux purges n'atteint

| Table / stockage | Clé | Effet visible du résidu |
|---|---|---|
| `vet_roster` | `id` | **la ligne vétérinaire reste** partout, sur tous les postes |
| `forecast_signatures` | `person_id` | signature de prévisionnel fantôme |
| `cp_adjustments` | `person_id, year` | ajustement de CP orphelin au tableau de bord |
| `medical_visits` | `person_id` | carte « visites médicales » du tableau de bord |
| `announcement_reads` | `person_id` | accusés de lecture orphelins |
| `announcements.author_id` | `person_id` | annonces signées d'un disparu |
| `push_subscriptions` | `user_name` | notifications poussées vers un compte supprimé |
| `caldav_credentials` | `person_id` | identifiants iCloud conservés |
| roster ASV | `localStorage` | suppression **par appareil** : les autres postes gardent la ligne |

### Fichiers réellement concernés

- `src/settings.js` (les deux handlers 💣 et le rendu du tableau)
- `src/api.js` (roster vétérinaire : il existe `apiSetVetArchived`, **pas** de suppression)
- `src/state.js` (rosters ASV et vétérinaire)
- `supabase/functions/manage-users/index.ts` (action `purge`)
- `src/lib/` — fichier nouveau pour la règle « que supprimer / peut-on supprimer »
- `tests/unit/` — fichier de test associé

**Et, si le roster ASV est migré, les trois consommateurs réels de `timeFraction` / `saturdayOnly` / `workingDays`** — omis de la première version de cette note, corrigé après passage AV :
- `src/slots.js` ([l.186](src/slots.js#L186) : heures nominales du samedi)
- `src/dashboard-stats.js` (quota hebdomadaire, cible annuelle)
- `src/leave-requests.js` ([l.413](src/leave-requests.js#L413) : proratisation des CP)

## 3. Schéma de données visé

### Une seule migration : `asv_roster`

Décidée à l'arbitrage. Elle calque **exactement** `vet_roster` (migration `20260803000001`), plus les champs propres aux ASV. **Présentée pour validation, non appliquée.**

```sql
create table if not exists asv_roster (
  id             text primary key,   -- sert de person_id dans les clés de planning
  name           text not null,
  short          text not null,
  last_name      text,
  initial        text not null,
  color          text not null,
  time_fraction  numeric not null default 1.0,   -- ⚠ entre dans le calcul des heures
  saturday_only  boolean not null default false, -- ⚠ idem
  working_days   jsonb,                          -- ⚠ idem
  archived       boolean not null default false,
  sort_order     int not null default 0,
  updated_at     timestamptz not null default now()
);
```

RLS calquée sur `vet_roster` : lecture pour tout compte authentifié (un ASV doit voir l'effectif), écriture réservée à `vet` et `admin`.

`localStorage` (`ASV_ROSTER_KEY`) est **conservé, rétrogradé en cache d'amorçage / hors ligne**, exactement comme `VET_ROSTER_KEY` l'est pour les vétérinaires. Aucune donnée perdue en cas de coupure réseau.

### L'amorçage : le vrai sujet de la migration

`vet_roster` a pu être amorcé par un `INSERT` en dur (deux associés connus). Pour les ASV, **la vérité n'existe qu'en `localStorage`, potentiellement différente d'un poste à l'autre** : ajouts, temps de travail modifiés, archivages. Un `INSERT` en dur choisirait arbitrairement un état et écraserait silencieusement les autres.

Il faut donc que la migration crée la table **vide**, et que le front applique la règle : table vide → le premier poste admin qui se connecte y pousse son roster local, puis la table fait foi ; table non vide → elle écrase le cache local, comme pour `vet_roster`. Le poste qui amorce doit être **celui de Jérémie**, choisi sciemment, pas le premier arrivé.

### La suppression elle-même

Aucune autre migration. La purge s'étend aux tables existantes via l'Edge Function en `service_role` : aucune policy nouvelle.

**Correction après passage AV** — deux affirmations de la première version étaient fausses :
- La policy `DELETE` **existe déjà**. `create policy "vet admin writes vet_roster" on vet_roster for all` ([migration 20260803000001, l.70-75](supabase/migrations/20260803000001_role_vet_employe.sql#L70-L75)) : `for all` couvre `DELETE` pour `admin` et `vet`. Rien à trancher.
- Le SQL ci-dessus ne « calque pas exactement » `vet_roster` : il laisse tomber la contrainte `check (id <> '' and id !~ '[_/[:space:]]')` (l.49 de la migration), celle qui protège l'extraction du `person_id` depuis les clés de planning. **À rétablir** dans tout SQL final.

## 4. Invariants touchés

**Cette section était fausse dans la première version. Corrigée après passage AV.**

- **`asv-hours-contract` n'est PAS dans le rayon d'action.** Ni `timeFraction`, ni `saturdayOnly`, ni `workingDays` n'entrent dans `src/lib/asv-hours.js` : l'heure du samedi y est clée **par identifiant littéral**, `const SATURDAY_HOURS_BY_PID = { carla: 7 + 25 / 60 }` ([asv-hours.js:13](src/lib/asv-hours.js#L13), consommé [l.37](src/lib/asv-hours.js#L37), miroir `supabase/functions/_shared/asv-hours.ts:19,45`). Le test de contrat ne peut structurellement pas voir un roster.
  → **Conséquence directe : le « test de non-régression de paie » proposé au §7 de la première version aurait été tautologique.** Branché sur `asv-hours.js`, il passe quoi qu'on mette dans la table. C'est exactement le motif que `CLAUDE.md` interdit. Il est remplacé au §7.
- **Le risque de paie est réel mais ailleurs**, dans trois consommateurs que le contrat ne couvre pas : `src/slots.js`, `src/dashboard-stats.js`, `src/leave-requests.js`.
- **Deux règles concurrentes pour l'heure du samedi, déjà présentes dans le dépôt** :

  | Site | Règle |
  |---|---|
  | [slots.js:186](src/slots.js#L186) | `personOf(pid)?.saturdayOnly ? ASV_STD_SAT_CARLA : 7.0` — **par drapeau** |
  | `_shared/asv-hours.ts:45` | `SATURDAY_HOURS_BY_PID[pid] ?? 7.0` — **par pid littéral** |

  Elles ne s'accordent aujourd'hui que par accident : `saturdayOnly` n'est écrit par **aucune interface** (zéro occurrence dans `src/settings.js`). C'est une constante de fait, portée par une seule personne. Faire de `saturday_only` une colonne partagée et éditable **arme cette divergence**. → `saturday_only` ne devient pas éditable tant que les deux règles ne sont pas réconciliées en une seule.
- `ASV_STD_SAT_CARLA / 35` est **dérivé, jamais recopié** ([state.js:77-79](src/state.js#L77-L79)). Une colonne `numeric` **est** une recopie : aucune dérivation ne survit à un `INSERT`. Voir le scénario du §7.
- Le rattrapage « Carla absente des données sauvegardées » ([state.js:69-83](src/state.js#L69-L83)) doit être rejoué ou explicitement retiré, pas oublié.
- RLS : **non affaiblie**. `asv_roster` calque `vet_roster` ; la purge reste en `service_role` derrière un appelant vérifié admin.
- Le commentaire [api.js:96-97](src/api.js#L96-L97) pose une règle explicite : *« On ne supprime jamais : les clés de planning historiques référencent le person_id et doivent rester lisibles. »* **Ce chantier la contredit frontalement.** C'est le vrai sujet de conception, traité au §7.

## 5. Ce qui change pour l'utilisateur final

Un seul comportement pour le 💣, quel que soit le type de ligne : après confirmation, la personne disparaît de la gestion des collaborateurs, du calendrier et du tableau de bord, **sur tous les postes** — ASV comprises, une fois le roster partagé.

La fenêtre de confirmation liste ce qui va réellement être supprimé, chiffré : « 47 demi-journées, 3 mois signés, 1 entretien ». Si un mois signé existe, elle le dit en clair et demande une seconde confirmation. Si rien n'a jamais été signé — le cas de « test vétérinaire » — un seul clic suffit.

Effet de bord bienvenu de la migration `asv_roster` : **ajouter** une ASV ou modifier son temps de travail devient également visible de tous les postes, ce qui n'était pas le cas.

## 6. Ce qui ne sera pas fait

- Aucune corbeille, aucun undo, aucune restauration.
- Aucun journal d'audit des suppressions.
- **Aucune fusion automatique de rosters ASV divergents.** Un seul poste amorce `asv_roster` ; les autres se réalignent sur la table. Si un poste avait des ASV que le poste d'amorçage n'a pas, elles ne remonteront pas toutes seules — il faudra les ressaisir.
- Aucun changement du calcul des heures. Les valeurs `time_fraction` / `saturday_only` / `working_days` sont transportées, pas recalculées.
- Le chantier « signalements » en cours (`docs/NOTE-SIGNALEMENTS.md`, table `feedback` du 16/08) n'est pas touché — la table `feedback` n'a pas de colonne `person_id`, rien à purger.

## 7. Les risques

**Erreur de paie — le risque numéro un depuis l'arbitrage.** Faire transiter `time_fraction`, `saturday_only` et `working_days` par une table partagée crée un mode de panne inédit : un roster distant incomplet, mal typé ou mal appliqué change silencieusement le temps de travail d'une ASV, donc ses heures dues et ses CP proratisés. `vet_roster` ne portait aucun champ de ce genre — le précédent n'est donc pas rassurant, il est simplement muet.

**Le scénario précis, trouvé par AV — l'arrondi qui canonise une valeur fausse :**
1. Carla porte `timeFraction = ASV_STD_SAT_CARLA / 35 = 0,2119047…` ([config.js:85](src/config.js#L85), repli dérivé [state.js:79](src/state.js#L79)).
2. L'admin ouvre « Modifier » sur une ligne ASV. Aucun preset ne matche → preset `custom`, et le champ pourcentage est rempli par un `Math.round(cur * 100)` = **21**.
3. Enregistrer, **sans même toucher au bloc temps de travail**, renvoie `(parseInt('21') || 100) / 100` = **0,21** ([settings.js:781](src/settings.js#L781)). La dérivation est perdue, silencieusement.
4. Rien ne le signale : le seul test qui regarde ce champ (`tests/asv-rules.spec.ts`) a des bornes assez larges pour accepter à la fois l'arrondi **et** l'ancien bug `7,25 / 35` corrigé par le commit `5475ef0`.
5. L'amorçage pousse cette valeur en base. Tous les autres postes s'alignent dessus. Les CP proratisés de Carla ([leave-requests.js:413](src/leave-requests.js#L413)) et sa cible annuelle sont désormais faux **à l'échelle de la clinique**, écrits en base, indistinguables d'une valeur juste — et le TNR reste vert de bout en bout.

C'est le mode d'échec du commit `5475ef0` — une valeur recopiée qui remplace une valeur dérivée — rejoué avec une base de données pour le figer.

Garde-fous, à tenir dans le lot de migration :
- `applyAsvRosterRows` ignore un jeu de lignes vide, exactement comme [`applyVetRosterRows`](src/state.js#L184) : mieux vaut un roster périmé qu'un effectif vidé.
- Une `time_fraction` absente ou illisible **conserve la valeur locale** au lieu de retomber sur `1.0` — un défaut à `1.0` transformerait une ASV à 75 % en temps plein, silencieusement.
- **Assertion unitaire dure, exécutable sans Supabase** (remplace le test tautologique de la première version) : le roster par défaut de `config.js` et le repli de `state.js:79` valent exactement `ASV_STD_SAT_CARLA / 35`, en `toBeCloseTo(…, 10)`. Et resserrer les bornes de `tests/asv-rules.spec.ts`, qui acceptent encore l'ancien bug.
- **Corriger le chemin d'arrondi de [settings.js:781](src/settings.js#L781) avant tout amorçage** — sinon la migration grave l'erreur dans la base.
- **Avant d'amorcer : dumper la clé `amivet_asv_roster` de chaque poste et archiver les JSON.** C'est la seule chose qui rend le point de non-retour (§7 bis) franchissable sans perte.

**Perte de preuve juridique.** Supprimer les `monthly_signatures` d'un salarié réel efface les feuilles d'heures signées : la preuve du temps de travail déclaré et validé. Aujourd'hui la purge le fait déjà, mais comme elle est visiblement incomplète elle n'est probablement jamais utilisée sur un vrai salarié. La rendre complète et propagée à tous les postes transforme un bouton à moitié cassé en arme qui marche.

Traité par la décision d'arbitrage : la suppression **compte le passé signé avant d'agir** — libre si le compte est à zéro, avertissement chiffré et second palier de confirmation sinon. C'est une règle métier : elle va dans `src/lib/`, elle est testée, elle n'est pas enfouie dans `settings.js`.

**Amorçage du roster ASV depuis le mauvais poste.** Si un poste au roster incomplet amorce `asv_roster` le premier, il impose son état à toute la clinique. Traité au §3 : l'amorçage est un geste explicite et réservé à l'admin, pas un effet de bord du premier chargement.

**`sort_order` n'a aucune contrepartie locale.** `saveASVRoster` ([state.js:26-44](src/state.js#L26-L44)) ne persiste **aucun ordre** — seul le rang dans le tableau compte — et `reindexPresentShades` attribue les nuances de « présent » **par index**. Une table dont toutes les lignes valent `0` rend l'ordre non déterministe : nuances de vert et colonnes du tableau de bord changent d'un chargement à l'autre. Il faut donc inventer un champ qui n'existe pas dans le modèle actuel, et décider de son amorçage. Travail non prévu dans la première version.

**Dépendance créée.** L'effectif ASV, aujourd'hui garanti hors ligne, devient tributaire d'une lecture réseau et d'une RLS. Et l'écriture réservée à `vet` / `admin` retire à une ASV et à un `vet_employe` la capacité de corriger leur roster local. C'est peut-être voulu, mais ça doit figurer au §5.

## 7 bis. Le point de non-retour

Ce n'est ni la migration ni le code : une table vide se `drop`, `src/api.js` et `src/state.js` se `revert`.

Le point de non-retour est **le premier `applyAsvRosterRows()` qui aboutit sur un poste autre que celui qui a amorcé** — au premier chargement d'un poste tiers après l'`INSERT` initial. À cet instant, son `localStorage` est écrasé sans copie et sans journal, et toute `time_fraction` erronée présente en base devient indistinguable d'une valeur juste.

Le geste d'amorçage reste réversible **tant qu'aucun autre poste n'a rechargé**. Cette fenêtre est courte et n'est protégée par rien d'autre que les dumps `localStorage` archivés au préalable (§7).

**Perte de données de planning.** La purge des slots est locale, puis propagée par `buildPatch` / `applyPatch`. Il faut vérifier que le patch porte bien des suppressions et qu'un poste au cache plus ancien ne ressuscite pas les slots au prochain `pullRemotePlanning`. À vérifier par test au lot concerné, pas à supposer.

**Purge partielle.** Si l'Edge Function échoue au milieu, on obtient un état mixte. La purge doit être ordonnée du plus périphérique vers la ligne de roster, et le front ne retire la personne de l'effectif **qu'après** succès distant — l'inverse de ce que fait le handler actuel, qui `splice` avant d'appeler le serveur.

## 8. Définition de « terminé »

1. Le roster ASV est partagé : ajouter, modifier ou supprimer une ASV depuis un poste est visible de tous.
2. Les heures calculées après migration sont **identiques** à celles calculées avant, ASV par ASV, prouvé par test.
3. Les deux 💣 mènent au même comportement complet, quel que soit le type de ligne (ASV ou vétérinaire, avec ou sans compte).
4. Toutes les tables du tableau du §2 sont purgées, `vet_roster` et `asv_roster` compris.
5. La règle « que peut-on supprimer, et à quel prix » vit dans `src/lib/`, exportée et testée.
6. TNR vert, au-dessus de la référence (344 unitaires / 12 fichiers + 30 Playwright), avec les tests neufs en plus.
7. `docs/EXPLOITATION.md` et `docs/SECURITE.md` mis à jour : ce que le 💣 supprime exactement, et qu'il n'y a pas de retour en arrière.
8. Commits locaux, un par lot, disant quoi et pourquoi. Le lot de migration signale explicitement qu'il touche aux données de temps de travail.
9. Passation FS écrite.

**À la charge de Jérémie :**
- Appliquer la migration `asv_roster` dans Supabase (SQL Editor), après validation du SQL.
- **Amorcer le roster depuis son poste**, celui dont l'effectif ASV fait foi — geste unique et irréversible en pratique.
- Redéployer l'Edge Function `manage-users` : le déploiement GitHub Pages ne couvre pas les fonctions Supabase.
- Vérifier en production sur la ligne « test vétérinaire », puis sur une ASV **archivée** avant d'y toucher pour de vrai.

## 9. Découpage — l'ordre est rouvert par AV

**La voie courte, ratée à la première lecture.** La ligne de la capture — « test vétérinaire · Vétérinaire salarié · Sans compte » — **ne vient pas d'`ASV_PEOPLE`**. Elle vient de `PEOPLE`, via `localOnlyVets` ([settings.js:314-322](src/settings.js#L314-L322)). Le handler `data-purge-local` ([settings.js:571](src/settings.js#L571)) ne cherche que dans `ASV_PEOPLE` : **c'est tout le bug.** Or `vet_roster` est **déjà** une table partagée, dont la policy `for all` autorise **déjà** le `DELETE` à `admin` et `vet`.

Le besoin d'origine se corrige donc en deux gestes, **sans aucune migration** :
1. faire chercher le handler dans `PEOPLE` autant que dans `ASV_PEOPLE` ;
2. étendre l'action `purge` de l'Edge Function à `vet_roster` (ou ajouter un `apiDeleteVetRoster` à côté d'`apiSetVetArchived`, [api.js:98](src/api.js#L98)).

Zéro nouvelle table, zéro champ de paie sur le réseau, effet immédiatement visible sur tous les postes. Le roster ASV en `localStorage` reste une vraie dette — mais c'est une dette **d'ajout**, pas de suppression : rien dans le symptôme rapporté ne l'exige.

Placer la migration ASV en Lot 0 fait donc attendre la correction courte, sûre et réversible **derrière le seul morceau irréversible du chantier**. Si le Lot 0 dérape ou traîne, le 💣 reste cassé.

### Découpage initial (migration d'abord)

- **Lot 0 — migration du roster ASV.** SQL `asv_roster` + RLS, `src/api.js` (fetch / upsert / delete), `src/state.js` (`applyAsvRosterRows`, cache rétrogradé), amorçage explicite par l'admin. **Tests de non-régression de paie** : heures identiques avant / après. Aucun changement au 💣. C'est le lot le plus risqué du chantier — il passe en premier, seul, et se termine par un TNR vert avant qu'on aille plus loin.
- **Lot 1** — extraire dans `src/lib/` la règle de suppression : ce qu'on compte avant d'agir (demi-journées, mois signés, entretiens), ce qui déclenche le second palier, la liste ordonnée de ce qui est à supprimer. Tests unitaires. Aucun changement visible.
- **Lot 2** — étendre l'action `purge` de l'Edge Function à toutes les tables du §2, les deux rosters inclus, dans l'ordre défini au Lot 1.
- **Lot 3** — unifier les deux handlers `settings.js` : un seul chemin, appel distant **avant** retrait local, récapitulatif chiffré et second palier dans la confirmation, rafraîchissement des deux rosters après succès.
- **Lot 4** — documentation et passation.

Chaque lot laisse le dépôt cohérent et se termine par un TNR vert et un commit local.

### Découpage recommandé après AV (voie courte d'abord)

- **Lot A — le 💣 vétérinaire.** Handler unifié `PEOPLE` + `ASV_PEOPLE`, purge étendue à `vet_roster`, règle de suppression extraite dans `src/lib/` avec le comptage du passé signé et le second palier de confirmation. Aucune migration, entièrement réversible. **Répond au symptôme d'origine.**
- **Lot B — la purge complète.** Les huit stockages du §2, ordre du plus périphérique vers le roster, appel distant avant retrait local.
- **Lot C — la migration `asv_roster`.** L'ancien Lot 0, avec tous les garde-fous du §7, **précédé** de la correction de l'arrondi [settings.js:781](src/settings.js#L781) et de l'archivage des `localStorage`. Chantier à part entière, qui peut vivre sur sa propre branche.
- **Lot D** — documentation et passation.

## 10. Ce qui reste ouvert

**Une question d'ordre, à trancher par Jérémie** : découpage initial (migration ASV d'abord, conforme à son arbitrage de 7 h 50) ou découpage recommandé après AV (💣 vétérinaire d'abord, migration ASV ensuite) ? Dans les deux cas la migration ASV est faite — seul l'ordre change.

Deux points techniques se tranchent au moment du lot de migration, pas avant :
1. `working_days` en `jsonb` ou en colonnes booléennes — dépend de la forme exacte du champ local.
2. Le geste d'amorçage : bouton dédié dans les réglages, ou proposition à l'admin quand la table est vide.

## 11. Traces

- Branche de travail : `feat/suppression-collaborateur`, créée le 16/08/2026. Merge sur `main` plus tard.
- Note passée au contradicteur indépendant (skill AV, mode DOSSIER) le 16/08/2026 : trois objections retenues, toutes vérifiées dans le dépôt. Corrections intégrées aux §2, §3, §4, §7, §7 bis et §9.
