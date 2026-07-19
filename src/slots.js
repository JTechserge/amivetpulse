import { ASV_PEOPLE, ASV_STD_SAT_CARLA, personOf } from './config.js';
import { store } from './store.js';

/* ---------- Clés de stockage ---------- */
export function slotKey(isoDate, personId, slot){ return `${isoDate}_${personId}_${slot}`; }
export function labelKey(isoDate, personId, slot){ return `${isoDate}_${personId}_${slot}_label`; }
export function commentKey(isoDate){ return `${isoDate}_comment`; }
export function decisionKey(isoDate, personId, slot){ return `${isoDate}_${personId}_${slot}_decision`; }
export function decisionCommentKey(isoDate, personId, slot){ return `${isoDate}_${personId}_${slot}_decision_comment`; }
export function changeKey(iso, pid, slot){ return `${iso}_${pid}_${slot}_chg`; }
export function overtimeKey(isoDate, personId){ return `${isoDate}_${personId}_overtime`; }

/* ---------- Helpers ---------- */
export function isASVPerson(personId){ return ASV_PEOPLE.some(p => p.id === personId); }

// Retourne true si la date ISO est dans les 14 prochains jours (aujourd'hui inclus)
export function isWithinNextTwoWeeks(iso){
  const d = new Date(iso + 'T00:00:00');
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return d.getTime() >= t0 && d.getTime() <= t0 + 14 * 24 * 60 * 60 * 1000;
}

/* ---------- Demandes de congé ASV ---------- */
// Le statut de décision est rattaché à chaque demi-journée plutôt qu'à une entité
// "demande" séparée : réutilise la logique de fusion des absences contiguës (mêmes clés
// store.DATA.slots) sans avoir à synchroniser deux structures en parallèle.
export function getLeaveDecision(isoDate, personId, slot){ return store.DATA.slots[decisionKey(isoDate,personId,slot)] || null; }
export function setLeaveDecision(isoDate, personId, slot, decision){
  const key = decisionKey(isoDate,personId,slot);
  if(decision) store.DATA.slots[key] = decision; else delete store.DATA.slots[key];
}
export function getLeaveDecisionComment(isoDate, personId, slot){ return store.DATA.slots[decisionCommentKey(isoDate,personId,slot)] || ''; }
export function setLeaveDecisionComment(isoDate, personId, slot, text){
  const key = decisionCommentKey(isoDate,personId,slot);
  if(text) store.DATA.slots[key] = text; else delete store.DATA.slots[key];
}

/* ---------- Modifications urgentes (14 j, ASV uniquement) ---------- */
export function getChangeDecision(iso, pid, slot){ return store.DATA.slots[changeKey(iso,pid,slot)] || null; }
export function setChangeDecision(iso, pid, slot, dec){
  const k = changeKey(iso,pid,slot);
  if(dec) store.DATA.slots[k] = dec; else delete store.DATA.slots[k];
}

/* ---------- Heures supplémentaires ASV ---------- */
export function getOvertimeHours(isoDate, personId){ return parseFloat(store.DATA.slots[overtimeKey(isoDate,personId)]) || 0; }
export function setOvertimeHours(isoDate, personId, hours){
  const key = overtimeKey(isoDate, personId);
  const n = parseFloat(hours);
  if(!isNaN(n) && n !== 0) store.DATA.slots[key] = n; else delete store.DATA.slots[key];
}

/* ---------- Lecture / écriture des créneaux ---------- */
export function getSlotState(isoDate, personId, slot){ return store.DATA.slots[slotKey(isoDate,personId,slot)] || 'empty'; }
export function setSlotState(isoDate, personId, slot, state){
  const key = slotKey(isoDate,personId,slot);
  const wasAbsent = store.DATA.slots[key] === 'absent';
  if(state === 'empty'){
    delete store.DATA.slots[key];
    delete store.DATA.slots[labelKey(isoDate,personId,slot)];
  } else {
    store.DATA.slots[key] = state;
    if(state !== 'absent') delete store.DATA.slots[labelKey(isoDate,personId,slot)];
  }
  if(isASVPerson(personId)){
    if(state === 'absent' && !wasAbsent){
      // Nouvelle absence : demande de congé créée en attente (sauf si une décision existait,
      // ex. ré-application du même état pendant un glisser-peindre).
      if(!getLeaveDecision(isoDate, personId, slot)) setLeaveDecision(isoDate, personId, slot, 'pending');
      // Des heures sup n'ont plus de sens un jour de congé : on les efface.
      setOvertimeHours(isoDate, personId, 0);
    } else if(state !== 'absent' && wasAbsent){
      setLeaveDecision(isoDate, personId, slot, null);
      setLeaveDecisionComment(isoDate, personId, slot, '');
    }
  }
}

