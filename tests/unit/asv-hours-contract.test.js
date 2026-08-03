import { describe, it, expect } from 'vitest';
import {
  timeToMins,
  getShiftType,
  getSlotShiftType,
  getSlotNominalH,
  getDayNominalH,
  getDayAllOtH,
  getDayDeficitH,
  getLegacyOtH,
} from '../../src/lib/asv-hours.js';
import { ASV_STD_SAT_CARLA } from '../../src/config.js';

// Tests de contrat : vérifient les valeurs que le module partagé doit produire
// pour que le front (src/lib/asv-hours.js) et la Edge Function
// (supabase/functions/_shared/asv-hours.ts) soient en accord.
// Toute divergence ici = désaccord potentiel dans les récapitulatifs email.

const ISO_SAT = '2026-07-11'; // samedi (wd=6)
const ISO_MON = '2026-07-07'; // lundi  (wd=1)

function s(iso, pid, key, val) {
  return { [`${iso}_${pid}_${key}`]: val };
}

// Construit un objet slots avec état 'present' pour les créneaux donnés
function present(iso, pid, ...slots) {
  return Object.assign({}, ...slots.map((slot) => s(iso, pid, slot, 'present')));
}

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

describe('getSlotShiftType', () => {
  it('retourne O par défaut (fallback getShiftType)', () => {
    expect(getSlotShiftType({}, ISO_MON, 'alice', 'M')).toBe('O');
    expect(getSlotShiftType({}, ISO_MON, 'alice', 'AM')).toBe('O');
  });
  it('utilise la clé par demi-journée si présente', () => {
    expect(getSlotShiftType(s(ISO_MON, 'alice', 'M_shift', 'F'), ISO_MON, 'alice', 'M')).toBe('F');
    expect(getSlotShiftType(s(ISO_MON, 'alice', 'AM_shift', 'D'), ISO_MON, 'alice', 'AM')).toBe('D');
  });
  it('M et AM peuvent avoir des types différents', () => {
    const slots = { ...s(ISO_MON, 'alice', 'M_shift', 'O'), ...s(ISO_MON, 'alice', 'AM_shift', 'D') };
    expect(getSlotShiftType(slots, ISO_MON, 'alice', 'M')).toBe('O');
    expect(getSlotShiftType(slots, ISO_MON, 'alice', 'AM')).toBe('D');
  });
  it('fallback vers clé jour si pas de clé demi-journée', () => {
    const slots = s(ISO_MON, 'alice', 'shift', 'F');
    expect(getSlotShiftType(slots, ISO_MON, 'alice', 'M')).toBe('F');
    expect(getSlotShiftType(slots, ISO_MON, 'alice', 'AM')).toBe('F');
  });
});

describe('getSlotNominalH', () => {
  it('Ouverture Mat. → 4.5h', () => {
    expect(getSlotNominalH({}, ISO_MON, 'alice', 'M', 1)).toBe(4.5);
  });
  it('Ouverture A-m. → 4.0h', () => {
    expect(getSlotNominalH({}, ISO_MON, 'alice', 'AM', 1)).toBe(4.0);
  });
  it('Fermeture Mat. → 4.0h', () => {
    expect(getSlotNominalH(s(ISO_MON, 'alice', 'M_shift', 'F'), ISO_MON, 'alice', 'M', 1)).toBe(4.0);
  });
  it('Fermeture A-m. → 4.25h', () => {
    expect(getSlotNominalH(s(ISO_MON, 'alice', 'AM_shift', 'F'), ISO_MON, 'alice', 'AM', 1)).toBe(4.25);
  });
  it('Demi-j. Mat. → 4.0h', () => {
    expect(getSlotNominalH(s(ISO_MON, 'alice', 'M_shift', 'D'), ISO_MON, 'alice', 'M', 1)).toBe(4.0);
  });
  it('Demi-j. A-m. → 4.0h', () => {
    expect(getSlotNominalH(s(ISO_MON, 'alice', 'AM_shift', 'D'), ISO_MON, 'alice', 'AM', 1)).toBe(4.0);
  });
  it('Carla samedi Mat. → valeur contractuelle de config.js', () => {
    // Assertion contre la SOURCE DE VÉRITÉ, jamais contre un littéral : c'est un
    // 7.25 recopié ici qui avait entériné 10 min d'écart par samedi entre le
    // tableau de bord et la feuille signée.
    expect(getSlotNominalH({}, ISO_SAT, 'carla', 'M', 6)).toBeCloseTo(ASV_STD_SAT_CARLA, 10);
  });
  it('autre ASV samedi Mat. → 7.0h', () => {
    expect(getSlotNominalH({}, ISO_SAT, 'alice', 'M', 6)).toBe(7.0);
  });
  it('samedi A-m. → 0h (non travaillé)', () => {
    expect(getSlotNominalH({}, ISO_SAT, 'carla', 'AM', 6)).toBe(0);
    expect(getSlotNominalH({}, ISO_SAT, 'alice', 'AM', 6)).toBe(0);
  });
});

