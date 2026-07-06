# Prompt — 4 Nouveaux Modules RH pour Amivet Pulse

## CONTEXTE TECHNIQUE (à lire absolument avant de coder)

Tu travailles sur **`amivet-pulse.html`** — application single-page vanilla JS/HTML/CSS (~5461 lignes),
backend Supabase, hébergée sur GitHub Pages. **Aucun framework, aucun bundler.**

### Personnel
```javascript
const PEOPLE = [
  { id:'david',    name:'David',    short:'Dr. Pelois',   color:'#0D9488', initial:'D', timeFraction:1.0 },
  { id:'stephane', name:'Stéphane', short:'Dr. Maquinay', color:'#F97316', initial:'S', timeFraction:1.0 },
];
const ASV_PEOPLE = [
  { id:'marie',   name:'Marie',   color:'#4ADE80', initial:'M', timeFraction:1.0  },
  { id:'johanna', name:'Johanna', color:'#60A5FA', initial:'J', timeFraction:1.0  },
  { id:'julie',   name:'Julie',   color:'#C084FC', initial:'J', timeFraction:0.75, archived:false },
];
const ALL_PEOPLE = [...PEOPLE, ...ASV_PEOPLE];
```

### CSS variables (respecter impérativement)
```css
--color-primary:       #0F766E   /* teal-700 */
--color-primary-light: #14B8A6   /* teal-500 */
--color-secondary:     #F0FDF9   /* teal-50  */
--color-text:          #1E293B
--color-muted:         #64748B
--color-border:        #E2E8F0
--color-card:          #FFFFFF
```

### Pattern Supabase (déjà en place)
```javascript
const { data, error } = await supabase
  .from('table_name')
  .upsert({ ... }, { onConflict: 'person_id,year' });
```
Clé anon publique déjà initialisée dans `supabaseClient`. Ne pas modifier.

### Pattern Dashboard existant
- Variable d'état : `dashSubState.tab` (string)
- Valeurs actuelles : `'stats'`, `'hours'`, `'requests'`, `'signatures'`, `'interviews'`
- Rendu : `renderDashboard()` → switch sur `dashSubState.tab` → appelle `renderDashboard<Tab>()`
- Barre d'onglets : liste de `{ id, icon, label }` générée dans `renderDashboard()`

### Tables Supabase existantes
`planning_data` · `monthly_signatures` · `annual_interviews` · `calendar_sync` · `email_settings` · `auth`

### Règles importantes
1. **Zéro dépendance externe** — graphiques en SVG ou Canvas natif uniquement
2. **Zéro régression** — les 5 onglets Dashboard existants et les vues Vets/ASV doivent fonctionner
3. **RLS permissif** — même pattern que `monthly_signatures` (allow anon read/write/delete)
4. **Persistance immédiate** — chaque action utilisateur est sauvegardée sur Supabase immédiatement
5. **Toast de feedback** — appeler la fonction `showToast(message, type)` (type: `'success'|'error'`) après chaque opération Supabase

---

## MODULE 1 — COMPTEUR CP (Congés Payés) 📆

### Emplacement
Nouvel onglet dans le tableau de bord : id `'conges'`, icône `📆`, label `"Compteur CP"`.
L'insérer en 3ème position (après `hours`, avant `requests`).

### Référence légale (à coder exactement ainsi)
```javascript
const CP_DAYS_PER_MONTH = 2.5;          // jours ouvrables acquis par mois travaillé
const CP_REFERENCE_START_MONTH = 5;     // juin = index 5 (période 1 juin N-1 → 31 mai N)
```
Acquisition réelle = `CP_DAYS_PER_MONTH × timeFraction` par mois de la période de référence.

### Table Supabase à créer → `supabase-schema-11-cp-adjustments.sql`
```sql
CREATE TABLE IF NOT EXISTS cp_adjustments (
  person_id      TEXT           NOT NULL,
  year           INT            NOT NULL,  -- année de FIN de période (ex: 2026 = période juin 2025 → mai 2026)
  carried_over   DECIMAL(5,2)   NOT NULL DEFAULT 0,  -- report N-1 saisi par l'admin
  extra_days     DECIMAL(5,2)   NOT NULL DEFAULT 0,  -- ajustement manuel (ancienneté, récup…)
  extra_note     TEXT           NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (person_id, year)
);
ALTER TABLE cp_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon read"   ON cp_adjustments FOR SELECT USING (true);
CREATE POLICY "allow anon write"  ON cp_adjustments FOR INSERT WITH CHECK (true);
CREATE POLICY "allow anon update" ON cp_adjustments FOR UPDATE USING (true);
```

