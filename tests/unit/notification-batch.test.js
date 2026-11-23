import { describe, it, expect } from 'vitest';
import { mergeHalfDayRanges, formatHalfDayRange } from '../../src/lib/notification-batch.js';

const fmt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const hd = (iso, slot) => ({ iso, slot });

describe('regroupement des notifications de congé', () => {
  it('une semaine saisie demi-journée par demi-journée → une seule plage', () => {
    const slots = [];
    for (const d of ['01', '02', '03', '04', '05']) slots.push(hd(`2026-12-${d}`, 'M'), hd(`2026-12-${d}`, 'AM'));
    const r = mergeHalfDayRanges(slots.reverse());
    expect(r).toHaveLength(1);
    expect(r[0].count).toBe(10);
    expect(formatHalfDayRange(r[0], fmt)).toBe('du 01/12 au 05/12');
  });
  it('samedi après-midi puis lundi matin : le dimanche ne coupe pas', () => {
    const r = mergeHalfDayRanges([hd('2026-12-05', 'AM'), hd('2026-12-07', 'M')]);
    expect(r).toHaveLength(1);
    expect(formatHalfDayRange(r[0], fmt)).toBe('du 05/12 (A-m.) au 07/12 (Mat.)');
  });
  it('dates non consécutives → plages séparées', () => {
    const r = mergeHalfDayRanges([hd('2026-12-01', 'M'), hd('2026-12-03', 'M'), hd('2026-12-03', 'AM')]);
    expect(r.map((x) => formatHalfDayRange(x, fmt))).toEqual(['01/12 (Mat.)', '03/12']);
  });
  it('matin puis après-midi du lendemain : un trou (après-midi du jour 1) coupe la plage', () => {
    expect(mergeHalfDayRanges([hd('2026-12-01', 'M'), hd('2026-12-02', 'AM')])).toHaveLength(2);
  });
  it('les doublons ne comptent qu’une fois', () => {
    expect(mergeHalfDayRanges([hd('2026-12-01', 'M'), hd('2026-12-01', 'M')])[0].count).toBe(1);
  });
  it('à cheval sur deux mois et deux années', () => {
    const r = mergeHalfDayRanges([hd('2026-12-31', 'AM'), hd('2027-01-01', 'M')]);
    expect(r).toHaveLength(1);
  });
});
