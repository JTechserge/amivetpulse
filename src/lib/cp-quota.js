/* Quota annuel de congés payés des ASV.
   Règle (Jérémie, 23/11/2026) : chaque ASV a droit à 5 semaines = 25 jours de CP
   par année civile, quel que soit son temps de travail. Le report N-1 et les
   ajustements manuels (table cp_adjustments) s'ajoutent à ce quota.
   Un vétérinaire ne peut pas valider des CP au-delà. */

import { isReposLabel, isSickOrAccidentLabel } from './leave-utils.js';

export const ASV_CP_DAYS_PER_YEAR = 25;

// Le motif d'une demande de congé est un texte libre (« Vacances », « SKI TIGNES »…).
// Toute absence posée avec l'outil Congé compte comme congé payé, sauf repos,
// maladie / accident (aucune validation) et les motifs qui ne sont pas des CP.
const NON_CP_RE = /^(formation|congr[eè]s|rtt|rendez-vous m[eé]dical|r[eé]cup[eé]ration)\b/i;

/** Motif d'absence décompté comme congé payé. */
export function isCPLabel(label) {
  const lc = (label || '').trim();
  if (isReposLabel(lc) || isSickOrAccidentLabel(lc)) return false;
  return !NON_CP_RE.test(lc);
}

/**
 * Jours de CP d'une personne sur une année civile, d'après les demi-journées
 * absentes à motif CP/Congé.
 * @param {Record<string,string>} slots  store.DATA.slots
 * @param {string} pid
 * @param {number} year
 * @param {'approved'|'pending'|'any'} status  'approved' = validés par un vétérinaire
 * @returns {number} jours (une demi-journée = 0,5)
 */
export function countCPDays(slots, pid, year, status = 'approved') {
  let halfDays = 0;
  const prefix = `${year}-`;
  for (const key of Object.keys(slots)) {
    const m = key.match(/^(\d{4}-\d{2}-\d{2})_(.+)_(M|AM)$/);
    if (!m || m[2] !== pid || !m[1].startsWith(prefix)) continue;
    if (slots[key] !== 'absent') continue;
    if (!isCPLabel(slots[`${key}_label`])) continue;
    const decision = slots[`${key}_decision`] || 'pending';
    if (status !== 'any' && decision !== status) continue;
    halfDays++;
  }
  return halfDays / 2;
}

/**
 * Jours d'une demande (liste de demi-journées) répartis par année civile.
 * @param {{iso:string}[]} groupSlots
 * @returns {Record<number, number>}
 */
export function requestDaysByYear(groupSlots) {
  const out = {};
  for (const { iso } of groupSlots) {
    const y = Number(iso.slice(0, 4));
    out[y] = (out[y] || 0) + 0.5;
  }
  return out;
}

/**
 * Contrôle d'une demande de CP au regard du quota annuel.
 * @param {{approvedDays:number, requestedDays:number, carriedOver?:number, extra?:number}} p
 * @returns {{limit:number, after:number, over:number}}  over > 0 → dépassement
 */
export function checkCPQuota({
  approvedDays,
  requestedDays,
  carriedOver = 0,
  extra = 0,
  entitlement = ASV_CP_DAYS_PER_YEAR,
}) {
  const limit = entitlement + (carriedOver || 0) + (extra || 0);
  const after = approvedDays + requestedDays;
  return { limit, after, over: Math.max(0, Math.round((after - limit) * 100) / 100) };
}

// ── Nouvelles arrivées (à partir de 2027) ──
// Une ASV arrivée en cours d'année à partir de 2027 acquiert ses CP au prorata des
// jours écoulés depuis son arrivée (25 j pour une année complète). Les années
// suivantes, et pour l'effectif présent avant 2027, les 25 j sont dus dès janvier.
export const CP_PRORATA_FROM_YEAR = 2027;

const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const daysInYear = (y) => dayNum(`${y}-12-31`) - dayNum(`${y}-01-01`) + 1;
const round2 = (n) => Math.round(n * 100) / 100;

function isProrataYear(year, arrivalISO) {
  return !!arrivalISO && +arrivalISO.slice(0, 4) >= CP_PRORATA_FROM_YEAR && +arrivalISO.slice(0, 4) === year;
}

/**
 * Droit annuel total de CP d'une ASV pour une année (quota de validation).
 * @param {number} year
 * @param {string|null} arrivalISO  date d'arrivée YYYY-MM-DD, ou null (effectif historique)
 */
export function asvCPEntitlement(year, arrivalISO) {
  if (arrivalISO && +arrivalISO.slice(0, 4) > year) return 0;
  if (!isProrataYear(year, arrivalISO)) return ASV_CP_DAYS_PER_YEAR;
  return round2((ASV_CP_DAYS_PER_YEAR * (dayNum(`${year}-12-31`) - dayNum(arrivalISO) + 1)) / daysInYear(year));
}

/**
 * CP acquis à une date donnée (colonne « Acquis » du tableau de bord).
 * @param {number} year
 * @param {string|null} arrivalISO
 * @param {string} todayISO
 */
export function asvCPAcquired(year, arrivalISO, todayISO) {
  if (todayISO < `${year}-01-01`) return 0;
  if (!isProrataYear(year, arrivalISO)) return asvCPEntitlement(year, arrivalISO);
  if (todayISO < arrivalISO) return 0;
  const end = todayISO < `${year}-12-31` ? todayISO : `${year}-12-31`;
  return round2((ASV_CP_DAYS_PER_YEAR * (dayNum(end) - dayNum(arrivalISO) + 1)) / daysInYear(year));
}
