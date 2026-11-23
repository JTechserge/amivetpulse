import { describe, it, expect } from 'vitest';
import {
  ASV_CP_DAYS_PER_YEAR,
  isCPLabel,
  countCPDays,
  requestDaysByYear,
  checkCPQuota,
} from '../../src/lib/cp-quota.js';

function cp(slots, iso, pid, slot, decision, label = 'Congé payé') {
  slots[`${iso}_${pid}_${slot}`] = 'absent';
  slots[`${iso}_${pid}_${slot}_label`] = label;
  if (decision) slots[`${iso}_${pid}_${slot}_decision`] = decision;
}

describe('quota annuel de CP des ASV', () => {
  it('vaut 25 jours (5 semaines)', () => {
    expect(ASV_CP_DAYS_PER_YEAR).toBe(25);
  });

  it('reconnaît les motifs CP / Congé, pas Maladie ni Formation', () => {
    expect(isCPLabel('CP')).toBe(true);
    expect(isCPLabel('Congé payé')).toBe(true);
    expect(isCPLabel('Conge')).toBe(true);
    expect(isCPLabel('Arrêt maladie')).toBe(false);
    expect(isCPLabel('Formation')).toBe(false);
    expect(isCPLabel('')).toBe(false);
  });

  it('compte les jours validés par statut, une demi-journée = 0,5 j', () => {
    const s = {};
    cp(s, '2026-07-06', 'marie', 'M', 'approved');
    cp(s, '2026-07-06', 'marie', 'AM', 'approved');
    cp(s, '2026-07-07', 'marie', 'M', null); // en attente
    cp(s, '2026-07-08', 'marie', 'M', 'rejected');
    cp(s, '2026-07-09', 'marie', 'M', 'approved', 'Arrêt maladie'); // pas un CP
    cp(s, '2025-12-31', 'marie', 'M', 'approved'); // autre année
    cp(s, '2026-07-06', 'julie', 'M', 'approved'); // autre personne
    expect(countCPDays(s, 'marie', 2026, 'approved')).toBe(1);
    expect(countCPDays(s, 'marie', 2026, 'pending')).toBe(0.5);
    expect(countCPDays(s, 'marie', 2026, 'any')).toBe(2);
  });

  it('répartit une demande à cheval sur deux années', () => {
    const days = requestDaysByYear([
      { iso: '2026-12-31', slot: 'M' },
      { iso: '2026-12-31', slot: 'AM' },
      { iso: '2027-01-02', slot: 'M' },
    ]);
    expect(days).toEqual({ 2026: 1, 2027: 0.5 });
  });

  it('accepte jusqu’à 25 j pile, refuse au-delà', () => {
    expect(checkCPQuota({ approvedDays: 20, requestedDays: 5 }).over).toBe(0);
    expect(checkCPQuota({ approvedDays: 20, requestedDays: 5.5 })).toEqual({ limit: 25, after: 25.5, over: 0.5 });
  });

  it('le report N-1 et les ajustements augmentent le quota', () => {
    expect(checkCPQuota({ approvedDays: 25, requestedDays: 3, carriedOver: 2, extra: 1 }).over).toBe(0);
    expect(checkCPQuota({ approvedDays: 25, requestedDays: 3, carriedOver: 2 }).over).toBe(1);
  });

  it('un ajustement négatif réduit le quota', () => {
    expect(checkCPQuota({ approvedDays: 24, requestedDays: 1, extra: -1 }).over).toBe(1);
  });
});
