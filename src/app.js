import {
  PEOPLE, ASV_PEOPLE,
  SLOTS, STORAGE_KEY, VIEW_STATE_KEY, AUTH_SESSION_KEY,
  SUPABASE_URL, SUPABASE_AUTH_URL, SUPABASE_ANON_KEY,
  getCurrentYear, setCurrentYear, personOf,
} from './config.js';
import {
  escapeHTML, fmtISO, daysInMonth, isoWeekday, isSunday, holidayName,
  getWeekMondayDate,
} from './utils.js';
import { getAuthSession, saveAuthSession, supabaseHeaders } from './auth.js';
import { loadASVRoster } from './state.js';
import { showToast, showSavedToast, openConfirmModal, loadPersonColors } from './ui.js';
import { pushDataToSupabase, syncFromSupabase } from './api.js';
import { store } from './store.js';
import { setupLogin, renderLoginScreen, renderSetPasswordScreen } from './login.js';
import { initServiceWorker, showIOSInstallTip, updatePwaOfflineBanner } from './pwa.js';
import { loadAnnouncements, renderAnnounces } from './announcements.js';
import { setupSignatures, loadSignatures, openSignConfirmModal } from './signatures.js';
import {
  isASVPerson, setSlotState, setSlotLabel,
} from './slots.js';
import { setupAnnualView, renderAnnualViewForGroup } from './annual-view.js';
import {
  setupDashboard, renderDashboard, setDashSubTab, countPendingLeaveRequests,
} from './dashboard.js';
import {
  setupWeekView, renderWeekViewASV,
} from './week-view.js';
import {
  setupCalendar, renderCalendarView, openDaySidebar, buildLegendColors,
  initCalendarInteractions, changeMonth, goToToday,
} from './calendar.js';
import { setupSettings, initSettingsMenu } from './settings.js';
/* ================================================================
   AMIVET PLANNING — Application JS (vanilla ES2022, sans dépendance)
   ================================================================ */

/* ----------------------------------------------------------------
   1. CONSTANTES & ÉTAT GLOBAL
   ---------------------------------------------------------------- */

// Réglages (couleurs associés/ASV, gestion collaborateurs, synchro calendrier, aide) → src/settings.js

// État de navigation par vue calendrier (mois affiché courant par année)
const today = new Date();

// ----------------------------------------------------------------
// Année "courante" / "prévisionnelle" — dynamiques plutôt que des littéraux figés, pour
// que la bascule annuelle (voir performYearRollover) continue de fonctionner toute seule
// chaque 1er janvier sans jamais avoir besoin de retoucher le code.
// ----------------------------------------------------------------


// Cal state + store.CAL_VIEWS → store.js (see initCalState() below)
function buildCalViews(){
  const cy = getCurrentYear();
  return {
    'vets-current':  { year:cy,   people:PEOPLE,     navState:store.calStateCurrent,     todayNav:true,  forecast:false, label:'Vétérinaires', containerId:'vets-sub-calendar', printable:false },
    'vets-forecast': { year:cy+1, people:PEOPLE,     navState:store.calStateForecast,    todayNav:false, forecast:true,  label:'Vétérinaires', containerId:'vets-sub-forecast', printable:false },
    'asv-current':   { year:cy,   people:ASV_PEOPLE, navState:store.calStateAsvCurrent,  todayNav:true,  forecast:false, label:'ASV',          containerId:'asv-sub-calendar',  printable:true },
    'asv-forecast':  { year:cy+1, people:ASV_PEOPLE, navState:store.calStateAsvForecast, todayNav:false, forecast:true,  label:'ASV',          containerId:'asv-sub-forecast',  printable:true },
  };
}
function initCalState(){
  const cy = getCurrentYear();
  const m = today.getFullYear() === cy ? today.getMonth() : 0;
  store.calStateCurrent.month = m;
  store.calStateAsvCurrent.month = m;
  store.CAL_VIEWS = buildCalViews();
  store.dashState.year = cy;
}
const GROUP_VIEWS = {
  vets: { label:'Vétérinaires', calendarViewKey:'vets-current', forecastViewKey:'vets-forecast', calendarContainer:'vets-sub-calendar', annualContainer:'vets-sub-annual', forecastContainer:'vets-sub-forecast' },
  asv:  { label:'ASV',          calendarViewKey:'asv-current',  forecastViewKey:'asv-forecast',  calendarContainer:'asv-sub-calendar',  annualContainer:'asv-sub-annual',  forecastContainer:'asv-sub-forecast' },
};

initCalState();

// Verrou par mot de passe (protection légère) des onglets sensibles. Le mot de passe
// lui-même n'existe nulle part dans ce code source (public sur GitHub) : il est stocké
// sous forme de hash dans Supabase, vérifié via des fonctions RPC qui ne renvoient que
// vrai/faux (voir supabase-schema-3-password-security.sql).

