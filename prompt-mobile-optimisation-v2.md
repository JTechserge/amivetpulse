# Prompt Claude Code — Optimisation Mobile · Amivet Pulse RH (v2)

## Contrainte absolue — desktop inchangé

Toutes les modifications CSS sont dans `@media (max-width:767px)`. Tout le JS conditionnel vérifie `window.innerWidth < 768`. Aucune modification de HTML existant ni de logique JS desktop. À ≥768px, l'app doit être pixel-perfect identique à avant.

**Breakpoint choisi : 767px** (pas 768px — iPad portrait = exactement 768px, on le laisse côté desktop).

---

## Lire le fichier en premier — points précis à repérer

Avant d'écrire une ligne, faire `Read amivet-pulse.html` et noter :

1. **Lignes ~733–750** — structure exacte du `<header class="app-header">` : quels boutons sont dans `.header-actions`, quels `data-view` ont les `.nav-tab`
2. **La fonction qui gère les changements d'onglet** — chercher l'`addEventListener` sur `.nav-tab` ou une fonction nommée type `switchView()`, `setView()`, `showView()`. **Ne pas la réécrire — l'appeler depuis la bottom nav.**
3. **Lignes ~425–450** — structure du `.day-sidebar` : le `.day-sidebar-head` a-t-il des boutons ? Quelle est la fonction de fermeture (chercher `sidebar-overlay` click handler) ?
4. **Lignes ~465–483** — structure des `.modal-backdrop`/`.modal-box` : combien y en a-t-il de différents ? Ont-ils des IDs ?
5. **Lignes ~395–423** — `.popover-backdrop`/`.popover-box` : idem
6. **CSS existant à ~601** — le seul `@media (max-width:900px)` existant : ne pas le toucher, ajouter un bloc séparé `@media (max-width:767px)` à la fin du `<style>`

---

## Inspiration design — les 3 références à garder en tête

**BambooHR mobile** : bottom tab bar 5 items, badge rouge sur l'icône, label court sous l'icône, indicateur actif = trait teal en haut du tab. Cards larges par personne, touch targets généreux.

**Factorial** : bottom sheets pour TOUTES les actions secondaires (filtres, formulaires, confirmations). Formulaire de congé en plein écran avec grande zone de date. Header qui ne change pas de hauteur mais perd ses éléments secondaires.

**Lucca RH (France)** : navigation par swipe horizontal entre les vues principales. Sidebar → bottom sheet. Chaque cellule calendrier > 40px de hauteur sur mobile.

**Règle de design 2026 (Muzli)** : le tiers inférieur de l'écran est la zone pouce. Y mettre la navigation et les actions primaires. Tout ce qui est au-delà du milieu de l'écran nécessite un effort de reach.

---

## Les 6 transformations — spécifications (pas de code)

### Transformation 1 — Bottom Tab Bar

**Quoi** : les 4 onglets de `.main-nav` migrent vers une barre fixe en bas.

**Spec CSS** : à ≤767px, `.main-nav { display:none }`. Créer par JS un élément `<nav id="mobile-bottom-nav">` injecté dans `#app` (pas dans `.app-header`). Caractéristiques de la barre :
- Hauteur : 56px + `env(safe-area-inset-bottom)` — fond blanc, border-top, shadow légère vers le haut
- 4 colonnes égales flex, chacune centrée : icône 22px au-dessus, label 11px dessous
- Réutiliser les emojis et `data-view` des `.nav-tab` existants
- État actif : couleur `var(--color-primary)` sur icône + label, ligne de 2px `var(--color-primary)` en haut du tab (pas de background)
- Les spans `#dash-nav-badge` et `#annonces-nav-badge` : les dupliquer dans les tabs correspondants de la bottom nav (copier `innerHTML` depuis les originaux à chaque rendu)
- Clic sur un tab mobile → appeler exactement la même fonction que les `.nav-tab` desktop (chercher et réutiliser)
- Respecter `body.role-asv` : masquer le tab dashboard comme le CSS desktop existant

**Spec JS** : écouter `window.addEventListener('resize', ...)` pour afficher/masquer `#mobile-bottom-nav` selon la largeur. L'injecter uniquement si `window.innerWidth < 768`.

**Impact immédiat** : `.app-main` doit avoir `padding-bottom` suffisant pour que le contenu ne soit pas caché sous la barre (56px + safe-area + une marge).

### Transformation 2 — Header compact

**Quoi** : le header passe de 64px à 52px sur mobile, ne garde que l'essentiel.

**Spec** : `.app-header-inner` height 52px, padding latéral réduit. `.brand-logo` : 30×30px. `.brand-title` : 16px. Dans `.header-actions` : identifier visuellement quels boutons sont critiques (settings ⚙️) et lesquels sont secondaires (Undo, filtres, etc.) — masquer les secondaires sur mobile. Le dropdown `.settings-menu` garde son comportement identique.

