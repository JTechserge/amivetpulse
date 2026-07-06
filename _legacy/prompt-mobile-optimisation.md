# Prompt Claude Code — Optimisation Mobile · Amivet Pulse RH

## Contexte et contrainte principale

Tu travailles sur `amivet-pulse.html`, une application RH monopage (single-file HTML/CSS/JS vanilla). L'app est actuellement optimisée pour desktop (max-width 1440px). Elle a **un seul bloc media query mobile** à la ligne ~601 :

```css
@media (max-width:900px){
  .dash-grid{grid-template-columns:1fr;}
  .brand-sub{display:none;}
}
```

C'est tout ce qui existe côté mobile. Le résultat : navigation cramped, tableau-calendrier trop dense pour les doigts, popover trop petit, sidebar pleine hauteur non adaptée.

**Contrainte absolue : ne rien changer au desktop.** Toutes les modifications doivent être encapsulées dans des `@media (max-width:768px)` ou des classes conditionnelles ajoutées par JS uniquement quand `window.innerWidth < 769`. Aucune modification de la structure HTML de base ni du JS desktop. L'expérience à ≥769px doit rester pixel-perfect identique.

**Commencer par lire le fichier.** Avant tout code, faire `Read amivet-pulse.html` pour identifier :
- La structure exacte de `.app-header-inner` et `.main-nav` (lignes 733-750 environ)
- Les classes des modales (`.modal-backdrop`, `.modal-box`, `.popover-backdrop`, `.popover-box`)
- La structure du `.day-sidebar`
- La position du `#toast-container`
- Les classes des boutons de navigation (`.nav-tab[data-view="..."]`) et leurs icônes/labels

---

## Inspiration : les meilleures apps RH mobile 2026

S'inspirer de ces références pour les décisions de design :

**BambooHR** — Bottom tab bar avec 5 icônes, cards larges par employé, swipe entre onglets, large touch targets 44px+, actions primaires dans un FAB vert.

**Factorial** — Bottom nav minimaliste, calendrier mobile en vue "badges colorés par personne" plutôt que tableau dense, bottom sheets pour toutes les actions secondaires.

**Lucca RH** — Sidebar qui devient bottom sheet sur mobile, formulaire de congé en fullscreen modal avec grande zone de saisie, indicateurs de statut visuellement distincts même sur petit écran.

**Patterns 2026 (source : Muzli Design Trends 2026)** :
- Navigation bottom-centric : les actions principales dans le tiers inférieur de l'écran (zone pouce)
- Bottom sheets comme conteneur standard pour tout ce qui n'est pas plein écran
- Cibles tactiles minimum 48dp (Android) / 44pt (iOS)
- Header qui se compacte au scroll
- FAB pour l'action principale unique (ici : "Nouveau congé")

---

## Les 6 transformations à implémenter

### 1 — Bottom Tab Bar (remplacement du top nav sur mobile)

**Objectif** : les 4 onglets `[data-view="dashboard"]`, `[data-view="vets"]`, `[data-view="asv"]`, `[data-view="annonces"]` migrent vers une barre fixe en bas, dans la zone pouce.

**Comportement** :
- À ≤768px : masquer `.main-nav` dans le header (CSS `display:none`)
- Créer dynamiquement (JS) une `<nav id="mobile-bottom-nav">` et l'injecter dans `#app` (pas dans `.app-header`)
- La barre est fixe en bas, height 56px + `env(safe-area-inset-bottom)`
- Fond blanc, border-top `1px solid var(--color-border)`, shadow vers le haut
- 4 tabs égaux en largeur, chacun : icône 22px + label 11px dessous
- Icônes : réutiliser les emojis déjà présents dans les `.nav-tab` existants (📊 🩺 🐾 📣)
- État actif : icône et label en `var(--color-primary)`, avec un trait de 2px `var(--color-primary)` en haut du tab
- Badges : reprendre les `#dash-nav-badge` et `#annonces-nav-badge` existants — les cloner/déplacer dans la bottom nav
- Cliquer un tab de la bottom nav doit appeler exactement la même logique que cliquer le `.nav-tab` correspondant dans le desktop (chercher et appeler la fonction JS existante qui gère le changement de vue)
- Si `body.role-asv`, masquer le tab dashboard comme le fait le CSS desktop : `body.role-asv [data-view="dashboard"]`

