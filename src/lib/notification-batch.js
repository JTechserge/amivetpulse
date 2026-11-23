/* Regroupement des notifications de demandes de congé : une notification par
   suite de demi-journées consécutives, au lieu d'une par demi-journée.
   Deux demi-journées se suivent si c'est le matin puis l'après-midi du même jour,
   ou l'après-midi puis le matin du jour suivant (le dimanche ne coupe pas). */

const SLOT_ORDER = { M: 0, AM: 1 };

function dayIndex(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
}

/** Rang continu d'une demi-journée, dimanches exclus de la numérotation. */
function halfDayRank(iso, slot) {
  const d = dayIndex(iso);
  // 1970-01-04 (jour 3) est un dimanche : les dimanches sont les jours d ≡ 3 (mod 7).
  const sundaysUpTo = Math.floor((d - 3 + 7) / 7);
  return (d - sundaysUpTo) * 2 + SLOT_ORDER[slot];
}

/**
 * Regroupe des demi-journées en plages consécutives.
 * @param {{iso:string, slot:'M'|'AM'}[]} slots
 * @returns {{from:{iso:string,slot:string}, to:{iso:string,slot:string}, count:number}[]}
 */
export function mergeHalfDayRanges(slots) {
  const uniq = new Map();
  for (const s of slots) uniq.set(`${s.iso}|${s.slot}`, { iso: s.iso, slot: s.slot, rank: halfDayRank(s.iso, s.slot) });
  const sorted = [...uniq.values()].sort((a, b) => a.rank - b.rank);
  const ranges = [];
  for (const s of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && s.rank === last._rank + 1) {
      last.to = { iso: s.iso, slot: s.slot };
      last.count++;
      last._rank = s.rank;
    } else {
      ranges.push({ from: { iso: s.iso, slot: s.slot }, to: { iso: s.iso, slot: s.slot }, count: 1, _rank: s.rank });
    }
  }
  return ranges.map(({ from, to, count }) => ({ from, to, count }));
}

const SLOT_TXT = { M: 'Mat.', AM: 'A-m.' };

/**
 * Texte d'une plage, ex. « 01/12/2026 » (journée entière), « 01/12/2026 (Mat.) »,
 * « du 01/12/2026 au 05/12/2026 », « du 01/12/2026 (A-m.) au 03/12/2026 (Mat.) ».
 * @param {{from:{iso,slot}, to:{iso,slot}}} range
 * @param {(iso:string)=>string} fmt  formatage d'une date
 */
export function formatHalfDayRange(range, fmt) {
  const { from, to } = range;
  if (from.iso === to.iso) {
    return from.slot === to.slot ? `${fmt(from.iso)} (${SLOT_TXT[from.slot]})` : fmt(from.iso);
  }
  const start = from.slot === 'AM' ? `${fmt(from.iso)} (${SLOT_TXT.AM})` : fmt(from.iso);
  const end = to.slot === 'M' ? `${fmt(to.iso)} (${SLOT_TXT.M})` : fmt(to.iso);
  return `du ${start} au ${end}`;
}
