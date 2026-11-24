// Réglages de bascule d'année saisis par un associé (écran Réglages → Bascule d'année).
//
// Les bornes et la règle par défaut ne sont PAS redéfinies ici : elles viennent de
// lib/clinic-year.js (contrat avec save-planning). Une valeur est dans les bornes
// si et seulement si clinic-year la retient telle quelle. Ce module n'ajoute que
// les règles de saisie : pas de date passée, pas de réglage déjà atteint (que
// save-planning refuserait de toute façon pour la bascule).

import { asvLockDate, clinicCurrentYear, rolloverDate } from './clinic-year.js';

const frDate = (iso) => iso.split('-').reverse().join('/');

/**
 * Années des deux réglages que l'écran propose au jour `todayIso` :
 * la prochaine bascule, et le prochain verrou des feuilles ASV qui n'est pas
 * encore atteint (en janvier, celui de l'année qui vient de commencer).
 */
export function yearSettingsTargets(todayIso, slots) {
  const cy = clinicCurrentYear(todayIso, slots);
  return {
    rolloverYear: cy + 1,
    lockYear: todayIso < asvLockDate(slots, cy) ? cy : cy + 1,
  };
}

/** '' si `value` est acceptable pour rollover_date_<year>, sinon le motif du refus. */
export function rolloverDateRejectReason(value, year, todayIso, slots) {
  if (todayIso >= rolloverDate(slots, year))
    return `La bascule vers ${year} est déjà atteinte : elle n'est plus modifiable.`;
  if (value === '') return '';
  if (rolloverDate({ [`rollover_date_${year}`]: value }, year) !== value) {
    return `La date de bascule doit être comprise entre le ${frDate(`${year - 1}-12-01`)} et le ${frDate(`${year}-01-31`)}.`;
  }
  if (value < todayIso) return 'La date de bascule ne peut pas être dans le passé.';
  return '';
}

/**
 * '' si `value` est acceptable pour asv_lock_date_<year>, sinon le motif du refus.
 * `slots` doit porter la date de bascule retenue (celle en cours de saisie).
 */
export function asvLockDateRejectReason(value, year, todayIso, slots) {
  if (todayIso >= asvLockDate(slots, year)) return `Les feuilles ASV de ${year - 1} sont déjà verrouillées.`;
  if (value === '') return '';
  if (asvLockDate({ [`asv_lock_date_${year}`]: value }, year) !== value) {
    return `La date de verrou doit être comprise entre le ${frDate(`${year}-01-01`)} et le ${frDate(`${year}-03-31`)}.`;
  }
  if (value < rolloverDate(slots, year)) return 'La date de verrou ne peut pas précéder la bascule.';
  if (value < todayIso) return 'La date de verrou ne peut pas être dans le passé.';
  return '';
}

/**
 * Écrit les réglages dans `slots` (muté). '' ou valeur par défaut = clé retirée ;
 * null = réglage non touché (champ non modifiable).
 */
export function applyYearSettings(slots, { rolloverYear, rollover, lockYear, lock }) {
  const put = (key, value, def) => {
    if (value === null || value === undefined) return;
    if (value === '' || value === def) delete slots[key];
    else slots[key] = value;
  };
  put(`rollover_date_${rolloverYear}`, rollover, `${rolloverYear}-01-01`);
  put(`asv_lock_date_${lockYear}`, lock, `${lockYear}-01-31`);
  return slots;
}