**CSS mobile uniquement** :
```css
@media (max-width:768px){
  .main-nav { display:none; }
  .app-main { padding: 16px 14px calc(56px + env(safe-area-inset-bottom) + 16px); }
  #mobile-bottom-nav {
    position: fixed; bottom: 0; left: 0; right: 0;
    height: calc(56px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: #fff;
    border-top: 1px solid var(--color-border);
    box-shadow: 0 -4px 16px rgba(15,23,42,0.07);
    display: flex; z-index: 45;
  }
  /* ... tabs, labels, badges */
}
```

### 2 — Header compact sur mobile

**Objectif** : le header passe de 64px à 52px, épuré, logo + titre + bouton settings seulement.

**Comportement** :
- À ≤768px :
  - `.app-header-inner` height passe à 52px, padding réduit à `0 14px`
  - `.brand-logo` passe à 30px × 30px
  - `.brand-title` passe à 16px
  - `.header-actions` : ne garder visible que le bouton settings (icône ⚙️ ou ≡) ; masquer les autres boutons qui ne sont pas critiques
  - Le menu `.settings-menu` garde son comportement dropdown existant (ne pas le transformer)
- À ≥769px : aucun changement

### 3 — Bottom Sheet (remplace sidebar et modales sur mobile)

**Objectif** : `.day-sidebar` (panel droit fixe 340px) devient un bottom sheet qui monte du bas. Même chose pour `.modal-box` et `.popover-box`.

**Comportement du `.day-sidebar` sur mobile** :
- À ≤768px, le `.day-sidebar` passe de `position:fixed; right:0; width:340px; height:100%` à :
  - `position:fixed; bottom:0; left:0; right:0; width:100%; max-height:82vh`
  - `border-radius: 20px 20px 0 0`
  - `transform: translateY(100%)` → `translateY(0)` quand `.open`
  - Ajouter un "drag handle" en haut : barre grise 36px × 4px centrée, margin 12px auto
  - Comportement swipe-to-dismiss : détecter `touchstart`/`touchmove`/`touchend` sur le handle et le header du sidebar. Si l'utilisateur swipe vers le bas > 80px, fermer le sidebar (appeler la même fonction de fermeture que le bouton close existant). Donner un feedback visuel pendant le swipe (suivre le doigt avec `transform: translateY(Xpx)`).
  - L'overlay `.sidebar-overlay` reste identique (fond semi-transparent)

**Comportement des `.modal-box` sur mobile** :
- Ajouter `@media (max-width:768px)` sur `.modal-box` et `.modal-box.modal-box-wide` :
  - `position:fixed; bottom:0; left:0; right:0; width:100%; max-width:100%`
  - `border-radius: 20px 20px 0 0`
  - `max-height:90vh; overflow-y:auto`
  - `.modal-backdrop` : `align-items:flex-end` (pas centré)
- Ajouter le drag handle identique à celui du sidebar
- Ajouter swipe-to-dismiss identique

**Comportement de `.popover-box`** :
- Même traitement bottom sheet, `max-height:70vh`

### 4 — Calendrier mensuel mobile

**Objectif** : le tableau-calendrier dense (cellules 24px, texte 8.5px) devient lisible et utilisable au doigt.

**Problème actuel** : `.cal-cell` fait 24px de hauteur avec `font-size:8.5px` — impossible à tapper précisément. La table a 31 colonnes × N lignes — sur 390px de large, chaque colonne fait ~10px.

**Solution** : ne pas reconstruire la vue calendrier depuis zéro. Appliquer des transformations CSS qui rendent l'existant utilisable :

