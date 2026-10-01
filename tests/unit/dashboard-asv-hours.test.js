/**
 * Heures ASV du tableau de bord (Suivi ASV) : elles doivent être exactes à la
 * minute et égales à celles de la vue hebdomadaire.
 *
 * Cas réel (01/10/2026) : une semaine de 35h45 dans la vue hebdomadaire
 * s'affichait 35h48 dans le tableau mensuel — le total était arrondi au
 * dixième d'heure (35,75 → 35,8) avant affichage.
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
const { setSlotState, setPlusMins } = await import('../../src/slots.js');
const { computeASVWorkedHoursNew, computeASVWorkedHoursWeek, computeASVWorkedHours } = await import(
  '../../src/dashboard-stats.js'
);

const PID = 'marie';

// Semaine du lundi 26/10/2026 : O, O, F, F, plus 2h15 de H.supp. le lundi.
// Vue hebdomadaire : 10h45 + 8h30 + 8h15 + 8h15 = 35h45.
function seedWeek() {
  store.DATA = { slots: {} };
  const days = [
    ['2026-10-26', 'O'],
    ['2026-10-27', 'O'],
    ['2026-10-28', 'F'],
    ['2026-10-29', 'F'],
  ];
  for (const [iso, shift] of days) {
    setSlotState(iso, PID, 'M', 'present');
    setSlotState(iso, PID, 'AM', 'present');
    store.DATA.slots[`${iso}_${PID}_shift`] = shift;
  }
  setPlusMins('2026-10-26', PID, 135);
}

beforeEach(seedWeek);

describe('heures ASV du tableau de bord, à la minute près', () => {
  it('semaine : 35h45, pas 35h48', () => {
    expect(computeASVWorkedHoursWeek(PID, new Date('2026-10-26T00:00:00'))).toBeCloseTo(35.75, 9);
  });

  it('mois (tableau « Heures mensuelles ») : 35h45, pas 35h48', () => {
    expect(computeASVWorkedHoursNew(PID, 2026, 9)).toBeCloseTo(35.75, 9);
  });

  it('année : 35h45', () => {
    expect(computeASVWorkedHoursNew(PID, 2026, null)).toBeCloseTo(35.75, 9);
    expect(computeASVWorkedHours(PID, 2026, 9)).toBeCloseTo(35.75, 9);
  });
});
