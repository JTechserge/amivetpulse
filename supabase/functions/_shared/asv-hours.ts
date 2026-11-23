// Calcul des heures ASV — fonctions pures (runtime Deno).
// Miroir de src/lib/asv-hours.js (même logique, même constantes).
// Tout changement dans l'un doit être répercuté dans l'autre.
// Source de vérité pour les récapitulatifs email de signature mensuelle.
//
// Divergence corrigée par rapport à l'implémentation initiale inline dans request-signature :
// - getDayNominalH retournait 7.0h pour tous les samedis.
// - Carla (saturdayOnly) a un contrat de 7 h 25 min le samedi (ASV_STD_SAT_CARLA côté front).

export type SlotsRecord = Record<string, string>;

// Doit rester synchronisé avec ASV_STD_SAT_CARLA dans src/config.js
// et avec SATURDAY_HOURS_BY_PID dans src/lib/asv-hours.js.
//
// ATTENTION — 7h25 s'écrit `7 + 25 / 60`, PAS `7.25`.
// La valeur contractuelle de Carla est 7 h 25 min (8:30–16:45 moins ~50 min de
// pause). `7.25` vaut 7 h 15 min, soit 10 minutes de moins par samedi : c'était
// l'écart entre le tableau de bord et cette feuille de présence signée.
const SATURDAY_HOURS_BY_PID: Record<string, number> = {
  carla: 7 + 25 / 60,
};

// Samedi des ASV autres que Carla — deux postes possibles, selon l'outil utilisé :
// - matin : Ouverture 8h30→13h00 = 4h30 ; tout autre poste (Demi-journée…) = 4h00 ;
// - après-midi : Fermeture = 2h45 (`2 + 45 / 60`) ; sinon Demi-journée = 2h30.
const SATURDAY_SLOT_H: Record<string, Record<string, number>> = {
  M: { O: 4.5, other: 4.0 },
  AM: { F: 2 + 45 / 60, other: 2.5 },
};

// Heures par demi-journée selon type de poste (Lot 2)
const SLOT_NOMINAL_H: Record<string, Record<string, number>> = {
  O: { M: 4.5, AM: 4.0 },
  F: { M: 4.0, AM: 4.25 },
  D: { M: 4.0, AM: 4.0 },
};
const SLOT_KEYS = ['M', 'AM'] as const;

export function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function getShiftType(slots: SlotsRecord, iso: string, pid: string): string {
  return slots[`${iso}_${pid}_shift`] || 'O';
}

export function getSlotShiftType(slots: SlotsRecord, iso: string, pid: string, slot: string): string {
  return slots[`${iso}_${pid}_${slot}_shift`] || getShiftType(slots, iso, pid);
}

/** Heures d'une demi-journée de samedi (hors Carla) selon le poste. */
export function getSaturdaySlotNominalH(shift: string, slot: string): number {
  const t = SATURDAY_SLOT_H[slot];
  if (!t) return 0;
  return t[shift] ?? t.other;
}

export function getSlotNominalH(slots: SlotsRecord, iso: string, pid: string, slot: string, wd: number): number {
  if (wd === 6) {
    // Carla : contrat de 7h25 porté par la demi-journée du matin, inchangé.
    if (pid in SATURDAY_HOURS_BY_PID) return slot === 'M' ? SATURDAY_HOURS_BY_PID[pid] : 0;
    return getSaturdaySlotNominalH(getSlotShiftType(slots, iso, pid, slot), slot);
  }
  return (SLOT_NOMINAL_H[getSlotShiftType(slots, iso, pid, slot)] ?? SLOT_NOMINAL_H.O)[slot] ?? 4.0;
}

/** Heures nominales du jour = somme des demi-journées présentes (Lot 2). */
export function getDayNominalH(slots: SlotsRecord, iso: string, pid: string, wd: number): number {
  return SLOT_KEYS.reduce((sum: number, slot: string) => {
    if (slots[`${iso}_${pid}_${slot}`] !== 'present') return sum;
    return sum + getSlotNominalH(slots, iso, pid, slot, wd);
  }, 0);
}

export function getDayAllOtH(slots: SlotsRecord, iso: string, pid: string): number {
  return (parseInt(slots[`${iso}_${pid}_plus_mins`]) || 0) / 60;
}

export function getDayDeficitH(slots: SlotsRecord, iso: string, pid: string): number {
  return (parseInt(slots[`${iso}_${pid}_minus_mins`]) || 0) / 60;
}

/** Rétrocompatibilité : ancienne clé _overtime (avant la refacto vue semaine ASV). */
export function getLegacyOtH(slots: SlotsRecord, iso: string, pid: string): number {
  return parseFloat(slots[`${iso}_${pid}_overtime`]) || 0;
}