### Fonction de calcul (à implémenter)
```javascript
function getCPSummary(person, referenceYear) {
  // referenceYear = année de fin de période (ex: 2026)
  // Période = 1 juin (referenceYear-1) → 31 mai (referenceYear)

  // 1. Compter les mois écoulés depuis le début de la période jusqu'à aujourd'hui (ou fin de période)
  // 2. acquired = moisÉcoulés × CP_DAYS_PER_MONTH × person.timeFraction, arrondi à 2 décimales
  // 3. taken = compter les jours 'Absent' avec motif 'CP' ou 'Congé' dans planning_data
  //           pour cette personne sur la période de référence
  // 4. Charger carried_over et extra_days depuis cp_adjustments pour (person.id, referenceYear)
  // 5. balance = acquired + carried_over + extra_days - taken
  // Retourner : { acquired, taken, carriedOver, extra, extraNote, balance, periodLabel, daysLeft }
}
```

### UI de l'onglet `renderDashboardConges()`

**En-tête** : `"Période de référence : 1 juin 2025 → 31 mai 2026"` — calculé dynamiquement.

**Tableau principal** — une ligne par personne (ALL_PEOPLE, archivés exclus) :

| Personne | Acquis | Posés | Report N-1 | Ajust. | Solde |
|---|---|---|---|---|---|
| 🟢 Marie | 17.5j | 5j | 2j | 0j | **14.5j** |
| 🟢 Johanna | 17.5j | 10j | 0j | 0j | **7.5j** |
| 🟡 Julie | 13.1j | 3j | 0j | 0j | **10.1j** |

- Couleur du solde : 🟢 ≥ 10j · 🟡 5–9j · 🔴 < 5j
- Barre de progression sous chaque ligne : `taken / (acquired + carried_over + extra_days)`
- **Admin only** : bouton "✎ Ajuster" sur chaque ligne → modal avec :
  - Champ "Report N-1 (jours)" (number, step 0.5)
  - Champ "Ajustement manuel (jours)" + Motif (textarea)
  - Bouton "Enregistrer" → upsert dans `cp_adjustments`
- Sélecteur d'année en haut à droite pour naviguer entre les périodes de référence

---

## MODULE 2 — ABSENTÉISME 📊

### Emplacement
Nouvel onglet dans le tableau de bord : id `'absences'`, icône `📊`, label `"Absentéisme"`.
L'insérer en 4ème position (après `conges`, avant `requests`).

### Calcul du taux d'absentéisme
```javascript
function getAbsenteeismRate(personId, year, month) {
  // 1. workingDays = nombre de jours Lun-Ven dans le mois, HORS jours fériés français
  // 2. absentDays  = cellules status 'A' (absent) dans planning_data pour (personId, year, month)
  //                  NE PAS compter les jours non définis (vides) comme absences
  // 3. rate = (absentDays / workingDays) * 100, arrondi à 1 décimale
  // Retourner : { rate, absentDays, workingDays }
}

// Jours fériés français à intégrer (calcul algorithmique de Pâques obligatoire) :
// 1er jan, Lundi de Pâques, 1er mai, 8 mai, Jeudi de l'Ascension,
// Lundi de Pentecôte, 14 juil, 15 août, 1er nov, 11 nov, 25 déc
function getJoursFeries(year) { /* ... */ }
```

### UI de l'onglet `renderDashboardAbsences()`

**Section A — Graphique SVG (12 mois glissants)**

Implémenter un graphique à barres groupées en SVG natif :
- Dimensions : `width: 100%, height: 280px` (viewBox adaptatif)
- Axe X : 12 derniers mois (labels abrégés "Jun 25", "Jul 25"…)
- Axe Y : 0 % → max+2 %, grille horizontale tous les 2 %
- Une barre par personne (couleur = `person.color`), groupées par mois
- Ligne rouge pointillée horizontale à 6 % avec label "Seuil d'alerte"
- Tooltip au survol (mouseover SVG) : `"Marie — Juil 2025 : 3.2% (1j/22j)"`
- Légende personnes sous le graphique (cercle coloré + nom)

**Section B — Tableau récapitulatif annuel**

Sélecteur d'année (N-2, N-1, N courant). Tableau :

| Personne | Jan | Fév | … | Déc | **Moy. annuelle** | Trend vs N-1 |
|---|---|---|---|---|---|---|
| Marie | 0% | 4.5% | … | 2.1% | **2.3%** | ↓ -0.8 pts |
| Johanna | 5% | 9% | … | 0% | **6.1%** 🔴 | ↑ +1.3 pts |

