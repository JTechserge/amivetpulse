import { describe, it, expect, beforeEach } from 'vitest';
import { ASV_PEOPLE, ASV_ROSTER_KEY, ASV_ROSTER_CACHE_KEY } from '../../src/config.js';
import { loadASVRoster, applyASVRosterRows, applyASVRosterRow } from '../../src/state.js';

// loadASVRoster() s'exécute à chaque démarrage : ce qu'il réintroduit dans
// l'effectif réapparaît après un rafraîchissement, quoi qu'ait fait l'utilisateur.
// Depuis la v23 l'effectif fait foi en base (asv_roster) ; le poste n'en tient
// qu'un cache, et la clé historique reste intacte pour un retour arrière.

const memoryStore = {};
globalThis.localStorage = {
  getItem: (k) => memoryStore[k] ?? null,
  setItem: (k, v) => {
    memoryStore[k] = String(v);
  },
  removeItem: (k) => delete memoryStore[k],
};

const marie = { id: 'marie', name: 'Marie', short: 'Marie', initial: 'M', color: '#DB2777' };
const row = (over = {}) => ({
  id: 'julie',
  name: 'Julie',
  short: 'Julie',
  initial: 'JU',
  last_name: null,
  color: '#059669',
  time_fraction: 0.75,
  working_days: [1, 2, 4],
  saturday_only: false,
  archived: false,
  sort_order: 0,
  updated_at: '2026-11-25T18:39:00.123456+00:00',
  ...over,
});
const cacheIds = () => JSON.parse(localStorage.getItem(ASV_ROSTER_CACHE_KEY)).map((p) => p.id);

beforeEach(() => {
  Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);
});

describe('loadASVRoster', () => {
  it("amorce le cache avec l'effectif par défaut au premier lancement, sans écrire la clé historique", () => {
    // Le défaut vit dans config.js ; on le relit tel quel plutôt que de le recopier.
    const defaults = ASV_PEOPLE.map((p) => p.id);
    loadASVRoster();
    expect(cacheIds()).toEqual(defaults);
    expect(localStorage.getItem(ASV_ROSTER_KEY)).toBeNull();
  });

  it("ne ressuscite pas une ASV supprimée de l'effectif enregistré", () => {
    localStorage.setItem(ASV_ROSTER_CACHE_KEY, JSON.stringify([marie]));
    loadASVRoster();
    expect(ASV_PEOPLE.map((p) => p.id)).toEqual(['marie']);
    expect(cacheIds()).toEqual(['marie']);
  });

  it('amorce depuis la clé historique sans la réécrire, et la laisse en lecture seule', () => {
    const legacy = JSON.stringify([{ ...marie, timeFraction: 0.5 }]);
    localStorage.setItem(ASV_ROSTER_KEY, legacy);
    loadASVRoster();
    expect(ASV_PEOPLE.map((p) => p.id)).toEqual(['marie']);
    expect(ASV_PEOPLE[0].timeFraction).toBe(0.5);
    // Pas d'updatedAt : aucune écriture possible avant un chargement depuis la base.
    expect(ASV_PEOPLE[0].updatedAt).toBeNull();
    expect(localStorage.getItem(ASV_ROSTER_KEY)).toBe(legacy);
  });

  it('préfère le cache à la clé historique', () => {
    localStorage.setItem(ASV_ROSTER_KEY, JSON.stringify([marie]));
    localStorage.setItem(ASV_ROSTER_CACHE_KEY, JSON.stringify([{ ...marie, id: 'johanna' }]));
    loadASVRoster();
    expect(ASV_PEOPLE.map((p) => p.id)).toEqual(['johanna']);
  });
});

describe('applyASVRosterRows', () => {
  it('ignore une réponse vide et conserve le cache', () => {
    localStorage.setItem(ASV_ROSTER_CACHE_KEY, JSON.stringify([marie]));
    loadASVRoster();
    expect(applyASVRosterRows([])).toBe(false);
    expect(applyASVRosterRows(null)).toBe(false);
    expect(ASV_PEOPLE.map((p) => p.id)).toEqual(['marie']);
    expect(cacheIds()).toEqual(['marie']);
  });

  it('remplace l’effectif par les lignes de la base, triées, et met le cache à jour sans toucher la clé historique', () => {
    const legacy = JSON.stringify([marie]);
    localStorage.setItem(ASV_ROSTER_KEY, legacy);
    loadASVRoster();
    expect(applyASVRosterRows([row({ id: 'leo', sort_order: 4 }), row({ sort_order: 1 })])).toBe(true);
    expect(ASV_PEOPLE.map((p) => p.id)).toEqual(['julie', 'leo']);
    expect(ASV_PEOPLE[0]).toMatchObject({
      timeFraction: 0.75,
      workingDays: [1, 2, 4],
      updatedAt: '2026-11-25T18:39:00.123456+00:00',
    });
    expect(cacheIds()).toEqual(['julie', 'leo']);
    expect(localStorage.getItem(ASV_ROSTER_KEY)).toBe(legacy);
  });

  it('le cache restitue fraction, jours et version au démarrage suivant', () => {
    applyASVRosterRows([row()]);
    ASV_PEOPLE.length = 0;
    loadASVRoster();
    expect(ASV_PEOPLE[0]).toMatchObject({
      id: 'julie',
      timeFraction: 0.75,
      workingDays: [1, 2, 4],
      updatedAt: '2026-11-25T18:39:00.123456+00:00',
    });
  });
});

describe('applyASVRosterRow', () => {
  it('remplace la personne en place à partir de la ligne renvoyée, nom de famille effacé compris', () => {
    applyASVRosterRows([row({ last_name: 'Durand' })]);
    const ref = ASV_PEOPLE[0];
    applyASVRosterRow(row({ time_fraction: 0.8, updated_at: '2026-11-26T08:00:00+00:00' }));
    expect(ASV_PEOPLE[0]).toBe(ref);
    expect(ref.timeFraction).toBe(0.8);
    expect(ref.updatedAt).toBe('2026-11-26T08:00:00+00:00');
    expect(ref.lastName).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(ASV_ROSTER_CACHE_KEY))[0].timeFraction).toBe(0.8);
  });

  it('ajoute une personne absente (création)', () => {
    applyASVRosterRows([row()]);
    applyASVRosterRow(row({ id: 'nina', sort_order: 5 }));
    expect(ASV_PEOPLE.map((p) => p.id)).toEqual(['julie', 'nina']);
  });
});
