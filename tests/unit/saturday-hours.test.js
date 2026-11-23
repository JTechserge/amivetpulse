/**
 * Heures du samedi vues par le calendrier ASV (vues mensuelle et hebdomadaire)
 * et par le tableau de bord : elles passent par src/slots.js, pas par le module
 * partagé directement. Règle (Jérémie, 23/11/2026), ASV autres que Carla :
 *   matin  : Ouverture 8h30→13h = 4h30, Demi-journée = 4h00
 *   a-midi : Fermeture = 2h25, Demi-journée = 2h30
 */
import { describe, it, expect, beforeEach } from 'vitest';

const memoryStore = {};
globalThis.localStorage = {
  getItem: (k) => memoryStore[k] ?? null,
  setItem: (k, v) => {
    memoryStore[k] = String(v);
  },
  removeItem: (k) => delete memoryStore[k],
};

const { store } = await import('../../src/store.js');
const { setSlotState, setSlotShiftType, getDayNominal } = await import('../../src/slots.js');
const { computeASVWorkedHoursWeek, computeASVWorkedHoursNew } = await import('../../src/dashboard-stats.js');
const { ASV_STD_SAT_CARLA } = await import('../../src/lib/pay-constants.js');

const SAT = '2026-11-21';
const mins = (h) => Math.round(h * 60);

function sat(pid, slots) {
  for (const [slot, shift] of Object.entries(slots)) {
    setSlotState(SAT, pid, slot, 'present');
    setSlotShiftType(SAT, pid, slot, shift);
  }
}

beforeEach(() => {
  store.DATA = { slots: {} };
});

describe('samedi — calendrier et tableau de bord', () => {
  it('Ouverture le matin → 4h30', () => {
    sat('marie', { M: 'O' });
    expect(mins(getDayNominal(SAT, 'marie'))).toBe(270);
  });
  it('Demi-journée le matin → 4h00', () => {
    sat('marie', { M: 'D' });
    expect(mins(getDayNominal(SAT, 'marie'))).toBe(240);
  });
  it("Fermeture l'après-midi → 2h25", () => {
    sat('marie', { AM: 'F' });
    expect(mins(getDayNominal(SAT, 'marie'))).toBe(145);
  });
  it("Demi-journée l'après-midi → 2h30", () => {
    sat('marie', { AM: 'D' });
    expect(mins(getDayNominal(SAT, 'marie'))).toBe(150);
  });
  it('Carla reste à 7h25', () => {
    sat('carla', { M: 'O' });
    expect(getDayNominal(SAT, 'carla')).toBeCloseTo(ASV_STD_SAT_CARLA, 10);
  });
  it('les totaux semaine et mois du tableau de bord suivent la règle', () => {
    sat('marie', { M: 'O' });
    sat('johanna', { AM: 'F' });
    expect(mins(computeASVWorkedHoursWeek('marie', new Date('2026-11-16T00:00:00')))).toBe(270);
    expect(mins(computeASVWorkedHoursNew('johanna', 2026, 10))).toBe(145);
  });
});
