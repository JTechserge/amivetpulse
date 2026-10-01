import { describe, it, expect } from 'vitest';
import { forecastAccess, defaultForecastPid } from '../../src/lib/forecast-access.js';

// Prévisionnel ASV : toutes les fiches sont visibles, une ASV ne modifie que la
// sienne. « canEditPerson » est le résultat de canEditSlot(pid) (app.js), seule
// règle de droits du planning ; elle n'est pas recopiée ici.

describe('forecastAccess', () => {
  it("met en consultation seule la fiche d'une collègue", () => {
    const a = forecastAccess({ canEditPerson: false, signed: false, role: 'asv' });
    expect(a.readOnly).toBe(true);
    expect(a.consultOnly).toBe(true);
  });

  it('laisse une ASV modifier sa propre fiche non signée', () => {
    const a = forecastAccess({ canEditPerson: true, signed: false, role: 'asv' });
    expect(a.readOnly).toBe(false);
    expect(a.consultOnly).toBe(false);
  });

  it('fige une fiche signée, même pour sa titulaire et pour un associé', () => {
    expect(forecastAccess({ canEditPerson: true, signed: true, role: 'asv' }).readOnly).toBe(true);
    expect(forecastAccess({ canEditPerson: true, signed: true, role: 'vet' }).readOnly).toBe(true);
  });

  it("ne propose la demande de signature qu'aux associés et à l'admin, sur une fiche non signée", () => {
    expect(forecastAccess({ canEditPerson: true, signed: false, role: 'asv' }).canRequestSignature).toBe(false);
    expect(forecastAccess({ canEditPerson: true, signed: false, role: 'vet_employe' }).canRequestSignature).toBe(false);
    expect(forecastAccess({ canEditPerson: true, signed: false, role: 'vet' }).canRequestSignature).toBe(true);
    expect(forecastAccess({ canEditPerson: true, signed: false, role: 'admin' }).canRequestSignature).toBe(true);
    expect(forecastAccess({ canEditPerson: true, signed: true, role: 'admin' }).canRequestSignature).toBe(false);
  });

  it("réserve l'annulation d'une signature aux associés et à l'admin", () => {
    expect(forecastAccess({ canEditPerson: true, signed: true, role: 'asv' }).canUnsign).toBe(false);
    expect(forecastAccess({ canEditPerson: true, signed: true, role: 'vet' }).canUnsign).toBe(true);
  });
});

describe('defaultForecastPid', () => {
  const people = [{ id: 'marie' }, { id: 'old', archived: true }, { id: 'johanna' }, { id: 'julie' }];

  it('ouvre sur la fiche de l’ASV connectée', () => {
    expect(defaultForecastPid(people, (pid) => pid === 'julie')).toBe('julie');
  });

  it('ouvre sur la première ASV active quand rien n’est modifiable', () => {
    expect(defaultForecastPid(people, () => false)).toBe('marie');
  });

  it('ignore une ASV archivée, même modifiable', () => {
    expect(defaultForecastPid(people, (pid) => pid === 'old')).toBe('marie');
  });
});