- Cellules : fond vert pâle si < 3%, amber si 3–6%, rouge pâle si > 6%
- Ligne "Moyenne équipe" en bas du tableau, en gras

**Section C — Panneau d'alertes**

Si un individu dépasse 6% sur les 3 derniers mois glissants → encadré rouge :
```
⚠️ Johanna dépasse le seuil de 6% d'absentéisme sur 3 mois consécutifs (moy. 7.2%).
   Point recommandé en entretien annuel.
```

---

## MODULE 3 — VISITES MÉDICALES 🏥

### Emplacement
Nouvel onglet dans le tableau de bord : id `'medical'`, icône `🏥`, label `"Visites médicales"`.
L'insérer en 5ème position (après `absences`, avant `requests`).

### Table Supabase à créer → `supabase-schema-12-medical-visits.sql`
```sql
CREATE TABLE IF NOT EXISTS medical_visits (
  id               UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  person_id        TEXT           NOT NULL,
  visit_date       DATE           NOT NULL,
  visit_type       TEXT           NOT NULL DEFAULT 'periodique',
    -- 'embauche' | 'periodique' | 'reprise' | 'spontanee'
  status           TEXT           NOT NULL DEFAULT 'apte',
    -- 'apte' | 'apte_reserves' | 'inapte' | 'en_attente'
  reserves_note    TEXT           NOT NULL DEFAULT '',
  next_visit_date  DATE,                     -- NULL = calculé auto via frequency_months
  frequency_months INT            NOT NULL DEFAULT 60,
    -- 60 = 5 ans (standard), 24 = 2 ans (surveillance renforcée)
  doctor_name      TEXT           NOT NULL DEFAULT '',
  notes            TEXT           NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
ALTER TABLE medical_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon read"   ON medical_visits FOR SELECT USING (true);
CREATE POLICY "allow anon write"  ON medical_visits FOR INSERT WITH CHECK (true);
CREATE POLICY "allow anon update" ON medical_visits FOR UPDATE USING (true);
CREATE POLICY "allow anon delete" ON medical_visits FOR DELETE USING (true);
```

### Logique d'alerte
```javascript
function getMedicalAlert(visit) {
  // Si aucune visite : status 'a_planifier' → ROUGE
  // Calculer effectiveNextDate = visit.next_visit_date ?? addMonths(visit.visit_date, visit.frequency_months)
  // daysUntil = Math.floor((effectiveNextDate - today) / 86400000)
  // daysUntil < 0   → ROUGE  (⛔ Dépassée)
  // daysUntil < 90  → AMBER  (⚠️  Dans moins de 3 mois)
  // sinon           → VERT   (✅  À jour)
  return { level: 'red'|'amber'|'green', effectiveNextDate, daysUntil, label }
}
```

### UI de l'onglet `renderDashboardMedical()`

**Tableau de surveillance — une ligne par personne (ALL_PEOPLE)**

| Statut | Personne | Dernière visite | Type | Aptitude | Prochaine visite | Actions |
|---|---|---|---|---|---|---|
| ✅ | Marie | 12/03/2023 | Périodique | Apte | 12/03/2028 | ✎ |
| ⚠️ | Johanna | 01/06/2023 | Périodique | Apte | 01/06/2025 | ✎ |
| ⛔ | Julie | — | — | À planifier | — | + Ajouter |
| ✅ | David | 15/01/2024 | Périodique | Apte | 15/01/2029 | ✎ |
| ⚠️ | Stéphane | 20/11/2023 | Périodique | Apte avec réserves ℹ️ | 20/11/2025 | ✎ |

- Clic sur ℹ️ (apte avec réserves) → popover/tooltip affichant `reserves_note`
- Bouton "+ Ajouter visite" (admin) en haut à droite de l'onglet
- Bouton "✎" sur chaque ligne → même modal en mode édition