describe('getDayNominalH — modèle presence-aware (Lot 2)', () => {
  it('aucun créneau présent → 0h', () => {
    expect(getDayNominalH({}, ISO_MON, 'carla', 1)).toBe(0);
    expect(getDayNominalH({}, ISO_SAT, 'carla', 6)).toBe(0);
  });
  it('journée complète Ouverture → 8.5h (4.5+4.0)', () => {
    expect(getDayNominalH(present(ISO_MON, 'alice', 'M', 'AM'), ISO_MON, 'alice', 1)).toBe(8.5);
  });
  it('journée complète Fermeture → 8.25h (4.0+4.25)', () => {
    const slots = { ...present(ISO_MON, 'alice', 'M', 'AM'), ...s(ISO_MON, 'alice', 'shift', 'F') };
    expect(getDayNominalH(slots, ISO_MON, 'alice', 1)).toBeCloseTo(8.25);
  });
  it('Mat. seul Ouverture → 4.5h', () => {
    expect(getDayNominalH(present(ISO_MON, 'alice', 'M'), ISO_MON, 'alice', 1)).toBe(4.5);
  });
  it('A-m. seul Fermeture → 4.25h', () => {
    const slots = { ...present(ISO_MON, 'alice', 'AM'), ...s(ISO_MON, 'alice', 'AM_shift', 'F') };
    expect(getDayNominalH(slots, ISO_MON, 'alice', 1)).toBe(4.25);
  });
  it('Carla samedi Mat. présent → valeur contractuelle de config.js', () => {
    expect(getDayNominalH(present(ISO_SAT, 'carla', 'M'), ISO_SAT, 'carla', 6)).toBeCloseTo(
      ASV_STD_SAT_CARLA,
      10
    );
  });
  it('autre ASV samedi Mat. présent → 7.0h', () => {
    expect(getDayNominalH(present(ISO_SAT, 'alice', 'M'), ISO_SAT, 'alice', 6)).toBe(7.0);
  });
});

describe('getDayAllOtH — compteur plus_mins (Lot 3)', () => {
  it('retourne 0 sans données', () => {
    expect(getDayAllOtH({}, ISO_MON, 'alice')).toBe(0);
  });
  it('lit la clé plus_mins', () => {
    expect(getDayAllOtH(s(ISO_MON, 'alice', 'plus_mins', '60'), ISO_MON, 'alice')).toBe(1);
  });
  it('15 min → 0.25h', () => {
    expect(getDayAllOtH(s(ISO_MON, 'alice', 'plus_mins', '15'), ISO_MON, 'alice')).toBeCloseTo(0.25);
  });
});

describe('getDayDeficitH — compteur minus_mins (Lot 3)', () => {
  it('retourne 0 sans données', () => {
    expect(getDayDeficitH({}, ISO_MON, 'alice')).toBe(0);
  });
  it('lit la clé minus_mins', () => {
    expect(getDayDeficitH(s(ISO_MON, 'alice', 'minus_mins', '30'), ISO_MON, 'alice')).toBeCloseTo(0.5);
  });
  it('ne peut pas être négatif (min 0)', () => {
    expect(getDayDeficitH({}, ISO_MON, 'alice')).toBe(0);
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

// ─── Garde-fou : 7h25 n'est pas 7,25 h ───────────────────────────────────────

describe('cohérence de l\'heure du samedi de Carla', () => {
  it('vaut 7 h 25 min, et surtout PAS 7,25 h', () => {
    // Le piège qui a produit la divergence : « 7h25 » lu comme un décimal.
    // 7.25 h = 7 h 15 min, soit 10 minutes de moins par samedi.
    expect(ASV_STD_SAT_CARLA).toBeCloseTo(7 + 25 / 60, 10);
    expect(ASV_STD_SAT_CARLA).not.toBeCloseTo(7.25, 4);
    expect(Math.round((ASV_STD_SAT_CARLA - 7) * 60)).toBe(25);
  });

  it('le module partagé et config.js donnent la même heure', () => {
    // Si ce test casse, le miroir Deno a divergé de la source de vérité :
    // le tableau de bord et la feuille signée ne comptent plus pareil.
    expect(getSlotNominalH({}, ISO_SAT, 'carla', 'M', 6)).toBeCloseTo(ASV_STD_SAT_CARLA, 10);
  });
});
