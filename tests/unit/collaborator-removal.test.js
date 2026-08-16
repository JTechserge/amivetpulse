import { describe, it, expect } from 'vitest';
import {
  countCollaboratorFootprint,
  requiresSecondConfirmation,
  removalSummaryLines,
} from '../../src/lib/collaborator-removal.js';

describe('countCollaboratorFootprint — à qui appartient une clé', () => {
  it("n'attribue à une personne que les clés dont elle est le person_id", () => {
    const slots = {
      '2026-01-05_alice_M': 'present',
      '2026-01-05_alice_AM': 'absent',
      '2026-01-05_bob_M': 'present',
    };
    const r = countCollaboratorFootprint({ slots, personId: 'alice' });
    expect(r.planningKeys.sort()).toEqual(['2026-01-05_alice_AM', '2026-01-05_alice_M']);
    expect(r.halfDays).toBe(2);
  });

  it('ne confond pas un identifiant avec un autre dont il est le préfixe', () => {
    const slots = {
      '2026-01-05_julie_M': 'present',
      '2026-01-05_julie-2_M': 'present',
    };
    expect(countCollaboratorFootprint({ slots, personId: 'julie' }).halfDays).toBe(1);
    expect(countCollaboratorFootprint({ slots, personId: 'julie-2' }).halfDays).toBe(1);
  });

  it('compte les clés dérivées dans planningKeys mais pas dans halfDays', () => {
    const slots = {
      '2026-01-05_alice_M': 'absent',
      '2026-01-05_alice_M_label': 'Congé payé',
      'forecast_alice_2026-01-05': 'O',
      forecast_sig_alice_2026: 'signed',
    };
    const r = countCollaboratorFootprint({ slots, personId: 'alice' });
    expect(r.planningKeys).toHaveLength(4);
    expect(r.halfDays).toBe(1);
  });

  it('renvoie une empreinte vide sans personId', () => {
    const slots = { '2026-01-05_alice_M': 'present' };
    expect(countCollaboratorFootprint({ slots, personId: '' })).toEqual({
      planningKeys: [],
      halfDays: 0,
      signedMonths: 0,
      interviews: 0,
    });
  });

  it('tolère des entrées absentes', () => {
    const r = countCollaboratorFootprint({ personId: 'alice' });
    expect(r).toEqual({ planningKeys: [], halfDays: 0, signedMonths: 0, interviews: 0 });
  });
});

describe('countCollaboratorFootprint — mois signés et entretiens', () => {
  it('ne compte que les signatures de la personne visée', () => {
    const signatureKeys = new Set(['alice|2026|0', 'alice|2026|1', 'bob|2026|0']);
    expect(countCollaboratorFootprint({ signatureKeys, personId: 'alice' }).signedMonths).toBe(2);
    expect(countCollaboratorFootprint({ signatureKeys, personId: 'bob' }).signedMonths).toBe(1);
  });

  it("n'attribue pas une signature à un identifiant qui n'en est qu'un préfixe", () => {
    const signatureKeys = new Set(['julie|2026|0']);
    expect(countCollaboratorFootprint({ signatureKeys, personId: 'ju' }).signedMonths).toBe(0);
  });

  it('ignore une clé de signature malformée au lieu de la rattacher par troncature', () => {
    const signatureKeys = new Set(['juli']);
    expect(countCollaboratorFootprint({ signatureKeys, personId: 'juli' }).signedMonths).toBe(0);
  });

  it('compte les entretiens annuels de la personne', () => {
    const interviews = [
      { person_id: 'alice', year: 2025 },
      { person_id: 'alice', year: 2026 },
      { person_id: 'bob', year: 2026 },
    ];
    expect(countCollaboratorFootprint({ interviews, personId: 'alice' }).interviews).toBe(2);
  });
});

describe('requiresSecondConfirmation', () => {
  it('exige un second palier dès qu’un mois est signé', () => {
    expect(requiresSecondConfirmation({ signedMonths: 1 })).toBe(true);
  });

  it("n'exige rien quand aucun mois n'est signé, même avec du planning", () => {
    expect(requiresSecondConfirmation({ halfDays: 300, signedMonths: 0, interviews: 4 })).toBe(false);
  });

  it('tolère une empreinte absente', () => {
    expect(requiresSecondConfirmation(undefined)).toBe(false);
  });
});

describe('removalSummaryLines', () => {
  it('accorde le singulier et le pluriel', () => {
    expect(removalSummaryLines({ halfDays: 1, signedMonths: 1, interviews: 1 })).toEqual([
      '1 demi-journée saisie',
      '1 mois signé',
      '1 entretien annuel',
    ]);
    expect(removalSummaryLines({ halfDays: 2, signedMonths: 3, interviews: 4 })).toEqual([
      '2 demi-journées saisies',
      '3 mois signés',
      '4 entretiens annuels',
    ]);
  });

  it('omet les natures absentes', () => {
    expect(removalSummaryLines({ halfDays: 5 })).toEqual(['5 demi-journées saisies']);
  });

  it('annonce explicitement une empreinte vide', () => {
    expect(removalSummaryLines({ halfDays: 0, signedMonths: 0, interviews: 0 })).toEqual(['Aucune donnée enregistrée']);
  });
});
