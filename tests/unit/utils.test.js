import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  escapeHTML, slugifyName,
  hexToHsl, hexToRgba, colorRejectReason,
  fmtISO, daysInMonth, isoWeekday, isSunday, isSaturday,
  getFrenchHolidays, holidaysFor, holidayName,
  formatHHMM, signedHHMM, roundTo15min,
  asvFullName,
} from '../../src/utils.js';
import { ASV_PEOPLE } from '../../src/config.js';

// ================================================================
// escapeHTML
// ================================================================
describe('escapeHTML', () => {
  test('échappe &', () => expect(escapeHTML('a & b')).toBe('a &amp; b'));
  test('échappe <', () => expect(escapeHTML('<script>')).toBe('&lt;script&gt;'));
  test('échappe "', () => expect(escapeHTML('"hello"')).toBe('&quot;hello&quot;'));
  test("échappe '", () => expect(escapeHTML("it's")).toBe("it&#39;s"));
  test('les chaînes sûres passent inchangées', () => expect(escapeHTML('hello world 123')).toBe('hello world 123'));
  test('coerce les non-strings', () => expect(escapeHTML(42)).toBe('42'));
});

// ================================================================
// slugifyName
// ================================================================
describe('slugifyName', () => {
  test('nom simple', () => expect(slugifyName('Marie')).toBe('marie'));
  test('accents supprimés', () => expect(slugifyName('Élodie')).toBe('elodie'));
  test('espaces → tirets', () => expect(slugifyName('Jean Pierre')).toBe('jean-pierre'));
  test('tirets de début/fin supprimés', () => expect(slugifyName('  Marie  ')).toBe('marie'));
  test('chaîne vide → asv', () => expect(slugifyName('')).toBe('asv'));
  test('caractères spéciaux', () => expect(slugifyName('Marie-Laure')).toBe('marie-laure'));
});

// ================================================================
// hexToHsl
// ================================================================
describe('hexToHsl', () => {
  test('blanc pur → luminosité 100', () => {
    const { l } = hexToHsl('#ffffff');
    expect(l).toBeCloseTo(100, 0);
  });
  test('noir pur → luminosité 0', () => {
    const { l } = hexToHsl('#000000');
    expect(l).toBeCloseTo(0, 0);
  });
  test('rouge pur → teinte ~0', () => {
    const { h } = hexToHsl('#ff0000');
    expect(h).toBeCloseTo(0, 0);
  });
  test('vert pur → teinte ~120', () => {
    const { h } = hexToHsl('#00ff00');
    expect(h).toBeCloseTo(120, 0);
  });
  test('bleu pur → teinte ~240', () => {
    const { h } = hexToHsl('#0000ff');
    expect(h).toBeCloseTo(240, 0);
  });
});

// ================================================================
// colorRejectReason
// ================================================================
describe('colorRejectReason', () => {
  test('couleur invalide', () => expect(colorRejectReason('pas-une-couleur')).toBeTruthy());
  test('blanc rejeté (réservé cases vides)', () => expect(colorRejectReason('#ffffff')).toBeTruthy());
  test('rouge rejeté (réservé congés validés)', () => expect(colorRejectReason('#ff0000')).toBeTruthy());
  test('vert rejeté (réservé jours travaillés)', () => expect(colorRejectReason('#00ff00')).toBeTruthy());
  test('bleu marine rejeté (réservé congés en attente)', () => expect(colorRejectReason('#1a3a8c')).toBeTruthy());
  test('violet accepté (couleur neutre)', () => expect(colorRejectReason('#7C3AED')).toBeNull());
  test('rose foncé accepté', () => expect(colorRejectReason('#DB2777')).toBeNull());
  test('orange accepté', () => expect(colorRejectReason('#EA580C')).toBeNull());
});

// ================================================================
// hexToRgba
// ================================================================
describe('hexToRgba', () => {
  test('rouge 50% transparent', () => expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)'));
  test('blanc opaque', () => expect(hexToRgba('#ffffff', 1)).toBe('rgba(255,255,255,1)'));
  test('bleu opaque', () => expect(hexToRgba('#0000ff', 1)).toBe('rgba(0,0,255,1)'));
});

