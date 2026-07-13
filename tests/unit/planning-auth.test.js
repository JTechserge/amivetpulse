import { describe, it, expect } from 'vitest';
import {
  extractPersonIdFromKey,
  findChangedKeys,
  hasFullAccess,
  validateAsvWrite,
} from '../../src/lib/planning-auth.js';

// ─── extractPersonIdFromKey ───────────────────────────────────────────────────

describe('extractPersonIdFromKey', () => {
  it('extrait le person_id depuis une clé slot simple', () => {
    expect(extractPersonIdFromKey('2026-07-14_marie_M')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_david_AM')).toBe('david');
    expect(extractPersonIdFromKey('2026-07-14_stephane_M')).toBe('stephane');
    expect(extractPersonIdFromKey('2026-07-14_johanna_AM')).toBe('johanna');
    expect(extractPersonIdFromKey('2026-07-14_julie_M')).toBe('julie');
    expect(extractPersonIdFromKey('2026-07-14_carla_AM')).toBe('carla');
  });

  it('extrait le person_id depuis des clés avec suffixe', () => {
    expect(extractPersonIdFromKey('2026-07-14_marie_M_decision')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_marie_M_label')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_marie_AM_decision')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_marie_overtime')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_marie_early_dep')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_marie_week_ot_mins')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_marie_lunch_ot_mins')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_marie_shift_type')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_david_M_label')).toBe('david');
  });

  it('fonctionne sur différentes dates', () => {
    expect(extractPersonIdFromKey('2025-01-01_marie_M')).toBe('marie');
    expect(extractPersonIdFromKey('2026-12-31_david_AM')).toBe('david');
  });

  it('renvoie null pour des clés invalides ou trop courtes', () => {
    expect(extractPersonIdFromKey('')).toBeNull();
    expect(extractPersonIdFromKey(null)).toBeNull();
    expect(extractPersonIdFromKey(undefined)).toBeNull();
    expect(extractPersonIdFromKey('short')).toBeNull();
    expect(extractPersonIdFromKey('2026-07-14_')).toBeNull(); // 11 chars exactement → null
  });
});

// ─── findChangedKeys ──────────────────────────────────────────────────────────

describe('findChangedKeys', () => {
  it('renvoie un tableau vide si les deux états sont identiques', () => {
    const slots = { '2026-07-14_marie_M': 'present', '2026-07-14_david_M': 'absent' };
    expect(findChangedKeys(slots, { ...slots })).toHaveLength(0);
  });

  it('détecte une clé modifiée', () => {
    const old = { '2026-07-14_marie_M': 'empty' };
    const new_ = { '2026-07-14_marie_M': 'present' };
    const result = findChangedKeys(old, new_);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: '2026-07-14_marie_M', oldValue: 'empty', newValue: 'present' });
  });

  it('détecte une clé ajoutée (ancienne valeur = undefined)', () => {
    const old = {};
    const new_ = { '2026-07-14_marie_M_decision': 'pending' };
    const result = findChangedKeys(old, new_);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: '2026-07-14_marie_M_decision', oldValue: undefined, newValue: 'pending' });
  });

  it('détecte une clé supprimée (nouvelle valeur = undefined)', () => {
    const old = { '2026-07-14_marie_M_decision': 'pending' };
    const new_ = {};
    const result = findChangedKeys(old, new_);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: '2026-07-14_marie_M_decision', oldValue: 'pending', newValue: undefined });
  });

  it('gère plusieurs changements simultanés', () => {
    const old = {
      '2026-07-14_marie_M': 'empty',
      '2026-07-14_david_M': 'present',
      '2026-07-14_marie_AM': 'empty',
    };
    const new_ = {
      '2026-07-14_marie_M': 'present',   // modifié
      '2026-07-14_david_M': 'present',   // inchangé
      '2026-07-14_marie_AM': 'present',  // modifié
      '2026-07-14_marie_overtime': '2', // ajouté
    };
    const result = findChangedKeys(old, new_);
    expect(result).toHaveLength(3);
    const keys = result.map(r => r.key);
    expect(keys).toContain('2026-07-14_marie_M');
    expect(keys).toContain('2026-07-14_marie_AM');
    expect(keys).toContain('2026-07-14_marie_overtime');
    expect(keys).not.toContain('2026-07-14_david_M');
  });

  it('tolère des entrées null/undefined (push idempotent)', () => {
    expect(findChangedKeys(null, {})).toHaveLength(0);
    expect(findChangedKeys({}, null)).toHaveLength(0);
    expect(findChangedKeys(null, null)).toHaveLength(0);
  });
});

// ─── hasFullAccess ────────────────────────────────────────────────────────────

