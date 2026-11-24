/**
 * Regroupement des demandes de congé (page Demandes) : le dimanche et un jour
 * férié laissé vide ne coupent pas une suite, y compris d'un mois à l'autre.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// leave-requests.js importe pwa.js (window au chargement du module).
vi.mock('../../src/pwa.js', () => ({ triggerPushNotification: vi.fn() }));

const memoryStore = {};
globalThis.localStorage = {
  getItem: (k) => memoryStore[k] ?? null,
  setItem: (k, v) => {
    memoryStore[k] = String(v);
  },
  removeItem: (k) => delete memoryStore[k],
};

const { store } = await import('../../src/store.js');
const { collectAllLeaveGroups } = await import('../../src/leave-requests.js');
// getCurrentYear() se déduit de la date du jour (lib/clinic-year.js) : on fige
// l'horloge en 2026 pour que les demandes listées portent sur 2026 et 2027.
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-06-15T10:00:00Z'));
afterAll(() => vi.useRealTimers());

function leave(iso, label = 'Vacances') {
  for (const slot of ['M', 'AM']) {
    store.DATA.slots[`${iso}_johanna_${slot}`] = 'absent';
    store.DATA.slots[`${iso}_johanna_${slot}_label`] = label;
  }
}
function days(fromISO, toISO) {
  const out = [];
  for (let d = new Date(fromISO + 'T00:00:00'); d <= new Date(toISO + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0)
      out.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      );
  }
  return out;
}
const johanna = () => collectAllLeaveGroups().filter((g) => g.personId === 'johanna');

beforeEach(() => {
  store.DATA = { slots: {} };
});

describe('suites de congés', () => {
  it('quatre semaines lundi→samedi, à cheval sur novembre et décembre → une seule demande', () => {
    days('2026-11-23', '2026-12-19').forEach((iso) => leave(iso));
    const g = johanna();
    expect(g).toHaveLength(1);
    expect(g[0].slots).toHaveLength(48);
    expect(g[0].slots[0].iso).toBe('2026-11-23');
    expect(g[0].slots.at(-1).iso).toBe('2026-12-19');
  });
  it('un jour férié vide au milieu ne coupe pas (25 décembre)', () => {
    days('2026-12-21', '2026-12-26')
      .filter((iso) => iso !== '2026-12-25')
      .forEach((iso) => leave(iso));
    expect(johanna()).toHaveLength(1);
  });
  it('un jour ouvré non posé coupe la suite', () => {
    ['2026-11-23', '2026-11-25'].forEach((iso) => leave(iso));
    expect(johanna()).toHaveLength(2);
  });
  it('un motif différent coupe la suite', () => {
    leave('2026-11-23', 'Vacances');
    leave('2026-11-24', 'Formation');
    expect(johanna()).toHaveLength(2);
  });
});