// ----------------------------------------------------------------
// Bascule annuelle automatique (current -> current+1, forecast -> forecast+1)
// ----------------------------------------------------------------
function isYearRolloverDue(){ return today.getFullYear() > getCurrentYear(); }
function performYearRollover(){
  const fromYear = getCurrentYear();
  const toYear = fromYear + 1;
  setCurrentYear(toYear);
  store.CAL_VIEWS = buildCalViews();
  store.calStateCurrent.month = 0;
  store.calStateAsvCurrent.month = 0;
  store.calStateForecast.month = 0;
  store.calStateAsvForecast.month = 0;
  document.getElementById('rollover-banner')?.remove();
  renderCurrentView();
  showToast(`Calendrier basculé sur ${toYear}`, '🔄');
}
function renderRolloverBanner(){
  if(!isYearRolloverDue()) return;
  if(document.getElementById('rollover-banner')) return;
  const fromYear = getCurrentYear(), toYear = fromYear + 1;
  const bar = document.createElement('div');
  bar.id = 'rollover-banner';
  bar.className = 'rollover-banner';
  // eslint-disable-next-line no-unsanitized/property
  bar.innerHTML = `
    <span>📅 Nous sommes en ${today.getFullYear()} — le calendrier ${fromYear} peut basculer sur ${toYear} (le prévisionnel ${toYear} devient le calendrier courant, ${toYear+1} est proposé en prévisionnel).</span>
    <div class="rollover-actions">
      <button class="btn btn-sm btn-primary" id="rollover-confirm">Basculer maintenant</button>
      <button class="btn-icon" id="rollover-dismiss" aria-label="Plus tard">✕</button>
    </div>
  `;
  document.getElementById('app-main').prepend(bar);
  bar.querySelector('#rollover-confirm').onclick = performYearRollover;
  bar.querySelector('#rollover-dismiss').onclick = ()=> bar.remove();
}

const UNDO_MAX = 30;
function snapshotBeforeChange(){
  store.UNDO_STACK.push(JSON.stringify(store.DATA.slots));
  if(store.UNDO_STACK.length > UNDO_MAX) store.UNDO_STACK.shift();
  updateUndoButtons();
}
function undoLastAction(){
  if(store.UNDO_STACK.length === 0) return;
  store.DATA.slots = JSON.parse(store.UNDO_STACK.pop());
  saveData(false);
  renderCurrentView();
  updateUndoButtons();
  showToast('Dernière action annulée', '↩️');
}
function updateUndoButtons(){
  document.querySelectorAll('.undo-btn').forEach(btn=>{ btn.disabled = store.UNDO_STACK.length === 0; });
}


/* ----------------------------------------------------------------
   4. PERSISTANCE (localStorage + synchronisation Supabase partagée)
   ---------------------------------------------------------------- */

// ----------------------------------------------------------------
// Authentification — état global et gestion de session
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// État global — Annonces
// ----------------------------------------------------------------

function clearAuthSession(){ sessionStorage.removeItem(AUTH_SESSION_KEY); store.currentUser = null; }

