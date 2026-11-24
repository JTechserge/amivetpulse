// Année de la clinique et verrous de fin d'année — module partagé.
//
// MIROIR : supabase/functions/_shared/clinic-year.ts porte la même logique pour
// save-planning. tests/unit/clinic-year.test.js fait tourner les mêmes cas contre
// les deux : toute divergence fait tomber la suite.
//
// Principe : la bascule d'année n'est pas une opération qui écrit des données.
// L'année courante, le gel du prévisionnel et le verrou des feuilles ASV de
// l'année écoulée se DÉDUISENT de la date du jour (heure de Paris). Rien n'est
// rejoué, rien ne peut être réécrasé : l'idempotence est acquise par construction.
//
// Règles fixes (décision de Jérémie, 24/11/2026) :
//   bascule vers Y  le lundi qui ouvre la semaine du 1er janvier si celui-ci tombe
//                   du lundi au samedi (ex. 1er janvier 2027 un vendredi → lundi
//                   28/12/2026 : les ASV complètent la semaine à cheval dans la
//                   nouvelle année) ; s'il tombe un dimanche, le lundi 2 janvier.
//   verrou ASV      les feuilles de Y-1 se verrouillent le 15/01/Y.
// Réglages tri-état restant dans planning_data.slots (posés par un associé) :
//   closed_month_<Y>_<M0>  'true' = clôturé, 'false' = rouvert par un associé,
//                       absent = règle par défaut (verrouillé après le 15/01/Y+1).
//   forecast_closed_<Y> 'true' = figé, 'false' = rouvert par un associé,
//                       absent = figé dès que Y est l'année courante (ou passée).
// Les anciens réglages rollover_date_<Y> / asv_lock_date_<Y> ne sont plus lus.

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

/** Date à laquelle `year` devient l'année courante (règle fixe, voir en-tête). */
export function rolloverDate(_slots, year) {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dow = jan1.getUTCDay(); // 0 = dimanche … 6 = samedi
  // Dimanche → lundi 2 janvier ; lundi → le 1er lui-même ; mardi … samedi →
  // lundi précédent (décembre).
  const shift = dow === 0 ? 1 : 1 - dow;
  jan1.setUTCDate(jan1.getUTCDate() + shift);
  return jan1.toISOString().slice(0, 10);
}

/** Année courante de la clinique au jour `todayIso`. */
export function clinicCurrentYear(todayIso, slots) {
  const y = Number(todayIso.slice(0, 4));
  if (todayIso >= rolloverDate(slots, y + 1)) return y + 1;
  if (todayIso < rolloverDate(slots, y)) return y - 1;
  return y;
}

/** Date à laquelle les feuilles ASV de `year - 1` se verrouillent : le 15/01/`year`. */
export function asvLockDate(_slots, year) {
  return `${year}-01-15`;
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
