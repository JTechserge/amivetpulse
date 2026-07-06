# Prompt Claude Code — Redesign complet du calendrier mensuel

## Objectif

Remplacer le rendu tableau HTML du calendrier par une **grille CSS en blocs de semaine**. La structure actuelle (table HTML avec une ligne par personne et une colonne par demi-journée) est remplacée par une structure où **chaque jour est une colonne** et **toutes les personnes sont empilées à l'intérieur** de chaque colonne.

Résultat visuel cible :
- 7 colonnes égales (Lundi → Dimanche), identiques quelle que soit la longueur du mois
- 5-6 blocs de semaine empilés verticalement avec une séparation entre chaque semaine
- Dans chaque colonne-jour : le numéro du jour en haut, puis une bande M/A par personne
- Chaque bande M/A : moitié gauche = matin, moitié droite = après-midi, colorée selon le statut
- Les samedis et dimanches affichent uniquement le numéro, pas de bandes interactives
- Aucun colspan, aucun merge visuel — chaque jour est rendu individuellement

## Ce qui NE change PAS — liste exhaustive

Aucune modification de :
- `PRESENT_SHADES` (lignes 1025-1028) et l'appel à `info.style` dans `cellRenderInfo()`
- Variables CSS : `--color-absent`, `--color-leave-pending`, `--color-leave-rejected`, `--color-holiday`, `--color-saturday`, `--color-sunday`
- `cellRenderInfo(iso, personId, slot)` — réutiliser telle quelle pour les couleurs et labels
- `cellAriaLabel(iso, personId, slot)` — réutiliser pour l'accessibilité
- La logique de données en mémoire (slots, absences, decisions, getSlotState, etc.)
- Toutes les requêtes Supabase
- Le toolbar calendrier (`.cal-toolbar`, navigation mois, boutons filtres)
- La légende existante (`.legend`)
- La vue semaine ASV (`.week-view-wrap`) — non touchée
- Le side panel `.day-sidebar`
- Les modales et formulaires

## Lire d'abord — sections critiques

Avant d'écrire quoi que ce soit, lire `amivet-pulse.html` et identifier :

