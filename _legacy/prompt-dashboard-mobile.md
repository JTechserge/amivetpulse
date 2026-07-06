# Prompt Claude Code — Tableau de bord · Optimisation mobile

## Contrainte absolue
Tout le CSS est dans `@media (max-width:767px)`. Tout JS conditionnel vérifie `window.innerWidth < 768`. Le desktop reste pixel-perfect identique. Lire `amivet-pulse.html` en premier — la structure réelle est aux lignes ~5040–5080 (`renderDashboard`), ~5080 (`renderDashboardStats`), ~5447 (`renderDashboardHours`), ~5882 (`renderDashboardMedical`), ~5515 (`renderLeaveRequestsPage`), ~5165 (`renderDashboardInterviews`).

---

## Contexte — ce qui existe aujourd'hui

Le tableau de bord est rendu par `renderDashboard()`. Il contient :

- Un `.sub-nav` avec **6 sous-onglets** : `🩺 Suivi vétérinaires`, `🐾 Suivi ASV`, `🏥 Visites médicales`, `📋 Demandes de congé`, `✍️ Feuilles signées`, `📝 Entretiens annuels`
- Un `.year-toggle` (N / N+1) présent sur 4 des 6 onglets
- Des `.dash-grid` (déjà 1-colonne à 900px grâce à la media query existante)
- Des `<table class="recap-table">` avec 12 colonnes (mois) + colonnes personnes — `min-width:400–600px`
- Des SVG de graphiques générés par `buildBarChartSVG()` et `buildBarChartSVGASV()` dans `.chart-wrap`
- Une table visites médicales avec 7 colonnes (`min-width:600px`)
- Des actions dangereuses (`🗑️ Réinitialiser ${cy}`) côte à côte avec le year-toggle sur l'onglet stats

Sur un iPhone 14 (390px), le résultat actuel : sous-onglets coupés, tableaux avec scroll horizontal brutal sans momentum, graphiques qui débordent, boutons de réinitialisation trop proches du year-toggle.

---

## Inspiration — apps RH mobiles 2026

**BambooHR** : les 5 sous-sections du dashboard sont cachées derrière un sélecteur dropdown sur mobile (pas 5 tabs visibles simultanément). La section active est clairement identifiée, les autres s'ouvrent sur tap.

**Factorial** : tableaux de données → remplacés par des cards empilées sur mobile. Chaque ligne de table devient une card avec label à gauche, valeur à droite.

**Lucca** : graphiques SVG scrollables horizontalement dans un conteneur dédié, avec un hint visuel (gradient fade-out à droite) indiquant qu'on peut scroller.

---

## Les 5 transformations

### Transformation 1 — Sous-navigation : 6 onglets scrollables

**Problème** : `.sub-nav` est `display:flex; width:fit-content`. Avec 6 boutons + emojis + texte, ça déborde sur 390px.

**Spec** : sur mobile, le `.sub-nav` devient une barre scrollable horizontalement sur toute la largeur :
- `width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch`
- Supprimer le `border-radius` ou le garder (au choix visuel)
- Chaque `.sub-tab` : padding vertical augmenté pour cible tactile ≥ 44px de hauteur totale
- Ajouter `scroll-snap-type:x mandatory` sur `.sub-nav` et `scroll-snap-align:start` sur chaque `.sub-tab` — l'utilisateur "snape" d'un tab à l'autre
- Gradient fade-out à droite du `.sub-nav` (pseudo-élément `::after`) pour indiquer qu'il y a d'autres tabs hors écran
- **Ne pas modifier les event listeners** — le clic sur `.sub-tab` fonctionne déjà avec `data-sub`

### Transformation 2 — Year-toggle + boutons danger

**Problème** : sur l'onglet `stats` (`renderDashboardStats`), le year-toggle et les 2 boutons `🗑️ Réinitialiser` sont dans un flex row. Sur mobile ils se chevauchent ou wrappent mal.

**Spec** :
- Sur mobile, les 2 boutons `#dash-reset-current` et `#dash-reset-forecast` passent en `display:none` — une action destructive ne doit pas être accessible par accident sur mobile (mauvaise manipulation, doigt)
- Le year-toggle reste visible, centré, avec padding augmenté sur les boutons (cibles 44px)
- Sur les autres onglets qui ont un year-toggle seul (signatures, interviews, hours), le toggle reste visible et centré

### Transformation 3 — Tableaux récapitulatifs → scroll + colonne sticky

**Problème** : `table.recap-table` avec 12+ colonnes. Plusieurs ont un `min-width` explicite en inline style (400px ou 600px). Le scroll horizontal existe déjà sur le conteneur `.card[style*="overflow-x:auto"]` mais sans momentum iOS.

**Spec CSS** :
- Sur les `.card` qui contiennent une `recap-table` : `-webkit-overflow-scrolling:touch`
- Première colonne `td:first-child` et `th:first-child` : `position:sticky; left:0; z-index:2; background:#fff` (ou `var(--color-secondary)` pour les `<th>`) — la colonne des noms/mois reste visible pendant le scroll horizontal
- Ajouter un gradient fade-out à droite du `.card` contenant la table (pseudo-element `::after` sur le card, `overflow:hidden` sur le card) pour indiquer qu'il y a des données à droite