// ================================================================
// Utilitaires dates
// ================================================================
describe('fmtISO', () => {
  test('formate en YYYY-MM-DD', () => {
    expect(fmtISO(new Date(2026, 6, 12))).toBe('2026-07-12');
  });
  test('pad mois et jour', () => {
    expect(fmtISO(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('daysInMonth', () => {
  test('juillet = 31', () => expect(daysInMonth(2026, 6)).toBe(31));
  test('juin = 30', () => expect(daysInMonth(2026, 5)).toBe(30));
  test('février 2024 (bissextile) = 29', () => expect(daysInMonth(2024, 1)).toBe(29));
  test('février 2026 (non bissextile) = 28', () => expect(daysInMonth(2026, 1)).toBe(28));
});

describe('isoWeekday', () => {
  test('lundi 2026-07-13 → 0', () => expect(isoWeekday(new Date(2026, 6, 13))).toBe(0));
  test('vendredi 2026-07-10 → 4', () => expect(isoWeekday(new Date(2026, 6, 10))).toBe(4));
  test('samedi 2026-07-11 → 5', () => expect(isoWeekday(new Date(2026, 6, 11))).toBe(5));
  test('dimanche 2026-07-12 → 6', () => expect(isoWeekday(new Date(2026, 6, 12))).toBe(6));
});

describe('isSunday / isSaturday', () => {
  test('dimanche 2026-07-12', () => expect(isSunday(new Date(2026, 6, 12))).toBe(true));
  test('samedi 2026-07-11', () => expect(isSaturday(new Date(2026, 6, 11))).toBe(true));
  test('lundi n\'est pas dimanche', () => expect(isSunday(new Date(2026, 6, 13))).toBe(false));
  test('lundi n\'est pas samedi', () => expect(isSaturday(new Date(2026, 6, 13))).toBe(false));
});

// ================================================================
// Jours fériés
// ================================================================
describe('getFrenchHolidays / holidayName', () => {
  test('Jour de l\'An 2026', () => {
    const h = getFrenchHolidays(2026);
    expect(h['2026-01-01']).toBe("Jour de l'An");
  });
  test('Fête du Travail 2026', () => {
    const h = getFrenchHolidays(2026);
    expect(h['2026-05-01']).toBe('Fête du Travail');
  });
  test('Noël 2026', () => {
    const h = getFrenchHolidays(2026);
    expect(h['2026-12-25']).toBe('Noël');
  });
  test('Pâques 2026 est le 05 avril', () => {
    // Easter 2026 = April 5 → Lundi de Pâques = April 6
    const h = getFrenchHolidays(2026);
    expect(h['2026-04-06']).toBe('Lundi de Pâques');
  });
  test('holidayName retourne le nom', () => {
    expect(holidayName('2026-07-14')).toBe('Fête Nationale');
  });
  test('holidayName retourne null pour un jour ordinaire', () => {
    expect(holidayName('2026-07-13')).toBeNull();
  });
  test('holidaysFor met en cache (même référence)', () => {
    const a = holidaysFor(2026);
    const b = holidaysFor(2026);
    expect(a).toBe(b); // même objet (cache)
  });
});

// ================================================================
// Heures
// ================================================================
describe('formatHHMM', () => {
  test('8.5 → 8h30', () => expect(formatHHMM(8.5)).toBe('8h30'));
  test('8.25 → 8h15', () => expect(formatHHMM(8.25)).toBe('8h15'));
  test('0 → 0h00', () => expect(formatHHMM(0)).toBe('0h00'));
  test('négatif → abs', () => expect(formatHHMM(-1.5)).toBe('1h30'));
  test('7.75 → 7h45', () => expect(formatHHMM(7.75)).toBe('7h45'));
});

describe('signedHHMM', () => {
  test('0 → 0h00 (sans signe)', () => expect(signedHHMM(0)).toBe('0h00'));
  test('positif préfixé +', () => expect(signedHHMM(1.5)).toBe('+1h30'));
  test('négatif préfixé -', () => expect(signedHHMM(-1.25)).toBe('-1h15'));
});

describe('roundTo15min', () => {
  test('0.1 → 0 (arrondi à 0h)', () => expect(roundTo15min(0.1)).toBe(0));
  test('0.13 → 0.25 (arrondi à 15min)', () => expect(roundTo15min(0.13)).toBe(0.25));
  test('8.5 reste 8.5', () => expect(roundTo15min(8.5)).toBe(8.5));
  test('8.4 → 8.5 (arrondi à 30min)', () => expect(roundTo15min(8.4)).toBe(8.5));
  test('1.8 → 1.75 (arrondi à 45min)', () => expect(roundTo15min(1.8)).toBe(1.75));
});

// ================================================================
// asvFullName
// ================================================================
describe('asvFullName', () => {
  let savedMarie;
  beforeEach(() => {
    savedMarie = { ...ASV_PEOPLE.find(p => p.id === 'marie') };
  });
  afterEach(() => {
    const p = ASV_PEOPLE.find(p => p.id === 'marie');
    if(p){ p.lastName = savedMarie.lastName; }
  });

  test('sans nom de famille → prénom seul', () => {
    const p = ASV_PEOPLE.find(x => x.id === 'marie');
    if(p) delete p.lastName;
    expect(asvFullName('marie')).toBe('Marie');
  });
  test('avec nom de famille → "Prénom Nom"', () => {
    const p = ASV_PEOPLE.find(x => x.id === 'marie');
    if(p) p.lastName = 'Dupont';
    expect(asvFullName('marie')).toBe('Marie Dupont');
  });
  test('personId inconnu → renvoie le personId', () => {
    expect(asvFullName('inconnu')).toBe('inconnu');
  });
  test('lastName vide → prénom seul', () => {
    const p = ASV_PEOPLE.find(x => x.id === 'marie');
    if(p) p.lastName = '';
    expect(asvFullName('marie')).toBe('Marie');
  });
});
