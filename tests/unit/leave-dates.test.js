/**
 * Tests unitaires — fonctions pures de leave-requests.js :
 *   easterDate, getJoursFeries, cpPeriodISO, sortLeaveGroups,
 *   getCPTakenDays, getAbsenteeismRate
 *
 * leave-requests.js importe pwa.js (window.addEventListener au module level) →
 * mock obligatoire pour l'environnement Node.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/pwa.js', () => ({ triggerPushNotification: vi.fn() }));

import { store } from '../../src/store.js';
import {
  easterDate,
  getJoursFeries,
  cpPeriodISO,
  sortLeaveGroups,
  getCPTakenDays,
  getAbsenteeismRate,
} from '../../src/leave-requests.js';

function resetStore() {
  store.DATA = { version: 2, slots: {} };
}

function setAbsent(iso, pid, slot, label = null, decision = null) {
  store.DATA.slots[`${iso}_${pid}_${slot}`] = 'absent';
  if (label !== null) store.DATA.slots[`${iso}_${pid}_${slot}_label`] = label;
  if (decision !== null) store.DATA.slots[`${iso}_${pid}_${slot}_decision`] = decision;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. easterDate(year)
// ─────────────────────────────────────────────────────────────────────────────
describe('easterDate (leave-requests.js)', () => {
  it('2024 → 31 mars (date vérifiée)', () => {
    const d = easterDate(2024);
    expect(d.getMonth()).toBe(2); // mars = index 2
    expect(d.getDate()).toBe(31);
  });

  it('2025 → 20 avril', () => {
    const d = easterDate(2025);
    expect(d.getMonth()).toBe(3); // avril = index 3
    expect(d.getDate()).toBe(20);
  });

  it('2026 → 5 avril', () => {
    const d = easterDate(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(5);
  });

  it('retourne toujours un objet Date valide', () => {
    for (const y of [2023, 2024, 2025, 2026, 2027]) {
      const d = easterDate(y);
      expect(d).toBeInstanceOf(Date);
      expect(isNaN(d.getTime())).toBe(false);
      // Pâques tombe toujours entre le 22 mars et le 25 avril
      const m = d.getMonth();
      const day = d.getDate();
      const ok =
        (m === 2 && day >= 22) || // mars ≥ 22
        (m === 3 && day <= 25);   // avril ≤ 25
      expect(ok).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. getJoursFeries(year)
// ─────────────────────────────────────────────────────────────────────────────
describe('getJoursFeries (leave-requests.js)', () => {
  it('contient les 8 jours fériés fixes de 2026', () => {
    const f = getJoursFeries(2026);
    for (const iso of [
      '2026-01-01', // Jour de l'an
      '2026-05-01', // Fête du Travail
      '2026-05-08', // Victoire 1945
      '2026-07-14', // Fête Nationale
      '2026-08-15', // Assomption
      '2026-11-01', // Toussaint
      '2026-11-11', // Armistice
      '2026-12-25', // Noël
    ]) {
      expect(f.has(iso)).toBe(true);
    }
  });

  it('contient les 3 jours fériés mobiles de 2026 (Pâques le 5 avril)', () => {
    const f = getJoursFeries(2026);
    expect(f.has('2026-04-06')).toBe(true); // Lundi de Pâques (5 avr + 1)
    expect(f.has('2026-05-14')).toBe(true); // Ascension (5 avr + 39)
    expect(f.has('2026-05-25')).toBe(true); // Lundi de Pentecôte (5 avr + 50)
  });

  it('retourne exactement 11 jours fériés par an', () => {
    expect(getJoursFeries(2026).size).toBe(11);
  });

  it("isolement d'année : les fériés de 2025 ne contaminent pas 2026", () => {
    const f25 = getJoursFeries(2025);
    expect(f25.has('2025-07-14')).toBe(true);
    expect(f25.has('2026-07-14')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. cpPeriodISO(referenceYear)
// ─────────────────────────────────────────────────────────────────────────────
describe('cpPeriodISO (leave-requests.js)', () => {
  it('2026 → du 1er janvier au 31 décembre', () => {
    const { start, end } = cpPeriodISO(2026);
    expect(start).toBe('2026-01-01');
    expect(end).toBe('2026-12-31');
  });

  it('le label mentionne l\'année', () => {
    const { label } = cpPeriodISO(2026);
    expect(label).toContain('2026');
  });

  it('couvre exactement une année civile complète', () => {
    for (const y of [2024, 2025, 2026]) {
      const { start, end } = cpPeriodISO(y);
      expect(start).toBe(`${y}-01-01`);
      expect(end).toBe(`${y}-12-31`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. sortLeaveGroups(groups)
// ─────────────────────────────────────────────────────────────────────────────
describe('sortLeaveGroups (leave-requests.js)', () => {
  const g = (status, iso) => ({ status, slots: [{ iso }] });

  it('pending avant approved avant rejected', () => {
    const groups = [g('rejected', '2026-07-08'), g('pending', '2026-07-06'), g('approved', '2026-07-07')];
    const sorted = sortLeaveGroups(groups);
    expect(sorted[0].status).toBe('pending');
    expect(sorted[1].status).toBe('approved');
    expect(sorted[2].status).toBe('rejected');
  });

  it('même statut : tri par date croissante', () => {
    const groups = [g('pending', '2026-07-10'), g('pending', '2026-07-06'), g('pending', '2026-07-01')];
    const sorted = sortLeaveGroups(groups);
    expect(sorted.map((x) => x.slots[0].iso)).toEqual(['2026-07-01', '2026-07-06', '2026-07-10']);
  });

  it("ne mute pas le tableau d'origine", () => {
    const groups = [g('approved', '2026-07-07'), g('pending', '2026-07-06')];
    const original = [groups[0].status, groups[1].status];
    sortLeaveGroups(groups);
    expect(groups[0].status).toBe(original[0]);
    expect(groups[1].status).toBe(original[1]);
  });

  it('tableau vide → tableau vide', () => {
    expect(sortLeaveGroups([])).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. getCPTakenDays(personId, startISO, endISO)
// ─────────────────────────────────────────────────────────────────────────────
describe('getCPTakenDays (leave-requests.js)', () => {
  beforeEach(resetStore);

  it('store vide → 0 jour pris', () => {
    expect(getCPTakenDays('marie', '2026-07-01', '2026-07-31')).toBe(0);
  });

  it('ASV avec 2 demi-journées CP → 1 jour', () => {
    setAbsent('2026-07-06', 'marie', 'M', 'Congé annuel');
    setAbsent('2026-07-06', 'marie', 'AM', 'Congé annuel');
    expect(getCPTakenDays('marie', '2026-07-01', '2026-07-31')).toBe(1);
  });

  it('ASV : absence Maladie ne consomme pas de CP', () => {
    setAbsent('2026-07-06', 'marie', 'M', 'Maladie');
    setAbsent('2026-07-06', 'marie', 'AM', 'Maladie');
    expect(getCPTakenDays('marie', '2026-07-01', '2026-07-31')).toBe(0);
  });

  it('absence hors plage de dates ignorée', () => {
    setAbsent('2026-08-01', 'marie', 'M', 'Congé annuel');
    setAbsent('2026-08-01', 'marie', 'AM', 'Congé annuel');
    expect(getCPTakenDays('marie', '2026-07-01', '2026-07-31')).toBe(0);
  });

  it('3 demi-journées CP → 1.5 jour', () => {
    setAbsent('2026-07-06', 'marie', 'M', 'Congé annuel');
    setAbsent('2026-07-06', 'marie', 'AM', 'Congé annuel');
    setAbsent('2026-07-07', 'marie', 'M', 'Congé annuel');
    expect(getCPTakenDays('marie', '2026-07-01', '2026-07-31')).toBe(1.5);
  });

  it("filtre par personId : absences d'une autre ASV ignorées", () => {
    setAbsent('2026-07-06', 'johanna', 'M', 'Congé annuel');
    setAbsent('2026-07-06', 'johanna', 'AM', 'Congé annuel');
    expect(getCPTakenDays('marie', '2026-07-01', '2026-07-31')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. getAbsenteeismRate(personId, year, month)
// ─────────────────────────────────────────────────────────────────────────────
describe('getAbsenteeismRate (leave-requests.js)', () => {
  beforeEach(resetStore);

  it('sans absences : rate=0, workingDays=22 pour juillet 2026', () => {
    // Juillet 2026 : 23 jours ouvrés - 1 férié (14 juillet) = 22 jours travaillables
    const { rate, absentDays, workingDays } = getAbsenteeismRate('marie', 2026, 6);
    expect(rate).toBe(0);
    expect(absentDays).toBe(0);
    expect(workingDays).toBe(22);
  });

  it('2 demi-journées absentes → absentDays=1', () => {
    setAbsent('2026-07-06', 'marie', 'M');
    setAbsent('2026-07-06', 'marie', 'AM');
    const { absentDays } = getAbsenteeismRate('marie', 2026, 6);
    expect(absentDays).toBe(1);
  });

  it('absence rejetée (ASV) non comptabilisée dans le taux', () => {
    setAbsent('2026-07-06', 'marie', 'M', null, 'rejected');
    setAbsent('2026-07-06', 'marie', 'AM', null, 'rejected');
    const { absentDays } = getAbsenteeismRate('marie', 2026, 6);
    expect(absentDays).toBe(0);
  });
});