describe('hasFullAccess', () => {
  it('admin → accès complet', () => {
    expect(hasFullAccess({ role: 'admin', can_edit_vet_calendar: false, can_edit_all_asv: false })).toBe(true);
  });

  it('vet → accès complet', () => {
    expect(hasFullAccess({ role: 'vet', can_edit_vet_calendar: false, can_edit_all_asv: false })).toBe(true);
  });

  it('can_edit_vet_calendar = true → accès complet', () => {
    expect(hasFullAccess({ role: 'asv', can_edit_vet_calendar: true, can_edit_all_asv: false })).toBe(true);
  });

  it('can_edit_all_asv = true → accès complet', () => {
    expect(hasFullAccess({ role: 'asv', can_edit_vet_calendar: false, can_edit_all_asv: true })).toBe(true);
  });

  it('ASV basique → pas d\'accès complet (diff requis)', () => {
    expect(hasFullAccess({ role: 'asv', can_edit_vet_calendar: false, can_edit_all_asv: false })).toBe(false);
  });

  it('profil null/undefined → pas d\'accès', () => {
    expect(hasFullAccess(null)).toBe(false);
    expect(hasFullAccess(undefined)).toBe(false);
  });
});

// ─── validateAsvWrite ────────────────────────────────────────────────────────

describe('validateAsvWrite — cas autorisés', () => {
  it('aucun changement (push idempotent) → toujours autorisé', () => {
    expect(validateAsvWrite([], 'marie')).toBeNull();
  });

  it('ASV modifie son propre slot (absent ↔ present)', () => {
    const changed = [{ key: '2026-07-14_marie_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateAsvWrite(changed, 'marie')).toBeNull();
  });

  it('ASV modifie plusieurs de ses propres clés', () => {
    const changed = [
      { key: '2026-07-14_marie_M', oldValue: 'empty', newValue: 'present' },
      { key: '2026-07-14_marie_AM', oldValue: 'empty', newValue: 'absent' },
      { key: '2026-07-14_marie_M_label', oldValue: '', newValue: 'Formation' },
      { key: '2026-07-14_marie_overtime', oldValue: undefined, newValue: '1.5' },
    ];
    expect(validateAsvWrite(changed, 'marie')).toBeNull();
  });

  it('ASV soumet une demande de congé (decision → pending)', () => {
    const changed = [{ key: '2026-07-14_marie_M_decision', oldValue: undefined, newValue: 'pending' }];
    expect(validateAsvWrite(changed, 'marie')).toBeNull();
  });

  it('ASV annule sa demande en attente (pending → supprimée)', () => {
    const changed = [{ key: '2026-07-14_marie_M_decision', oldValue: 'pending', newValue: undefined }];
    expect(validateAsvWrite(changed, 'marie')).toBeNull();
  });

  it('ASV corrige son label après une demande (pending reste pending)', () => {
    const changed = [{ key: '2026-07-14_marie_M_label', oldValue: 'Congé', newValue: 'Congé annuel' }];
    expect(validateAsvWrite(changed, 'marie')).toBeNull();
  });

  it('ASV met à jour ses heures sup et départ anticipé', () => {
    const changed = [
      { key: '2026-07-14_marie_early_dep', oldValue: '', newValue: '17:30' },
      { key: '2026-07-14_marie_week_ot_mins', oldValue: undefined, newValue: '30' },
    ];
    expect(validateAsvWrite(changed, 'marie')).toBeNull();
  });

  it('ASV modifie son slot AM pendant que les slots des autres restent intacts', () => {
    // Seules les clés CHANGÉES sont passées — les clés inchangées ne sont pas dans le diff
    const changed = [{ key: '2026-07-14_marie_AM', oldValue: 'empty', newValue: 'absent' }];
    expect(validateAsvWrite(changed, 'marie')).toBeNull();
  });
});

describe('validateAsvWrite — cas refusés (403)', () => {
  it('ASV modifie le slot d\'une autre ASV', () => {
    const changed = [{ key: '2026-07-14_johanna_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/johanna/);
  });

  it('ASV modifie le slot d\'un vet', () => {
    const changed = [{ key: '2026-07-14_david_M', oldValue: 'present', newValue: 'absent' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/david/);
  });

  it('ASV tente de s\'auto-approuver (decision → approved)', () => {
    const changed = [{ key: '2026-07-14_marie_M_decision', oldValue: 'pending', newValue: 'approved' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/admin/);
  });

  it('ASV tente de s\'auto-rejeter (decision → rejected)', () => {
    const changed = [{ key: '2026-07-14_marie_M_decision', oldValue: 'pending', newValue: 'rejected' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/admin/);
  });

  it('ASV tente d\'annuler une décision déjà approuvée', () => {
    const changed = [{ key: '2026-07-14_marie_M_decision', oldValue: 'approved', newValue: undefined }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/approuvée|rejetée/);
  });

  it('ASV tente de modifier une décision déjà rejetée', () => {
    const changed = [{ key: '2026-07-14_marie_M_decision', oldValue: 'rejected', newValue: 'pending' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/approuvée|rejetée/);
  });

  it('ASV sans person_id dans le profil → refus systématique', () => {
    const changed = [{ key: '2026-07-14_marie_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateAsvWrite(changed, null)).toMatch(/person_id/);
    expect(validateAsvWrite(changed, '')).toMatch(/person_id/);
  });

  it('ASV modifie ses propres slots ET un slot étranger dans le même push', () => {
    const changed = [
      { key: '2026-07-14_marie_M', oldValue: 'empty', newValue: 'present' },  // ok
      { key: '2026-07-14_julie_AM', oldValue: 'empty', newValue: 'absent' },  // interdit
    ];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/julie/);
  });
});
