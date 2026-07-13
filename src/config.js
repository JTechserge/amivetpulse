/* ================================================================
   AMIVET PLANNING — Constantes & configuration statique
   Aucune dépendance externe. Importé par app.js et les modules métier.
   ================================================================ */

// ----------------------------------------------------------------
// Personnes
// ----------------------------------------------------------------
export const PRESENT_SHADES = [
  { bg:'#86EFAC', border:'#4ADE80', text:'#14532D' }, // vert
  { bg:'#A7F3D0', border:'#34D399', text:'#064E3B' }, // émeraude
  { bg:'#BEF264', border:'#A3E635', text:'#3F6212' }, // vert tilleul
];

export const PEOPLE = [
  { id:'david',    name:'Dr. David Pelois',      short:'David',    color:'#2563EB', initial:'D', present:PRESENT_SHADES[0] },
  { id:'stephane', name:'Dr. Stéphane Maquinay', short:'Stéphane', color:'#7C3AED', initial:'S', present:PRESENT_SHADES[1] },
];

// Tableau muté en place par le module roster (ajout/retrait ASV depuis le tableau de bord).
// ASV_PEOPLE est intentionnellement muté in-place plutôt que réassigné : tout le reste de
// l'app garde la même référence et voit automatiquement les changements.
export const ASV_PEOPLE = [
  { id:'marie',   name:'Marie',   short:'Marie',   color:'#DB2777', initial:'M',  present:PRESENT_SHADES[0], timeFraction:1.0 },
  { id:'johanna', name:'Johanna', short:'Johanna', color:'#EA580C', initial:'Jo', present:PRESENT_SHADES[1], timeFraction:1.0 },
  { id:'julie',   name:'Julie',   short:'Julie',   color:'#059669', initial:'Ju', present:PRESENT_SHADES[2], timeFraction:0.75 },
  { id:'carla',   name:'Carla',   short:'Carla',   color:'#0EA5E9', initial:'Ca', present:PRESENT_SHADES[3], timeFraction:7.25/35, saturdayOnly:true },
];

// Fonction car ASV_PEOPLE peut être muté en place ; recalcule à chaque appel.
export function allPeople(){ return [...PEOPLE, ...ASV_PEOPLE]; }

// ----------------------------------------------------------------
// Congés Payés
// ----------------------------------------------------------------
export const CP_DAYS_PER_MONTH = 2.5;
export const CP_REFERENCE_START_MONTH = 0; // janvier = index 0

// ----------------------------------------------------------------
// Annonces
// ----------------------------------------------------------------
export const ANNONCE_CATEGORIES = {
  urgent:  { label:'Urgent',  color:'#DC2626', bg:'#FEF2F2', border:'#FECACA', icon:'🚨' },
  meeting: { label:'Réunion', color:'#7C3AED', bg:'#EDE9FE', border:'#DDD6FE', icon:'🗓️' },
  task:    { label:'Tâche',   color:'#D97706', bg:'#FEF3C7', border:'#FDE68A', icon:'✅' },
  info:    { label:'Info',    color:'#0369A1', bg:'#EFF6FF', border:'#BFDBFE', icon:'ℹ️' },
};

// ----------------------------------------------------------------
// Roster ASV dynamique
// ----------------------------------------------------------------
export const ASV_ROSTER_KEY = 'amivet_asv_roster';
export const ASV_DEFAULT_COLOR_PALETTE = ['#DB2777','#EA580C','#059669','#0EA5E9','#D946EF','#4F46E5','#0D9488','#DC2626'];

// ----------------------------------------------------------------
// Planning
// ----------------------------------------------------------------
export const SLOTS = ['M','AM'];
export const SLOT_LABELS = { M:'Matin', AM:'Après-midi' };
export const YEARS = [2026, 2027]; // années éditables

// ----------------------------------------------------------------
// Clés de stockage local
// ----------------------------------------------------------------
export const STORAGE_KEY = 'amivet_planning_data';
export const PERSON_COLORS_KEY = 'amivet_person_colors';
export const VIEW_STATE_KEY = 'amivet_view_state';
export const AUTH_SESSION_KEY = 'amivet_auth_session';

// ----------------------------------------------------------------
// Supabase — clé anon volontairement publique, protégée par RLS
// ----------------------------------------------------------------
export const SUPABASE_URL          = 'https://ubowqtowyqmpraoxbaoo.supabase.co/rest/v1/';
export const SUPABASE_AUTH_URL     = 'https://ubowqtowyqmpraoxbaoo.supabase.co/auth/v1/';
export const SUPABASE_FUNCTIONS_URL = 'https://ubowqtowyqmpraoxbaoo.supabase.co/functions/v1/';
export const CALENDAR_FEED_URL     = `${SUPABASE_FUNCTIONS_URL}calendar-feed`;
export const SUPABASE_ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVib3dxdG93eXFtcHJhb3hiYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MzkzNjksImV4cCI6MjA5ODIxNTM2OX0.cC7vTWrK-Ykii5dtlg_6lA5quHe6rv78IRxZT-ArV_8';

// ----------------------------------------------------------------
// Heures & plafonds légaux (modulation art. L3122-4 CT)
// ----------------------------------------------------------------
export const ANNUAL_FULLTIME_HOURS = 1607; // référence légale France (loi Aubry 2000)
export const HALFDAY_HOURS         = 3.5;  // 35h / 5j / 2 demi-journées
export const WEEKLY_MAX_HOURS      = 42;
export const ASV_STD_SAT_CARLA     = 7.25; // Carla : 8:30-16:45 avec 1h pause
export const ASV_STD_SAT_SECOND    = 7.0;  // 2e ASV samedi : 9:00-16:30
export const ASV_STD_WEEKDAY_AVG   = 8.375;
export const CLINIC_HOURS = { mStart:'08:30', mEnd:'13:00', amStart:'15:00', amEnd:'20:00' };
export const CLINIC_M_H  = 4.5;   // 8h30→13h00
export const CLINIC_AM_H = 4.25;  // 15h00→19h15