// ----------------------------------------------------------------
// Fonctions d'authentification (Supabase Auth REST)
// ----------------------------------------------------------------
async function authSignOut(){
  const s = getAuthSession();
  if(s?.access_token){
    await fetch(`${SUPABASE_AUTH_URL}logout`, {
      method:'POST',
      headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${s.access_token}` },
    }).catch(()=>{});
  }
  clearAuthSession();
  // Purger le DYNAMIC_CACHE pour ne pas laisser les données RH lisibles
  // depuis le cache SW sur un poste partagé après déconnexion.
  if(navigator.serviceWorker?.controller){
    navigator.serviceWorker.controller.postMessage({ type:'PURGE_DYNAMIC_CACHE' });
  }
}
async function authRefreshSession(){
  const s = getAuthSession();
  if(!s?.refresh_token){ clearAuthSession(); return null; }
  const res = await fetch(`${SUPABASE_AUTH_URL}token?grant_type=refresh_token`, {
    method:'POST',
    headers:{ apikey:SUPABASE_ANON_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ refresh_token:s.refresh_token }),
  });
  if(!res.ok){ clearAuthSession(); return null; }
  const session = await res.json();
  saveAuthSession(session);
  return session;
}
async function loadCurrentUser(){
  const s = getAuthSession();
  if(!s?.access_token) return null;
  // Vérifier le token Supabase Auth
  let authRes = await fetch(`${SUPABASE_AUTH_URL}user`, {
    headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${s.access_token}` },
  });
  if(authRes.status === 401){
    const refreshed = await authRefreshSession();
    if(!refreshed) return null;
    authRes = await fetch(`${SUPABASE_AUTH_URL}user`, {
      headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${refreshed.access_token}` },
    });
  }
  if(!authRes.ok) return null;
  const authUser = await authRes.json();
  // Charger le profil depuis user_profiles
  const profRes = await fetch(`${SUPABASE_URL}user_profiles?id=eq.${authUser.id}&select=*`, {
    headers: supabaseHeaders(),
  });
  if(!profRes.ok) return null;
  const profiles = await profRes.json();
  if(!profiles.length) return null;
  const p = profiles[0];
  store.currentUser = {
    id: authUser.id, email: authUser.email,
    role: p.role, person_id: p.person_id, display_name: p.display_name,
    can_edit_vet_calendar: p.can_edit_vet_calendar,
    can_edit_all_asv: p.can_edit_all_asv,
  };
  return store.currentUser;
}

// ----------------------------------------------------------------
// Helpers de permissions
// ----------------------------------------------------------------
function effectiveRole(){
  if(!store.currentUser) return null;
  if(store.currentUser.role === 'admin') return store.adminViewMode === 'asv' ? 'asv' : 'vet';
  return store.currentUser.role;
}
function canAccessDashboard(){ const r = effectiveRole(); return r === 'vet' || r === 'admin'; }
function canAccessSettings(){ return store.currentUser?.role === 'admin' || store.currentUser?.role === 'vet'; }
function canEditSlot(personId){
  if(!store.currentUser) return false;
  const asvPerson = ASV_PEOPLE.find(p=>p.id===personId);
  if(asvPerson?.archived) return false;
  const role = effectiveRole();
  if(role === 'vet') return true;
  if(role === 'asv'){
    const isImpersonating = store.currentUser.role === 'admin' && store.adminViewMode === 'asv';
    const myId = isImpersonating ? store.adminImpersonatedPersonId : store.currentUser.person_id;
    if(isASVPerson(personId)){
      // En impersonation : strictement la ligne de la personne choisie, comme un vrai ASV
      if(isImpersonating) return personId === myId;
      return personId === myId || store.currentUser.can_edit_all_asv === true;
    }
    // Calendrier vétérinaires : jamais modifiable en impersonation
    if(isImpersonating) return false;
    return store.currentUser.can_edit_vet_calendar === true;
  }
  return false;
}

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && parsed.slots) { store.DATA = parsed; return; }
    }
  }catch(e){ console.warn('Lecture localStorage impossible, ré-initialisation.', e); }
  store.DATA = { version:2, slots:{} };
}
function saveData(showToast = true){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store.DATA));
  updateDashboardNavBadge();
  scheduleSupabasePush();
  if(showToast) showSavedToast();
}

// --- Synchronisation Supabase : la base partagée fait foi entre tous les appareils, le
// localStorage ne sert que de cache instantané pour le premier affichage et le hors-ligne.
let _supabasePushTimer = null;
function scheduleSupabasePush(){
  clearTimeout(_supabasePushTimer);
  // Attend une courte pause après la dernière modification (ex. fin d'un glisser-peindre)
  // pour grouper les écritures plutôt que d'envoyer une requête à chaque case cochée.
  _supabasePushTimer = setTimeout(()=> pushDataToSupabase(store.DATA.slots), 900);
}
// Signatures électroniques mensuelles (feuille de présence ASV) : un cache local simple
// (clé "personId|year|month") rechargé au démarrage et après chaque signature/annulation —
// pas besoin de la sophistication du sync push/pull de planning_data, ces écritures sont
// rares et ponctuelles (quelques-unes par mois, pas par clic).
/* signatures.js — signatureKey, isMonthSigned, loadSignatures, signMonth, revokeSignature */

async function loadInterviews(){
  try{
    const res = await fetch(`${SUPABASE_URL}annual_interviews?select=*`, { headers: supabaseHeaders() });
    if(!res.ok) return;
    store.INTERVIEWS = await res.json();
  }catch(e){ console.warn('Entretiens inaccessibles.', e); }
}

// Notifie le nombre de demandes de congé ASV en attente directement sur l'onglet "Tableau
// de bord", visible depuis n'importe quelle page de l'app (pas seulement quand on y est).
function updateDashboardNavBadge(){
  const el = document.getElementById('dash-nav-badge');
  const n = countPendingLeaveRequests();
  if(el){
    el.textContent = n > 0 ? String(n) : '';
    el.className = n > 0 ? 'nav-badge' : '';
  }
  if('setAppBadge' in navigator){
    if(n > 0) navigator.setAppBadge(n).catch(()=>{});
    else navigator.clearAppBadge().catch(()=>{});
  }
}

// ----------------------------------------------------------------
/* announcements.js — annonceViewerId, loadAnnouncements, renderAnnounces, etc. */

/* slots.js — slotKey, labelKey, getSlotState/setSlotState, etc. */

/* ----------------------------------------------------------------
   5. DONNÉES DE DÉMONSTRATION
   ---------------------------------------------------------------- */
// Marque une plage de jours (bornes incluses) comme absente avec un motif, pour une personne donnée
function seedAbsenceRange(personId, fromISO, toISO, label){
  let d = new Date(fromISO+'T00:00:00');
  const end = new Date(toISO+'T00:00:00');
  while(d <= end){
    if(!isSunday(d)){
      const iso = fmtISO(d);
      SLOTS.forEach(slot=>{
        setSlotState(iso, personId, slot, 'absent');
        setSlotLabel(iso, personId, slot, label);
      });
    }
    d = new Date(d.getTime() + 86400000);
  }
}

function _seedDemoData(){
  // --- 2026 : données réelles (issues du planning Excel de la clinique) ---
  // Janvier à août : présence par défaut Lu-Sa pour les deux associés (les jours fériés
  // restent vides, comme dans le fichier source, qui ne contient pas non plus de données
  // au-delà du mois d'août 2026 — sept./oct./nov./déc. ne sont donc pas pré-remplis).
  for(let month=0; month<=7; month++){
    const nbDays = daysInMonth(2026, month);
    for(let day=1; day<=nbDays; day++){
      const date = new Date(2026, month, day);
      const iso = fmtISO(date);
      if(isSunday(date) || holidayName(iso)) continue;
      setSlotState(iso,'david','M','present');
      setSlotState(iso,'david','AM','present');
      setSlotState(iso,'stephane','M','present');
      setSlotState(iso,'stephane','AM','present');
    }
  }
  // Congés et événements identifiés sur le planning d'origine
  seedAbsenceRange('david', '2026-01-12', '2026-01-16', 'Perche');
  seedAbsenceRange('david', '2026-01-26', '2026-01-31', 'Ski');
  seedAbsenceRange('david', '2026-02-09', '2026-02-13', 'Perche');
  seedAbsenceRange('stephane', '2026-05-01', '2026-05-02', 'Événement familial');
  seedAbsenceRange('stephane', '2026-05-13', '2026-05-14', 'Événement familial');
  seedAbsenceRange('david', '2026-05-19', '2026-05-23', 'Congés');
  seedAbsenceRange('stephane', '2026-06-19', '2026-06-20', 'Congés');
  seedAbsenceRange('stephane', '2026-06-24', '2026-06-28', 'Congés');
  seedAbsenceRange('stephane', '2026-10-10', '2026-10-11', 'Congés');

  // --- 2027 : janvier (prévisionnel) ---
  const nbDaysJan2027 = daysInMonth(2027,0);
  for(let day=1; day<=nbDaysJan2027; day++){
    const date = new Date(2027,0,day);
    if(isSunday(date)) continue;
    const iso = fmtISO(date);
    const wd = isoWeekday(date);
    if(wd <=3){ setSlotState(iso,'david','M','present'); setSlotState(iso,'david','AM','present'); }
    else if(wd === 4){ setSlotState(iso,'david','M','absent'); setSlotState(iso,'david','AM','absent'); }
    if(wd >=1 && wd <=4){ setSlotState(iso,'stephane','M','present'); setSlotState(iso,'stephane','AM','present'); }
    else if(wd === 0){ setSlotState(iso,'stephane','M','absent'); setSlotState(iso,'stephane','AM','absent'); }
  }
  ['2027-01-12','2027-01-13','2027-01-14'].forEach(iso=>{
    setSlotState(iso,'stephane','M','absent'); setSlotLabel(iso,'stephane','M','Formation chirurgie');
    setSlotState(iso,'stephane','AM','absent'); setSlotLabel(iso,'stephane','AM','Formation chirurgie');
  });
  // --- 2027 : semaine de congés David en février ---
  for(let day=8; day<=12; day++){
    const date = new Date(2027,1,day);
    if(isSunday(date)) continue;
    const iso = fmtISO(date);
    setSlotState(iso,'david','M','absent'); setSlotLabel(iso,'david','M','Vacances hiver');
    setSlotState(iso,'david','AM','absent'); setSlotLabel(iso,'david','AM','Vacances hiver');
  }
  saveData(false);
}


/* ----------------------------------------------------------------
   8. MENU RÉGLAGES (export / import / reset)
   ---------------------------------------------------------------- */

function openResetYearModal(year, isForecast){
  const label = isForecast ? `prévisionnel ${year}` : `année courante ${year}`;
  openConfirmModal({
    title:`Réinitialiser le ${label} ?`,
    message:`Toutes les présences, absences${isForecast ? '' : ', commentaires'} et heures saisies pour ${year} seront définitivement supprimées. Cette action est irréversible.`,
    confirmLabel:`Réinitialiser ${year}`,
    onConfirm:()=>{
      snapshotBeforeChange();
      Object.keys(store.DATA.slots).filter(k=>k.startsWith(`${year}-`)).forEach(k=> delete store.DATA.slots[k]);
      saveData();
      renderCurrentView();
      showToast(`${year} réinitialisé`, '🗑️');
    }
  });
}

/* ----------------------------------------------------------------
   9. NAVIGATION ENTRE ONGLETS
   ---------------------------------------------------------------- */
let currentView = 'vets';
const VIEW_RENDERERS = {}; // rempli plus loin par chaque module de vue

function switchView(viewId){
  currentView = viewId;
  document.querySelectorAll('.nav-tab').forEach(btn=>{
    const active = btn.dataset.view === viewId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.view-section').forEach(sec=>{
    sec.classList.toggle('hidden', sec.id !== `view-${viewId}`);
  });
  renderCurrentView();
  saveViewState();
}
// Renvoie l'id du conteneur DOM de la sous-page actuellement sélectionnée pour ce groupe.
function _activeSubContainer(group){
  const g = GROUP_VIEWS[group];
  const sub = store.subNavState[group];
  if(sub === 'calendar') return g.calendarContainer;
  if(sub === 'forecast') return g.forecastContainer;
  return g.annualContainer;
}
// Seul point d'entrée qui décide si le contenu réel peut s'afficher ou s'il faut montrer
// le verrou — aussi bien pour un onglet simple (tableau de bord) que pour un onglet groupé
// (vétérinaires), où le verrou doit s'afficher À L'INTÉRIEUR de la sous-page active sans
// détruire la sous-navigation (sub-nav) ni les autres sous-pages masquées.
function renderCurrentView(){
  renderRolloverBanner();
  const isForecastSubPage = (currentView === 'vets' && store.subNavState.vets === 'forecast') || (currentView === 'asv' && store.subNavState.asv === 'forecast');
  document.body.classList.toggle('forecast-theme', isForecastSubPage);
  if(currentView === 'dashboard' && !canAccessDashboard()){
    switchView('vets');
    return;
  }
  const renderer = VIEW_RENDERERS[currentView];
  if(renderer) renderer();
}

// Sous-pages "Calendrier mensuel" / "Vue annuelle" / "Prévisionnel" au sein d'un onglet
// groupé. Appelée uniquement une fois l'accès autorisé par renderCurrentView (jamais
// directement quand le groupe est protégé et verrouillé).
function renderGroupSubPage(group){
  const g = GROUP_VIEWS[group];
  const sub = store.subNavState[group];
  if(sub === 'calendar') renderCalendarView(g.calendarViewKey);
  else if(sub === 'forecast') renderCalendarView(g.forecastViewKey);
  else if(sub === 'week' && group === 'asv') renderWeekViewASV();
  else renderAnnualViewForGroup(group);
}
function switchSubPage(group, subKey){
  const g = GROUP_VIEWS[group];
  store.subNavState[group] = subKey;
  document.querySelectorAll(`#${group}-sub-nav .sub-tab`).forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.sub === subKey);
  });
  document.getElementById(g.calendarContainer).classList.toggle('hidden', subKey !== 'calendar');
  document.getElementById(g.annualContainer).classList.toggle('hidden', subKey !== 'annual');
  document.getElementById(g.forecastContainer).classList.toggle('hidden', subKey !== 'forecast');
  const weekEl = document.getElementById('asv-sub-week');
  if(weekEl) weekEl.classList.toggle('hidden', !(group === 'asv' && subKey === 'week'));
  renderCurrentView();
  saveViewState();
}

/* ================================================================
   VUE SEMAINE ASV — saisie horaire personnelle
   ================================================================ */
// Génère une fenêtre d'impression du planning hebdomadaire d'une ASV avec cadre de signature
// Impression mensuelle — une fiche par ASV sélectionnée, tout le mois

// Popup de sélection ASV avant impression mensuelle


// Mémorise l'onglet et la sous-page affichés pour qu'un rechargement de page (F5) rouvre
// la même vue plutôt que de revenir systématiquement sur "Vétérinaires". Purement
// cosmétique : ne contient aucune donnée du planning, donc pas besoin de Supabase ici.
function saveViewState(){
  try{
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
      currentView,
      subNavState: store.subNavState,
      annualYearState: store.annualYearState,
      dashSubTab: store.dashSubState.tab,
    }));
  }catch{ /* stockage indisponible : tant pis, on retombera sur la vue par défaut */ }
}
// Renvoie l'id de vue à restaurer (ou null si rien de valide n'a été sauvegardé), et
// restaure au passage les sous-pages mémorisées dans les états globaux correspondants.
function loadViewState(){
  try{
    const raw = localStorage.getItem(VIEW_STATE_KEY);
    if(!raw) return null;
    const saved = JSON.parse(raw);
    if(saved.subNavState) Object.assign(store.subNavState, saved.subNavState);
    if(saved.annualYearState) Object.assign(store.annualYearState, saved.annualYearState);
    if(saved.dashSubTab) store.dashSubState.tab = saved.dashSubTab;
    return saved.currentView || null;
  }catch{ return null; }
}
function initNav(){
  document.getElementById('main-nav').addEventListener('click', (e)=>{
    const btn = e.target.closest('.nav-tab');
    if(btn) switchView(btn.dataset.view);
  });
  document.querySelectorAll('.sub-nav').forEach(nav=>{
    const group = nav.id.replace('-sub-nav','');
    nav.addEventListener('click', (e)=>{
      const btn = e.target.closest('.sub-tab');
      if(btn) switchSubPage(group, btn.dataset.sub);
    });
  });
}

