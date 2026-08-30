/**
 * Tests unitaires — Commentaire de journée
 *
 * Couvre hasDayComment (src/slots.js), le prédicat qui décide de l'affichage
 * de la pastille rouge et de l'infobulle sur l'en-tête de jour du calendrier,
 * en vue vétérinaire comme en vue ASV.
 *
 * Aucun enjeu de paie : le commentaire n'entre dans aucun calcul d'heures.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// pwa.js utilise window.addEventListener au niveau module → incompatible jsdom
vi.mock('../../src/pwa.js', () => ({ triggerPushNotification: vi.fn() }));

import { store } from '../../src/store.js';
import { getDayComment, setDayComment, hasDayComment } from '../../src/slots.js';

function resetStore() {
  store.DATA = { version: 2, slots: {} };
}

describe('hasDayComment (src/slots.js)', () => {
  beforeEach(resetStore);

  it('retourne false quand aucun commentaire n’a été saisi', () => {
    expect(hasDayComment('2026-09-14')).toBe(false);
  });

  it('retourne true dès qu’un commentaire est saisi', () => {
    setDayComment('2026-09-14', 'Réunion fournisseur');
    expect(hasDayComment('2026-09-14')).toBe(true);
  });

  it('retourne false après effacement du commentaire', () => {
    setDayComment('2026-09-14', 'Journée portes ouvertes');
    setDayComment('2026-09-14', '');
    expect(hasDayComment('2026-09-14')).toBe(false);
  });

  it('ignore un commentaire fait uniquement d’espaces', () => {
    setDayComment('2026-09-14', '   ');
    // getDayComment restitue la chaîne telle quelle : c’est bien le prédicat
    // qui filtre, pas le stockage.
    expect(getDayComment('2026-09-14')).toBe('   ');
    expect(hasDayComment('2026-09-14')).toBe(false);
  });

  it('ne déborde pas sur les jours voisins', () => {
    setDayComment('2026-09-14', 'Formation');
    expect(hasDayComment('2026-09-13')).toBe(false);
    expect(hasDayComment('2026-09-15')).toBe(false);
  });
});
