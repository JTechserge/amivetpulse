/**
 * Tests unitaires pour la logique métier planning.
 * Remplace 45 assertions tautologiques (valeurs redéclarées dans le test)
 * par des imports des vraies fonctions/constantes de production.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  ANNUAL_FULLTIME_HOURS,
  WEEKLY_MAX_HOURS,
  ASV_STD_SAT_CARLA,
  ASV_STD_SAT_SECOND,
  ASV_STD_WEEKDAY_AVG,
} from '../../src/lib/pay-constants.js';

import { isWithinNextTwoWeeks } from '../../src/slots.js';
import { isReposLabel } from '../../src/lib/leave-utils.js';
import { getASVQuota } from '../../src/dashboard-stats.js';

// ─────────────────────────────────────────────────────────────────
// 1. Constantes légales (src/config.js)
// ─────────────────────────────────────────────────────────────────
describe('Constantes légales', () => {
  it('ANNUAL_FULLTIME_HOURS = 1607h (loi Aubry 2000)', () => {
    expect(ANNUAL_FULLTIME_HOURS).toBe(1607);
  });

  it('WEEKLY_MAX_HOURS = 42h (plafond légal)', () => {
    expect(WEEKLY_MAX_HOURS).toBe(42);
  });

  it('1607h < 52 semaines × 42h (cohérence modulation)', () => {
    expect(ANNUAL_FULLTIME_HOURS).toBeLessThan(52 * WEEKLY_MAX_HOURS);
  });
});

// ─────────────────────────────────────────────────────────────────
// 2. Horaires ASV (src/config.js)
// ─────────────────────────────────────────────────────────────────
describe('Horaires ASV — constantes', () => {
  it('Carla samedi = 7h25 (8h30-16h45 avec ~50min pause)', () => {
    expect(ASV_STD_SAT_CARLA).toBeCloseTo(7 + 25 / 60, 4);
  });

  it('2e ASV samedi = 7h00 (convention clinique)', () => {
    expect(ASV_STD_SAT_SECOND).toBe(7.0);
  });

  it('Carla travaille plus longtemps le samedi que les autres ASV', () => {
    expect(ASV_STD_SAT_CARLA).toBeGreaterThan(ASV_STD_SAT_SECOND);
  });

  it('ASV_STD_WEEKDAY_AVG = (8.5 + 8.25) / 2', () => {
    expect(ASV_STD_WEEKDAY_AVG).toBeCloseTo((8.5 + 8.25) / 2, 4);
  });
});

// ─────────────────────────────────────────────────────────────────
// 3. Fenêtre 2 semaines — src/slots.js#isWithinNextTwoWeeks
// ─────────────────────────────────────────────────────────────────
describe('isWithinNextTwoWeeks (src/slots.js)', () => {
  // Date de référence fixe pour éviter toute fragilité liée au jour réel
  const REF = new Date('2026-07-31T12:00:00');

  function addDays(n) {
    const d = new Date(REF);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aujourd'hui est dans la fenêtre", () => {
    vi.useFakeTimers();
    vi.setSystemTime(REF);
    expect(isWithinNextTwoWeeks(addDays(0))).toBe(true);
  });

  it('demain est dans la fenêtre', () => {
    vi.useFakeTimers();
    vi.setSystemTime(REF);
    expect(isWithinNextTwoWeeks(addDays(1))).toBe(true);
  });

  it('J+14 est dans la fenêtre (limite incluse)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(REF);
    expect(isWithinNextTwoWeeks(addDays(14))).toBe(true);
  });

  it('J+15 est hors fenêtre', () => {
    vi.useFakeTimers();
    vi.setSystemTime(REF);
    expect(isWithinNextTwoWeeks(addDays(15))).toBe(false);
  });

  it('hier est hors fenêtre', () => {
    vi.useFakeTimers();
    vi.setSystemTime(REF);
    expect(isWithinNextTwoWeeks(addDays(-1))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// 4. Filtrage libellés repos — src/leave-requests.js#isReposLabel
// ─────────────────────────────────────────────────────────────────
describe('isReposLabel (src/leave-requests.js)', () => {
  it("'Repos planifié' est un repos", () => {
    expect(isReposLabel('Repos planifié')).toBe(true);
  });

  it("'repos' minuscule est un repos", () => {
    expect(isReposLabel('repos')).toBe(true);
  });

  it("'Non travaillé' est un repos", () => {
    expect(isReposLabel('Non travaillé')).toBe(true);
  });

  it("'Congé annuel' n'est PAS un repos", () => {
    expect(isReposLabel('Congé annuel')).toBe(false);
  });

  it("'Maladie' n'est PAS un repos", () => {
    expect(isReposLabel('Maladie')).toBe(false);
  });

  it('chaîne vide → false', () => {
    expect(isReposLabel('')).toBe(false);
  });

  it('null/undefined → false (défensive)', () => {
    expect(isReposLabel(null)).toBe(false);
    expect(isReposLabel(undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// 5. Quotas ASV — src/dashboard-stats.js#getASVQuota
// ─────────────────────────────────────────────────────────────────
describe('getASVQuota (src/dashboard-stats.js)', () => {
  it('Marie (temps plein) : quota annuel = 1607h', () => {
    expect(getASVQuota('marie').annual).toBe(1607);
  });

  it('Marie : quota hebdo = 35h', () => {
    expect(getASVQuota('marie').weekly).toBe(35);
  });

  it('Julie (3/4 temps) : quota annuel ≈ 1205.3h', () => {
    expect(getASVQuota('julie').annual).toBeCloseTo(1205.3, 0);
  });

  it('Julie : quota hebdo = 26.25h', () => {
    expect(getASVQuota('julie').weekly).toBeCloseTo(26.25, 2);
  });

  it('Carla (saturdayOnly) : annual = null (hors modulation annuelle)', () => {
    expect(getASVQuota('carla').annual).toBeNull();
  });

  it('Carla : quota hebdo = ASV_STD_SAT_CARLA (un samedi)', () => {
    expect(getASVQuota('carla').weekly).toBeCloseTo(ASV_STD_SAT_CARLA, 4);
  });

  it('Carla : quota mensuel ≈ 32.1h (7h25 × 52 ÷ 12)', () => {
    expect(getASVQuota('carla').monthly).toBeCloseTo(((7 + 25 / 60) * 52) / 12, 0);
  });

  it('tous les quotas hebdo ASV non-samedi sont sous le plafond de 42h', () => {
    for (const pid of ['marie', 'johanna', 'julie']) {
      expect(getASVQuota(pid).weekly).toBeLessThan(WEEKLY_MAX_HOURS);
    }
  });
});