/* ----------------------------------------------------------------
   10. RACCOURCIS CLAVIER
   ---------------------------------------------------------------- */
// Renvoie la clé store.CAL_VIEWS du calendrier mensuel actuellement affiché, ou null si la vue
// courante n'est pas un calendrier (ex. tableau de bord, sous-page "Vue annuelle"...).
function activeCalendarViewKey(){
  const g = GROUP_VIEWS[currentView];
  if(!g) return null;
  const sub = store.subNavState[currentView];
  if(sub === 'calendar') return g.calendarViewKey;
  if(sub === 'forecast') return g.forecastViewKey;
  return null;
}
function initKeyboardShortcuts(){
  document.addEventListener('keydown', (e)=>{
    if(e.target.matches && e.target.matches('input, textarea')) return;
    if((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z'){
      e.preventDefault();
      undoLastAction();
      return;
    }
    const viewKey = activeCalendarViewKey();
    if(!viewKey) return;
    if(e.key === 'ArrowLeft'){ changeMonth(viewKey, -1); }
    else if(e.key === 'ArrowRight'){ changeMonth(viewKey, 1); }
    else if(e.key.toLowerCase() === 't' && store.CAL_VIEWS[viewKey].todayNav){ goToToday(viewKey); }
  });
}

/* ================================================================
   11-13. VUE CALENDRIER + INTERACTIONS → src/calendar.js
   VUE SEMAINE ASV + IMPRESSION → src/week-view.js
   ================================================================ */

VIEW_RENDERERS['vets'] = ()=> renderGroupSubPage('vets');
VIEW_RENDERERS['asv'] = ()=> renderGroupSubPage('asv');
VIEW_RENDERERS['annonces'] = renderAnnounces;
/* announcements.js — renderAnnounces, openAnnouncementModal */

/* ================================================================
   14. TABLEAU DE BORD → dashboard.js
   15. VUE ANNUELLE (heatmap) → annual-view.js
   16. INITIALISATION GÉNÉRALE (ci-dessous)
   ================================================================ */

function renderImpersonationBanner(){
  const banner = document.getElementById('impersonation-banner');
  if(!banner) return;
  if(store.currentUser?.role === 'admin' && store.adminViewMode === 'asv' && store.adminImpersonatedPersonId){
    const p = personOf(store.adminImpersonatedPersonId);
    banner.classList.remove('hidden');
    // eslint-disable-next-line no-unsanitized/property
    banner.innerHTML = `
      <span>👁 Mode aperçu</span>
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${p?.color||'#fff'};display:inline-block;"></span>
        Vue de <strong>${escapeHTML(p?.short||store.adminImpersonatedPersonId)}</strong>
      </span>
      <button class="imp-back" id="imp-back-btn">← Retour à ma vue</button>
    `;
    document.getElementById('imp-back-btn').onclick = ()=>{
      store.adminViewMode = 'vet';
      store.adminImpersonatedPersonId = null;
      applyRoleToDOM();
      initSettingsMenu();
      renderCurrentView();
      showToast('Retour à la vue Vétérinaires', '👁');
    };
  } else {
    banner.classList.add('hidden');
    banner.innerHTML = '';
  }
}

// Applique les classes CSS de rôle sur <body> et met à jour la bannière d'impersonation.
function applyRoleToDOM(){
  document.body.classList.toggle('role-asv', effectiveRole() === 'asv');
  document.body.classList.toggle('role-vet', effectiveRole() !== 'asv');
  renderImpersonationBanner();
}

function openASVImpersonationPicker(){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3>👁 Vue ASV — choisir</h3>
    <p>Sélectionnez l'ASV dont vous souhaitez voir l'expérience :</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
      ${ASV_PEOPLE.map(p=>`
        <button type="button" class="btn" data-pick-asv="${p.id}"
          style="justify-content:flex-start;gap:10px;border-color:${p.color};">
          <span style="width:10px;height:10px;border-radius:50%;background:${p.color};display:inline-block;"></span>
          ${escapeHTML(p.short)}
        </button>
      `).join('')}
    </div>
    <div class="modal-actions"><button class="btn" id="modal-cancel">Annuler</button></div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
  box.querySelectorAll('[data-pick-asv]').forEach(btn=>{
    btn.onclick = ()=>{
      store.adminImpersonatedPersonId = btn.dataset.pickAsv;
      store.adminViewMode = 'asv';
      close();
      applyRoleToDOM();
      initSettingsMenu();
      if(currentView === 'dashboard') switchView('vets');
      else renderCurrentView();
      showToast(`Vue ASV : ${personOf(store.adminImpersonatedPersonId)?.short}`, '👁');
    };
  });
}

function initApp(){
  store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(today));
  applyRoleToDOM();
  loadASVRoster();
  loadPersonColors();
  // Rafraîchir le token toutes les 45 min pour éviter les 401 après expiration
  setInterval(()=> authRefreshSession(), 45 * 60 * 1000);
  loadData();
  initNav();
  initSettingsMenu();
  initKeyboardShortcuts();
  initCalendarInteractions();
  updateDashboardNavBadge();
  const restoredView = loadViewState();
  switchSubPage('vets', store.subNavState.vets);
  switchSubPage('asv', store.subNavState.asv);
  const startView = !canAccessDashboard() && restoredView === 'dashboard' ? 'vets' : restoredView;
  switchView(VIEW_RENDERERS[startView] ? startView : 'vets');
  refreshData();
  document.getElementById('login-overlay').classList.add('hidden');
  // Ouvrir le modal de confirmation si l'utilisateur vient d'un lien de signature email
  if(store.pendingSignToken){
    const token = store.pendingSignToken;
    store.pendingSignToken = null;
    openSignConfirmModal(token);
  }
  handlePwaShortcutAction();
}

