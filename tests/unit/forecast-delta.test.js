import { describe, it, expect } from 'vitest';
import { parseForecastHours, forecastDelta, forecastMonthTotal } from '../../src/lib/forecast-delta.js';

describe('parseForecastHours', () => {
  it('lit les heures saisies', () => {
    expect(parseForecastHours('35')).toBe(35);
    expect(parseForecastHours('35.5')).toBe(35.5);
    expect(parseForecastHours(42)).toBe(42);
  });
  it('ignore CP, vide et illisible', () => {
    expect(parseForecastHours('CP')).toBeNull();
    expect(parseForecastHours(null)).toBeNull();
    expect(parseForecastHours(undefined)).toBeNull();
    expect(parseForecastHours('')).toBeNull();
    expect(parseForecastHours('abc')).toBeNull();
  });
});

describe('forecastDelta', () => {
  it('donne réalisé − prévu à la minute', () => {
    expect(forecastDelta(35.75, 35)).toBe(0.75);
    expect(forecastDelta(28, 35)).toBe(-7);
    expect(forecastDelta(35, 35)).toBe(0);
  });
  it("n'invente pas d'écart sans prévisionnel", () => {
    expect(forecastDelta(35, null)).toBeNull();
    expect(forecastDelta(35, 0)).toBeNull();
  });
  it('arrondit les résidus flottants à la minute', () => {
    // 0.1 + 0.2 - 0.3 ≠ 0 en flottant ; l'écart doit être nul.
    expect(forecastDelta(0.1 + 0.2 + 35, 35.3)).toBe(0);
  });
});

describe('forecastMonthTotal', () => {
  // Novembre 2026 : lundis 2, 9, 16, 23, 30. Le lundi 26/10 a son vendredi le 30/10 → octobre.
  // Le lundi 30/11 a son vendredi le 04/12 → décembre.
  const weeks = {
    '2026-10-26': '35',
    '2026-11-02': '35',
    '2026-11-09': 'CP',
    '2026-11-16': '30.5',
    '2026-11-23': '42',
    '2026-11-30': '35',
  };
  const get = (iso) => weeks[iso] ?? null;

  it('rattache chaque semaine au mois de son vendredi et ignore les CP', () => {
    expect(forecastMonthTotal(get, 2026, 10)).toBe(35 + 30.5 + 42);
    expect(forecastMonthTotal(get, 2026, 9)).toBe(35);
    expect(forecastMonthTotal(get, 2026, 11)).toBe(35);
  });

  it('vaut 0 sans prévisionnel', () => {
    expect(forecastMonthTotal(() => null, 2026, 10)).toBe(0);
  });

  it("rattache à janvier la semaine du 1er janvier dont le vendredi tombe dans l'année", () => {
    // 1er janvier 2027 = vendredi ; lundi 28/12/2026.
    const g = (iso) => (iso === '2026-12-28' ? '35' : null);
    expect(forecastMonthTotal(g, 2027, 0)).toBe(35);
  });
});
