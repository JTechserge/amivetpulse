/**
 * Tests unitaires pour les fonctions pures de src/forecast.js.
 * Les fonctions qui lisent store.DATA.slots (computeMonthTotal, etc.)
 * sont testées via un mock minimal du module slots.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildYearWeeks, fmtUTCDate } from '../../src/forecast.js';

// ─── Mocks des modules avec dépendances DOM / store ───────────────

// slots.js : on mock getForecastWeek pour contrôler les valeurs retournées
vi.mock('../../src/slots.js', () => ({
  getForecastWeek: vi.fn(() => null),
  setForecastWeek: vi.fn(),
  getForecastSig: vi.fn(() => null),
  setForecastSig: vi.fn(),
}));

// store.js : on mock le store minimal
vi.mock('../../src/store.js', () => ({
  store: { DATA: { slots: {} }, forecastPageState: null, currentUser: null },
}));

// ui.js : mock showToast
vi.mock('../../src/ui.js', () => ({ showToast: vi.fn() }));

// config.js : mock des constantes nécessaires
vi.mock('../../src/config.js', () => ({
  ASV_PEOPLE: [
    { id: 'marie', name: 'Marie', short: 'Marie', color: '#DB2777' },
    { id: 'johanna', name: 'Johanna', short: 'Johanna', color: '#EA580C' },
  ],
  MONTH_NAMES: [
    'Janvier','Février','Mars','Avril','Mai','Juin',
    'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
  ],
  MONTH_SHORT: ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'],
  ANNUAL_FULLTIME_HOURS: 1607,
}));

// utils.js : mock escapeHTML
vi.mock('../../src/utils.js', () => ({ escapeHTML: (s) => String(s) }));

// Importer les fonctions de calcul APRÈS les mocks (pour que getForecastWeek soit mockée)
import { getForecastWeek } from '../../src/slots.js';
import {
  computeMonthTotal,
  computeAnnualTotal,
  computeCPCount,
  computeBreakdown,
} from '../../src/forecast.js';

// ─── buildYearWeeks ───────────────────────────────────────────────

describe('buildYearWeeks', () => {
  it('2026 : génère entre 52 et 53 semaines', () => {
    const weeks = buildYearWeeks(2026);
    expect(weeks.length).toBeGreaterThanOrEqual(52);
    expect(weeks.length).toBeLessThanOrEqual(53);
  });

  it('2026 : 53 semaines exactement', () => {
    // 2026 commence un jeudi (1er janv) → l'année ISO a 53 semaines
    expect(buildYearWeeks(2026).length).toBe(53);
  });

  it('2026 : première semaine — le lundi précède ou est le 1er janv', () => {
    const weeks = buildYearWeeks(2026);
    const first = weeks[0];
    expect(first.w).toBe(1);
    // La première semaine doit contenir le 1er janvier
    expect(first.ds.getUTCFullYear()).toBe(2026);
    expect(first.ds.getUTCMonth()).toBe(0); // Janvier
  });

  it('2026 : la semaine du 1er janvier (S1) est bien le lundi 29 déc 2025', () => {
    const weeks = buildYearWeeks(2026);
    const first = weeks[0];
    // Le lundi de S1-2026 est le 29/12/2025 (ISO : le jeudi est le 1er janv 2026)
    expect(fmtUTCDate(first.mon)).toBe('2025-12-29');
  });

  it('2026 : borne de début (ds) = max(lundi, 1er janv)', () => {
    const weeks = buildYearWeeks(2026);
    const first = weeks[0];
    // S1 débute au 1er jan car le lundi est le 29 déc 2025
    expect(fmtUTCDate(first.ds)).toBe('2026-01-01');
  });

  it('2026 : dernière semaine bornée au 31 déc 2026', () => {
    const weeks = buildYearWeeks(2026);
    const last = weeks[weeks.length - 1];
    expect(fmtUTCDate(last.de)).toBe('2026-12-31');
  });

  it('toutes les semaines ont un mondayISO au format YYYY-MM-DD', () => {
    const weeks = buildYearWeeks(2026);
    const re = /^\d{4}-\d{2}-\d{2}$/;
    weeks.forEach((wk) => {
      expect(wk.mondayISO).toMatch(re);
    });
  });

  it('les numéros de semaine sont consécutifs à partir de 1', () => {
    const weeks = buildYearWeeks(2026);
    weeks.forEach((wk, i) => {
      expect(wk.w).toBe(i + 1);
    });
  });

  it('chaque semaine est rattachée au mois de son jeudi (month = 0..11)', () => {
    const weeks = buildYearWeeks(2026);
    weeks.forEach((wk) => {
      expect(wk.month).toBeGreaterThanOrEqual(0);
      expect(wk.month).toBeLessThanOrEqual(11);
    });
  });

  it('2027 : génère 52 ou 53 semaines', () => {
    const weeks = buildYearWeeks(2027);
    expect(weeks.length).toBeGreaterThanOrEqual(52);
    expect(weeks.length).toBeLessThanOrEqual(53);
  });
});

// ─── fmtUTCDate ───────────────────────────────────────────────────

describe('fmtUTCDate', () => {
  it('formate une date UTC en YYYY-MM-DD', () => {
    expect(fmtUTCDate(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01');
    expect(fmtUTCDate(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12-31');
    expect(fmtUTCDate(new Date(Date.UTC(2025, 11, 29)))).toBe('2025-12-29');
  });
});

// ─── computeMonthTotal ────────────────────────────────────────────

describe('computeMonthTotal', () => {
  beforeEach(() => { getForecastWeek.mockReset(); });

  it('retourne 0 si toutes les semaines sont CP', () => {
    getForecastWeek.mockReturnValue('CP');
    const weeks = [{ mondayISO: '2026-01-05' }, { mondayISO: '2026-01-12' }];
    expect(computeMonthTotal('marie', weeks)).toBe(0);
  });

  it('retourne 0 si toutes les semaines sont null', () => {
    getForecastWeek.mockReturnValue(null);
    const weeks = [{ mondayISO: '2026-01-05' }];
    expect(computeMonthTotal('marie', weeks)).toBe(0);
  });

  it('additionne correctement les heures', () => {
    getForecastWeek.mockImplementation((pid, mon) => {
      if (mon === '2026-01-05') return '35';
      if (mon === '2026-01-12') return '42';
      return null;
    });
    const weeks = [{ mondayISO: '2026-01-05' }, { mondayISO: '2026-01-12' }];
    expect(computeMonthTotal('marie', weeks)).toBe(77);
  });

  it('ignore les semaines CP dans la somme', () => {
    getForecastWeek.mockImplementation((pid, mon) => {
      if (mon === '2026-01-05') return '35';
      if (mon === '2026-01-12') return 'CP';
      return null;
    });
    const weeks = [{ mondayISO: '2026-01-05' }, { mondayISO: '2026-01-12' }];
    expect(computeMonthTotal('marie', weeks)).toBe(35);
  });
});

// ─── computeAnnualTotal ───────────────────────────────────────────

describe('computeAnnualTotal', () => {
  beforeEach(() => { getForecastWeek.mockReset(); });

  it('ignore les semaines CP', () => {
    getForecastWeek.mockImplementation((pid, mon) => {
      if (mon === '2026-01-05') return 'CP';
      if (mon === '2026-01-12') return '35';
      return null;
    });
    const weeks = [{ mondayISO: '2026-01-05' }, { mondayISO: '2026-01-12' }];
    expect(computeAnnualTotal('marie', weeks)).toBe(35);
  });

  it('additionne toutes les heures non-CP', () => {
    getForecastWeek.mockImplementation(() => '35');
    const weeks = [
      { mondayISO: '2026-01-05' },
      { mondayISO: '2026-01-12' },
      { mondayISO: '2026-01-19' },
    ];
    expect(computeAnnualTotal('marie', weeks)).toBe(105);
  });

  it('retourne 0 si tout est vide', () => {
    getForecastWeek.mockReturnValue(null);
    const weeks = [{ mondayISO: '2026-01-05' }, { mondayISO: '2026-01-12' }];
    expect(computeAnnualTotal('marie', weeks)).toBe(0);
  });
});

// ─── computeCPCount ───────────────────────────────────────────────

describe('computeCPCount', () => {
  beforeEach(() => { getForecastWeek.mockReset(); });

  it('compte les semaines CP', () => {
    getForecastWeek.mockImplementation((pid, mon) => {
      if (mon === '2026-07-06' || mon === '2026-07-13') return 'CP';
      return '35';
    });
    const weeks = [
      { mondayISO: '2026-06-29' },
      { mondayISO: '2026-07-06' },
      { mondayISO: '2026-07-13' },
    ];
    expect(computeCPCount('marie', weeks)).toBe(2);
  });

  it('retourne 0 si aucune semaine CP', () => {
    getForecastWeek.mockReturnValue('35');
    const weeks = [{ mondayISO: '2026-01-05' }, { mondayISO: '2026-01-12' }];
    expect(computeCPCount('marie', weeks)).toBe(0);
  });
});

// ─── computeBreakdown ────────────────────────────────────────────

describe('computeBreakdown', () => {
  beforeEach(() => { getForecastWeek.mockReset(); });

  it('regroupe par volume horaire décroissant', () => {
    getForecastWeek.mockImplementation((pid, mon) => {
      if (mon === 'w1' || mon === 'w2') return '42';
      if (mon === 'w3') return '35';
      return null;
    });
    const weeks = [{ mondayISO: 'w1' }, { mondayISO: 'w2' }, { mondayISO: 'w3' }, { mondayISO: 'w4' }];
    const result = computeBreakdown('marie', weeks);
    expect(result[0]).toMatchObject({ label: '42h', count: 2, isCP: false });
    expect(result[1]).toMatchObject({ label: '35h', count: 1, isCP: false });
  });

  it('compte correctement les CP et les place en dernier', () => {
    getForecastWeek.mockImplementation((pid, mon) => {
      if (mon === 'w1') return 'CP';
      if (mon === 'w2') return 'CP';
      if (mon === 'w3') return '35';
      return null;
    });
    const weeks = [{ mondayISO: 'w1' }, { mondayISO: 'w2' }, { mondayISO: 'w3' }, { mondayISO: 'w4' }];
    const result = computeBreakdown('marie', weeks);
    const cpRow = result.find((r) => r.isCP);
    expect(cpRow).toBeDefined();
    expect(cpRow.count).toBe(2);
    // CP doit être le dernier élément
    expect(result[result.length - 1].isCP).toBe(true);
  });

  it('ne retourne aucune ligne pour les semaines sans valeur', () => {
    getForecastWeek.mockReturnValue(null);
    const weeks = [{ mondayISO: 'w1' }, { mondayISO: 'w2' }];
    expect(computeBreakdown('marie', weeks)).toHaveLength(0);
  });
});
