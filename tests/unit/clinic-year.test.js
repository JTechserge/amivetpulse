import { describe, it, expect } from 'vitest';
import * as front from '../../src/lib/clinic-year.js';
import * as edge from '../../supabase/functions/_shared/clinic-year.ts';

// Contrat front ↔ Edge Function : save-planning refuse les écritures selon ces
// règles, l'écran grise selon ces règles. Une divergence = un verrou qui ne
// tient qu'à l'affichage, ou un geste légitime refusé sans explication.

describe.each([
  ['front (src/lib/clinic-year.js)', front],
  ['Edge (supabase/functions/_shared/clinic-year.ts)', edge],
])('clinic-year — %s', (_label, m) => {
  describe('parisTodayIso — heure de Paris, pas celle de la machine', () => {
    it('31/12 à 23h59 Paris (22h59 UTC, hiver) → encore le 31/12', () => {
      expect(m.parisTodayIso(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31');
    });
    it('01/01 à 00h00 Paris (23h00 UTC la veille) → déjà le 01/01', () => {
      expect(m.parisTodayIso(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
    });
    it('heure d’été : 30/06 à 23h30 UTC → 01/07 à Paris', () => {
      expect(m.parisTodayIso(new Date('2027-06-30T23:30:00Z'))).toBe('2027-07-01');
    });
  });

  describe('rolloverDate — lundi de la semaine du 1er janvier, ou 1er lundi si week-end', () => {
    it.each([
      [2024, '2024-01-01', 'lundi → le 1er janvier lui-même'],
      [2030, '2029-12-31', 'mardi → lundi précédent'],
      [2025, '2024-12-30', 'mercredi → lundi précédent'],
      [2026, '2025-12-29', 'jeudi → lundi précédent'],
      [2027, '2026-12-28', 'vendredi → lundi précédent'],
      [2028, '2028-01-03', 'samedi → premier lundi de janvier'],
      [2023, '2023-01-02', 'dimanche → premier lundi de janvier'],
    ])('%i : %s (%s)', (year, expected) => {
      expect(m.rolloverDate({}, year)).toBe(expected);
    });
    it('les anciens réglages rollover_date_<Y> ne sont plus lus', () => {
      expect(m.rolloverDate({ rollover_date_2027: '2026-12-15' }, 2027)).toBe('2026-12-28');
    });
  });

  describe('clinicCurrentYear', () => {
    it('2027 (1er janvier un vendredi) : bascule dans la nuit du dimanche 27 au lundi 28/12/2026', () => {
      expect(m.clinicCurrentYear('2026-12-27', {})).toBe(2026);
      expect(m.clinicCurrentYear('2026-12-28', {})).toBe(2027);
      expect(m.clinicCurrentYear('2027-01-01', {})).toBe(2027);
    });
    it('2028 (1er janvier un samedi) : encore 2027 les 1er et 2 janvier, 2028 le lundi 3', () => {
      expect(m.clinicCurrentYear('2028-01-01', {})).toBe(2027);
      expect(m.clinicCurrentYear('2028-01-02', {})).toBe(2027);
      expect(m.clinicCurrentYear('2028-01-03', {})).toBe(2028);
    });
    it('2024 (1er janvier un lundi) : bascule le 1er janvier', () => {
      expect(m.clinicCurrentYear('2023-12-31', {})).toBe(2023);
      expect(m.clinicCurrentYear('2024-01-01', {})).toBe(2024);
    });
    it('en cours d’année : l’année civile', () => {
      expect(m.clinicCurrentYear('2027-06-15', {})).toBe(2027);
    });
    it('sans slots du tout (null) → même règle', () => {
      expect(m.clinicCurrentYear('2026-12-28', null)).toBe(2027);
    });
  });

  describe('isAsvMonthLocked — feuilles ASV de l’année écoulée', () => {
    it('décembre 2026 reste ouvert jusqu’au 14/01/2027, verrouillé le 15/01', () => {
      expect(m.isAsvMonthLocked({}, '2027-01-14', 2026, 11)).toBe(false);
      expect(m.isAsvMonthLocked({}, '2027-01-15', 2026, 11)).toBe(true);
    });
    it('décembre 2026 reste ouvert après la bascule du 28/12 (semaine à cheval à compléter)', () => {
      expect(m.isAsvMonthLocked({}, '2026-12-28', 2026, 11)).toBe(false);
    });
    it('les 12 mois de 2026 sont verrouillés après la date de verrou', () => {
      for (let mo = 0; mo < 12; mo++) expect(m.isAsvMonthLocked({}, '2027-01-15', 2026, mo)).toBe(true);
    });
    it('l’année courante n’est jamais verrouillée par défaut', () => {
      expect(m.isAsvMonthLocked({}, '2027-06-01', 2027, 0)).toBe(false);
    });
    it('clôture manuelle (closed_month = true) : verrouillé tout de suite, même en cours d’année', () => {
      expect(m.isAsvMonthLocked({ closed_month_2026_11: 'true' }, '2026-12-20', 2026, 11)).toBe(true);
    });
    it('réouverture par un associé (closed_month = false) : l’emporte sur le verrou par défaut', () => {
      expect(m.isAsvMonthLocked({ closed_month_2026_11: 'false' }, '2027-06-01', 2026, 11)).toBe(false);
    });
    it('les anciens réglages asv_lock_date_<Y> ne sont plus lus', () => {
      const slots = { asv_lock_date_2027: '2027-03-31' };
      expect(m.isAsvMonthLocked(slots, '2027-01-15', 2026, 11)).toBe(true);
    });
  });

  describe('isForecastYearLocked — prévisionnel ASV figé', () => {
    it('le prévisionnel 2027 est modifiable jusqu’au 27/12/2026, figé dès la bascule du 28/12', () => {
      expect(m.isForecastYearLocked({}, '2026-12-27', 2027)).toBe(false);
      expect(m.isForecastYearLocked({}, '2026-12-28', 2027)).toBe(true);
    });
    it('le prévisionnel de l’année suivante (2028) reste ouvert', () => {
      expect(m.isForecastYearLocked({}, '2027-01-01', 2028)).toBe(false);
    });
    it('réouvert par un associé (forecast_closed = false)', () => {
      expect(m.isForecastYearLocked({ forecast_closed_2027: 'false' }, '2027-03-01', 2027)).toBe(false);
    });
    it('figé à la main avant la bascule (forecast_closed = true)', () => {
      expect(m.isForecastYearLocked({ forecast_closed_2027: 'true' }, '2026-11-01', 2027)).toBe(true);
    });
  });

  describe('forecastWeekYear — rattachement par le jeudi', () => {
    it('lundi 28/12/2026 → jeudi 31/12 → 2026', () => {
      expect(m.forecastWeekYear('2026-12-28')).toBe(2026);
    });
    it('lundi 29/12/2025 → jeudi 01/01/2026 → 2026', () => {
      expect(m.forecastWeekYear('2025-12-29')).toBe(2026);
    });
    it('lundi 27/12/2027 → jeudi 30/12 → 2027', () => {
      expect(m.forecastWeekYear('2027-12-27')).toBe(2027);
    });
  });
});
