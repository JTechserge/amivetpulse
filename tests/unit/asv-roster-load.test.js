import { describe, it, expect, beforeEach } from 'vitest';
import { ASV_PEOPLE, ASV_ROSTER_KEY } from '../../src/config.js';
import { loadASVRoster } from '../../src/state.js';

// loadASVRoster() s'exécute à chaque démarrage : ce qu'il réintroduit dans
// l'effectif réapparaît après un rafraîchissement, quoi qu'ait fait l'utilisateur.

const memoryStore = {};
globalThis.localStorage = {
  getItem: (k) => memoryStore[k] ?? null,
  setItem: (k, v) => {
    memoryStore[k] = String(v);
  },
  removeItem: (k) => delete memoryStore[k],
};

const marie = { id: 'marie', name: 'Marie', short: 'Marie', initial: 'M', color: '#DB2777' };

beforeEach(() => {
  Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);
});

describe('loadASVRoster', () => {
  it("amorce l'effectif par défaut au premier lancement", () => {
    // Le défaut vit dans config.js ; on le relit tel quel plutôt que de le recopier.
    const defaults = ASV_PEOPLE.map((p) => p.id);
    loadASVRoster();
    expect(JSON.parse(localStorage.getItem(ASV_ROSTER_KEY)).map((p) => p.id)).toEqual(defaults);
  });

  it("ne ressuscite pas une ASV supprimée de l'effectif enregistré", () => {
    // Effectif tel que l'écrit saveASVRoster() après la suppression définitive de Carla.
    localStorage.setItem(ASV_ROSTER_KEY, JSON.stringify([marie]));
    loadASVRoster();
    expect(ASV_PEOPLE.map((p) => p.id)).toEqual(['marie']);
    expect(JSON.parse(localStorage.getItem(ASV_ROSTER_KEY)).map((p) => p.id)).toEqual(['marie']);
  });
});