export function getSlotLabel(isoDate, personId, slot){ return store.DATA.slots[labelKey(isoDate,personId,slot)] || ''; }
export function setSlotLabel(isoDate, personId, slot, label){
  const key = labelKey(isoDate,personId,slot);
  if(label) store.DATA.slots[key] = label; else delete store.DATA.slots[key];
}
export function getDayComment(isoDate){ return store.DATA.slots[commentKey(isoDate)] || ''; }
export function setDayComment(isoDate, text){
  const key = commentKey(isoDate);
  if(text) store.DATA.slots[key] = text; else delete store.DATA.slots[key];
}

/* ---------- Cycle d'état (vide → présent → absent → vide) ---------- */
export function cycleState(state){
  if(state === 'empty') return 'present';
  if(state === 'present') return 'absent';
  return 'empty';
}

/* ---------- Suivi des heures ASV (vue semaine + dashboard) ---------- */

// Poste du jour : ouverture 'O' ou fermeture 'F'
export function shiftTypeKey(iso, pid){ return `${iso}_${pid}_shift`; }
export function getShiftType(iso, pid){ return store.DATA.slots[shiftTypeKey(iso, pid)] || 'O'; }

export function timeToMins(t){ if(!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }

// Heures nominales par jour selon poste et jour de semaine
export function getDayNominal(iso, pid){
  const d = new Date(iso + 'T00:00:00');
  if(d.getDay() === 6){ const p = personOf(pid); return p?.saturdayOnly ? ASV_STD_SAT_CARLA : 7.0; }
  return getShiftType(iso, pid) === 'F' ? 8.25 : 8.5;
}

// Départ anticipé (vue semaine)
export function earlyDepKey(iso, pid){ return `${iso}_${pid}_early_dep`; }
export function getEarlyDep(iso, pid){ return store.DATA.slots[earlyDepKey(iso, pid)] || ''; }
export function setEarlyDep(iso, pid, v){ if(v) store.DATA.slots[earlyDepKey(iso, pid)] = v; else delete store.DATA.slots[earlyDepKey(iso, pid)]; }

// Heures déficitaires (départ avant fin standard du poste)
export function getDayDeficitH(iso, pid){
  const early = getEarlyDep(iso, pid);
  if(!early) return 0;
  const stdEndMins = getShiftType(iso, pid) === 'F' ? 19 * 60 + 15 : 19 * 60;
  return Math.max(0, (stdEndMins - timeToMins(early)) / 60);
}

// Heures supplémentaires semaine (zone drag, stockées en minutes entières)
export function weekOtKey(iso, pid){ return `${iso}_${pid}_ot_mins`; }
export function getWeekOtMins(iso, pid){ return parseInt(store.DATA.slots[weekOtKey(iso, pid)], 10) || 0; }
export function setWeekOtMins(iso, pid, v){ if(v > 0) store.DATA.slots[weekOtKey(iso, pid)] = v; else delete store.DATA.slots[weekOtKey(iso, pid)]; }
export function getDayOtH(iso, pid){ return getWeekOtMins(iso, pid) / 60; }

// Heures supplémentaires pause repas
export function lunchOtKey(iso, pid){ return `${iso}_${pid}_lunch_ot_mins`; }
export function getLunchOtMins(iso, pid){ return parseInt(store.DATA.slots[lunchOtKey(iso, pid)], 10) || 0; }
export function setLunchOtMins(iso, pid, v){ if(v > 0) store.DATA.slots[lunchOtKey(iso, pid)] = v; else delete store.DATA.slots[lunchOtKey(iso, pid)]; }
export function getDayLunchOtH(iso, pid){ return getLunchOtMins(iso, pid) / 60; }
export function getDayAllOtH(iso, pid){ return getDayOtH(iso, pid) + getDayLunchOtH(iso, pid); }

// Note de jour (texte libre par ASV)
export function dayNoteKey(iso, pid){ return `${iso}_${pid}_day_note`; }
export function getDayNote(iso, pid){ return store.DATA.slots[dayNoteKey(iso, pid)] || ''; }
export function setDayNote(iso, pid, v){ if(v) store.DATA.slots[dayNoteKey(iso, pid)] = v; else delete store.DATA.slots[dayNoteKey(iso, pid)]; }

/* ---------- Fermeture de la clinique ---------- */
export function clinicClosedKey(iso){ return `${iso}_clinic_closed`; }
export function isClinicClosed(iso){ return !!store.DATA.slots[clinicClosedKey(iso)]; }
export function setClinicClosed(iso, closed){
  if(closed) store.DATA.slots[clinicClosedKey(iso)] = true;
  else delete store.DATA.slots[clinicClosedKey(iso)];
}

// Retourne true si la date est un jour de travail contractuel pour cette personne.
// saturdayOnly → seulement le samedi (Carla). workingDays → jours spécifiques (1=Lun…6=Sam).
// Sans contrainte définie, tous les jours ouvrés sont valides.
export function isPersonWorkingDay(personId, date){
  const p = personOf(personId);
  if(!p) return true;
  const dow = date.getDay(); // 0=Dim, 1=Lun, ..., 6=Sam
  if(p.saturdayOnly) return dow === 6;
  if(p.workingDays && p.workingDays.length > 0) return p.workingDays.includes(dow);
  return true;
}
