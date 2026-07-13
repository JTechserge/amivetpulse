import { ASV_PEOPLE } from './config.js';
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