async function init(){
  // Charger l'effectif ASV dès le démarrage (indépendant de l'auth) : garantit que
  // localStorage est peuplé même sur l'écran de connexion, et que le roster est prêt
  // quel que soit le chemin d'entrée (login, recovery, invite).
  loadASVRoster();
  // Callback de réinitialisation de mot de passe : Supabase envoie le token dans le hash URL
  const hash = new URLSearchParams(window.location.hash.replace(/^#/,''));
  const query = new URLSearchParams(window.location.search);
  const type = hash.get('type') || query.get('type');
  const accessToken = hash.get('access_token') || query.get('access_token');
  if((type === 'recovery' || type === 'invite') && accessToken){
    renderSetPasswordScreen(accessToken, type === 'invite');
    return;
  }

  // Lien de signature reçu par email (?sign=UUID) — stocker le token avant l'auth,
  // puis le traiter dans initApp() une fois l'utilisateur identifié.
  const signToken = query.get('sign');
  if(signToken){
    store.pendingSignToken = signToken;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('sign');
    history.replaceState({}, '', cleanUrl.toString());
  }

  const session = getAuthSession();
  if(!session){ renderLoginScreen(); return; }
  const user = await loadCurrentUser();
  if(!user){ clearAuthSession(); renderLoginScreen(); return; }
  initApp();
}
document.addEventListener('DOMContentLoaded', init);

/* login.js — renderLoginScreen, renderForgotPasswordScreen, renderSetPasswordScreen */

/* ================================================================
   PWA — fonctions SW, install, push → src/pwa.js
   ================================================================ */

function refreshData(){
  syncFromSupabase().then(remoteSlots=>{
    if(remoteSlots !== null){
      store.DATA = { version:2, slots: remoteSlots };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store.DATA));
      renderCurrentView();
      updateDashboardNavBadge();
    }
  });
  loadSignatures();
  loadInterviews();
  loadAnnouncements();
}
function refreshAllPwaData(){ refreshData(); }
window.addEventListener('online', ()=>{ updatePwaOfflineBanner(); refreshAllPwaData(); });
window.addEventListener('offline', updatePwaOfflineBanner);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) refreshAllPwaData(); });

