import { describe, it, expect } from 'vitest';
import {
  timeToMins,
  getShiftType,
  getDayNominalH,
  getDayAllOtH,
  getDayDeficitH,
  getLegacyOtH,
} from '../../src/lib/asv-hours.js';

// Tests de contrat : vérifient les valeurs que le module partagé doit produire
// pour que le front (src/lib/asv-hours.js) et la Edge Function
// (supabase/functions/_shared/asv-hours.ts) soient en accord.
// Toute divergence ici = désaccord potentiel dans les récapitulatifs email.

const ISO_SAT  = '2026-07-11'; // samedi (wd=6)
const ISO_MON  = '2026-07-07'; // lundi  (wd=1)

function s(iso, pid, key, val){ return { [`${iso}_${pid}_${key}`]: val }; }

describe('timeToMins', () => {
  it('convertit HH:MM en minutes', () => {
    expect(timeToMins('19:15')).toBe(19 * 60 + 15);
    expect(timeToMins('00:00')).toBe(0);
    expect(timeToMins('08:30')).toBe(510);
  });
});

describe('getShiftType', () => {
  it('retourne O par défaut', () => {
    expect(getShiftType({}, ISO_MON, 'alice')).toBe('O');
  });
  it('retourne F si clé _shift = F', () => {
    expect(getShiftType(s(ISO_MON, 'alice', 'shift', 'F'), ISO_MON, 'alice')).toBe('F');
  });
});

describe('getDayNominalH — bug Carla corrigé', () => {
  it('Carla samedi → 7.25h (contrat)', () => {
    expect(getDayNominalH({}, ISO_SAT, 'carla', 6)).toBe(7.25);
  });
  it('autre ASV samedi → 7.0h', () => {
    expect(getDayNominalH({}, ISO_SAT, 'marie', 6)).toBe(7.0);
    expect(getDayNominalH({}, ISO_SAT, 'alice', 6)).toBe(7.0);
  });
  it('semaine Ouverture → 8.5h', () => {
    expect(getDayNominalH({}, ISO_MON, 'carla', 1)).toBe(8.5);
    expect(getDayNominalH({}, ISO_MON, 'alice', 1)).toBe(8.5);
  });
  it('semaine Fermeture → 8.25h', () => {
    const slotsF = s(ISO_MON, 'alice', 'shift', 'F');
    expect(getDayNominalH(slotsF, ISO_MON, 'alice', 1)).toBe(8.25);
  });
});

describe('getDayAllOtH', () => {
  it('retourne 0 sans données', () => {
    expect(getDayAllOtH({}, ISO_MON, 'alice')).toBe(0);
  });
  it('additionne soirée + midi', () => {
    const slots = {
      ...s(ISO_MON, 'alice', 'ot_mins', '30'),
      ...s(ISO_MON, 'alice', 'lunch_ot_mins', '15'),
    };
    expect(getDayAllOtH(slots, ISO_MON, 'alice')).toBeCloseTo(0.75);
  });
  it('soirée seule', () => {
    expect(getDayAllOtH(s(ISO_MON, 'alice', 'ot_mins', '60'), ISO_MON, 'alice')).toBe(1);
  });
});

describe('getDayDeficitH', () => {
  it('retourne 0 sans départ anticipé', () => {
    expect(getDayDeficitH({}, ISO_MON, 'alice')).toBe(0);
  });
  it('calcule le déficit Ouverture (fin standard 19h00)', () => {
    const slots = s(ISO_MON, 'alice', 'early_dep', '18:30');
    expect(getDayDeficitH(slots, ISO_MON, 'alice')).toBeCloseTo(0.5);
  });
  it('calcule le déficit Fermeture (fin standard 19h15)', () => {
    const slots = {
      ...s(ISO_MON, 'alice', 'shift', 'F'),
      ...s(ISO_MON, 'alice', 'early_dep', '18:15'),
    };
    expect(getDayDeficitH(slots, ISO_MON, 'alice')).toBe(1);
  });
  it('départ après la fin standard → 0 (pas de négatif)', () => {
    const slots = s(ISO_MON, 'alice', 'early_dep', '20:00');
    expect(getDayDeficitH(slots, ISO_MON, 'alice')).toBe(0);
  });
});

describe('getLegacyOtH', () => {
  it('retourne 0 sans ancienne clé', () => {
    expect(getLegacyOtH({}, ISO_MON, 'alice')).toBe(0);
  });
  it('lit la clé _overtime', () => {
    expect(getLegacyOtH(s(ISO_MON, 'alice', 'overtime', '1.5'), ISO_MON, 'alice')).toBe(1.5);
  });
});
