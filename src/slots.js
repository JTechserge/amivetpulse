import { ASV_PEOPLE, ASV_STD_SAT_CARLA, SLOTS, personOf } from './config.js';
import { store } from './store.js';

/* ---------- Clés de stockage ---------- */
export function slotKey(isoDate, personId, slot) {
  return `${isoDate}_${personId}_${slot}`;
}
export function labelKey(isoDate, personId, slot) {
  return `${isoDate}_${personId}_${slot}_label`;
}
export function commentKey(isoDate) {
  return `${isoDate}_comment`;
}
export function decisionKey(isoDate, personId, slot) {
  return `${isoDate}_${personId}_${slot}_decision`;
}
export function decisionCommentKey(isoDate, personId, slot) {
  return `${isoDate}_${personId}_${slot}_decision_comment`;
}
export function changeKey(iso, pid, slot) {
  return `${iso}_${pid}_${slot}_chg`;
}
export function overtimeKey(isoDate, personId) {
  return `${isoDate}_${personId}_overtime`;
}

/* ---------- Helpers ---------- */
export function isASVPerson(personId) {
  return ASV_PEOPLE.some((p) => p.id === personId);
}

// Retourne true si la date ISO est dans les 14 prochains jours (aujourd'hui inclus)
export function isWithinNextTwoWeeks(iso) {
  const d = new Date(iso + 'T00:00:00');
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return d.getTime() >= t0 && d.getTime() <= t0 + 14 * 24 * 60 * 60 * 1000;
}

/* ---------- Demandes de congé ASV ---------- */
// Le statut de décision est rattaché à chaque demi-journée plutôt qu'à une entité
// "demande" séparée : réutilise la logique de fusion des absences contiguës (mêmes clés
// store.DATA.slots) sans avoir à synchroniser deux structures en parallèle.
export function getLeaveDecision(isoDate, personId, slot) {
  return store.DATA.slots[decisionKey(isoDate, personId, slot)] || null;
}
export function setLeaveDecision(isoDate, personId, slot, decision) {
  const key = decisionKey(isoDate, personId, slot);
  if (decision) store.DATA.slots[key] = decision;
  else delete store.DATA.slots[key];
}
export function getLeaveDecisionComment(isoDate, personId, slot) {
  return store.DATA.slots[decisionCommentKey(isoDate, personId, slot)] || '';
}
export function setLeaveDecisionComment(isoDate, personId, slot, text) {
  const key = decisionCommentKey(isoDate, personId, slot);
  if (text) store.DATA.slots[key] = text;
  else delete store.DATA.slots[key];
}

/* ---------- Modifications urgentes (14 j, ASV uniquement) ---------- */
export function getChangeDecision(iso, pid, slot) {
  return store.DATA.slots[changeKey(iso, pid, slot)] || null;
}
export function setChangeDecision(iso, pid, slot, dec) {
  const k = changeKey(iso, pid, slot);
  if (dec) store.DATA.slots[k] = dec;
  else delete store.DATA.slots[k];
}

/* ---------- Heures supplémentaires ASV ---------- */
export function getOvertimeHours(isoDate, personId) {
  return parseFloat(store.DATA.slots[overtimeKey(isoDate, personId)]) || 0;
}
export function setOvertimeHours(isoDate, personId, hours) {
  const key = overtimeKey(isoDate, personId);
  const n = parseFloat(hours);
  if (!isNaN(n) && n !== 0) store.DATA.slots[key] = n;
  else delete store.DATA.slots[key];
}

/* ---------- Lecture / écriture des créneaux ---------- */
export function getSlotState(isoDate, personId, slot) {
  return store.DATA.slots[slotKey(isoDate, personId, slot)] || 'empty';
}
export function setSlotState(isoDate, personId, slot, state) {
  const key = slotKey(isoDate, personId, slot);
  const wasAbsent = store.DATA.slots[key] === 'absent';
  if (state === 'empty') {
    delete store.DATA.slots[key];
    delete store.DATA.slots[labelKey(isoDate, personId, slot)];
    delete store.DATA.slots[`${isoDate}_${personId}_${slot}_shift`];
  } else {
    store.DATA.slots[key] = state;
    if (state !== 'absent') delete store.DATA.slots[labelKey(isoDate, personId, slot)];
  }
  if (isASVPerson(personId)) {
    if (state === 'absent' && !wasAbsent) {
      // Nouvelle absence : demande de congé créée en attente (sauf si une décision existait,
      // ex. ré-application du même état pendant un glisser-peindre).
      if (!getLeaveDecision(isoDate, personId, slot)) setLeaveDecision(isoDate, personId, slot, 'pending');
      // Des heures sup n'ont plus de sens un jour de congé : on les efface.
      setOvertimeHours(isoDate, personId, 0);
    } else if (state !== 'absent' && wasAbsent) {
      setLeaveDecision(isoDate, personId, slot, null);
      setLeaveDecisionComment(isoDate, personId, slot, '');
    }
  }
}

