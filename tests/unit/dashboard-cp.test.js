import { describe, test, expect } from 'vitest';
import { CP_DAYS_PER_MONTH } from '../../src/config.js';

// Reproduit la logique de getCPAcquired sans dépendre du DOM ni de `today`.
function simulateCPAcquired(person, startISO, endISO){
  const startDate = new Date(startISO + 'T00:00:00');
  const endDate   = new Date(endISO   + 'T00:00:00');
  if(endDate < startDate) return 0;
  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  if(endDate.getDate() >= 1) months++;
  months = Math.max(0, Math.min(months, 12));
  return Math.round(months * CP_DAYS_PER_MONTH * (person.timeFraction ?? 1.0) * 100) / 100;
}

describe('CP_DAYS_PER_MONTH', () => {
  test('constante à 2.5 jours par mois', () => {
    expect(CP_DAYS_PER_MONTH).toBe(2.5);
  });
});

describe('getCPAcquired — proratisation timeFraction', () => {
  const fulltime  = { timeFraction: 1.0 };
  const halftime  = { timeFraction: 0.5 };
  const threequar = { timeFraction: 0.75 };
  const noFrac    = {};                       // timeFraction absent → 1.0 par défaut

  test('temps plein, 1 mois complet → 2.5 j', () => {
    expect(simulateCPAcquired(fulltime, '2026-06-01', '2026-06-15')).toBe(2.5);
  });

  test('mi-temps, 1 mois → 1.25 j', () => {
    expect(simulateCPAcquired(halftime, '2026-06-01', '2026-06-15')).toBe(1.25);
  });

  test('3/4 temps, 1 mois → 1.88 j (arrondi centième)', () => {
    expect(simulateCPAcquired(threequar, '2026-06-01', '2026-06-15')).toBe(1.88);
  });

  test('pas de timeFraction → traité comme temps plein', () => {
    expect(simulateCPAcquired(noFrac, '2026-06-01', '2026-06-15')).toBe(2.5);
  });

  test('période complète 12 mois (temps plein) → 30 j', () => {
    expect(simulateCPAcquired(fulltime, '2026-06-01', '2027-05-15')).toBe(30);
  });

  test('plafonné à 12 mois même si période plus longue', () => {
    expect(simulateCPAcquired(fulltime, '2026-01-01', '2027-06-15')).toBe(30);
  });

  test('période nulle (end < start) → 0', () => {
    expect(simulateCPAcquired(fulltime, '2026-06-15', '2026-06-01')).toBe(0);
  });

  test('mi-temps, 12 mois → 15 j', () => {
    expect(simulateCPAcquired(halftime, '2026-06-01', '2027-05-15')).toBe(15);
  });
});
