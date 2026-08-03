import { describe, it, expect } from 'vitest';
import {
  extractPersonIdFromKey,
  findChangedKeys,
  hasFullAccess,
  validateAsvWrite,
  validateVetEmployeWrite,
  buildPatch,
  applyPatch,
  patchToChangedKeys,
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
    expect(extractPersonIdFromKey('2026-07-14_')).toBeNull(); // date + _ mais person_id vide
  });

  it('renvoie null pour des clés sans préfixe date valide', () => {
    expect(extractPersonIdFromKey('marie_M')).toBeNull(); // pas de date
    expect(extractPersonIdFromKey('nodate_marie_M')).toBeNull(); // format quelconque
    expect(extractPersonIdFromKey('2026-07-14')).toBeNull(); // date seule, pas de _person_id
    expect(extractPersonIdFromKey('26-07-14_marie_M')).toBeNull(); // année tronquée
  });

  it('extrait correctement même avec suffixe _decision', () => {
    expect(extractPersonIdFromKey('2026-07-14_marie_M_decision')).toBe('marie');
    expect(extractPersonIdFromKey('2026-07-14_stephane_AM_decision')).toBe('stephane');
  });

  it('reconnaît les clés forecast hebdo (forecast_<pid>_YYYY-MM-DD)', () => {
    expect(extractPersonIdFromKey('forecast_marie_2026-01-05')).toBe('marie');
    expect(extractPersonIdFromKey('forecast_johanna_2026-03-09')).toBe('johanna');
    expect(extractPersonIdFromKey('forecast_julie_2025-12-29')).toBe('julie');
  });

  it('reconnaît les clés forecast_sig (forecast_sig_<pid>_<year>)', () => {
    expect(extractPersonIdFromKey('forecast_sig_johanna_2026')).toBe('johanna');
    expect(extractPersonIdFromKey('forecast_sig_julie_2025')).toBe('julie');
    expect(extractPersonIdFromKey('forecast_sig_marie_2027')).toBe('marie');
  });

  it('régression — les clés classiques restent valides', () => {
    expect(extractPersonIdFromKey('2026-01-05_marie_M')).toBe('marie');
    expect(extractPersonIdFromKey('2026-01-05_david_AM_label')).toBe('david');
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
      '2026-07-14_marie_M': 'present', // modifié
      '2026-07-14_david_M': 'present', // inchangé
      '2026-07-14_marie_AM': 'present', // modifié
      '2026-07-14_marie_overtime': '2', // ajouté
    };
    const result = findChangedKeys(old, new_);
    expect(result).toHaveLength(3);
    const keys = result.map((r) => r.key);
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

  it("ASV basique → pas d'accès complet (diff requis)", () => {
    expect(hasFullAccess({ role: 'asv', can_edit_vet_calendar: false, can_edit_all_asv: false })).toBe(false);
  });

  it("profil null/undefined → pas d'accès", () => {
    expect(hasFullAccess(null)).toBe(false);
    expect(hasFullAccess(undefined)).toBe(false);
  });

  it("vétérinaire salarié → jamais d'accès complet", () => {
    expect(hasFullAccess({ role: 'vet_employe', can_edit_vet_calendar: false, can_edit_all_asv: false })).toBe(false);
  });

  it("vétérinaire salarié → les flags ASV ne lui ouvrent pas l'accès complet", () => {
    // Garde-fou : un can_edit_vet_calendar posé par erreur sur son profil ne doit
    // pas court-circuiter validateVetEmployeWrite et lui ouvrir le planning ASV.
    expect(hasFullAccess({ role: 'vet_employe', can_edit_vet_calendar: true, can_edit_all_asv: false })).toBe(false);
    expect(hasFullAccess({ role: 'vet_employe', can_edit_vet_calendar: false, can_edit_all_asv: true })).toBe(false);
  });
});

// ─── validateVetEmployeWrite ─────────────────────────────────────────────────

// Roster vétérinaire de test : 2 associés + 1 salarié.
const VETS = new Set(['david', 'stephane', 'salarie']);

