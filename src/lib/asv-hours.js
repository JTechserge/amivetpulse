// Calcul des heures ASV — fonctions pures (runtime navigateur / Vitest).
// Miroir JS de supabase/functions/_shared/asv-hours.ts (même logique, même constantes).
// Tout changement dans l'un doit être répercuté dans l'autre.

// Doit rester synchronisé avec ASV_STD_SAT_CARLA dans src/config.js
// et avec SATURDAY_HOURS_BY_PID dans supabase/functions/_shared/asv-hours.ts.
const SATURDAY_HOURS_BY_PID = { carla: 7.25 };

// Heures par demi-journée selon type de poste (Lot 2)
const SLOT_NOMINAL_H = {
  O: { M: 4.5, AM: 4.0 },
  F: { M: 4.0, AM: 4.25 },
  D: { M: 4.0, AM: 4.0 },
};
const SLOT_KEYS = ['M', 'AM'];

export function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function getShiftType(slots, iso, pid) {
  return slots[`${iso}_${pid}_shift`] || 'O';
}

export function getSlotShiftType(slots, iso, pid, slot) {
  return slots[`${iso}_${pid}_${slot}_shift`] || getShiftType(slots, iso, pid);
}

export function getSlotNominalH(slots, iso, pid, slot, wd) {
  if (wd === 6) return slot === 'M' ? (SATURDAY_HOURS_BY_PID[pid] ?? 7.0) : 0;
  return (SLOT_NOMINAL_H[getSlotShiftType(slots, iso, pid, slot)] ?? SLOT_NOMINAL_H.O)[slot] ?? 4.0;
}

/** Heures nominales du jour = somme des demi-journées présentes (Lot 2). */
export function getDayNominalH(slots, iso, pid, wd) {
  return SLOT_KEYS.reduce((sum, slot) => {
    if (slots[`${iso}_${pid}_${slot}`] !== 'present') return sum;
    return sum + getSlotNominalH(slots, iso, pid, slot, wd);
  }, 0);
}

export function getDayAllOtH(slots, iso, pid) {
  return (parseInt(slots[`${iso}_${pid}_plus_mins`]) || 0) / 60;
}

export function getDayDeficitH(slots, iso, pid) {
  return (parseInt(slots[`${iso}_${pid}_minus_mins`]) || 0) / 60;
}

/** Rétrocompatibilité : ancienne clé _overtime (avant la refacto vue semaine ASV). */
export function getLegacyOtH(slots, iso, pid) {
  return parseFloat(slots[`${iso}_${pid}_overtime`]) || 0;
}
