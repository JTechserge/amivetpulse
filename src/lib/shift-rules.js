/* Postes autorisés par demi-journée, tous jours et toutes ASV confondus :
   une Ouverture n'a lieu que le matin, une Fermeture que l'après-midi. */

export const SHIFT_SLOT_MESSAGE = "Une ouverture a lieu uniquement le matin et une fermeture uniquement l'après-midi.";

/**
 * @param {'O'|'F'|'D'} shift
 * @param {'M'|'AM'} slot
 * @returns {boolean}
 */
export function isShiftAllowedOnSlot(shift, slot) {
  if (shift === 'O') return slot === 'M';
  if (shift === 'F') return slot === 'AM';
  return true;
}