describe('validateVetEmployeWrite — cas autorisés', () => {
  it('aucun changement (push idempotent) → autorisé', () => {
    expect(validateVetEmployeWrite([], VETS, false)).toBeNull();
  });

  it('édite sa propre ligne du calendrier vétérinaire', () => {
    const changed = [{ key: '2026-07-14_salarie_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toBeNull();
  });

  it("édite la ligne d'un associé — il gère tout le calendrier vétérinaire", () => {
    // C'est ce qui le distingue d'un ASV, cantonné à sa seule ligne.
    const changed = [{ key: '2026-07-14_david_AM', oldValue: 'empty', newValue: 'present' }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toBeNull();
  });

  it('soumet une demande de congé sur sa ligne (decision → pending)', () => {
    const changed = [{ key: '2026-07-14_salarie_M_decision', oldValue: undefined, newValue: 'pending' }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toBeNull();
  });

  it('annule sa demande en attente (pending → supprimée)', () => {
    const changed = [{ key: '2026-07-14_salarie_M_decision', oldValue: 'pending', newValue: undefined }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toBeNull();
  });

  it("pose un libellé d'absence sur une ligne vétérinaire", () => {
    const changed = [{ key: '2026-07-14_salarie_M_label', oldValue: '', newValue: 'Congé' }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toBeNull();
  });

  it('édite une ligne ASV une fois can_edit_asv_calendar activé', () => {
    const changed = [{ key: '2026-07-14_marie_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateVetEmployeWrite(changed, VETS, true)).toBeNull();
  });
});

describe('validateVetEmployeWrite — cas refusés (403)', () => {
  it('refuse une ligne ASV tant que can_edit_asv_calendar est false', () => {
    const changed = [{ key: '2026-07-14_marie_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toMatch(/calendrier vétérinaire/);
  });

  it('refuse une personne inconnue du roster', () => {
    const changed = [{ key: '2026-07-14_ghost_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toMatch(/calendrier vétérinaire/);
  });

  it('refuse une clé de format invalide', () => {
    const changed = [{ key: 'salarie_M', oldValue: undefined, newValue: 'present' }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toMatch(/non reconnue/);
  });

  it("ne peut pas s'auto-approuver", () => {
    const changed = [{ key: '2026-07-14_salarie_M_decision', oldValue: 'pending', newValue: 'approved' }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toMatch(/associé/);
  });

  it("ne peut pas approuver la demande d'un autre vétérinaire salarié", () => {
    const vets = new Set(['david', 'salarie', 'salarie2']);
    const changed = [{ key: '2026-07-14_salarie2_AM_decision', oldValue: 'pending', newValue: 'approved' }];
    expect(validateVetEmployeWrite(changed, vets, false)).toMatch(/associé/);
  });

  it('ne peut pas rejeter une demande', () => {
    const changed = [{ key: '2026-07-14_salarie_M_decision', oldValue: 'pending', newValue: 'rejected' }];
    expect(validateVetEmployeWrite(changed, VETS, false)).toMatch(/associé/);
  });

  it('ne peut pas revenir sur une décision déjà arrêtée', () => {
    const approved = [{ key: '2026-07-14_salarie_M_decision', oldValue: 'approved', newValue: undefined }];
    expect(validateVetEmployeWrite(approved, VETS, false)).toMatch(/approuvée|rejetée/);
    const rejected = [{ key: '2026-07-14_salarie_M_decision', oldValue: 'rejected', newValue: 'pending' }];
    expect(validateVetEmployeWrite(rejected, VETS, false)).toMatch(/approuvée|rejetée/);
  });

  it('refuse tout le push si une seule clé est hors périmètre', () => {
    const changed = [
      { key: '2026-07-14_salarie_M', oldValue: 'empty', newValue: 'present' }, // ok
      { key: '2026-07-14_julie_AM', oldValue: 'empty', newValue: 'absent' }, // ASV → interdit
    ];
    expect(validateVetEmployeWrite(changed, VETS, false)).toMatch(/calendrier vétérinaire/);
  });

  it('roster vide → refus systématique (fail-closed)', () => {
    // Sans roster, impossible de distinguer une ligne vét d'une ligne ASV.
    const changed = [{ key: '2026-07-14_salarie_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateVetEmployeWrite(changed, new Set(), false)).toMatch(/Roster/);
    expect(validateVetEmployeWrite(changed, [], true)).toMatch(/Roster/);
  });

  it('accepte un tableau comme un Set pour la liste des vétérinaires', () => {
    const changed = [{ key: '2026-07-14_david_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateVetEmployeWrite(changed, ['david', 'stephane'], false)).toBeNull();
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
  it("ASV modifie le slot d'une autre ASV", () => {
    const changed = [{ key: '2026-07-14_johanna_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/johanna/);
  });

  it("ASV supprime la présence d'une autre ASV (clé étrangère, newValue = undefined)", () => {
    const changed = [{ key: '2026-07-14_johanna_M', oldValue: 'present', newValue: undefined }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/johanna/);
  });

  it('clé de format invalide (sans préfixe date) → refus (extractPersonIdFromKey retourne null)', () => {
    const changed = [{ key: 'marie_M', oldValue: undefined, newValue: 'present' }];
    expect(validateAsvWrite(changed, 'marie')).not.toBeNull();
  });

  it('clé avec person_id inconnu → refus pour le demandeur', () => {
    const changed = [{ key: '2026-07-14_ghost_M', oldValue: 'empty', newValue: 'present' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/ghost/);
  });

  it("ASV modifie le slot d'un vet", () => {
    const changed = [{ key: '2026-07-14_david_M', oldValue: 'present', newValue: 'absent' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/david/);
  });

  it("ASV tente de s'auto-approuver (decision → approved)", () => {
    const changed = [{ key: '2026-07-14_marie_M_decision', oldValue: 'pending', newValue: 'approved' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/admin/);
  });

  it("ASV tente de s'auto-rejeter (decision → rejected)", () => {
    const changed = [{ key: '2026-07-14_marie_M_decision', oldValue: 'pending', newValue: 'rejected' }];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/admin/);
  });

  it("ASV tente d'annuler une décision déjà approuvée", () => {
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
      { key: '2026-07-14_marie_M', oldValue: 'empty', newValue: 'present' }, // ok
      { key: '2026-07-14_julie_AM', oldValue: 'empty', newValue: 'absent' }, // interdit
    ];
    expect(validateAsvWrite(changed, 'marie')).toMatch(/julie/);
  });
});

// ─── Sauvegarde par correctif (patch) ────────────────────────────────────────
//
// Contexte : le planning est un document JSON unique. Envoyer le document
// entier fait que la sauvegarde du dernier écrase celle de l'autre. On envoie
// désormais uniquement les clés modifiées, appliquées sur l'état frais du
// serveur. `null` dans un patch signifie « supprimer cette clé ».

describe('buildPatch', () => {
  it('ne renvoie rien si rien n\'a changé', () => {
    const base = { '2026-07-14_marie_M': 'present' };
    expect(buildPatch(base, { ...base })).toEqual({});
  });

  it('capture une valeur modifiée', () => {
    const base = { '2026-07-14_marie_M': 'empty' };
    const now = { '2026-07-14_marie_M': 'present' };
    expect(buildPatch(base, now)).toEqual({ '2026-07-14_marie_M': 'present' });
  });

  it('capture une clé ajoutée', () => {
    expect(buildPatch({}, { '2026-07-14_marie_M': 'absent' })).toEqual({ '2026-07-14_marie_M': 'absent' });
  });

  it('représente une suppression par null', () => {
    const base = { '2026-07-14_marie_M': 'absent' };
    expect(buildPatch(base, {})).toEqual({ '2026-07-14_marie_M': null });
  });

  it('ignore les clés inchangées quand d\'autres bougent', () => {
    const base = { a: '1', b: '2', c: '3' };
    const now = { a: '1', b: 'X', c: '3', d: '4' };
    expect(buildPatch(base, now)).toEqual({ b: 'X', d: '4' });
  });

  it('tolère des entrées nulles', () => {
    expect(buildPatch(null, null)).toEqual({});
    expect(buildPatch(null, { a: '1' })).toEqual({ a: '1' });
  });
});

describe('applyPatch', () => {
  it('applique ajouts, modifications et suppressions', () => {
    const slots = { a: '1', b: '2' };
    const result = applyPatch(slots, { b: 'X', c: '3', a: null });
    expect(result).toEqual({ b: 'X', c: '3' });
  });

  it('ne modifie pas l\'objet source', () => {
    const slots = { a: '1' };
    applyPatch(slots, { a: null, b: '2' });
    expect(slots).toEqual({ a: '1' });
  });

  it('un patch vide laisse l\'état intact', () => {
    const slots = { a: '1' };
    expect(applyPatch(slots, {})).toEqual({ a: '1' });
  });

  it('LE CŒUR DU CORRECTIF — deux sauvegardes concurrentes ne s\'écrasent plus', () => {
    // État commun chargé par les deux personnes
    const S0 = { '2026-07-14_david_M': 'present' };

    // Chacune modifie une case différente, sans voir l'autre
    const patchA = buildPatch(S0, { ...S0, '2026-07-14_david_AM': 'absent' });
    const patchB = buildPatch(S0, { ...S0, '2026-07-15_stephane_M': 'present' });

    // Le serveur les applique l'une après l'autre sur l'état courant
    const afterA = applyPatch(S0, patchA);
    const afterB = applyPatch(afterA, patchB);

    // Les deux modifications survivent — c'est ce qui était perdu avant.
    expect(afterB['2026-07-14_david_AM']).toBe('absent');
    expect(afterB['2026-07-15_stephane_M']).toBe('present');
    expect(afterB['2026-07-14_david_M']).toBe('present');
  });
});

describe('patchToChangedKeys', () => {
  it('reconstruit les couples ancienne/nouvelle valeur pour le contrôle des droits', () => {
    const current = { '2026-07-14_marie_M_decision': 'pending' };
    const patch = { '2026-07-14_marie_M_decision': 'approved' };
    expect(patchToChangedKeys(patch, current)).toEqual([
      { key: '2026-07-14_marie_M_decision', oldValue: 'pending', newValue: 'approved' },
    ]);
  });

  it('traduit null en suppression (newValue undefined)', () => {
    const current = { '2026-07-14_marie_M': 'absent' };
    expect(patchToChangedKeys({ '2026-07-14_marie_M': null }, current)).toEqual([
      { key: '2026-07-14_marie_M', oldValue: 'absent', newValue: undefined },
    ]);
  });

  it('permet de refuser une auto-approbation envoyée en patch', () => {
    // Le contrôle de droits doit fonctionner à l'identique sur un patch.
    const current = { '2026-07-14_marie_M_decision': 'pending' };
    const changed = patchToChangedKeys({ '2026-07-14_marie_M_decision': 'approved' }, current);
    expect(validateAsvWrite(changed, 'marie')).toMatch(/admin/);
  });
});
