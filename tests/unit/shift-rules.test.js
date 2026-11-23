import { describe, it, expect } from 'vitest';
import { isShiftAllowedOnSlot, SHIFT_SLOT_MESSAGE } from '../../src/lib/shift-rules.js';

describe('poste autorisé par demi-journée', () => {
  it("Ouverture : le matin oui, l'après-midi non", () => {
    expect(isShiftAllowedOnSlot('O', 'M')).toBe(true);
    expect(isShiftAllowedOnSlot('O', 'AM')).toBe(false);
  });
  it("Fermeture : l'après-midi oui, le matin non", () => {
    expect(isShiftAllowedOnSlot('F', 'AM')).toBe(true);
    expect(isShiftAllowedOnSlot('F', 'M')).toBe(false);
  });
  it('Demi-journée : partout', () => {
    expect(isShiftAllowedOnSlot('D', 'M')).toBe(true);
    expect(isShiftAllowedOnSlot('D', 'AM')).toBe(true);
  });
  it('le message explique la règle', () => {
    expect(SHIFT_SLOT_MESSAGE).toMatch(/ouverture.*uniquement le matin/i);
    expect(SHIFT_SLOT_MESSAGE).toMatch(/fermeture.*uniquement l'après-midi/i);
  });
});