```css
@media (max-width:768px){
  /* Hauteur des cellules : 24px → 38px */
  .cal-cell { height:38px; font-size:11px; }
  
  /* Colonne label : 76px → 60px pour gagner de la place */
  .cal-table .col-label, .row-label { width:60px; font-size:9px; }
  
  /* Header jours : plus lisible */
  .cth { padding:6px 2px; }
  .cal-daynum { font-size:14px; }
  .cal-weekday { font-size:9px; }
  
  /* Scroll horizontal avec momentum iOS */
  .cal-scroll { -webkit-overflow-scrolling:touch; scroll-snap-type:x proximity; }
  
  /* Toolbar calendrier : empiler verticalement */
  .cal-toolbar { flex-direction:column; align-items:stretch; gap:10px; }
  .cal-month-label { font-size:18px; min-width:auto; }
  .cal-toolbar-actions { justify-content:space-between; }
  
  /* Légende : compacter */
  .legend-row { gap:12px; }
  .legend-item { font-size:12px; }
  
  /* Masquer les outils par colonne (trop petits pour le tactile) */
  .cal-col-tools { display:none; }
}
```

**Optionnel — bascule vue "agenda"** : Si la refonte CSS seule n'est pas suffisante, ajouter un bouton toggle "📅 / 📋" dans la `.cal-toolbar` (visible mobile seulement) qui bascule entre la vue tableau existante et une vue agenda simplifiée. La vue agenda affiche les absences/congés du mois sous forme de liste de cards par personne (`nom · du X au Y · statut`). Cette vue est générée par JS en lisant les données déjà en mémoire — ne pas refaire de requête Supabase.

### 5 — Vue semaine ASV (scroll tactile)

**Objectif** : la `.week-table` avec `min-width:560px` doit scroller horizontalement avec le momentum iOS et une colonne "time" sticky.

```css
@media (max-width:768px){
  .week-view-wrap { -webkit-overflow-scrolling:touch; }
  
  /* Sticky première colonne (time labels) */
  .week-table .week-time-label {
    position: sticky; left: 0; z-index: 2;
    background: var(--color-secondary);
    box-shadow: 2px 0 4px rgba(0,0,0,0.05);
  }
  
  /* Navigation semaine : centrer les contrôles */
  .week-nav { justify-content:center; }
  .week-nav-label { min-width:180px; font-size:14px; }
  
  /* Selector ASV : pleine largeur */
  .week-asv-pick { width:100%; margin-bottom:8px; }
}
```

### 6 — Toast, FAB et détails UX

**Toast** : sur mobile, centrer en bas juste au-dessus de la tab bar (pas en bas-droite).
```css
@media (max-width:768px){
  #toast-container {
    bottom: calc(56px + env(safe-area-inset-bottom) + 12px);
    right: 12px; left: 12px;
    align-items: center;
  }
  .toast { width:100%; justify-content:center; }
}
```

**FAB "Nouveau congé"** : créer un bouton flottant circulaire fixe visible uniquement sur mobile, positionné au-dessus de la tab bar à droite. Il appelle la même fonction que le bouton "Demander un congé" du dashboard desktop. Ne l'afficher que si l'utilisateur connecté est un ASV (chercher dans le code la condition `role-asv` / `body.classList`). Les vétérinaires ont déjà un accès rapide via le tableau de bord.

```css
@media (max-width:768px){
  #mobile-fab {
    position:fixed;
    bottom: calc(56px + env(safe-area-inset-bottom) + 14px);
    right:16px;
    width:52px; height:52px;
    border-radius:50%;
    background:var(--color-primary);
    color:#fff; font-size:24px;
    border:none;
    box-shadow:0 4px 16px rgba(15,118,110,0.35);
    display:flex; align-items:center; justify-content:center;
    z-index:44;
    transition:transform 0.15s, box-shadow 0.15s;
  }
  #mobile-fab:active { transform:scale(0.93); box-shadow:0 2px 8px rgba(15,118,110,0.25); }
}
```

