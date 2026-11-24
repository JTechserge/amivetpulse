import { describe, it, expect } from 'vitest';
import {
  yearSettingsTargets,
  rolloverDateRejectReason,
  asvLockDateRejectReason,
  applyYearSettings,
} from '../../src/lib/year-settings.js';

describe('yearSettingsTargets — quelles clés l’écran des associés modifie', () => {
  it('en novembre 2026 : bascule vers 2027, verrou des feuilles 2026', () => {
    expect(yearSettingsTargets('2026-11-24', {})).toEqual({ rolloverYear: 2027, lockYear: 2027 });
  });
  it('en janvier 2027, verrou pas encore atteint : on peut encore régler asv_lock_date_2027', () => {
    expect(yearSettingsTargets('2027-01-10', {})).toEqual({ rolloverYear: 2028, lockYear: 2027 });
  });
  it('le 31/01/2027, verrou atteint : on passe au verrou suivant', () => {
    expect(yearSettingsTargets('2027-01-31', {})).toEqual({ rolloverYear: 2028, lockYear: 2028 });
  });
  it('bascule anticipée au 15/12/2026 : le 20/12 la bascule suivante est 2028', () => {
    const slots = { rollover_date_2027: '2026-12-15' };
    expect(yearSettingsTargets('2026-12-20', slots)).toEqual({ rolloverYear: 2028, lockYear: 2027 });
  });
});

describe('rolloverDateRejectReason', () => {
  const today = '2026-11-24';
  it('vide = retour au défaut, accepté', () => {
    expect(rolloverDateRejectReason('', 2027, today, {})).toBe('');
  });
  it('dans les bornes et à venir : accepté', () => {
    expect(rolloverDateRejectReason('2026-12-15', 2027, today, {})).toBe('');
    expect(rolloverDateRejectReason('2027-01-31', 2027, today, {})).toBe('');
  });
  it('hors bornes (01/12/2026 … 31/01/2027) : refusé', () => {
    expect(rolloverDateRejectReason('2026-11-30', 2027, today, {})).toMatch(/entre le 01\/12\/2026 et le 31\/01\/2027/);
    expect(rolloverDateRejectReason('2027-02-01', 2027, today, {})).toMatch(/entre le 01\/12\/2026 et le 31\/01\/2027/);
  });
  it('date invalide : refusée', () => {
    expect(rolloverDateRejectReason('2026-12-32', 2027, today, {})).not.toBe('');
  });
  it('date passée : refusée', () => {
    expect(rolloverDateRejectReason('2026-12-05', 2027, '2026-12-10', {})).toMatch(/passé/);
  });
  it('aujourd’hui : accepté (bascule immédiate)', () => {
    expect(rolloverDateRejectReason('2026-12-10', 2027, '2026-12-10', {})).toBe('');
  });
  it('bascule déjà atteinte : plus modifiable, comme save-planning', () => {
    const slots = { rollover_date_2027: '2026-12-15' };
    expect(rolloverDateRejectReason('2027-01-01', 2027, '2026-12-20', slots)).toMatch(/déjà/);
  });
});

describe('asvLockDateRejectReason', () => {
  const today = '2026-11-24';
  it('vide = défaut 31/01, accepté', () => {
    expect(asvLockDateRejectReason('', 2027, today, {})).toBe('');
  });
  it('dans les bornes : accepté', () => {
    expect(asvLockDateRejectReason('2027-02-15', 2027, today, {})).toBe('');
    expect(asvLockDateRejectReason('2027-03-31', 2027, today, {})).toBe('');
  });
  it('hors bornes (01/01 … 31/03/2027) : refusé', () => {
    expect(asvLockDateRejectReason('2027-04-01', 2027, today, {})).toMatch(/entre le 01\/01\/2027 et le 31\/03\/2027/);
    expect(asvLockDateRejectReason('2026-12-31', 2027, today, {})).toMatch(/entre le 01\/01\/2027 et le 31\/03\/2027/);
  });
  it('avant la bascule (réglée au 31/01) : refusé', () => {
    const slots = { rollover_date_2027: '2027-01-31' };
    expect(asvLockDateRejectReason('2027-01-15', 2027, today, slots)).toMatch(/bascule/);
  });
  it('date passée : refusée', () => {
    expect(asvLockDateRejectReason('2027-01-05', 2027, '2027-01-10', {})).toMatch(/passé/);
  });
  it('verrou déjà atteint : plus modifiable ici', () => {
    expect(asvLockDateRejectReason('2027-02-28', 2027, '2027-02-01', {})).toMatch(/déjà/);
  });
});

describe('applyYearSettings', () => {
  it('écrit les dates choisies', () => {
    const slots = { other: 'x' };
    applyYearSettings(slots, { rolloverYear: 2027, rollover: '2026-12-15', lockYear: 2027, lock: '2027-02-28' });
    expect(slots).toEqual({ other: 'x', rollover_date_2027: '2026-12-15', asv_lock_date_2027: '2027-02-28' });
  });
  it('vide = clé retirée (règle par défaut)', () => {
    const slots = { rollover_date_2027: '2026-12-15', asv_lock_date_2027: '2027-02-28' };
    applyYearSettings(slots, { rolloverYear: 2027, rollover: '', lockYear: 2027, lock: '' });
    expect(slots).toEqual({});
  });
  it('valeur égale au défaut = clé retirée aussi', () => {
    const slots = { rollover_date_2027: '2026-12-15' };
    applyYearSettings(slots, { rolloverYear: 2027, rollover: '2027-01-01', lockYear: 2027, lock: '2027-01-31' });
    expect(slots).toEqual({});
  });
  it('null = clé non touchée (champ verrouillé)', () => {
    const slots = { rollover_date_2027: '2026-12-15' };
    applyYearSettings(slots, { rolloverYear: 2027, rollover: null, lockYear: 2027, lock: '2027-02-28' });
    expect(slots).toEqual({ rollover_date_2027: '2026-12-15', asv_lock_date_2027: '2027-02-28' });
  });
});