### Transformation 4 — Table visites médicales → cards

**Problème** : `renderDashboardMedical()` génère un `<table class="recap-table" style="min-width:600px;">` avec 7 colonnes : Statut, Personne, Dernière visite, Type, Aptitude, Prochaine visite, Actions.

**Spec** : CSS-only, pas de refonte JS. En utilisant `display:block` sur les éléments table :

```
@media (max-width:767px){
  /* Sur la table médicale uniquement */
  #dash-sub-medical .recap-table,
  #dash-sub-medical .recap-table thead,
  #dash-sub-medical .recap-table tbody,
  #dash-sub-medical .recap-table tr,
  #dash-sub-medical .recap-table td {
    display: block;
  }
  #dash-sub-medical .recap-table thead { display:none; } /* masquer les headers */
  #dash-sub-medical .recap-table tr {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 10px;
    background: #fff;
    position: relative;
  }
  /* Chaque td devient une ligne label:valeur via data-label */
  #dash-sub-medical .recap-table td {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border: none;
    font-size: 13px;
  }
  #dash-sub-medical .recap-table td::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--color-text-muted);
    font-size: 12px;
    flex-shrink: 0;
    margin-right: 8px;
  }
}
```

Pour que les `::before` affichent les bons labels, **modifier la fonction `renderDashboardMedical()`** pour ajouter les attributs `data-label` sur chaque `<td>` généré : `data-label="Statut"`, `data-label="Personne"`, `data-label="Dernière visite"`, `data-label="Type"`, `data-label="Aptitude"`, `data-label="Prochaine visite"`, `data-label="Actions"`. Cette modification est mineure (ajouter un attribut dans les template literals existants) et n'impacte pas le desktop.

L'icône statut (⛔ / ⚠️ / ✅) qui est dans la première `<td>` se retrouve en grand en haut de chaque card — c'est voulu, ça donne un signal visuel immédiat.

### Transformation 5 — Graphiques SVG → responsive

**Problème** : `buildBarChartSVG()` et `buildBarChartSVGASV()` génèrent des SVG avec probablement une largeur fixe. Sur mobile ils débordent hors de leur `.chart-wrap`.

**Spec CSS** (sans modifier le JS de génération des SVGs) :
- `.chart-wrap svg` : `max-width:100%; height:auto`
- `.chart-wrap` : `overflow-x:auto; -webkit-overflow-scrolling:touch`

Si les SVGs ont une largeur fixe (ex: `width="700"`) et que le CSS ne suffit pas (l'attribut HTML override le CSS en largeur max), **alors** modifier les fonctions `buildBarChartSVG` et `buildBarChartSVGASV` pour utiliser `viewBox` au lieu d'un `width` fixe : remplacer `width="700" height="200"` par `viewBox="0 0 700 200" width="100%"`. Vérifier que le rendu desktop reste identique après ce changement (il devrait — `viewBox` + `width="100%"` est la bonne pratique SVG responsive).

---

## Détails UX additionnels

**`.stat-value.big` (26px)** : sur mobile passer à 22px — évite les coupures sur petits écrans.

**`.person-card-head`** : déjà bon (38px avatar, flex row). Sur mobile, juste tightener le margin-bottom de 16px → 12px.

**`.dash-grid` gap** : déjà 18px → 12px sur mobile (les cards sont en 1-colonne, le gap vertical peut être plus compact).

**Demandes de congé (`renderLeaveRequestsPage`)** : lire la structure HTML générée. Si elle produit un tableau, appliquer le même pattern CSS `display:block` que les visites médicales avec `data-label`. Si elle produit des cards ou une liste, probablement rien à faire.

---

## Ordre d'implémentation

1. **Sub-nav scrollable** — impact visuel immédiat, risque zéro (CSS pur)
2. **Year-toggle + masquage boutons danger** — CSS pur, 3 lignes
3. **Graphiques SVG responsive** — modifier `buildBarChartSVG` avec `viewBox`, vérifier desktop
4. **Tableaux récapitulatifs sticky** — CSS, colonne sticky + momentum
5. **Visites médicales → cards** — ajouter `data-label` dans le JS + CSS display:block

---

## Checklist de validation

- [ ] Les 6 onglets du sub-nav sont accessibles en scrollant (aucun coupé)
- [ ] Chaque sous-onglet a une cible tactile ≥ 44px de hauteur
- [ ] Le gradient fade-out indique qu'il y a d'autres onglets à droite
- [ ] Les boutons 🗑️ Réinitialiser sont absents sur mobile
- [ ] Les tableaux récapitulatifs scrollent avec momentum, première colonne sticky
- [ ] Les visites médicales s'affichent en cards (pas en tableau)
- [ ] Les graphiques tiennent dans la largeur (pas de débordement horizontal)
- [ ] Les person-cards sont bien en 1-colonne sur iPhone 14 et iPhone SE
- [ ] Desktop 1024px : aucune régression