export function getSlotLabel(isoDate, personId, slot) {
  return store.DATA.slots[labelKey(isoDate, personId, slot)] || '';
}
export function setSlotLabel(isoDate, personId, slot, label) {
  const key = labelKey(isoDate, personId, slot);
  if (label) store.DATA.slots[key] = label;
  else delete store.DATA.slots[key];
}
export function getDayComment(isoDate) {
  return store.DATA.slots[commentKey(isoDate)] || '';
}
export function setDayComment(isoDate, text) {
  const key = commentKey(isoDate);
  if (text) store.DATA.slots[key] = text;
  else delete store.DATA.slots[key];
}

/* ---------- Cycle d'état (vide → présent → absent → vide) ---------- */
export function cycleState(state) {
  if (state === 'empty') return 'present';
  if (state === 'present') return 'absent';
  return 'empty';
}

/* ---------- Suivi des heures ASV (vue semaine + dashboard) ---------- */

// Poste du jour : ouverture 'O' ou fermeture 'F'
export function shiftTypeKey(iso, pid) {
  return `${iso}_${pid}_shift`;
}
export function getShiftType(iso, pid) {
  return store.DATA.slots[shiftTypeKey(iso, pid)] || 'O';
}

// Poste par demi-journée : 'O' (Ouverture), 'F' (Fermeture), 'D' (Demi-journée)
export function slotShiftTypeKey(iso, pid, slot) {
  return `${iso}_${pid}_${slot}_shift`;
}
export function getSlotShiftType(iso, pid, slot) {
  return store.DATA.slots[slotShiftTypeKey(iso, pid, slot)] || getShiftType(iso, pid);
}
export function setSlotShiftType(iso, pid, slot, type) {
  if (type) store.DATA.slots[slotShiftTypeKey(iso, pid, slot)] = type;
  else delete store.DATA.slots[slotShiftTypeKey(iso, pid, slot)];
}

export function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Heures par demi-journée selon type de poste (Lot 2)
const SLOT_NOMINAL_H = {
  O: { M: 4.5, AM: 4.0 },
  F: { M: 4.0, AM: 4.25 },
  D: { M: 4.0, AM: 4.0 },
};

// Heures nominales d'un créneau selon poste et jour de semaine
export function getSlotNominalH(iso, pid, slot) {
  const wd = new Date(iso + 'T00:00:00').getDay();
  if (wd === 6) return slot === 'M' ? (personOf(pid)?.saturdayOnly ? ASV_STD_SAT_CARLA : 7.0) : 0;
  return (SLOT_NOMINAL_H[getSlotShiftType(iso, pid, slot)] ?? SLOT_NOMINAL_H.O)[slot] ?? 4.0;
}

// Heures nominales du jour = somme des créneaux présents (Lot 2)
export function getDayNominal(iso, pid) {
  return SLOTS.reduce((sum, slot) => {
    if (getSlotState(iso, pid, slot) !== 'present') return sum;
    return sum + getSlotNominalH(iso, pid, slot);
  }, 0);
}

// Compteur heures supplémentaires (+15 min par incrément, Lot 3)
export function plusMinsKey(iso, pid) {
  return `${iso}_${pid}_plus_mins`;
}
export function getPlusMins(iso, pid) {
  return parseInt(store.DATA.slots[plusMinsKey(iso, pid)]) || 0;
}
export function setPlusMins(iso, pid, v) {
  const n = Math.max(0, v);
  if (n > 0) store.DATA.slots[plusMinsKey(iso, pid)] = n;
  else delete store.DATA.slots[plusMinsKey(iso, pid)];
}
export function getPlusH(iso, pid) {
  return getPlusMins(iso, pid) / 60;
}

