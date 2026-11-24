/**
 * Tests unitaires — Lots 6–11
 * Lot 6 : clôture de mois (isMonthClosed / setMonthClosed)
 * Lot 7 : prévisionnel ASV (getForecastWeek / setForecastWeek / getForecastSig / setForecastSig)
 * Lot 4 : maladie/accident sans approbation (isSickOrAccidentLabel)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// pwa.js utilise window.addEventListener au niveau module → incompatible jsdom
vi.mock('../../src/pwa.js', () => ({ triggerPushNotification: vi.fn() }));

import { store } from '../../src/store.js';
import {
  isMonthClosed,
  setMonthClosed,
  closedMonthKey,
  getForecastWeek,
  setForecastWeek,
  getForecastSig,
  setForecastSig,
  isForecastLocked,
  setForecastClosed,
  forecastClosedKey,
} from '../../src/slots.js';
import { isSickOrAccidentLabel } from '../../src/leave-requests.js';

function resetStore() {
  store.DATA = { version: 2, slots: {} };
}

// ── Lot 6 : clôture de mois (tri-état, bascule d'année) ───────────
// Date de verrou par défaut des feuilles 2026 : 31/01/2027 (asvLockDate).
describe('isMonthClosed / setMonthClosed (Lot 6)', () => {
  beforeEach(resetStore);
  const IN_YEAR = '2026-11-24';
  const AFTER_LOCK = '2027-02-15';

  it('retourne false par défaut en cours d’année', () => {
    expect(isMonthClosed(2026, 0, IN_YEAR)).toBe(false);
  });

  it('clé générée correctement', () => {
    expect(closedMonthKey(2026, 5)).toBe('closed_month_2026_5');
  });

  it('setMonthClosed(true) → isMonthClosed = true', () => {
    setMonthClosed(2026, 6, true, IN_YEAR);
    expect(isMonthClosed(2026, 6, IN_YEAR)).toBe(true);
  });

  it('setMonthClosed(false) → isMonthClosed = false', () => {
    setMonthClosed(2026, 6, true, IN_YEAR);
    setMonthClosed(2026, 6, false, IN_YEAR);
    expect(isMonthClosed(2026, 6, IN_YEAR)).toBe(false);
  });

  it('clôture isolée — les autres mois restent ouverts', () => {
    setMonthClosed(2026, 5, true, IN_YEAR);
    expect(isMonthClosed(2026, 4, IN_YEAR)).toBe(false);
    expect(isMonthClosed(2026, 6, IN_YEAR)).toBe(false);
  });

  it('réouverture en cours d’année : la clé est retirée, le mois se verrouillera de lui-même', () => {
    setMonthClosed(2026, 0, true, IN_YEAR);
    setMonthClosed(2026, 0, false, IN_YEAR);
    expect(store.DATA.slots[closedMonthKey(2026, 0)]).toBeUndefined();
    expect(isMonthClosed(2026, 0, AFTER_LOCK)).toBe(true);
  });

  it('après la date de verrou, un mois sans réglage est verrouillé', () => {
    expect(isMonthClosed(2026, 11, AFTER_LOCK)).toBe(true);
    expect(isMonthClosed(2027, 0, AFTER_LOCK)).toBe(false);
  });

  it('réouverture après la date de verrou : écrit « false », qui l’emporte sur le verrou', () => {
    setMonthClosed(2026, 11, false, AFTER_LOCK);
    expect(store.DATA.slots[closedMonthKey(2026, 11)]).toBe('false');
    expect(isMonthClosed(2026, 11, AFTER_LOCK)).toBe(false);
  });

  it('re-clôture d’un mois rouvert : écrit « true »', () => {
    setMonthClosed(2026, 11, false, AFTER_LOCK);
    setMonthClosed(2026, 11, true, AFTER_LOCK);
    expect(store.DATA.slots[closedMonthKey(2026, 11)]).toBe('true');
    expect(isMonthClosed(2026, 11, AFTER_LOCK)).toBe(true);
  });
});

// ── Prévisionnel figé à la bascule (forecast_closed_<Y>, tri-état) ──
describe('isForecastLocked / setForecastClosed', () => {
  beforeEach(resetStore);

  it('le prévisionnel 2027 est ouvert avant la bascule, figé à partir du lundi 28/12/2026', () => {
    expect(isForecastLocked(2027, '2026-12-27')).toBe(false);
    expect(isForecastLocked(2027, '2026-12-28')).toBe(true);
  });

  it('rouvrir une année figée écrit « false », figer à nouveau écrit « true »', () => {
    setForecastClosed(2027, false, '2027-02-01');
    expect(store.DATA.slots[forecastClosedKey(2027)]).toBe('false');
    expect(isForecastLocked(2027, '2027-02-01')).toBe(false);
    setForecastClosed(2027, true, '2027-02-01');
    expect(store.DATA.slots[forecastClosedKey(2027)]).toBe('true');
    expect(isForecastLocked(2027, '2027-02-01')).toBe(true);
  });

  it('rouvrir avant la bascule retire la clé : le gel par défaut s’appliquera', () => {
    setForecastClosed(2027, true, '2026-11-24');
    setForecastClosed(2027, false, '2026-11-24');
    expect(store.DATA.slots[forecastClosedKey(2027)]).toBeUndefined();
    expect(isForecastLocked(2027, '2027-01-01')).toBe(true);
  });
});

// ── Lot 7 : prévisionnel ASV ──────────────────────────────────────
describe('getForecastWeek / setForecastWeek (Lot 7)', () => {
  beforeEach(resetStore);

  const PID = 'noemie';
  const MONDAY = '2027-01-06';

  it('retourne null par défaut', () => {
    expect(getForecastWeek(PID, MONDAY)).toBeNull();
  });

  it('stocke des heures numériques (en string)', () => {
    setForecastWeek(PID, MONDAY, 35);
    expect(getForecastWeek(PID, MONDAY)).toBe('35');
  });

  it('stocke le marqueur CP', () => {
    setForecastWeek(PID, MONDAY, 'CP');
    expect(getForecastWeek(PID, MONDAY)).toBe('CP');
  });

  it('null supprime la clé', () => {
    setForecastWeek(PID, MONDAY, 42);
    setForecastWeek(PID, MONDAY, null);
    expect(getForecastWeek(PID, MONDAY)).toBeNull();
  });

  it('chaîne vide supprime la clé', () => {
    setForecastWeek(PID, MONDAY, '35');
    setForecastWeek(PID, MONDAY, '');
    expect(getForecastWeek(PID, MONDAY)).toBeNull();
  });

  it('semaines isolées — différentes personnes indépendantes', () => {
    setForecastWeek('carla', MONDAY, 'CP');
    setForecastWeek(PID, MONDAY, 35);
    expect(getForecastWeek('carla', MONDAY)).toBe('CP');
    expect(getForecastWeek(PID, MONDAY)).toBe('35');
  });
});

describe('getForecastSig / setForecastSig (Lot 7)', () => {
  beforeEach(resetStore);

  const PID = 'noemie';
  const YEAR = 2027;
  const SIG = { signedAt: '2026-12-01T10:00:00.000Z', signedBy: 'noemie@amivet.fr' };

  it('retourne null par défaut', () => {
    expect(getForecastSig(PID, YEAR)).toBeNull();
  });

  it('stocke et restitue la signature', () => {
    setForecastSig(PID, YEAR, SIG);
    const result = getForecastSig(PID, YEAR);
    expect(result.signedAt).toBe(SIG.signedAt);
    expect(result.signedBy).toBe(SIG.signedBy);
  });

  it('null supprime la signature', () => {
    setForecastSig(PID, YEAR, SIG);
    setForecastSig(PID, YEAR, null);
    expect(getForecastSig(PID, YEAR)).toBeNull();
  });

  it('JSON invalide en store → retourne null (robustesse)', () => {
    store.DATA.slots[`forecast_sig_${PID}_${YEAR}`] = 'invalid{json';
    expect(getForecastSig(PID, YEAR)).toBeNull();
  });
});

// ── Lot 4 : maladie/accident sans approbation ─────────────────────
describe('isSickOrAccidentLabel (Lot 4)', () => {
  it('reconnaît "Maladie"', () => {
    expect(isSickOrAccidentLabel('Maladie')).toBe(true);
  });

  it('reconnaît "Arrêt maladie"', () => {
    expect(isSickOrAccidentLabel('Arrêt maladie')).toBe(true);
  });

  it('reconnaît "Arrêt"', () => {
    expect(isSickOrAccidentLabel('Arrêt')).toBe(true);
  });

  it('reconnaît "Accident du travail"', () => {
    expect(isSickOrAccidentLabel('Accident du travail')).toBe(true);
  });

  it('reconnaît "accident" (minuscules)', () => {
    expect(isSickOrAccidentLabel('accident')).toBe(true);
  });

  it('insensible à la casse', () => {
    expect(isSickOrAccidentLabel('MALADIE')).toBe(true);
    expect(isSickOrAccidentLabel('ACCIDENT')).toBe(true);
  });

  it('retourne false pour un congé ordinaire', () => {
    expect(isSickOrAccidentLabel('Congé annuel')).toBe(false);
  });

  it('retourne false pour une chaîne vide', () => {
    expect(isSickOrAccidentLabel('')).toBe(false);
  });

  it('retourne false pour undefined/null', () => {
    expect(isSickOrAccidentLabel(undefined)).toBe(false);
    expect(isSickOrAccidentLabel(null)).toBe(false);
  });
});
