/**
 * Tests unitaires — fonctions pures de dashboard-stats.js :
 *   getWeekStart, getASVTimeFraction, getASVQuota
 *
 * dashboard-stats.js n'importe pas pwa.js → pas de mock nécessaire.
 */
import { describe, it, expect } from 'vitest';
import { getWeekStart, getASVTimeFraction, getASVQuota } from '../../src/dashboard-stats.js';
import { ASV_STD_SAT_CARLA } from '../../src/lib/pay-constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. getWeekStart(date) — retourne le lundi de la semaine
// ─────────────────────────────────────────────────────────────────────────────
describe('getWeekStart (dashboard-stats.js)', () => {
  it('vendredi 31 juillet 2026 → lundi 27 juillet', () => {
    const start = getWeekStart(new Date('2026-07-31T12:00:00'));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6); // juillet = index 6
    expect(start.getDate()).toBe(27);
  });

  it('lundi 27 juillet 2026 → lundi 27 juillet (même jour)', () => {
    const start = getWeekStart(new Date('2026-07-27T12:00:00'));
    expect(start.getDate()).toBe(27);
    expect(start.getMonth()).toBe(6);
  });

  it('dimanche 26 juillet 2026 → lundi 20 juillet (sem. précédente)', () => {
    const start = getWeekStart(new Date('2026-07-26T12:00:00'));
    expect(start.getDate()).toBe(20);
    expect(start.getMonth()).toBe(6);
  });

  it('mercredi 29 juillet 2026 → lundi 27 juillet', () => {
    const start = getWeekStart(new Date('2026-07-29T12:00:00'));
    expect(start.getDate()).toBe(27);
  });

  it('retourne toujours un lundi (getDay() === 1)', () => {
    const dates = [
      new Date('2026-07-26T12:00:00'), // dimanche
      new Date('2026-07-27T12:00:00'), // lundi
      new Date('2026-07-28T12:00:00'), // mardi
      new Date('2026-07-31T12:00:00'), // vendredi
      new Date('2026-08-01T12:00:00'), // samedi
    ];
    for (const d of dates) {
      expect(getWeekStart(d).getDay()).toBe(1);
    }
  });

  it('heure ramenée à minuit local', () => {
    const start = getWeekStart(new Date('2026-07-31T23:59:59'));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. getASVTimeFraction(personId)
// ─────────────────────────────────────────────────────────────────────────────
describe('getASVTimeFraction (dashboard-stats.js)', () => {
  it('marie (temps plein) → 1.0', () => {
    expect(getASVTimeFraction('marie')).toBeCloseTo(1.0, 2);
  });

  it('johanna (temps plein) → 1.0', () => {
    expect(getASVTimeFraction('johanna')).toBeCloseTo(1.0, 2);
  });

  it('julie (3/4 temps) → 0.75', () => {
    expect(getASVTimeFraction('julie')).toBeCloseTo(0.75, 2);
  });

  it('carla (samedi uniquement) → fraction cohérente avec 7h25/35h', () => {
    const f = getASVTimeFraction('carla');
    // ASV_STD_SAT_CARLA / 35 ≈ 0.207
    expect(f).toBeCloseTo(ASV_STD_SAT_CARLA / 35, 3);
  });

  it('personId inconnu → 1.0 par défaut', () => {
    expect(getASVTimeFraction('inconnu')).toBe(1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. getASVQuota — cohérence interne (complète la couverture planning-logic.test.js)
// ─────────────────────────────────────────────────────────────────────────────
describe('getASVQuota — cohérence interne (dashboard-stats.js)', () => {
  it('quota annuel marie = 1607 (temps plein)', () => {
    expect(getASVQuota('marie').annual).toBe(1607);
  });

  it('quota annuel julie (3/4) entre 1200 et 1210', () => {
    const julieAnnual = getASVQuota('julie').annual;
    expect(julieAnnual).toBeGreaterThan(1200);
    expect(julieAnnual).toBeLessThan(1210);
  });

  it('quota mensuel = quota annuel ÷ 12 (arrondi 1 décimale)', () => {
    const q = getASVQuota('marie');
    expect(q.monthly).toBeCloseTo(q.annual / 12, 0);
  });

  it('quota mensuel Carla = ASV_STD_SAT_CARLA × 52 ÷ 12 (arrondi 1 décimale)', () => {
    const q = getASVQuota('carla');
    expect(q.monthly).toBeCloseTo((ASV_STD_SAT_CARLA * 52) / 12, 0);
  });
});
