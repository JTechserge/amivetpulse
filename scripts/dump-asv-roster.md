# Relevé du roster ASV avant migration — lot C2

Procédure manuelle, à exécuter **une fois par poste et par navigateur** avant
tout amorçage de la table partagée `asv_roster`.

Contexte et justification : `docs/NOTE-SUPPRESSION-COLLABORATEUR.md` §7, §7 bis
et §14. Ce relevé est ce qui rend le point de non-retour franchissable sans
perte : après l'amorçage, le `localStorage` de chaque poste tiers est écrasé
sans copie ni journal.

## L'ordre compte

1. **Ce relevé d'abord**, sur tous les postes.
2. Le déploiement de C1 (`CACHE_VERSION` → `amivet-v9`) **ensuite**.
3. La re-saisie des fractions perdues (lot C3) **après** le déploiement.

Relever après avoir déployé ferait perdre la qualité de preuve de l'archive : on
ne pourrait plus dire si une valeur suspecte précédait ou suivait le push.

## ⚠️ Ne pas ouvrir l'application pour relever

`loadASVRoster()` **écrit** dans `localStorage` dans deux cas : quand Carla est
absente du tableau (`src/state.js:82`) et quand la clé n'existe pas encore
(`src/state.js:87`). Sur un poste où une ASV a été purgée par le 💣, ouvrir
l'app pour relever la réinjecte en fin de tableau. Le relevé modifierait son
propre objet.

**Le contournement**, valable parce que le service worker n'a aucun repli de
navigation — il n'intercepte que `/`, `/index.html` et `/amivet-pulse.html`
(`public/sw.js:99`) — et parce que `localStorage` est cloisonné par **origine**,
pas par chemin :

> Ouvrir un onglet sur une URL inexistante de la même origine, par exemple
> `https://jtechserge.github.io/amivetpulse/releve-roster`
>
> GitHub Pages renvoie sa page 404. Aucun script de l'application ne s'exécute,
> et la console a malgré tout accès au `localStorage` de l'origine.

## Le relevé, poste par poste

Onglet ouvert sur l'URL 404 ci-dessus → DevTools → Console :

```js
const raw = localStorage.getItem('amivet_asv_roster');
console.log(raw === null ? '### AUCUNE CLÉ SUR CE POSTE ###' : raw);
```

**L'ordre du tableau est une donnée** : le champ `present` (nuance de vert)
n'est pas persisté, il est réattribué par rang (`src/state.js:22-24`). Copier le
JSON tel quel, sans le réordonner ni le reformater.

Archiver sous `roster-<poste>-<navigateur>-AAAA-MM-JJ.json`, **hors du dépôt** —
le fichier contient des noms de salariées et leur temps de travail (volet RGPD
de `docs/EXPLOITATION.md`).

Champs attendus par entrée : `id`, `name`, `short`, `initial`, `color`,
`timeFraction`, `archived`, `saturdayOnly`, `workingDays`, et `lastName` s'il
est renseigné.

## L'inspection — ce qu'on cherche

Sur le même onglet, après le relevé :

```js
console.table(
  JSON.parse(localStorage.getItem('amivet_asv_roster')).map((p, rang) => ({
    rang,
    id: p.id,
    timeFraction: p.timeFraction,
    workingDays: JSON.stringify(p.workingDays),
    saturdayOnly: p.saturdayOnly,
    archived: p.archived,
  }))
);
```

Trois anomalies, par ordre de gravité :

| Ce qu'on voit | Ce que ça veut dire |
|---|---|
| `timeFraction: 0` | Jours choisis jamais persistés (défaut de la modale d'invitation). **Zéro CP acquis, zéro cible annuelle**, sans aucun signe visible dans le calendrier. Lot C3. |
| `workingDays: []` | Même défaut, vu par l'autre bout. Le garde `length > 0` (`src/slots.js:294`) échoue et tous les jours redeviennent travaillables. |
| Carla à `0.21` | Fraction reconstruite depuis son affichage arrondi. La valeur juste est `ASV_STD_SAT_CARLA / 35` = `0.2119047…`, **dérivée, jamais recopiée**. |

## Le recensement serveur — quel poste a été oublié

À exécuter dans le SQL Editor de Supabase. Il donne les `person_id` que le
serveur connaît. Un identifiant présent ici et absent de **tous** les JSON
relevés prouve qu'un poste a été manqué : c'est ce qui transforme « désigner le
poste qui fait foi » en vérification plutôt qu'en déclaration.

Les deux expressions rationnelles reproduisent `extractPersonIdFromKey`
(`src/lib/planning-auth.js:18-26`) — les formats `AAAA-MM-JJ_<pid>_…`,
`forecast_<pid>_…` et `forecast_sig_<pid>_…`.

```sql
with cles as (
  select jsonb_object_keys(data) as k
  from planning_data
  where id = 'singleton'
),
recense as (
  select coalesce(
           substring(k from '^forecast(?:_sig)?_([^_]+)_'),
           substring(k from '^\d{4}-\d{2}-\d{2}_([^_]+)')
         ) as person_id,
         'planning_data' as source
  from cles
  union all
  select person_id, 'user_profiles'      from user_profiles      where person_id is not null
  union all
  select person_id, 'monthly_signatures' from monthly_signatures where person_id is not null
  union all
  select person_id, 'annual_interviews'  from annual_interviews  where person_id is not null
  union all
  select person_id, 'medical_visits'     from medical_visits     where person_id is not null
)
select person_id,
       string_agg(distinct source, ', ' order by source) as vu_dans
from recense
where person_id is not null
group by person_id
order by person_id;
```

Le résultat mélange vétérinaires et ASV — `person_id` ne porte pas le type.
Écarter à la lecture les identifiants du roster vétérinaire (`vet_roster`).

## Terminé quand

- Un JSON par poste et par navigateur, ordre préservé, archivé hors dépôt.
- Le recensement serveur exécuté, et chaque `person_id` ASV retrouvé dans au
  moins un JSON — ou l'écart expliqué.
- Les trois anomalies recherchées sur chaque JSON, résultat écrit.
- Le poste qui fait foi désigné explicitement.

## Limite connue

Sur un iPad ou un iPhone, la console n'est accessible qu'en branchant l'appareil
à un Mac (Safari → Développement → Web Inspector). Sans cela, il n'existe pas de
moyen de relever un poste iOS sans ouvrir l'application — donc sans risquer
l'écriture décrite plus haut. Si un poste iOS porte un roster qui compte, le
signaler avant d'amorcer plutôt que de relever à l'aveugle.
