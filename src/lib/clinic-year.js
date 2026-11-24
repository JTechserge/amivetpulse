// Année de la clinique et verrous de fin d'année — module partagé.
//
// MIROIR : supabase/functions/_shared/clinic-year.ts porte la même logique pour
// save-planning. tests/unit/clinic-year.test.js fait tourner les mêmes cas contre
// les deux : toute divergence fait tomber la suite.
//
// Principe : la bascule d'année n'est pas une opération qui écrit des données.
// L'année courante, le gel du prévisionnel et le verrou des feuilles ASV de
// l'année écoulée se DÉDUISENT de la date du jour (heure de Paris) et de
// réglages facultatifs stockés dans planning_data. Rien n'est rejoué, rien ne
// peut être réécrasé : l'idempotence est acquise par construction.
//
// Réglages (clés de planning_data.slots, posées par un associé) :
//   rollover_date_<Y>   'YYYY-MM-DD' — date à laquelle Y devient l'année courante.
//                       Défaut Y-01-01. Bornée au 01/12/Y-1 … 31/01/Y.
//   asv_lock_date_<Y>   'YYYY-MM-DD' — date à laquelle les feuilles ASV de Y-1 se
//                       verrouillent d'elles-mêmes. Défaut Y-01-31 (délai de grâce
//                       pour saisir la fin décembre). Bornée au 01/01/Y … 31/03/Y.
//   closed_month_<Y>_<M0>  'true' = clôturé, 'false' = rouvert par un associé,
//                       absent = règle par défaut (verrouillé après la date de verrou).
//   forecast_closed_<Y> 'true' = figé, 'false' = rouvert par un associé,
//                       absent = figé dès que Y est l'année courante (ou passée).

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date du jour à Paris, 'YYYY-MM-DD', quel que soit le fuseau de la machine. */
export function parisTodayIso(now = new Date()) {
  // en-CA formate en AAAA-MM-JJ.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function validIsoBetween(value, min, max) {
  if (typeof value !== 'string') return null;
  const match = value.match(ISO_RE);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Rejette 2027-02-30 & co.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return value >= min && value <= max ? value : null;
}

/** Date à laquelle `year` devient l'année courante de la clinique. */
export function rolloverDate(slots, year) {
  const v = validIsoBetween(slots?.[`rollover_date_${year}`], `${year - 1}-12-01`, `${year}-01-31`);
  return v ?? `${year}-01-01`;
}

/** Année courante de la clinique au jour `todayIso`. */
export function clinicCurrentYear(todayIso, slots) {
  const y = Number(todayIso.slice(0, 4));
  if (todayIso >= rolloverDate(slots, y + 1)) return y + 1;
  if (todayIso < rolloverDate(slots, y)) return y - 1;
  return y;
}

/**
 * Date à laquelle les feuilles ASV de `year - 1` se verrouillent par défaut.
 * Jamais avant la bascule vers `year` : l'année en cours n'est jamais verrouillée.
 */
export function asvLockDate(slots, year) {
  const v = validIsoBetween(slots?.[`asv_lock_date_${year}`], `${year}-01-01`, `${year}-03-31`);
  const lock = v ?? `${year}-01-31`;
  const roll = rolloverDate(slots, year);
  return lock > roll ? lock : roll;
}

/** Feuilles ASV du mois (`year`, `month0` de 0 à 11) verrouillées au jour `todayIso` ? */
export function isAsvMonthLocked(slots, todayIso, year, month0) {
  const flag = slots?.[`closed_month_${year}_${month0}`];
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return todayIso >= asvLockDate(slots, year + 1);
}

/** Prévisionnel ASV de `year` figé au jour `todayIso` ? */
export function isForecastYearLocked(slots, todayIso, year) {
  const flag = slots?.[`forecast_closed_${year}`];
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return clinicCurrentYear(todayIso, slots) >= year;
}

/** Année d'une semaine de prévisionnel (clé au lundi) : celle de son jeudi, comme buildYearWeeks. */
export function forecastWeekYear(mondayIso) {
  const [y, m, d] = mondayIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 3)).getUTCFullYear();
}
