# Note de conception — lot C3a

Chantier « migration du roster ASV vers table partagée ». Note écrite le
16/08/2026, après la réparation C3b. Elle **remplace** le cadrage de C3a présenté
en séance le 16/08 au soir, qui n'avait jamais été écrit dans un fichier et dont
deux prémisses sont tombées depuis.

## 1. Le problème

L'application peut encore écrire une fraction de temps **nulle** dans le roster
ASV, et cette valeur traverse ensuite tous les calculs sans faire de bruit.

## 2. L'état actuel

Le trou est identifié et reproductible : `resolveTimeFraction({preset: 'days',
checkedDays: []})` rend `{fraction: 0, workingDays: []}` — `fractionFromDays([])`
somme une liste vide, donc `0 / 35`. Aucun des deux points d'écriture ne le
refuse : ils affectent `tfResult.fraction` tel quel.

| Fichier | Rôle dans le lot |
|---|---|
| `src/lib/time-fraction.js` | `fractionFromDays` (106-114), `resolveTimeFraction` (147-171) — où la règle doit vivre |
| `src/settings.js` | les **deux seuls** points d'écriture : invitation (705-718), édition (978-990) |
| `src/dashboard-stats.js` | 666-673 — où un `target` à 0 éteint silencieusement la projection *et* l'alerte « heures à régulariser » |
| `src/calendar.js` | 1160 et 1197 — champ mort `time_fraction` envoyé à `request-signature` |
| `tests/unit/asv-time-fraction.test.js` | la suite qui couvre la règle |

**Ce qui a changé depuis le cadrage initial.** Le défaut Carla est **réparé**
(C3b, 16/08, vérifié) : il n'existe aujourd'hui **aucune fraction fausse en
production**. Et l'interface, on le sait depuis ce soir, n'offre **aucun chemin
de réparation** — la garde `unchanged` rend intacte toute valeur qui s'affiche
sur le même pourcentage arrondi. Ces deux faits déplacent le centre de gravité du
lot : de la **détection** vers la **prévention**.

## 3. Schéma de données

Aucun. C3a ne touche ni la base, ni une migration, ni une policy. La table
partagée reste l'objet du chantier global, pas de ce lot.

## 4. Invariants touchés

**Aucun des garde-fous nommés.** Vérifié : `tests/unit/asv-hours-contract.test.js`
ne mentionne ni `timeFraction` ni `time-fraction` — la fraction de temps
n'intervient pas dans l'accord `src/lib/` ↔ `supabase/functions/_shared/`. Le lot
doit simplement laisser le palier 2 vert, `asv-time-fraction.test.js` compris.

Point d'attention : les vétérinaires **n'ont pas** de `timeFraction` du tout. Le
repli `?? 1.0` en lecture est légitime et ne doit pas être touché — sinon faux
positif sur David et Stéphane. La garde se pose donc **en écriture**, sur le seul
chemin ASV.

## 5. Ce qui change pour l'utilisateur

Une seule chose visible : choisir « Certains jours » **sans cocher aucun jour**
est refusé avec un message, au lieu d'enregistrer 0 % en silence. Aucun autre
écran ne bouge, aucune valeur existante n'est réécrite.

## 6. Ce qui ne sera pas fait

- **Les marqueurs d'affichage** qui signalaient une fraction suspecte. Le seul
  défaut jamais constaté en production est réparé, et un marqueur qui alerte sans
  offrir de chemin de réparation ne fait qu'inquiéter. Consigné en dette.
- **La saisie en heures et minutes**, et le chemin « rétablir la valeur
  contractuelle ». C'est la dette ouverte ce soir, et c'est un lot en soi.
- **La sentinelle `pre-push`** : elle protégeait la règle « relever avant de
  pousser ». C2 est clos, le relevé est fait, elle n'a plus d'objet.
- **La migration vers la table partagée** elle-même.

## 7. Risques

**Erreur de paie** — c'est le risque de la famille bloquante. `timeFraction`
proratise les CP acquis et la cible annuelle de modulation. Deux façons de se
tromper, opposées :

- garde absente → un 0 s'écrit, les CP acquis tombent à zéro sans alerte ;
- garde trop large → une valeur légitime est refusée, et une ASV devient
  impossible à saisir correctement.

D'où le seuil retenu : **refuser une fraction ≤ 0**, et rien d'autre. Pas de
plancher arbitraire, pas de substitution silencieuse à 1.0 — substituer
inventerait un contrat de travail.

## 8. Terminé quand

1. La règle vit dans `src/lib/time-fraction.js`, testée aux deux cas d'entrée
   (invitation d'une personne neuve, édition d'une personne existante).
2. Les deux points d'écriture de `src/settings.js` la respectent.
3. Le champ mort `time_fraction` est retiré de `src/calendar.js` (1160, 1197) —
   `request-signature` ne lit que `year, month, person_id` (`index.ts:67`), le
   laisser maintient un multiplicateur de paie non validé sur le réseau. Commit
   `chore` séparé.
4. Palier 2 vert : `npm run lint && npm run test:unit`.
5. Dette constatée consignée via DTF, commit local fait, passation FS écrite.
6. **Aucune action manuelle** ne reste à la charge de Jérémie : C3b, la seule qui
   l'était, est faite.

## Le point qui demande un arbitrage

À l'**invitation**, la personne est neuve : il n'y a aucune valeur courante à
préserver. Si « Certains jours » est choisi sans aucun jour coché, deux issues
possibles :

- **(a) Bloquer l'enregistrement** avec un message — recommandé. La saisie est
  incomplète, pas ambiguë ; l'inviter à cocher un jour est la seule réponse qui
  ne devine rien.
- **(b) Retomber sur 100 %** — écarté : ce serait inventer un temps plein, et
  c'est exactement le genre de repli silencieux qui a produit le défaut d'origine.

À l'**édition**, la question ne se pose pas : la valeur courante existe, la garde
la conserve.