**Bannière PWA offline** : sur mobile, elle doit s'afficher sous le header et pousser le contenu vers le bas (pas en `position:fixed` qui chevauche le header). Revoir le positionnement `#pwa-offline-banner` à ≤768px.

**Inputs et formulaires** : sur mobile, tous les `<input>` et `<textarea>` doivent avoir `font-size:16px` minimum pour éviter le zoom automatique de Safari iOS (comportement par défaut si font-size < 16px).
```css
@media (max-width:768px){
  input, textarea, select { font-size:16px !important; }
}
```

---

## Ordre d'implémentation recommandé

1. **Bottom tab bar** — c'est la transformation la plus visible et la plus impactante. Valider sur iPhone 14/15 (390px) et iPhone SE (375px).
2. **Header compact** — rapide et très propre visuellement.
3. **Inputs font-size 16px** — prévient le bug de zoom Safari, 1 ligne de CSS.
4. **Toast repositionné** — sans ça le toast est caché par la bottom nav.
5. **Bottom sheets** (sidebar + modales) — la plus technique, à faire après que la nav fonctionne.
6. **Calendrier CSS améliorations** — cellules plus grandes, toolbar empilée.
7. **Vue semaine sticky** — dernier, car c'est une vue secondaire.
8. **FAB** — bonus, à ajouter une fois le reste validé.

---

## Pièges à éviter

- **Ne jamais modifier le HTML desktop** — toutes les transformations de structure (bottom nav, FAB) sont créées par JS conditionnel et stylées en mobile-only CSS.
- **`window.innerWidth` vs media query** : pour les classes ajoutées par JS, écouter aussi `window.addEventListener('resize', ...)` pour recalculer si l'orientation change (portrait → paysage sur tablette).
- **La logique des nav-tabs existante** : ne pas réécrire la gestion des vues. Identifier la fonction JS qui gère `data-view` et l'appeler depuis la bottom nav. Si elle est inconnue, chercher un `addEventListener` sur `.nav-tab` dans le code existant.
- **Le swipe-to-dismiss** : ne pas bloquer le scroll vertical du contenu à l'intérieur du bottom sheet. Le drag doit être détecté seulement sur le handle et le header du sheet, pas sur le body scrollable.
- **Zoom Safari** : `font-size < 16px` sur les inputs → Safari iOS zoom automatiquement la page. Utiliser `!important` sur la règle mobile si les selectors desktop ont plus de spécificité.
- **Breakpoint 768px** : utiliser `max-width:768px` (pas 767 ni 769) pour cohérence — c'est la limite standard tablette/mobile qui correspond à la largeur minimale d'une tablette iPad (768px en portrait).

---

## Checklist de validation

- [ ] Desktop à 1024px+ : visuellement identique à avant — aucune régression
- [ ] iPhone 14 (390px) : bottom nav fonctionnelle, tous les onglets cliquables
- [ ] iPhone SE (375px) : bottom nav pas cramped, labels lisibles
- [ ] iPad (768px) : vérifier le breakpoint — desktop ou mobile ? (en portrait 768px = mobile, en paysage = desktop) → ajuster si nécessaire
- [ ] Navigation : cliquer un tab dans la bottom nav ouvre bien la vue correspondante
- [ ] Badges (dashboard, annonces) visibles dans la bottom nav
- [ ] Sidebar : s'ouvre depuis le bas sur mobile, swipe-down ferme
- [ ] Modal demande de congé : bottom sheet sur mobile, swipe-down ferme
- [ ] Toast : visible au-dessus de la tab bar, pas caché derrière
- [ ] Inputs : aucun zoom automatique Safari sur focus
- [ ] Cellules calendrier : tappables (≥36px de hauteur), texte lisible (≥11px)
- [ ] Vue semaine : scroll horizontal avec momentum, colonne time sticky
- [ ] FAB : visible pour les ASV, appelle la bonne fonction
- [ ] Rotation d'écran : portrait ↔ paysage → layout correct dans les deux sens
- [ ] Chrome DevTools mobile simulator : tester iPhone 12, iPhone SE, Pixel 6
