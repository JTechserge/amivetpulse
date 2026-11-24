import { describe, it, expect } from 'vitest';
import { historyYears } from '../../src/lib/annual-history.js';

describe('historyYears — années passées de la vue annuelle', () => {
  const keys = [
    '2025-03-10_marie_M',
    '2026-12-28_marie_AM',
    '2026-06-01_david_M',
    '2024-05-02_david_AM',
    '2027-01-04_marie_M',
    '2023-01-05_comment',
    'forecast_marie_2025-03-10',
    'closed_month_2024_11',
  ];

  it('années antérieures à l’année courante, croissantes, pour les personnes du groupe', () => {
    expect(historyYears(keys, 2027, ['marie'])).toEqual([2025, 2026]);
    expect(historyYears(keys, 2027, ['david'])).toEqual([2024, 2026]);
  });
  it('l’année courante et les suivantes sont exclues', () => {
    expect(historyYears(keys, 2026, ['marie'])).toEqual([2025]);
  });
  it('clés non datées ou sans personne du groupe ignorées', () => {
    expect(historyYears(keys, 2027, ['inconnu'])).toEqual([]);
  });
  it('planning vide → aucune année', () => {
    expect(historyYears([], 2027, ['marie'])).toEqual([]);
  });
});