/* ---------------- Raccourcis manifest + navigation au clic sur une notification ---------------- */
function navigateForNotificationType(type){
  if(typeof store.currentUser === 'undefined' || !store.currentUser) return;
  switch(type){
    case 'leave_request': case 'leave_approved': case 'leave_rejected':
      if(canAccessDashboard()){ switchView('dashboard'); setDashSubTab('requests'); renderDashboard(); }
      break;
    case 'medical_visit':
      if(canAccessDashboard()){ switchView('dashboard'); setDashSubTab('stats'); renderDashboard(); }
      break;
    case 'interview':
      if(canAccessDashboard()){ switchView('dashboard'); setDashSubTab('interviews'); renderDashboard(); }
      break;
    case 'announcement':
      switchView('annonces');
      break;
  }
}
function handlePwaShortcutAction(){
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if(!action) return;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('action');
  cleanUrl.searchParams.delete('source');
  history.replaceState({}, '', cleanUrl.toString());

  if(action === 'new-leave'){
    // Pas de formulaire dédié pour une nouvelle demande : on amène l'ASV sur son
    // calendrier, où peindre une absence crée automatiquement la demande en attente.
    switchView('asv');
    switchSubPage('asv', 'calendar');
  } else if(action === 'week-view'){
    switchView('asv');
    switchSubPage('asv', 'week');
  } else {
    navigateForNotificationType({
      'dashboard-requests':'leave_request', 'dashboard-medical':'medical_visit',
      'dashboard-interviews':'interview', 'announcements':'announcement',
    }[action]);
  }
}

