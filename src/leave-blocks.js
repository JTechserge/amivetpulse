import { SLOTS } from './config.js';
import { isASVPerson, getSlotState, getSlotLabel, getLeaveDecision } from './slots.js';
import { fmtISO, daysInMonth, isoWeekday, isSunday } from './utils.js';

// Clé de groupage : deux demi-journées de même typeKey peuvent appartenir au même bloc.
function halfTypeKey(iso, pid, slot) {
  const lbl = getSlotLabel(iso, pid, slot);
  const lc = lbl.toLowerCase().trim();
  if (lc === 'repos' || lc === 'repos planifié' || lc === 'non travaillé') return 'repos';
  if (lc === 'maladie' || lc === 'arrêt maladie' || lc === 'arrêt') return 'sick';
  const dec = isASVPerson(pid) ? (getLeaveDecision(iso, pid, slot) || 'pending') : 'conge';
  return dec + (lbl ? ':' + lc : '');
}

// Type visuel utilisé pour choisir la classe CSS de l'étiquette centrée.
function halfVisualType(iso, pid, slot) {
  const lbl = getSlotLabel(iso, pid, slot);
  const lc = lbl.toLowerCase().trim();
  if (lc === 'repos' || lc === 'repos planifié' || lc === 'non travaillé') return 'repos';
  if (lc === 'maladie' || lc === 'arrêt maladie' || lc === 'arrêt') return 'sick';
  if (!isASVPerson(pid)) return 'conge';
  return getLeaveDecision(iso, pid, slot) || 'pending';
}

// Vrai si les deux demi-journées sont directement adjacentes dans la séquence chronologique
// (SLOTS[last]→SLOTS[0] lendemain en sautant le dimanche, ou SLOTS[n]→SLOTS[n+1] même jour).
function isAdjacentHalf(iso1, s1, iso2, s2) {
  const i1 = SLOTS.indexOf(s1), i2 = SLOTS.indexOf(s2);
  if (iso1 === iso2) return i2 === i1 + 1;
  if (i1 !== SLOTS.length - 1 || i2 !== 0) return false;
  let d = new Date(iso1 + 'T00:00:00');
  d = new Date(d.getTime() + 86400000);
  while (isSunday(d)) d = new Date(d.getTime() + 86400000);
  return fmtISO(d) === iso2;
}

function crossesWeekBoundary(iso1, iso2) {
  return isoWeekday(new Date(iso2 + 'T00:00:00')) <= isoWeekday(new Date(iso1 + 'T00:00:00'));
}

/**
 * Calcule les blocs de congé fusionnés pour une personne sur un mois donné.
 *
 * Retourne Map<iso, { segmentStart, spanDays, label, visualType }> :
 *   segmentStart=true  → débuter une cellule fusionnée grid-column:span N ici
 *   segmentStart=false → jour absorbé dans le span précédent (sauter la cellule)
 *   absent de la Map   → rendre normalement
 *
 * Règles :
 *   – contiguïté slot-à-slot (M→AM même jour, AM→M lendemain sans dimanche)
 *   – rupture de bloc sur changement de type ou trou de présence
 *   – demi-journée isolée (bloc.halves.length < 2) → pas de fusion
 *   – segment d'un seul jour → pas de fusion (spanDays serait 1, visuellement inutile)
 *   – découpage par frontière de semaine calendaire
 */
export function computeLeaveBlocks(pid, year, month) {
  const nb = daysInMonth(year, month);
  const result = new Map();

  // Séquence ordonnée de toutes les demi-journées absentes du mois
  const absent = [];
  for (let d = 1; d <= nb; d++) {
    const date = new Date(year, month, d);
    if (isSunday(date)) continue;
    const iso = fmtISO(date);
    for (const slot of SLOTS) {
      if (getSlotState(iso, pid, slot) === 'absent') {
        absent.push({ iso, slot, typeKey: halfTypeKey(iso, pid, slot), lbl: getSlotLabel(iso, pid, slot) });
      }
    }
  }

  // Regroupement en blocs contigus de même typeKey
  const blocks = [];
  let cur = null;
  for (let i = 0; i < absent.length; i++) {
    const h = absent[i];
    const adj = i > 0 && isAdjacentHalf(absent[i - 1].iso, absent[i - 1].slot, h.iso, h.slot);
    if (adj && cur && h.typeKey === cur.typeKey) {
      cur.halves.push(h);
    } else {
      if (cur) blocks.push(cur);
      cur = { typeKey: h.typeKey, lbl: h.lbl, halves: [h] };
    }
  }
  if (cur) blocks.push(cur);

  for (const block of blocks) {
    if (block.halves.length < 2) continue; // demi-journée isolée → pas de fusion

    // Jours distincts en ordre chronologique
    const days = [];
    for (const h of block.halves) {
      if (!days.length || days[days.length - 1] !== h.iso) days.push(h.iso);
    }

    // Découpage par frontière de semaine, puis alimentation de la Map
    let segStart = 0;
    for (let i = 1; i <= days.length; i++) {
      const boundary = i === days.length || crossesWeekBoundary(days[i - 1], days[i]);
      if (!boundary) continue;

      const seg = days.slice(segStart, i);
      segStart = i;
      if (seg.length < 2) continue; // segment d'un seul jour → pas de cellule fusionnée

      const startIso = seg[0], endIso = seg[seg.length - 1];
      const spanDays =
        isoWeekday(new Date(endIso + 'T00:00:00')) - isoWeekday(new Date(startIso + 'T00:00:00')) + 1;
      const firstSlot = block.halves.find((h) => h.iso === startIso)?.slot ?? SLOTS[0];
      const visualType = halfVisualType(startIso, pid, firstSlot);

      result.set(startIso, { segmentStart: true, spanDays, label: block.lbl, visualType });
      for (let j = 1; j < seg.length; j++) {
        result.set(seg[j], { segmentStart: false });
      }
    }
  }

  return result;
}