1. **`buildHalfTable(year, month, days, people)`** — la fonction principale à remplacer. Comprendre les paramètres, notamment `people` (tableau d'objets person avec `.id`, `.short`, `.present`, `.color`).

2. **`buildCalendarGrid(viewKey)`** — comprend la logique de `days` (liste des jours du mois à afficher), `people` (quelle liste selon le viewKey : PEOPLE ou ASV_PEOPLE), et l'assemblage final. Identifier où `buildHalfTable` est appelé.

3. **Event handlers sur `.cal-cell`** — chercher TOUS les `addEventListener` et handlers JS qui référencent `.cal-cell`, `data-date`, `data-person`, `data-slot`, `data-slots`, `data-action="locked"`. Ce sont ces handlers qui doivent être mis à jour pour cibler `.cal-wg-half` à la place.

4. **Drag-to-fill** — identifier la logique complète (mousedown/mousemove/mouseup) qui utilise `.cal-cell`. La comprendre pour la transposer à `.cal-wg-half`.

5. **`updateCellDOM(cellEl)`** — cette fonction met à jour le DOM d'une cellule après modification. Elle sera remplacée par une fonction équivalente sur `.cal-wg-half`.

6. **`isMonthSigned`, `canEditSlot`** — fonctions de permission qui déterminent `locked` et `readonly`. Réutiliser telles quelles.

---

## La nouvelle fonction de rendu

### Signature

Remplacer `buildHalfTable(year, month, days, people)` par :

```javascript
function buildWeekGrid(year, month, people)
```

La fonction calcule elle-même les semaines à partir de `year` et `month` (pas besoin de recevoir `days` — elle détermine les jours du mois et leur positionnement dans les semaines L-Di).

### Algorithme de construction des semaines

```
1. Trouver le premier jour du mois (new Date(year, month, 1)) et son isoWeekday (0=Lun…6=Dim)
2. Trouver le nombre de jours dans le mois
3. Construire un tableau de semaines : chaque semaine est un tableau de 7 entrées (null ou numéro de jour)
   - Semaine 1 : remplir les positions 0 à (isoWeekday-1) avec null (jours avant le 1er)
   - Remplir avec les jours 1 à lastDay
   - Compléter la dernière semaine avec null jusqu'à la position 6
4. Rendre chaque semaine comme un bloc CSS grid
```

### Structure HTML générée

```html
<div class="cal-wg">

  <!-- En-têtes statiques des jours de semaine -->
  <div class="cal-wg-head">
    <div class="cal-wg-dh">L</div>
    <div class="cal-wg-dh">M</div>
    <div class="cal-wg-dh">M</div>
    <div class="cal-wg-dh">J</div>
    <div class="cal-wg-dh">V</div>
    <div class="cal-wg-dh cal-wg-dh-we">SA</div>
    <div class="cal-wg-dh cal-wg-dh-we">DI</div>
  </div>

  <!-- Légende des personnes (remplace les row-labels) -->
  <div class="cal-wg-person-legend">
    <!-- Pour chaque person dans people : -->
    <span class="cal-wg-person-tag"
          style="background:[person.present.bg];color:[person.present.text];border-color:[person.present.border]">
      [person.short]
    </span>
    <!-- + chip statut absent, pending -->
    <span class="cal-wg-status-tag cal-wg-status-absent">Congé</span>
    <span class="cal-wg-status-tag cal-wg-status-pending">En attente</span>
  </div>

  <!-- Blocs semaine (N=4 à 6 selon le mois) -->
  <div class="cal-wg-week">

    <!-- 7 colonnes, une par jour de la semaine 0=Lun … 6=Dim -->
    <!-- Jour null (hors mois) : -->
    <div class="cal-wg-day cal-wg-day-empty" aria-hidden="true"></div>

    <!-- Jour normal : -->
    <div class="cal-wg-day [cal-wg-day-holiday] [cal-wg-day-today]"
         data-date="[iso]">
      <div class="cal-wg-day-head">
        <div class="cal-wg-daynum">[jour]</div>
        <div class="cal-wg-holiday-name">[nom du férié — si applicable]</div>
      </div>
      <div class="cal-wg-persons">
        <!-- Pour chaque person dans people : -->
        <div class="cal-wg-pstrip" data-person="[person.id]">
          <div class="cal-wg-half [cal-wg-half-present|absent|leave-pending|leave-approved|leave-rejected]
                       [cal-wg-half-locked|cal-wg-half-readonly]"
               data-date="[iso]" data-person="[person.id]" data-slot="M"
               style="[info.style]"
               [data-action="locked" si bloqué]
               tabindex="0" role="button"
               title="[info.title]"
               aria-label="[cellAriaLabel(iso, person.id, 'M')]">[info.html ou 'M']</div>
          <div class="cal-wg-half ..."
               data-date="[iso]" data-person="[person.id]" data-slot="A"
               ...>[info.html ou 'A']</div>
        </div>
      </div>
    </div>

    <!-- Samedi : pas de bandes interactives -->
    <div class="cal-wg-day cal-wg-day-we cal-wg-day-sa" data-date="[iso]">
      <div class="cal-wg-day-head">
        <div class="cal-wg-daynum">[jour]</div>
      </div>
    </div>

    <!-- Dimanche : idem -->
    <div class="cal-wg-day cal-wg-day-we cal-wg-day-su" data-date="[iso]">
      <div class="cal-wg-day-head">
        <div class="cal-wg-daynum">[jour]</div>
      </div>
    </div>

  </div>
  <!-- Semaines suivantes... -->

</div>
```

### Contenu de chaque `.cal-wg-half`

```javascript
const info = cellRenderInfo(iso, person.id, slot);
const locked = isMonthSigned(person.id, year, month);
const noEdit = !canEditSlot(person.id);
const blocked = locked || noEdit;
const lockCls = locked ? ' cal-wg-half-locked' : noEdit ? ' cal-wg-half-readonly' : '';
const stateCls = ` cal-wg-half-${info.stateClass}`;

// Contenu affiché dans la demi-cellule :
// - Si présent : la lettre M ou A (minuscule dans le CSS via font-weight/opacity)
// - Si absent/pending/approved : info.html (icône + label tronqué) OU juste la lettre
// Pour simplifier : afficher info.html s'il existe, sinon la lettre
const content = info.html || (slot === 'M' ? 'M' : 'A');
```

---

## CSS de la nouvelle structure

Ajouter ces règles dans le bloc `<style>` existant (avant `@media print`) :

```css
/* ============================================================
   Calendrier — grille par semaine (remplace .cal-table)
   ============================================================ */

.cal-wg {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  overflow: hidden;
  background: var(--color-surface);
}

/* En-têtes jours de semaine */
.cal-wg-head {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background: var(--color-secondary);
  border-bottom: 1px solid var(--color-border);
}
.cal-wg-dh {
  padding: 8px 0;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  border-right: 0.5px solid var(--color-border);
}
.cal-wg-dh:last-child { border-right: none; }
.cal-wg-dh-we { opacity: 0.6; }

/* Légende des personnes */
.cal-wg-person-legend {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.cal-wg-person-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1.5px solid transparent;
}
.cal-wg-status-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--color-text-muted);
}
.cal-wg-status-tag::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 8px;
  border-radius: 2px;
}
.cal-wg-status-absent::before { background: var(--color-absent); }
.cal-wg-status-pending::before { background: var(--color-leave-pending); }

/* Blocs semaine */
.cal-wg-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.cal-wg-week + .cal-wg-week {
  border-top: 3px solid var(--color-secondary);
}

/* Colonnes-jour */
.cal-wg-day {
  border-right: 0.5px solid var(--color-border);
  display: flex;
  flex-direction: column;
  min-height: 84px;
}
.cal-wg-day:last-child { border-right: none; }
.cal-wg-day.cal-wg-day-empty { background: var(--color-secondary); }
.cal-wg-day.cal-wg-day-sa { background: var(--color-saturday); }
.cal-wg-day.cal-wg-day-su { background: var(--color-sunday); }

/* En-tête du jour */
.cal-wg-day-head {
  padding: 6px 7px 3px;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  flex-shrink: 0;
}
.cal-wg-daynum {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
  flex-shrink: 0;
}
.cal-wg-day.cal-wg-day-today .cal-wg-daynum {
  background: var(--color-primary);
  color: #fff;
}
.cal-wg-day.cal-wg-day-holiday .cal-wg-daynum {
  background: var(--color-holiday);
  color: #92400E;
}
.cal-wg-day.cal-wg-day-sa .cal-wg-daynum,
.cal-wg-day.cal-wg-day-su .cal-wg-daynum { color: var(--color-text-muted); }
.cal-wg-holiday-name {
  font-size: 7px;
  font-weight: 600;
  color: #D97706;
  line-height: 1.2;
}

/* Bandes de personnes */
.cal-wg-persons {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 3px 3px;
  gap: 2px;
}
.cal-wg-pstrip {
  flex: 1;
  display: flex;
  border-radius: 4px;
  overflow: hidden;
  min-height: 20px;
  border: 0.5px solid transparent;
}

/* Demi-cellule interactive */
.cal-wg-half {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 7.5px;
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--transition);
  color: var(--color-text-muted);
  background: var(--color-surface);
  user-select: none;
}
.cal-wg-half + .cal-wg-half {
  border-left: 0.5px solid rgba(128, 128, 128, 0.15);
}
.cal-wg-half:hover { filter: brightness(0.94); }

/* États d'absence (couleur via class, pas via style inline) */
.cal-wg-half-absent,
.cal-wg-half-leave-approved {
  background: var(--color-absent);
  color: var(--color-absent-text);
}
.cal-wg-half-leave-pending {
  background: var(--color-leave-pending);
  color: var(--color-leave-pending-text);
}
.cal-wg-half-leave-rejected {
  background: var(--color-leave-rejected);
  color: var(--color-leave-rejected-text);
  font-size: 6.5px;
}
/* État présent : couleur via PRESENT_SHADES en style inline — pas de classe nécessaire */

/* Verrouillé / lecture seule */
.cal-wg-half-locked { cursor: not-allowed; opacity: 0.62; filter: grayscale(35%); }
.cal-wg-half-locked:hover { filter: grayscale(35%); }
.cal-wg-half-readonly { cursor: default; opacity: 0.70; filter: grayscale(20%); }
.cal-wg-half-readonly:hover { filter: grayscale(20%); }

/* Personne archivée */
.cal-wg-pstrip.pstrip-archived .cal-wg-half {
  opacity: 0.40;
  filter: grayscale(60%);
  cursor: default;
}
```

---

## Mise à jour des event handlers

Le point le plus critique. Tous les handlers qui ciblaient `.cal-cell` doivent cibler `.cal-wg-half`.

### Approche

1. Chercher dans le JS toutes les occurrences de :
   - `.closest('.cal-cell')` → `.closest('.cal-wg-half')`
   - `querySelectorAll('.cal-cell')` → `querySelectorAll('.cal-wg-half')`
   - `classList.contains('cal-cell')` → `classList.contains('cal-wg-half')`
   - `data-slots` (attribut des cellules fusionnées) → ne s'applique plus, chaque half a ses propres data-date/person/slot
   - `data-slot-short` → remplacer par `data-slot` (les halves ont déjà `data-slot="M"` ou `data-slot="A"`)

2. **Click handler** : le clic sur `.cal-wg-half` déclenche le popover de motif d'absence. Comportement identique à `.cal-cell` sauf que `data-slots` n'existe plus — utiliser `[{iso: data-date, slot: data-slot}]` directement.

3. **Drag-to-fill** : 
   - `mousedown` sur `.cal-wg-half` → démarrer le drag, noter `data-person`
   - `mousemove` sur le document → `document.elementFromPoint(e.clientX, e.clientY)`, trouver `.cal-wg-half` le plus proche, vérifier que `data-person` correspond
   - `mouseup` → appliquer l'état sur toutes les halves traversées

4. **`updateCellDOM`** → écrire une fonction `updateHalfDOM(halfEl)` équivalente :
   ```javascript
   function updateHalfDOM(halfEl){
     const { date:iso, person:personId, slot } = halfEl.dataset;
     const info = cellRenderInfo(iso, personId, slot);
     // Retirer les classes d'état existantes
     halfEl.className = halfEl.className.replace(/cal-wg-half-\S+/g, '').trim();
     halfEl.classList.add('cal-wg-half', `cal-wg-half-${info.stateClass}`);
     halfEl.style.cssText = info.style || '';
     halfEl.innerHTML = info.html || slot;
     halfEl.title = info.title || '';
     halfEl.setAttribute('aria-label', cellAriaLabel(iso, personId, slot));
   }
   ```

5. **Boutons de commentaire/édition par jour** : dans la nouvelle structure, les `.cal-col-tools` (💬 ✏️) n'ont plus de `<th>` header. Les placer dans `.cal-wg-day-head` à côté du numéro de jour, comme des petites icônes. Garder les mêmes `data-action`, `data-date`, `aria-label`.

---

## Cas particuliers

### Jour férié
- Classe `cal-wg-day-holiday` sur la colonne-jour
- `.cal-wg-daynum` avec fond jaune (via la classe)
- `.cal-wg-holiday-name` avec le nom du férié (tronqué si long)
- Les bandes M/A restent interactives (on peut marquer présent sur un férié)

### Aujourd'hui
- Classe `cal-wg-day-today` sur la colonne-jour
- `.cal-wg-daynum` avec fond primary (via la classe)

### Samedi / Dimanche
- Classe `cal-wg-day-sa` ou `cal-wg-day-su`
- Pas de `.cal-wg-persons` — uniquement `.cal-wg-day-head` avec le numéro
- Fond légèrement teinté (via la classe)
- Le "bridge dimanche" de la logique de données reste inchangé — seul l'affichage change

### Cellule hors mois (null)
- Classe `cal-wg-day-empty` + `aria-hidden="true"`
- Fond `var(--color-secondary)`, rien d'autre

### Personne archivée
- Ajouter `pstrip-archived` sur le `.cal-wg-pstrip` correspondant
- CSS grayscale/opacity via la classe (pas via un attribut `data-archived`)

### Mois signé / lecture seule
- Ajouter `cal-wg-half-locked` ou `cal-wg-half-readonly` sur chaque `.cal-wg-half`
- Attribut `data-action="locked"` pour bloquer les handlers

---

## Mise à jour de `buildCalendarGrid(viewKey)`

La logique de `buildCalendarGrid` reste la même (toolbar, viewKey, days, people), mais l'appel à `buildHalfTable(year, month, days, people)` est remplacé par `buildWeekGrid(year, month, people)`.

Supprimer la variable `days` passée à `buildHalfTable` — `buildWeekGrid` calcule ses propres jours.

---

## Version mobile `@media (max-width:767px)`

Ajouter dans le bloc mobile existant (ou créer si absent) :

```css
@media (max-width:767px){
  /* Grille semaine mobile */
  .cal-wg-day { min-height: 68px; }
  .cal-wg-daynum { width: 20px; height: 20px; font-size: 11px; }
  .cal-wg-day-head { padding: 4px 4px 2px; min-height: 26px; gap: 3px; }
  .cal-wg-persons { padding: 0 2px 2px; gap: 1px; }
  .cal-wg-pstrip { min-height: 17px; border-radius: 3px; }
  .cal-wg-half { font-size: 0; } /* masquer M/A sur mobile, couleur suffit */
  .cal-wg-holiday-name { display: none; }
  .cal-wg-dh { font-size: 9px; padding: 7px 0; }
  .cal-wg-person-legend { padding: 7px 10px; gap: 8px; }
  .cal-wg-person-tag { font-size: 10px; padding: 2px 6px; }
}
```

---

## Ordre d'implémentation

1. **Écrire `buildWeekGrid(year, month, people)`** — fonction complète, tester avec les données de juillet pour vérifier le positionnement des jours dans les semaines.
2. **Ajouter le CSS** de la nouvelle structure dans le `<style>`.
3. **Mettre à jour `buildCalendarGrid()`** pour appeler `buildWeekGrid` au lieu de `buildHalfTable`.
4. **Vérifier le rendu visuel** desktop avant de toucher aux interactions.
5. **Migrer les event handlers** — click, drag-to-fill, updateCellDOM → updateHalfDOM. C'est la partie la plus risquée : faire un `grep` de toutes les occurrences de `.cal-cell` dans le JS avant de commencer.
6. **Tester les interactions** : clic → popover, drag → fill, clic sur signé → message locked.
7. **CSS mobile** — tester sur 390px.
8. **Vérification finale** — juillet avec des absences, des jours fériés, des personnes archivées.

---

## Checklist de validation

- [ ] Juillet : 5 blocs de semaine, le 1 juillet (mercredi) commence en position 3
- [ ] Cellules identiques en hauteur pour janvier (31j) et février (28j)
- [ ] Nuances de vert PRESENT_SHADES correctement appliquées par personne
- [ ] Rouge pour congé approuvé, bleu marine pour en attente, gris pour refusé
- [ ] Clic sur une demi-cellule → popover de saisie
- [ ] Drag pour remplir plusieurs demi-cellules d'un coup → fonctionne
- [ ] Demi-cellule signée/verrouillée → message d'erreur, pas d'action
- [ ] Férié 14 juillet : fond ambre sur le numéro, bandes toujours interactives
- [ ] Aujourd'hui : cercle primary sur le numéro
- [ ] Semaines SA/DI : fond teinté, pas de bandes interactives
- [ ] Mobile 390px : demi-cellules sans texte, couleur seule, touch-friendly (≥68px par jour)
- [ ] Desktop 1024px : aucune régression sur les vues non-calendrier (dashboard, vets, etc.)
- [ ] Vues vétérinaires ET ASV fonctionnent (2 personnes pour vétos, 3+ pour ASV)