/* push subscriptions + notification settings → pwa.js */

/* ---------------- Amorçage ---------------- */
setupSettings({ saveData, renderCurrentView, snapshotBeforeChange, canAccessSettings, effectiveRole, applyRoleToDOM, openASVImpersonationPicker, authSignOut, authRefreshSession, buildCalViews, activeCalendarViewKey });
setupCalendar({ snapshotBeforeChange, saveData, switchSubPage, canEditSlot, undoLastAction, getCurrentView: ()=>currentView });
setupWeekView({ saveData, snapshotBeforeChange, renderCurrentView, canEditSlot, effectiveRole, switchSubPage, updateUndoButtons });
setupLogin({ loadCurrentUser, initApp });
setupSignatures({ onLoaded: renderCurrentView, renderCalendarView });
setupAnnualView({ switchSubPage, switchView, openDaySidebar, saveViewState, buildLegendColors, GROUP_VIEWS });
setupDashboard({ openResetYearModal, saveViewState, canEditSlot, effectiveRole, snapshotBeforeChange, saveData, renderCurrentView, openDaySidebar, loadInterviews });
VIEW_RENDERERS['dashboard'] = renderDashboard;
initServiceWorker(navigateForNotificationType);
setTimeout(showIOSInstallTip, 4000);
updatePwaOfflineBanner();

/* ============================================================
   Mobile (≤767px) — bottom nav, bottom sheets, FAB
   ============================================================ */
