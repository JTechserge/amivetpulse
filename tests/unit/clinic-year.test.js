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

  describe('clinicCurrentYear', () => {
    it('sans réglage, bascule au 01/01', () => {
      expect(m.clinicCurrentYear('2026-12-31', {})).toBe(2026);
      expect(m.clinicCurrentYear('2027-01-01', {})).toBe(2027);
    });
    it('date anticipée : rollover_date_2027 = 2026-12-15', () => {
      const slots = { rollover_date_2027: '2026-12-15' };
      expect(m.clinicCurrentYear('2026-12-14', slots)).toBe(2026);
      expect(m.clinicCurrentYear('2026-12-15', slots)).toBe(2027);
    });
    it('date retardée : rollover_date_2027 = 2027-01-10', () => {
      const slots = { rollover_date_2027: '2027-01-10' };
      expect(m.clinicCurrentYear('2027-01-09', slots)).toBe(2026);
      expect(m.clinicCurrentYear('2027-01-10', slots)).toBe(2027);
    });
    it('date hors bornes ou invalide → ignorée, défaut 01/01', () => {
      for (const v of ['2026-11-30', '2027-02-01', '2027-02-30', 'demain', 20270105, null]) {
        expect(m.clinicCurrentYear('2027-01-01', { rollover_date_2027: v })).toBe(2027);
      }
    });
    it('sans slots du tout (null) → défaut', () => {
      expect(m.clinicCurrentYear('2027-03-01', null)).toBe(2027);
    });
  });

  describe('isAsvMonthLocked — feuilles ASV de l’année écoulée', () => {
    it('décembre 2026 reste ouvert jusqu’au 30/01/2027, verrouillé le 31/01 (délai de grâce)', () => {
      expect(m.isAsvMonthLocked({}, '2027-01-30', 2026, 11)).toBe(false);
      expect(m.isAsvMonthLocked({}, '2027-01-31', 2026, 11)).toBe(true);
    });
    it('les 12 mois de 2026 sont verrouillés après la date de verrou', () => {
      for (let mo = 0; mo < 12; mo++) expect(m.isAsvMonthLocked({}, '2027-02-01', 2026, mo)).toBe(true);
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
    it('asv_lock_date_2027 réglée au 2027-01-10 → verrou avancé', () => {
      const slots = { asv_lock_date_2027: '2027-01-10' };
      expect(m.isAsvMonthLocked(slots, '2027-01-09', 2026, 11)).toBe(false);
      expect(m.isAsvMonthLocked(slots, '2027-01-10', 2026, 11)).toBe(true);
    });
    it('verrou jamais avant la bascule : lock 05/01 mais bascule 20/01 → verrou le 20/01', () => {
      const slots = { asv_lock_date_2027: '2027-01-05', rollover_date_2027: '2027-01-20' };
      expect(m.isAsvMonthLocked(slots, '2027-01-19', 2026, 11)).toBe(false);
      expect(m.isAsvMonthLocked(slots, '2027-01-20', 2026, 11)).toBe(true);
    });
    it('asv_lock_date hors bornes → défaut 31/01', () => {
      const slots = { asv_lock_date_2027: '2027-04-01' };
      expect(m.isAsvMonthLocked(slots, '2027-01-31', 2026, 11)).toBe(true);
    });
  });

  describe('isForecastYearLocked — prévisionnel ASV figé', () => {
    it('le prévisionnel 2027 est modifiable en 2026, figé dès la bascule', () => {
      expect(m.isForecastYearLocked({}, '2026-12-31', 2027)).toBe(false);
      expect(m.isForecastYearLocked({}, '2027-01-01', 2027)).toBe(true);
    });
    it('le prévisionnel de l’année suivante (2028) reste ouvert', () => {
      expect(m.isForecastYearLocked({}, '2027-01-01', 2028)).toBe(false);
    });
    it('suit une bascule anticipée', () => {
      expect(m.isForecastYearLocked({ rollover_date_2027: '2026-12-15' }, '2026-12-15', 2027)).toBe(true);
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
