/**
 * Contrat de l'écriture idempotente dans `feedback` (lot 4).
 *
 * Statuts et transitions attendus écrits EN DUR : le test pince le chemin de
 * la routine de l'extérieur, il n'importe pas les tables de production.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  planTransition,
  buildStatusPatch,
  interpretPatchOutcome,
  claimNote,
  ownsClaim,
  isStaleClaim,
  readEmergencyStop,
  EMERGENCY_STOP_FILE,
  STALE_CLAIM_HOURS,
} from '../../scripts/feedback-mark.mjs';

const AT = new Date('2026-08-17T08:00:00.000Z');
const ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('planTransition — le chemin de la routine, et rien d autre', () => {
  it.each([
    ['nouveau', 'en_cours'],
    ['nouveau', 'decision_humaine'],
    ['en_cours', 'corrige'],
    ['en_cours', 'rejete'],
    ['en_cours', 'decision_humaine'],
  ])('%s → %s : apply', (from, to) => {
    expect(planTransition(from, to)).toEqual({ action: 'apply', reason: null });
  });

  it.each([['nouveau'], ['en_cours'], ['corrige'], ['decision_humaine']])(
    '%s → même statut : skip (idempotence du re-run)',
    (s) => {
      expect(planTransition(s, s).action).toBe('skip');
    }
  );

  it.each([
    ['corrige', 'en_cours'],
    ['corrige', 'rejete'],
    ['rejete', 'corrige'],
    ['decision_humaine', 'corrige'],
    ['decision_humaine', 'en_cours'],
  ])('%s → %s : refuse, statut terminal', (from, to) => {
    const verdict = planTransition(from, to);
    expect(verdict.action).toBe('refuse');
    expect(verdict.reason).toMatch(/terminal/);
  });

  it('refuse nouveau → corrige : pas de correction sans prise en charge', () => {
    expect(planTransition('nouveau', 'corrige').action).toBe('refuse');
  });
  it('refuse nouveau → rejete : même règle', () => {
    expect(planTransition('nouveau', 'rejete').action).toBe('refuse');
  });
  it('refuse en_cours → nouveau : la routine ne revient pas en arrière', () => {
    expect(planTransition('en_cours', 'nouveau').action).toBe('refuse');
  });
  it.each([['statut-inconnu', 'corrige'], ['nouveau', 'resolu'], [undefined, 'corrige']])(
    'refuse un statut hors CHECK SQL (%s → %s)',
    (from, to) => {
      expect(planTransition(from, to)).toEqual({ action: 'refuse', reason: 'statut inconnu' });
    }
  );
});

describe('claimNote / ownsClaim — la routine ne vole pas les prises en charge humaines', () => {
  it('claimNote produit un marqueur horodaté', () => {
    expect(claimNote(AT, 'pris en charge')).toBe('[routine 2026-08-17T08:00:00.000Z] pris en charge');
  });
  it('reconnaît sa propre prise en charge', () => {
    expect(ownsClaim({ status: 'en_cours', admin_note: claimNote(AT, 'pris en charge') })).toBe(true);
  });
  it('un en_cours annoté par un humain ne lui appartient pas', () => {
    expect(ownsClaim({ status: 'en_cours', admin_note: 'je regarde ça — Jérémie' })).toBe(false);
  });
  it('un en_cours sans note ne lui appartient pas', () => {
    expect(ownsClaim({ status: 'en_cours', admin_note: null })).toBe(false);
  });
  it('le marqueur sur un statut autre que en_cours ne vaut rien', () => {
    expect(ownsClaim({ status: 'nouveau', admin_note: claimNote(AT, 'x') })).toBe(false);
  });
});

describe('isStaleClaim — anti-boucle : un run mort s escalade, il ne se reprend pas', () => {
  const claimed = { status: 'en_cours', admin_note: claimNote(AT, 'pris en charge') };
  it('une prise en charge fraîche n est pas périmée', () => {
    expect(isStaleClaim(claimed, new Date(AT.getTime() + 3_600_000))).toBe(false);
  });
  it(`une prise en charge de plus de ${STALE_CLAIM_HOURS} h est périmée`, () => {
    expect(isStaleClaim(claimed, new Date(AT.getTime() + (STALE_CLAIM_HOURS + 1) * 3_600_000))).toBe(true);
  });
  it('un en_cours humain n est jamais périmé pour la routine', () => {
    const human = { status: 'en_cours', admin_note: 'je regarde — Jérémie' };
    expect(isStaleClaim(human, new Date('2027-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('buildStatusPatch — compare-and-set, jamais d écrasement', () => {
  it('garde le PATCH par le statut de départ dans l URL', () => {
    const req = buildStatusPatch({ id: ID, from: 'nouveau', to: 'en_cours', note: claimNote(AT, 'pris en charge'), at: AT });
    expect(req.method).toBe('PATCH');
    expect(req.path).toBe(`/rest/v1/feedback?id=eq.${ID}&status=eq.nouveau`);
    expect(req.headers).toEqual({ Prefer: 'return=representation' });
    expect(req.body.status).toBe('en_cours');
  });
  it('resolved_at est posé pour corrige', () => {
    const req = buildStatusPatch({ id: ID, from: 'en_cours', to: 'corrige', note: 'n', at: AT });
    expect(req.body.resolved_at).toBe('2026-08-17T08:00:00.000Z');
  });
  it('resolved_at est posé pour rejete', () => {
    const req = buildStatusPatch({ id: ID, from: 'en_cours', to: 'rejete', note: 'n', at: AT });
    expect(req.body.resolved_at).toBe('2026-08-17T08:00:00.000Z');
  });
  it('decision_humaine reste ouvert : resolved_at null', () => {
    const req = buildStatusPatch({ id: ID, from: 'en_cours', to: 'decision_humaine', note: 'n', at: AT });
    expect(req.body.resolved_at).toBeNull();
  });
  it('la prise en charge reste ouverte : resolved_at null', () => {
    const req = buildStatusPatch({ id: ID, from: 'nouveau', to: 'en_cours', note: 'n', at: AT });
    expect(req.body.resolved_at).toBeNull();
  });
  it('jette sur une transition non applicable', () => {
    expect(() => buildStatusPatch({ id: ID, from: 'corrige', to: 'rejete', at: AT })).toThrow(/non applicable/);
  });
  it('jette sur un id qui n est pas un UUID (garde d injection dans l URL)', () => {
    expect(() => buildStatusPatch({ id: 'id=eq.*', from: 'nouveau', to: 'en_cours', at: AT })).toThrow(/UUID/);
  });
});

describe('interpretPatchOutcome — perdu ≠ erreur', () => {
  it('au moins une ligne revenue : applique', () => {
    expect(interpretPatchOutcome([{ id: ID }])).toBe('applique');
  });
  it('zéro ligne : perdu — la ligne a changé sous la routine, on relit, on ne force pas', () => {
    expect(interpretPatchOutcome([])).toBe('perdu');
  });
  it('réponse inexploitable : perdu', () => {
    expect(interpretPatchOutcome(undefined)).toBe('perdu');
  });
});

describe('readEmergencyStop — le fichier à la racine arrête tout', () => {
  it('absent : la voie est libre', () => {
    const dir = mkdtempSync(join(tmpdir(), 'amivet-stop-'));
    expect(readEmergencyStop(dir)).toBeNull();
    rmSync(dir, { recursive: true });
  });
  it('présent avec un motif : la routine s arrête et remonte le motif', () => {
    const dir = mkdtempSync(join(tmpdir(), 'amivet-stop-'));
    writeFileSync(join(dir, EMERGENCY_STOP_FILE), 'régression sur les heures, on gèle\n');
    expect(readEmergencyStop(dir)).toEqual({ reason: 'régression sur les heures, on gèle' });
    rmSync(dir, { recursive: true });
  });
  it('présent mais vide : la routine s arrête quand même', () => {
    const dir = mkdtempSync(join(tmpdir(), 'amivet-stop-'));
    writeFileSync(join(dir, EMERGENCY_STOP_FILE), '');
    expect(readEmergencyStop(dir)).toEqual({ reason: 'sans motif' });
    rmSync(dir, { recursive: true });
  });
});