// Compteur heures manquantes (−15 min par incrément, Lot 3)
export function minusMinsKey(iso, pid) {
  return `${iso}_${pid}_minus_mins`;
}
export function getMinusMins(iso, pid) {
  return parseInt(store.DATA.slots[minusMinsKey(iso, pid)]) || 0;
}
export function setMinusMins(iso, pid, v) {
  const n = Math.max(0, v);
  if (n > 0) store.DATA.slots[minusMinsKey(iso, pid)] = n;
  else delete store.DATA.slots[minusMinsKey(iso, pid)];
}
export function getMinusH(iso, pid) {
  return getMinusMins(iso, pid) / 60;
}

// Délégation pour compatibilité avec les appelants existants (dashboard, vue semaine)
export function getDayAllOtH(iso, pid) {
  return getPlusH(iso, pid);
}
export function getDayDeficitH(iso, pid) {
  return getMinusH(iso, pid);
}

// Note de jour (texte libre par ASV)
export function dayNoteKey(iso, pid) {
  return `${iso}_${pid}_day_note`;
}
export function getDayNote(iso, pid) {
  return store.DATA.slots[dayNoteKey(iso, pid)] || '';
}
export function setDayNote(iso, pid, v) {
  if (v) store.DATA.slots[dayNoteKey(iso, pid)] = v;
  else delete store.DATA.slots[dayNoteKey(iso, pid)];
}

/* ---------- Note de dépassement journalier (par personne) ---------- */
export function overtimeNoteKey(iso, pid) {
  return `${iso}_${pid}_ot_note`;
}
export function getOvertimeNote(iso, pid) {
  return store.DATA.slots[overtimeNoteKey(iso, pid)] || '';
}
export function setOvertimeNote(iso, pid, text) {
  if (text && text.trim()) store.DATA.slots[overtimeNoteKey(iso, pid)] = text.trim();
  else delete store.DATA.slots[overtimeNoteKey(iso, pid)];
}

/* ---------- Fermeture de la clinique ---------- */
export function clinicClosedKey(iso) {
  return `${iso}_clinic_closed`;
}
export function isClinicClosed(iso) {
  return !!store.DATA.slots[clinicClosedKey(iso)];
}
export function setClinicClosed(iso, closed) {
  if (closed) store.DATA.slots[clinicClosedKey(iso)] = true;
  else delete store.DATA.slots[clinicClosedKey(iso)];
}

// Fermeture anticipée : heure de fin réduite (ex. "17:00"), ≠ fermeture totale
export function clinicEarlyCloseKey(iso) {
  return `${iso}_clinic_early_close`;
}
export function getClinicEarlyClose(iso) {
  return store.DATA.slots[clinicEarlyCloseKey(iso)] || '';
}
export function setClinicEarlyClose(iso, time) {
  if (time && time.trim()) store.DATA.slots[clinicEarlyCloseKey(iso)] = time.trim();
  else delete store.DATA.slots[clinicEarlyCloseKey(iso)];
}

// Retourne true si la date est un jour de travail contractuel pour cette personne.
// saturdayOnly → seulement le samedi (Carla). workingDays → jours spécifiques (1=Lun…6=Sam).
// Sans contrainte définie, tous les jours ouvrés sont valides.
export function isPersonWorkingDay(personId, date) {
  const p = personOf(personId);
  if (!p) return true;
  const dow = date.getDay(); // 0=Dim, 1=Lun, ..., 6=Sam
  if (p.saturdayOnly) return dow === 6;
  if (p.workingDays && p.workingDays.length > 0) return p.workingDays.includes(dow);
  return true;
}

// ── Clôture de mois (Lot 6) ──────────────────────────────────────
// month : 0-indexé (0=Jan … 11=Déc), cohérent avec cfg.navState.month et Date.getMonth().
export function closedMonthKey(year, month) {
  return `closed_month_${year}_${month}`;
}
export function isMonthClosed(year, month) {
  return store.DATA.slots[closedMonthKey(year, month)] === 'true';
}
export function setMonthClosed(year, month, closed) {
  const key = closedMonthKey(year, month);
  if (closed) store.DATA.slots[key] = 'true';
  else delete store.DATA.slots[key];
}