**Modal ajout/édition :**
- Personne (select si mode ajout, label si mode édition)
- Date de la visite (date input, max = aujourd'hui)
- Type de visite (4 boutons radio : Embauche / Périodique / Reprise / Spontanée)
- Statut d'aptitude (4 boutons radio : Apte / Apte avec réserves / Inapte / En attente)
- Réserves (textarea, visible seulement si "Apte avec réserves")
- Fréquence de renouvellement (select : 12 mois / 24 mois / 36 mois / 60 mois)
- Prochaine visite (date input, pré-rempli = calculé, modifiable manuellement)
- Médecin du travail (text input)
- Notes (textarea)
- Bouton "Enregistrer" → INSERT/UPDATE dans medical_visits

**Encadré légal en bas de l'onglet :**
```
📋 Référence légale — Article R4624-10 du Code du travail
Visite d'aptitude à l'embauche obligatoire. Renouvellement périodique tous les 5 ans
(surveillance simple) ou tous les 2 ans (surveillance renforcée : exposition aux risques).
```

---

## MODULE 4 — TABLEAU D'ANNONCES 📣

### Emplacement
**4ème onglet de navigation principale** (après l'onglet "ASV"), visible pour tous les rôles.
- Icône : 📣  
- Label : `"Annonces"`  
- Badge rouge sur l'onglet indiquant le nombre d'annonces **non lues** (se met à jour dynamiquement)

### Tables Supabase à créer → `supabase-schema-13-announcements.sql`
```sql
CREATE TABLE IF NOT EXISTS announcements (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  title        TEXT         NOT NULL,
  content      TEXT         NOT NULL,
  category     TEXT         NOT NULL DEFAULT 'info',
    -- 'urgent' | 'info' | 'task' | 'meeting'
  author_id    TEXT         NOT NULL,  -- person_id de l'auteur
  pinned       BOOLEAN      NOT NULL DEFAULT FALSE,
  target_roles TEXT         NOT NULL DEFAULT 'all',
    -- 'all' | 'vet' | 'asv'
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ            -- NULL = pas d'expiration
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon read"   ON announcements FOR SELECT USING (true);
CREATE POLICY "allow anon write"  ON announcements FOR INSERT WITH CHECK (true);
CREATE POLICY "allow anon update" ON announcements FOR UPDATE USING (true);
CREATE POLICY "allow anon delete" ON announcements FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id  UUID         NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  person_id        TEXT         NOT NULL,
  read_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (announcement_id, person_id)
);
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow anon read"  ON announcement_reads FOR SELECT USING (true);
CREATE POLICY "allow anon write" ON announcement_reads FOR INSERT WITH CHECK (true);
```

### Configuration des catégories (constante à ajouter)
```javascript
const ANNONCE_CATEGORIES = {
  urgent:  { label:'Urgent',  color:'#DC2626', bg:'#FEF2F2', border:'#FECACA', icon:'🚨' },
  meeting: { label:'Réunion', color:'#7C3AED', bg:'#EDE9FE', border:'#DDD6FE', icon:'🗓️' },
  task:    { label:'Tâche',   color:'#D97706', bg:'#FEF3C7', border:'#FDE68A', icon:'✅' },
  info:    { label:'Info',    color:'#0369A1', bg:'#EFF6FF', border:'#BFDBFE', icon:'ℹ️' },
};
```

### État global à ajouter
```javascript
let announcementsCache = {
  list: [],       // tableau d'objets announcement
  reads: new Set(), // Set de announcement_id déjà lus par la personne connectée
  loaded: false,
};

// Chargement initial (appeler au login et lors de la navigation vers l'onglet)
async function loadAnnouncements() {
  const today = new Date().toISOString();
  const { data: anns } = await supabase
    .from('announcements')
    .select('*')
    .or(`expires_at.is.null,expires_at.gt.${today}`)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  const { data: reads } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .eq('person_id', currentUser.id); // currentUser = personne connectée

  announcementsCache.list = anns ?? [];
  announcementsCache.reads = new Set((reads ?? []).map(r => r.announcement_id));
  announcementsCache.loaded = true;
  updateAnnouncementBadge(); // mettre à jour le badge nav
}
```

### Badge dynamique
```javascript
function getUnreadCount() {
  const visibleAnns = announcementsCache.list.filter(a => {
    if (a.target_roles === 'all') return true;
    if (a.target_roles === 'vet' && currentUser.role === 'vet') return true;
    if (a.target_roles === 'asv' && currentUser.role === 'asv') return true;
    return currentUser.role === 'admin';
  });
  return visibleAnns.filter(a => !announcementsCache.reads.has(a.id)).length;
}

function updateAnnouncementBadge() {
  const count = getUnreadCount();
  // Mettre à jour le badge HTML sur l'onglet nav 'annonces'
  // count === 0 → masquer le badge
  // count > 0  → afficher avec le chiffre
}
```

### UI de la vue `renderAnnounces()` (nouvelle fonction principale)

**Barre d'outils en haut :**
- Filtres catégorie (pills cliquables) : Tout | 🚨 Urgent | 🗓️ Réunion | ✅ Tâche | ℹ️ Info
- **Admin only** : bouton `"+ Nouvelle annonce"` à droite

**Liste de cartes (triée : épinglées en premier, puis date décroissante) :**
```
┌─────────────────────────────────────────────────────────────────┐
│ 📌 🚨 URGENT                    Dr. Maquinay · 3 juil. 2026   │
│ ─────────────────────────────────────────────────────────────── │
│  Nouveau protocole désinfection DASRI                           │
│  Le protocole entre en vigueur le 5 juillet. Merci de lire     │
│  la fiche affichée en salle de soins avant votre prochaine     │
│  vacation.                                                      │
│                                          ✎ Modifier  🗑 Suppr. │
└─────────────────────────────────────────────────────────────────┘
```
- Carte non lue : fond légèrement coloré (bg de la catégorie) + point bleu en haut à gauche
- Carte lue : fond blanc standard
- Au clic sur une carte non lue → INSERT dans `announcement_reads` → màj du badge nav → re-render
- Épinglée → icône 📌 + bordure gauche colorée 3px + fond légèrement marqué
- Expirée → visible dans section repliable "Archives" en bas de page, carte grisée

**Modal "Nouvelle annonce / Édition" (admin only) :**
- Titre (input text, max 80 chars, compteur de caractères)
- Contenu (textarea, min 3 lignes, markdown simple autorisé)
- Catégorie (4 boutons pills colorés selon ANNONCE_CATEGORIES)
- Destinataires (radio : Tout le monde / Vétérinaires uniquement / ASV uniquement)
- Épingler en haut (toggle switch)
- Date d'expiration (date input, optionnel — placeholder "Pas d'expiration")
- Bouton "Publier" (INSERT) ou "Mettre à jour" (UPDATE)
- Bouton "Supprimer" en rouge (mode édition only) avec confirmation

---

## FICHIERS SQL À CRÉER (dans l'ordre d'exécution)

Créer ces 3 fichiers dans le même répertoire que `amivet-pulse.html` :

1. **`supabase-schema-11-cp-adjustments.sql`** — table `cp_adjustments`
2. **`supabase-schema-12-medical-visits.sql`** — table `medical_visits`
3. **`supabase-schema-13-announcements.sql`** — tables `announcements` + `announcement_reads` dans le même fichier

---

## ORDRE D'INTÉGRATION RECOMMANDÉ

1. Créer les fichiers SQL et les exécuter dans Supabase
2. Ajouter les constantes globales (CP, catégories annonces)
3. Ajouter l'état `announcementsCache` et la fonction `loadAnnouncements()`
4. Ajouter l'onglet "Annonces" dans `renderNav()` + badge + `renderAnnounces()`
5. Ajouter les 3 onglets dans `renderDashboard()` :
   - Réorganiser la barre d'onglets : `stats | hours | conges | absences | medical | requests | signatures | interviews`
   - Implémenter `renderDashboardConges()`, `renderDashboardAbsences()`, `renderDashboardMedical()`
6. Vérifier que les 5 onglets Dashboard existants fonctionnent encore

---

## CHECKLIST DE VALIDATION

### Compteur CP
- [ ] Julie (timeFraction 0.75) acquiert bien 1.875j/mois vs 2.5j pour Marie
- [ ] Solde tient compte des jours "Absent / CP" existants dans `planning_data`
- [ ] Ajustement admin persiste après rechargement de page
- [ ] Changement d'année de référence recalcule tout correctement

### Absentéisme
- [ ] Graphique SVG s'affiche sans erreur console sur tous les navigateurs
- [ ] Les jours fériés (ex: 14 juillet 2026) ne comptent pas comme jours ouvrables
- [ ] Tooltip au survol fonctionne sur mobile (touch event)
- [ ] Alerte 6% s'affiche uniquement si le seuil est vraiment dépassé

### Visites médicales
- [ ] Personne sans visite → statut rouge "À planifier"
- [ ] Date calculée automatiquement = visit_date + frequency_months
- [ ] Admin peut modifier une visite existante sans en créer une nouvelle
- [ ] "Apte avec réserves" affiche le texte des réserves au clic

### Tableau d'annonces
- [ ] Badge nav disparaît quand toutes les annonces visibles sont lues
- [ ] Une annonce ciblée "vet" n'est PAS visible par un utilisateur ASV connecté
- [ ] Suppression d'une annonce supprime aussi ses enregistrements dans `announcement_reads` (CASCADE)
- [ ] Les annonces expirées n'apparaissent pas dans la liste principale mais restent dans "Archives"

### Non-régression
- [ ] Vue hebdomadaire ASV : saisie et calcul heures sup inchangés
- [ ] Entretiens annuels : ouverture modal et sauvegarde inchangées
- [ ] Signature mensuelle : verrouillage calendrier inchangé
- [ ] Navigation Vétérinaires / ASV : toutes les vues inchangées
