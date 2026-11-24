// Années passées consultables dans la vue annuelle (historique).
//
// Une année passée n'est proposée que si le planning contient au moins une clé
// datée de cette année pour une personne du groupe (vétérinaires ou ASV) : pas
// de bouton vers une année vide.

const DATED_KEY_RE = /^(\d{4})-\d{2}-\d{2}_([^_]+)_/;

/**
 * @param {string[]} slotKeys clés de planning_data.slots
 * @param {number} currentYear année courante de la clinique
 * @param {Iterable<string>} personIds identifiants des personnes du groupe
 * @returns {number[]} années strictement antérieures à currentYear, croissantes
 */
export function historyYears(slotKeys, currentYear, personIds) {
  const ids = new Set(personIds);
  const years = new Set();
  for (const key of slotKeys) {
    const m = key.match(DATED_KEY_RE);
    if (!m) continue;
    const y = Number(m[1]);
    if (y < currentYear && ids.has(m[2])) years.add(y);
  }
  return [...years].sort((a, b) => a - b);
}