**Important** : ne pas toucher au `position:sticky` du header — il doit rester sticky sur mobile.

### Transformation 3 — Bottom Sheets (la plus technique)

**Quoi** : `.day-sidebar`, les `.modal-box` et `.popover-box` glissent depuis le bas sur mobile.

**Spec du `.day-sidebar` en bottom sheet** :
- Position : `fixed; bottom:0; left:0; right:0; width:100%`
- Hauteur max : 85vh (pas 100% — laisser voir le fond pour l'effet de profondeur)
- Border-radius : 20px 20px 0 0
- Transition : `transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)` (courbe iOS standard)
- Fermé : `translateY(100%)`. Ouvert : `translateY(0)`
- Ajouter en haut du sheet un "drag handle" : div centré, 36×4px, background `var(--color-border)`, border-radius 2px, margin 10px auto
- **Swipe-to-dismiss** : attacher les listeners `touchstart`/`touchmove`/`touchend` **uniquement sur le drag handle** (pas sur le body du sheet — sinon conflit avec le scroll interne). Logique : si le delta Y final > 80px vers le bas et la vélocité > 0.3px/ms → fermer. Sinon → revenir à `translateY(0)` avec animation. Pendant le swipe : suivre le doigt avec `translateY(max(0, deltaY))` sans transition (immédiat). À la fermeture : même fonction que le bouton ✕ existant.
- **Ne pas interférer** avec les boutons dans `.day-sidebar-head` — le swipe ne doit être actif que sur le handle.
- L'overlay `.sidebar-overlay` existant garde son comportement (clic → ferme).

**Spec des `.modal-box`** :
- Identifier les différentes modales (par ID si elles en ont). Appliquer à tous : `position:fixed; bottom:0; left:0; right:0; max-width:100%; border-radius:20px 20px 0 0; max-height:90vh; overflow-y:auto`
- `.modal-backdrop` : `align-items:flex-end` sur mobile (modal en bas, pas centré)
- Ajouter drag handle identique, swipe-to-dismiss identique
- **Problème d'animation** : `.modal-backdrop.open { display:flex }` — `display` ne peut pas s'animer. Pour la transition d'ouverture/fermeture sur mobile, utiliser `opacity` + `transform` sur `.modal-box` plutôt que `display`. Si changer l'animation risque de casser le desktop, utiliser une classe CSS mobile-only `.mobile-sheet-anim` ajoutée par JS.

**Spec du `.popover-box`** : même traitement, max-height 70vh.

**Spec du `.settings-menu`** : sur mobile, le dropdown positionné `right:0; top:calc(100%+8px)` peut sortir hors écran. Le transformer en bottom sheet basique (width:100%, position fixed bottom, border-radius 20px 20px 0 0).

### Transformation 4 — Calendrier mensuel lisible

**Quoi** : les cellules `.cal-cell` (24px hauteur, 8.5px font) sont intouchables au doigt. Les rendre utilisables sans reconstruire la vue.

**Spec CSS uniquement** (pas de refonte JS) :
- `.cal-cell` : height → 36px minimum, font-size → 11px
- `.cth` (headers jours) : padding augmenté, `.cal-daynum` → 13px, `.cal-weekday` → 9px
- `.col-label` et `.row-label` : width → 58px (gain de place pour les colonnes jours)
- `.cal-col-tools` (les micro-boutons 15×15px) : `display:none` — intouchables sur mobile
- `.cal-toolbar` : `flex-direction:column`, toolbar-actions `justify-content:space-between`
- `.cal-month-label` : `font-size:18px`, `min-width:auto`
- `.cal-scroll` : ajouter `-webkit-overflow-scrolling:touch`
- `.sub-nav .sub-tab` : padding → `10px 16px` (cibles tactiles au minimum 44px de hauteur totale)

**Pas de vue agenda alternative** — la refonte CSS est suffisante. Garder une seule implémentation.

### Transformation 5 — Vue semaine ASV

**Quoi** : `.week-table` (min-width:560px) avec première colonne sticky.

**Spec** :
- `.week-view-wrap` : `-webkit-overflow-scrolling:touch`
- `.week-time-label` : `position:sticky; left:0; z-index:2; background:var(--color-secondary)` — la colonne des heures reste visible pendant le scroll horizontal
- `.week-asv-pick` : `width:100%; display:block; margin-bottom:10px`
- `.week-nav` : `justify-content:center`
- `.week-nav-label` : `font-size:14px; min-width:auto`

### Transformation 6 — Détails UX critiques

**Toast** : `#toast-container` est actuellement `bottom:22px; right:22px`. Sur mobile : `bottom:calc(56px + env(safe-area-inset-bottom) + 12px); left:12px; right:12px` — centré, au-dessus de la tab bar.

**Inputs — zoom Safari** : tout `<input>`, `<textarea>`, `<select>` avec font-size < 16px déclenche un zoom automatique sur iOS. Ajouter dans le bloc `@media (max-width:767px)` : `input, textarea, select { font-size:16px; }`. Si le sélecteur a besoin de plus de spécificité à cause du CSS desktop, utiliser `input:not([type="hidden"])` etc. — **pas de `!important`** (code smell, chercher d'abord la bonne spécificité).

**FAB "Nouveau congé"** : bouton circulaire fixe 52px, juste au-dessus de la tab bar à droite (`bottom: calc(56px + env(safe-area-inset-bottom) + 14px)`), fond `var(--color-primary)`, icône "+" blanc 24px. Créé par JS, visible uniquement si `window.innerWidth < 768`. Il appelle la même fonction que le bouton "Demander un congé" existant (le chercher dans le code). À afficher pour tous les rôles sauf si la fonction n'existe pas — dans ce cas ne pas créer le FAB.

**Animations GPU** : vérifier que toutes les transitions des bottom sheets utilisent `transform` et `opacity` uniquement — jamais `height`, `width`, `top`, `left` en transition (non-composité, cause des janks sur mobile). Le `.day-sidebar` existant utilise déjà `transform:translateX` — la version bottom sheet doit utiliser `transform:translateY`.

---

## Où placer le nouveau code

**CSS** : ajouter un nouveau bloc `/* ============================================================\n   Mobile (≤767px)\n   ============================================================ */` à la fin du `<style>` existant, avant `@media print`. Ne pas modifier les blocs CSS existants.

**JS** : le code d'initialisation mobile (création bottom nav, FAB, listeners) s'ajoute à la fin du `<script>` principal, dans une IIFE conditionnelle :
```
if (window.innerWidth < 768) { /* init mobile */ }
window.addEventListener('resize', () => { /* afficher/masquer selon largeur */ });
```

---

## Ordre d'implémentation — par risque croissant

1. **Inputs font-size 16px** — 1 ligne CSS, risque zéro, impact immédiat sur Safari
2. **Header compact** — CSS pur, pas de JS, facile à vérifier
3. **`.sub-nav .sub-tab` touch targets** — 1 ligne CSS
4. **Toast repositionné** — CSS pur
5. **Bottom tab bar** — JS + CSS, valider les clics et badges avant de continuer
6. **Calendrier CSS** — cellules plus grandes, toolbar empilée
7. **Vue semaine sticky** — CSS + overflow
8. **Bottom sheets** (sidebar, modales, popover, settings) — le plus complexe, faire en dernier pour ne pas bloquer si ça prend du temps
9. **FAB** — bonus après validation des bottom sheets

---

## Pièges à éviter

**Ne pas recréer la logique de navigation** — trouver et appeler la fonction existante. Si elle n'est pas identifiable, lire la gestion des events sur `.nav-tab` et la répliquer exactement.

**Le swipe sur le handle ne doit pas déclencher un clic** — `event.preventDefault()` sur `touchend` si un swipe a été détecté (delta > 10px). Sinon l'utilisateur ferme le sheet en voulant tapper le handle.

**Le scroll interne des sheets** — si `.day-sidebar-body` ou le contenu du modal est scrollable, le `touchmove` doit propager normalement quand le doigt est dans la zone scrollable. Attacher le swipe-to-dismiss **uniquement sur le handle**, pas sur le container entier.

**Resize listener** — sur rotation d'écran, `window.innerWidth` change. La bottom nav doit apparaître/disparaître proprement. Mettre un `debounce(200ms)` sur le listener resize pour éviter des appels trop fréquents.

**Pas de `!important`** — si un style mobile est écrasé par le desktop, augmenter la spécificité du sélecteur mobile plutôt que d'utiliser `!important`. Exception tolérée seulement si la spécificité du desktop est incontrôlable (ex: inline style injecté par JS).

---

## Checklist de validation (condensée)

- [ ] Desktop 1024px : aucune régression visuelle
- [ ] iPhone 14 (390px) + iPhone SE (375px) : bottom nav fonctionnelle, tous les onglets actifs
- [ ] iPad portrait (768px) : desktop layout — bottom nav absente
- [ ] Navigation : les 4 tabs de la bottom nav ouvrent les bonnes vues, badges synchronisés
- [ ] Sidebar : s'ouvre en bottom sheet, swipe-handle ferme, clic overlay ferme
- [ ] Modal demande de congé : bottom sheet, swipe ferme
- [ ] Inputs : aucun zoom Safari au focus
- [ ] Toast : visible au-dessus de la tab bar
- [ ] Calendrier : cellules ≥36px, tappables
- [ ] Rotation portrait↔paysage : layout correct dans les deux orientations
