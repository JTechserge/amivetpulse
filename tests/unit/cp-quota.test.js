import { describe, it, expect } from 'vitest';
import {
  ASV_CP_DAYS_PER_YEAR,
  isCPLabel,
  countCPDays,
  requestDaysByYear,
  checkCPQuota,
  asvCPEntitlement,
  asvCPAcquired,
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

  it('compte comme CP toute demande de congé, motif libre compris', () => {
    for (const l of ['CP', 'Congé payé', 'Vacances', 'SKI TIGNES', 'GRÈCE', '']) expect(isCPLabel(l)).toBe(true);
  });
  it('exclut repos, maladie, accident et les motifs qui ne sont pas des CP', () => {
    for (const l of [
      'Repos',
      'Arrêt maladie',
      'Maladie',
      'Accident du travail',
      'Formation',
      'Congrès',
      'RTT',
      'Rendez-vous médical',
      'Récupération',
    ])
      expect(isCPLabel(l)).toBe(false);
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

describe('acquisition des CP : effectif actuel et nouvelles arrivées', () => {
  it('effectif actuel (sans date d’arrivée) : 25 j dès janvier', () => {
    expect(asvCPAcquired(2027, null, '2027-01-02')).toBe(25);
    expect(asvCPEntitlement(2027, null)).toBe(25);
  });
  it('arrivée avant 2027 : 25 j dès janvier, pas de prorata', () => {
    expect(asvCPAcquired(2026, '2026-06-01', '2026-06-02')).toBe(25);
    expect(asvCPEntitlement(2026, '2026-06-01')).toBe(25);
  });
  it('arrivée le 1er janvier 2027 : prorata jour par jour, 25 j au 31 décembre', () => {
    expect(asvCPAcquired(2027, '2027-01-01', '2027-12-31')).toBe(25);
    expect(asvCPAcquired(2027, '2027-01-01', '2027-07-02')).toBe(12.53); // 183 j / 365
    expect(asvCPEntitlement(2027, '2027-01-01')).toBe(25);
  });
  it('arrivée le 1er juillet 2027 : droit de l’année au prorata (≈ 12,6 j)', () => {
    expect(asvCPEntitlement(2027, '2027-07-01')).toBe(12.6); // 184 j / 365
    expect(asvCPAcquired(2027, '2027-07-01', '2027-06-30')).toBe(0);
    expect(asvCPAcquired(2027, '2027-07-01', '2028-03-01')).toBe(12.6);
  });
  it('l’année suivant l’arrivée : 25 j dès janvier', () => {
    expect(asvCPAcquired(2028, '2027-07-01', '2028-01-01')).toBe(25);
    expect(asvCPEntitlement(2028, '2027-07-01')).toBe(25);
  });
  it('avant l’arrivée : aucun droit', () => {
    expect(asvCPEntitlement(2027, '2028-02-01')).toBe(0);
  });
  it('le quota de validation suit le droit proratisé', () => {
    const entitlement = asvCPEntitlement(2027, '2027-07-01');
    expect(checkCPQuota({ approvedDays: 10, requestedDays: 3, entitlement }).over).toBe(0.4);
  });
});