(function initMobileUI(){
  function debounce(fn, ms){ let t; return function(){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,arguments),ms); }; }

  /* ── Bottom Tab Bar ── */
  const TABS = [
    { view:'dashboard', icon:'📊', label:'Tableau de bord', shortLabel:'Tableau',  badgeId:'dash-nav-badge' },
    { view:'vets',      icon:'🩺', label:'Vétérinaires',    shortLabel:'Vétos',     badgeId:null },
    { view:'asv',       icon:'🐾', label:'ASV',              shortLabel:'ASV',       badgeId:null },
    { view:'annonces',  icon:'📣', label:'Annonces',         shortLabel:'Annonces',  badgeId:'annonces-nav-badge' },
  ];
  let bottomNav=null, fab=null;

  function createBottomNav(){
    const nav=document.createElement('nav');
    nav.id='mobile-bottom-nav';
    nav.setAttribute('aria-label','Navigation principale');
    TABS.forEach(tab=>{
      const btn=document.createElement('button');
      btn.className='mb-tab'; btn.dataset.view=tab.view;
      btn.setAttribute('aria-label',tab.label);
      const icon=document.createElement('span'); icon.className='mb-icon'; icon.textContent=tab.icon;
      const lbl=document.createElement('span');  lbl.className='mb-label'; lbl.textContent=tab.shortLabel;
      btn.appendChild(icon); btn.appendChild(lbl);
      if(tab.badgeId){
        const bw=document.createElement('span'); bw.id='mb-'+tab.badgeId; bw.className='mb-badge';
        btn.appendChild(bw);
      }
      btn.addEventListener('click',()=>{ if(typeof switchView==='function') switchView(tab.view); });
      nav.appendChild(btn);
    });
    return nav;
  }

  function syncBottomNav(){
    if(!bottomNav) return;
    const activeView=document.querySelector('.nav-tab.active')?.dataset.view;
    bottomNav.querySelectorAll('.mb-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));
    TABS.forEach(tab=>{
      if(!tab.badgeId) return;
      const src=document.getElementById(tab.badgeId);
      const dst=document.getElementById('mb-'+tab.badgeId);
      // eslint-disable-next-line no-unsanitized/property
      if(src&&dst) dst.innerHTML=src.innerHTML;
    });
  }

  function mountBottomNav(){
    if(bottomNav||window.innerWidth>=768) return;
    bottomNav=createBottomNav();
    document.getElementById('app').appendChild(bottomNav);
    syncBottomNav();
    const obs=new MutationObserver(syncBottomNav);
    document.querySelectorAll('.nav-tab').forEach(b=>obs.observe(b,{attributes:true,attributeFilter:['class']}));
    ['dash-nav-badge','annonces-nav-badge'].forEach(id=>{
      const el=document.getElementById(id); if(el) obs.observe(el,{childList:true,subtree:true,characterData:true});
    });
  }
  function unmountBottomNav(){ if(bottomNav){ bottomNav.remove(); bottomNav=null; } }

  /* ── FAB ── */
  function mountFAB(){
    if(fab||window.innerWidth>=768) return;
    if(typeof switchView!=='function'||typeof switchSubPage!=='function') return;
    fab=document.createElement('button');
    fab.id='mobile-fab'; fab.setAttribute('aria-label','Demander un congé'); fab.textContent='+';
    fab.addEventListener('click',()=>{ switchView('asv'); switchSubPage('asv','calendar'); });
    document.getElementById('app').appendChild(fab);
  }
  function unmountFAB(){ if(fab){ fab.remove(); fab=null; } }

  /* ── Drag-handle + swipe-to-dismiss ── */
  function addSheetHandle(el, dismissFn){
    if(window.innerWidth>=768) return;
    // Retire l'ancien handle s'il existe (re-render du contenu)
    el.querySelectorAll(':scope > .mobile-sheet-handle').forEach(h=>h.remove());
    const handle=document.createElement('div');
    handle.className='mobile-sheet-handle';
    el.insertBefore(handle, el.firstChild);

    let startY=0, startT=0, swiping=false;
    handle.addEventListener('touchstart',e=>{
      startY=e.touches[0].clientY; startT=Date.now(); swiping=false;
      el.style.transition='none';
    },{passive:true});
    handle.addEventListener('touchmove',e=>{
      const dy=e.touches[0].clientY-startY;
      if(dy>0){ swiping=true; el.style.transform=`translateY(${dy}px)`; }
    },{passive:true});
    handle.addEventListener('touchend',e=>{
      const dy=e.changedTouches[0].clientY-startY;
      const vel=dy/Math.max(1,Date.now()-startT);
      el.style.transition=''; el.style.transform='';
      if(swiping && dy>80 && vel>0.3) dismissFn();
    });
  }

  /* ── Sidebar ── */
  (function(){
    const sidebar=document.getElementById('day-sidebar');
    const overlay=document.getElementById('sidebar-overlay');
    if(!sidebar) return;
    const dismiss=()=>{ sidebar.classList.remove('open'); overlay&&overlay.classList.remove('open'); };
    new MutationObserver(()=>{ if(window.innerWidth<768) addSheetHandle(sidebar,dismiss); })
      .observe(sidebar,{childList:true});
  })();

  /* ── Modal ── */
  (function(){
    const box=document.getElementById('modal-box');
    const backdrop=document.getElementById('modal-backdrop');
    if(!box||!backdrop) return;
    const dismiss=()=>backdrop.classList.remove('open');
    new MutationObserver(()=>{ if(window.innerWidth<768) addSheetHandle(box,dismiss); })
      .observe(box,{childList:true});
    new MutationObserver(()=>{
      if(backdrop.classList.contains('open')&&window.innerWidth<768) addSheetHandle(box,dismiss);
    }).observe(backdrop,{attributes:true,attributeFilter:['class']});
  })();

  /* ── Popover ── */
  (function(){
    const box=document.getElementById('popover-box');
    const backdrop=document.getElementById('popover-backdrop');
    if(!box||!backdrop) return;
    const dismiss=()=>backdrop.classList.remove('open');
    new MutationObserver(()=>{ if(window.innerWidth<768) addSheetHandle(box,dismiss); })
      .observe(box,{childList:true});
    new MutationObserver(()=>{
      if(backdrop.classList.contains('open')&&window.innerWidth<768) addSheetHandle(box,dismiss);
    }).observe(backdrop,{attributes:true,attributeFilter:['class']});
  })();

  /* ── Resize ── */
  function onResize(){
    if(window.innerWidth<768){ mountBottomNav(); mountFAB(); }
    else { unmountBottomNav(); unmountFAB(); }
  }
  window.addEventListener('resize',debounce(onResize,200));
  onResize();
})();
