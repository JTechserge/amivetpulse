/* ================================================================
   AMIVET PLANNING — Utilitaires purs
   Importé par app.js et testable par Vitest sans mock.
   ================================================================ */
import { WEEKDAY_FULL, MONTH_NAMES } from './config.js';

// ----------------------------------------------------------------
// Chaînes
// ----------------------------------------------------------------
export function escapeHTML(str){
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Transforme un nom en identifiant slug ASCII (sans accents, sans espaces)
export function slugifyName(name){
  const lower = name.toLowerCase().normalize('NFD');
  let stripped = '';
  for(const ch of lower){
    const code = ch.codePointAt(0);
    if(code >= 0x0300 && code <= 0x036f) continue;
    stripped += ch;
  }
  return stripped.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'asv';
}

// ----------------------------------------------------------------
// Couleurs
// ----------------------------------------------------------------
export function hexToHsl(hex){
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (max+min)/2;
  const d = max-min;
  if(d !== 0){
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h = ((g-b)/d) % 6; break;
      case g: h = (b-r)/d + 2; break;
      default: h = (r-g)/d + 4;
    }
    h *= 60;
    if(h < 0) h += 360;
  }
  return { h, s: s*100, l: l*100 };
}

export function hexToRgba(hex, alpha){
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Renvoie une raison de refus si la couleur empiète sur les codes de statut réservés,
// ou null si la couleur est acceptée.
export function colorRejectReason(hex){
  if(!/^#[0-9a-fA-F]{6}$/.test(hex)) return 'couleur invalide.';
  const { h, s, l } = hexToHsl(hex);
  if(l > 92) return 'trop proche du blanc (réservé aux demi-journées vides).';
  if(s > 25 && (h <= 15 || h >= 345)) return 'trop proche du rouge (réservé aux congés validés).';
  if(s > 25 && (h >= 75 && h <= 160)) return 'trop proche du vert (réservé aux jours travaillés).';
  if(s > 25 && (h >= 200 && h <= 250)) return 'trop proche du bleu foncé (réservé aux congés en attente).';
  if(s > 25 && (h >= 40 && h <= 65)) return 'trop proche du jaune (réservé aux jours fériés).';
  return null;
}

// ----------------------------------------------------------------
// Dates
// ----------------------------------------------------------------

// Formate un objet Date en YYYY-MM-DD en heure locale (évite les décalages UTC de toISOString())
export function fmtISO(d){
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

export function daysInMonth(year, month){ return new Date(year, month+1, 0).getDate(); }

// Renvoie 0=lundi … 6=dimanche (convention ISO)
export function isoWeekday(date){ return (date.getDay() + 6) % 7; }
export function isSunday(date){ return isoWeekday(date) === 6; }
export function isSaturday(date){ return isoWeekday(date) === 5; }

// ----------------------------------------------------------------
// Jours fériés français (algorithme Meeus/Jones/Butcher)
// ----------------------------------------------------------------
export function getFrenchHolidays(year){
  const a = year % 19, b = Math.floor(year/100), c = year % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4;
  const l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  const month = Math.floor((h+l-7*m+114)/31);
  const day = ((h+l-7*m+114) % 31) + 1;
  const easter = new Date(year, month-1, day);

  const dates = [
    new Date(year, 0, 1),
    new Date(easter.getTime() + 1*86400000),
    new Date(year, 4, 1),
    new Date(year, 4, 8),
    new Date(easter.getTime() + 39*86400000),
    new Date(easter.getTime() + 50*86400000),
    new Date(year, 6, 14),
    new Date(year, 7, 15),
    new Date(year, 10, 1),
    new Date(year, 10, 11),
    new Date(year, 11, 25),
  ];
  const names = ["Jour de l'An","Lundi de Pâques","Fête du Travail","Victoire 1945","Ascension","Lundi de Pentecôte","Fête Nationale","Assomption","Toussaint","Armistice","Noël"];
  const map = {};
  dates.forEach((dt,idx)=>{ map[fmtISO(dt)] = names[idx]; });
  return map;
}

const HOLIDAYS_CACHE = {};
export function holidaysFor(year){
  if(!HOLIDAYS_CACHE[year]) HOLIDAYS_CACHE[year] = getFrenchHolidays(year);
  return HOLIDAYS_CACHE[year];
}
export function holidayName(isoDate){
  const year = parseInt(isoDate.slice(0,4),10);
  return holidaysFor(year)[isoDate] || null;
}

// ----------------------------------------------------------------
// Heures
// ----------------------------------------------------------------
export function formatHHMM(h){
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${hh}h${String(mm).padStart(2,'0')}`;
}

export function signedHHMM(h){
  if(h === 0) return '0h00';
  return `${h > 0 ? '+' : '-'}${formatHHMM(h)}`;
}

export function roundTo15min(h){ return Math.round(h * 4) / 4; }
export function formatNum(n){ return Number.isInteger(n) ? String(n) : n.toFixed(1); }

export function formatFR(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const date = new Date(y, m-1, d);
  return `${WEEKDAY_FULL[isoWeekday(date)]} ${d} ${MONTH_NAMES[m-1].toLowerCase()} ${y}`;
}
export function getWeekMondayDate(date){
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
