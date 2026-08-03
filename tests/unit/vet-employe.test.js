/**
 * Tests unitaires — rôle « vétérinaire non associé » (salarié).
 *
 * Couvre la règle métier centrale : les absences d'un vétérinaire SALARIÉ
 * suivent le cycle pending/approved/rejected, celles d'un ASSOCIÉ n'y sont
 * jamais soumises. Le statut s'attache à la personne, pas à l'auteur de la saisie.
 *
 * leave-requests.js importe pwa.js (window.addEventListener au module level) →
 * mock obligatoire pour l'environnement Node.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../../src/pwa.js', () => ({ triggerPushNotification: vi.fn() }));

import { PEOPLE, ASV_PEOPLE, isVetPerson, isPartnerVet, isNonPartnerVet } from '../../src/config.js';
import { store } from '../../src/store.js';
import { requiresLeaveApproval, isASVPerson, setSlotState, getLeaveDecision } from '../../src/slots.js';
import { collectAllLeaveGroups, getCPTakenDays } from '../../src/leave-requests.js';
import { buildRecapTable } from '../../src/dashboard-stats.js';

// getCurrentYear() lit localStorage, absent de l'environnement Node.
const memoryStore = {};
globalThis.localStorage = {
  getItem: (k) => memoryStore[k] ?? null,
  setItem: (k, v) => {
    memoryStore[k] = String(v);
  },
  removeItem: (k) => delete memoryStore[k],
};

const YEAR = 2026; // année par défaut de getCurrentYear()

// Effectif de test : on ajoute un salarié aux deux associés par défaut.
const SALARIE = {
  id: 'salarie',
  name: 'Dr. Salarié Test',
  short: 'Salarié',
  initial: 'Sa',
  color: '#0D9488',
  present: null,
  partner: false,
  archived: false,
  sortOrder: 2,
};
const ORIGINAL_VETS = PEOPLE.map((p) => ({ ...p }));
const ORIGINAL_ASV = ASV_PEOPLE.map((p) => ({ ...p }));

function useRoster(vets) {
  PEOPLE.length = 0;
  vets.forEach((v) => PEOPLE.push({ ...v }));
}

// Les ASV allongent inutilement le balayage de collectAllLeaveGroups (2 ans de
// demi-journées par personne) : on les retire, ils ont leurs propres tests.
function clearAsv() {
  ASV_PEOPLE.length = 0;
}

beforeEach(() => {
  store.DATA = { version: 2, slots: {} };
  useRoster([...ORIGINAL_VETS, SALARIE]);
  clearAsv();
});

afterAll(() => {
  useRoster(ORIGINAL_VETS);
  ASV_PEOPLE.length = 0;
  ORIGINAL_ASV.forEach((p) => ASV_PEOPLE.push(p));
});

function absent(iso, pid, slot, label = 'Congé') {
  store.DATA.slots[`${iso}_${pid}_${slot}`] = 'absent';
  if (label) store.DATA.slots[`${iso}_${pid}_${slot}_label`] = label;
}

// ─── Prédicats de statut ─────────────────────────────────────────────────────

describe('prédicats associé / salarié', () => {
  it('distingue associés et salariés parmi les vétérinaires', () => {
    expect(isVetPerson('david')).toBe(true);
    expect(isPartnerVet('david')).toBe(true);
    expect(isNonPartnerVet('david')).toBe(false);

    expect(isVetPerson('salarie')).toBe(true);
    expect(isPartnerVet('salarie')).toBe(false);
    expect(isNonPartnerVet('salarie')).toBe(true);
  });

  it("une personne inconnue n'est ni l'un ni l'autre", () => {
    expect(isVetPerson('fantome')).toBe(false);
    expect(isPartnerVet('fantome')).toBe(false);
    expect(isNonPartnerVet('fantome')).toBe(false);
  });

  it('un vétérinaire sans champ partner est traité comme associé (défaut sûr)', () => {
    // Cas d'un roster mis en cache avant l'introduction du champ : il ne doit
    // surtout pas basculer les associés historiques dans le flux de validation.
    useRoster([{ id: 'legacy', name: 'Legacy', short: 'Legacy', initial: 'L', color: '#000' }]);
    expect(isPartnerVet('legacy')).toBe(true);
    expect(isNonPartnerVet('legacy')).toBe(false);
    expect(requiresLeaveApproval('legacy')).toBe(false);
  });
});

describe('requiresLeaveApproval', () => {
  it('vrai pour un vétérinaire salarié, faux pour un associé', () => {
    expect(requiresLeaveApproval('salarie')).toBe(true);
    expect(requiresLeaveApproval('david')).toBe(false);
    expect(requiresLeaveApproval('stephane')).toBe(false);
  });

  it('reste vrai pour les ASV — le flux existant est préservé', () => {
    ASV_PEOPLE.push({ id: 'marie', name: 'Marie', short: 'Marie', initial: 'M', color: '#DB2777' });
    expect(requiresLeaveApproval('marie')).toBe(true);
    expect(isASVPerson('marie')).toBe(true);
    // Un salarié n'est pas une ASV : la logique métier ASV ne doit pas l'attraper.
    expect(isASVPerson('salarie')).toBe(false);
  });
});

// ─── Passage automatique en « en attente » ───────────────────────────────────

describe('setSlotState — création de la demande', () => {
  it('une absence posée sur un salarié devient « en attente »', () => {
    setSlotState(`${YEAR}-03-10`, 'salarie', 'M', 'absent');
    expect(getLeaveDecision(`${YEAR}-03-10`, 'salarie', 'M')).toBe('pending');
  });

  it('une absence posée sur un associé ne crée aucune demande', () => {
    setSlotState(`${YEAR}-03-10`, 'david', 'M', 'absent');
    expect(getLeaveDecision(`${YEAR}-03-10`, 'david', 'M')).toBeFalsy();
  });

  it('repasser en présent efface la demande du salarié', () => {
    setSlotState(`${YEAR}-03-10`, 'salarie', 'M', 'absent');
    setSlotState(`${YEAR}-03-10`, 'salarie', 'M', 'present');
    expect(getLeaveDecision(`${YEAR}-03-10`, 'salarie', 'M')).toBeFalsy();
  });
});

// ─── Collecte des demandes ───────────────────────────────────────────────────

describe('collectAllLeaveGroups', () => {
  it("remonte les absences d'un vétérinaire salarié", () => {
    absent(`${YEAR}-03-10`, 'salarie', 'M');
    absent(`${YEAR}-03-10`, 'salarie', 'AM');
    const groups = collectAllLeaveGroups().filter((g) => g.personId === 'salarie');
    expect(groups).toHaveLength(1);
    expect(groups[0].status).toBe('pending');
    expect(groups[0].slots).toHaveLength(2);
  });

  it('ignore totalement les absences des associés', () => {
    absent(`${YEAR}-03-10`, 'david', 'M');
    absent(`${YEAR}-03-11`, 'stephane', 'AM');
    expect(collectAllLeaveGroups()).toHaveLength(0);
  });

  it('reflète une demande approuvée puis refusée', () => {
    absent(`${YEAR}-04-02`, 'salarie', 'M');
    store.DATA.slots[`${YEAR}-04-02_salarie_M_decision`] = 'approved';
    expect(collectAllLeaveGroups()[0].status).toBe('approved');

    store.DATA.slots[`${YEAR}-04-02_salarie_M_decision`] = 'rejected';
    expect(collectAllLeaveGroups()[0].status).toBe('rejected');
  });

  it("exclut maladie et accident — pas d'approbation requise", () => {
    absent(`${YEAR}-05-04`, 'salarie', 'M', 'Maladie');
    absent(`${YEAR}-05-05`, 'salarie', 'M', 'Accident du travail');
    expect(collectAllLeaveGroups()).toHaveLength(0);
  });

  it('exclut le repos planifié', () => {
    absent(`${YEAR}-05-06`, 'salarie', 'M', 'Repos');
    expect(collectAllLeaveGroups()).toHaveLength(0);
  });

  it('sépare les demandes par libellé', () => {
    absent(`${YEAR}-06-01`, 'salarie', 'M', 'Congé');
    absent(`${YEAR}-06-01`, 'salarie', 'AM', 'Formation');
    const labels = collectAllLeaveGroups().map((g) => g.label);
    expect(labels).toContain('Congé');
    expect(labels).toContain('Formation');
  });
});

// ─── Décompte des CP ─────────────────────────────────────────────────────────

describe('getCPTakenDays', () => {
  const START = `${YEAR}-01-01`;
  const END = `${YEAR}-12-31`;

  it('ne décompte que les absences libellées CP/Congé pour un salarié', () => {
    absent(`${YEAR}-07-06`, 'salarie', 'M', 'Congé');
    absent(`${YEAR}-07-06`, 'salarie', 'AM', 'Congé');
    absent(`${YEAR}-07-07`, 'salarie', 'M', 'Formation');
    absent(`${YEAR}-07-08`, 'salarie', 'M', 'Maladie');
    // 2 demi-journées de congé = 1 jour ; Formation et Maladie ne consomment rien.
    expect(getCPTakenDays('salarie', START, END)).toBe(1);
  });

  it('décompte toute absence pour un associé — règle historique inchangée', () => {
    absent(`${YEAR}-07-06`, 'david', 'M', 'Formation');
    absent(`${YEAR}-07-06`, 'david', 'AM', 'Congé');
    expect(getCPTakenDays('david', START, END)).toBe(1);
  });
});

// ─── Récapitulatif mensuel du tableau de bord ────────────────────────────────

describe('buildRecapTable', () => {
  it('inclut une colonne jours et samedis pour le vétérinaire salarié', () => {
    const html = buildRecapTable(YEAR);
    expect(html).toContain('Salarié (j)');
    expect(html).toContain('Samedis Salarié');
    // Les associés restent présents, à leur place.
    expect(html).toContain('David (j)');
    expect(html).toContain('Stéphane (j)');
  });

  it("garde l'écart entre les deux associés seulement", () => {
    // L'écart mesure l'équilibrage entre associés : l'ajout d'un salarié ne
    // doit ni le supprimer ni le fausser.
    const html = buildRecapTable(YEAR);
    expect(html).toContain('<th>Écart</th>');
    expect(html).not.toContain('Salarié</td>'); // jamais nommé dans une cellule d'écart
  });

  it("masque l'écart s'il n'y a pas exactement deux associés", () => {
    useRoster([{ ...SALARIE }]);
    const html = buildRecapTable(YEAR);
    expect(html).toContain('Salarié (j)');
    expect(html).not.toContain('<th>Écart</th>');
  });

  it('compte les demi-journées travaillées du salarié', () => {
    // 2 demi-journées présentes en mars = 1 jour.
    store.DATA.slots[`${YEAR}-03-10_salarie_M`] = 'present';
    store.DATA.slots[`${YEAR}-03-10_salarie_AM`] = 'present';
    const html = buildRecapTable(YEAR);
    // La ligne de mars doit porter un 1 pour le salarié.
    const marsRow = html.split('<tr>').find((r) => r.includes('Mars'));
    expect(marsRow).toBeDefined();
    expect(marsRow).toContain('<td>1</td>');
  });
});
