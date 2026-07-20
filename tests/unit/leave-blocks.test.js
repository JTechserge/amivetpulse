/**
 * Tests unitaires pour computeLeaveBlocks (src/leave-blocks.js).
 *
 * Calendrier juillet 2026 (isoWeekday : 0=Lun … 5=Sam, 6=Dim) :
 *   Jul  1 = Mer(2)   Jul  6 = Lun(0)   Jul  7 = Mar(1)
 *   Jul  8 = Mer(2)   Jul  9 = Jeu(3)   Jul 10 = Ven(4)
 *   Jul 11 = Sam(5)   Jul 12 = Dim       Jul 13 = Lun(0)
 *   Jul 14 = Mar(1)   Jul 29 = Mer(2)   Jul 30 = Jeu(3)
 *   Jul 31 = Ven(4)
 * Août 2026 :
 *   Aug  1 = Sam(5)   Aug  2 = Dim       Aug  3 = Lun(0)
 *   Aug  4 = Mar(1)   Aug  5 = Mer(2)
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { computeLeaveBlocks } from '../../src/leave-blocks.js';
import { store } from '../../src/store.js';

const PID = 'marie'; // personne ASV (présente dans ASV_PEOPLE)

// ─── Helpers ───────────────────────────────────────────────────────────────

function setSlotAbsent(iso, slot, { label = '', decision = null } = {}) {
  store.DATA.slots[`${iso}_${PID}_${slot}`] = 'absent';
  if (label) store.DATA.slots[`${iso}_${PID}_${slot}_label`] = label;
  if (decision) store.DATA.slots[`${iso}_${PID}_${slot}_decision`] = decision;
}

function setDayAbsent(iso, opts = {}) {
  setSlotAbsent(iso, 'M', opts);
  setSlotAbsent(iso, 'AM', opts);
}

// ─── Suite ─────────────────────────────────────────────────────────────────

describe('computeLeaveBlocks', () => {
  beforeEach(() => {
    store.DATA.slots = {};
  });

  // 1. Plage démarrant en PM et finissant en M → bloc avec startSlot/endSlot partiels
  test('plage PM→M : lun-AM + mar-M absents → bloc de 2 demi-colonnes, slots partiels aux bords', () => {
    setSlotAbsent('2026-07-06', 'AM'); // lundi après-midi seulement
    setSlotAbsent('2026-07-07', 'M');  // mardi matin seulement

    const map = computeLeaveBlocks(PID, 2026, 6);

    // spanHalves=2 (AM lun + M mar), startSlot='AM', endSlot='M'
    expect(map.get('2026-07-06')).toMatchObject({ segmentStart: true, spanDays: 2, spanHalves: 2, startSlot: 'AM', endSlot: 'M', visualType: 'pending' });
    expect(map.get('2026-07-07')).toMatchObject({ segmentStart: false });
    expect(map.size).toBe(2);
  });

  // 1b. Début en PM : le premier jour partiel est inclus dans le bloc, startSlot='AM'
  test('début PM : lun-AM + mar-complet + mer-complet → bloc [lun-AM..mer-AM], startSlot=AM', () => {
    setSlotAbsent('2026-07-06', 'AM'); // lundi après-midi seulement (partiel)
    setDayAbsent('2026-07-07');        // mardi complet
    setDayAbsent('2026-07-08');        // mercredi complet

    const map = computeLeaveBlocks(PID, 2026, 6);

    // Lundi EST dans le bloc (startSlot='AM') ; spanHalves=5 (AM+M+AM+M+AM)
    expect(map.get('2026-07-06')).toMatchObject({ segmentStart: true, spanDays: 3, spanHalves: 5, startSlot: 'AM', endSlot: 'AM' });
    expect(map.get('2026-07-07')).toEqual({ segmentStart: false });
    expect(map.get('2026-07-08')).toEqual({ segmentStart: false });
    expect(map.size).toBe(3);
  });

  // 2. Plage sur deux semaines consécutives → deux segments, label sur chacun
  test('deux semaines : lun-sam sem1 + lun-mar sem2 → deux segments avec le même label', () => {
    const LBL = 'Repos planifié';
    // Semaine 1 : lun 6 → sam 11 (wd 0→5)
    for (const iso of ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11']) {
      setDayAbsent(iso, { label: LBL });
    }
    // dim 12 juillet → isSunday, sauté automatiquement par computeLeaveBlocks
    // Semaine 2 : lun 13 → mar 14 (wd 0→1)
    for (const iso of ['2026-07-13', '2026-07-14']) {
      setDayAbsent(iso, { label: LBL });
    }

    const map = computeLeaveBlocks(PID, 2026, 6);

    // Segment 1 : lun 6 (wd 0) → sam 11 (wd 5), span = 6
    expect(map.get('2026-07-06')).toMatchObject({ segmentStart: true, spanDays: 6, label: LBL, visualType: 'repos' });
    for (const iso of ['2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11']) {
      expect(map.get(iso)).toEqual({ segmentStart: false });
    }
    // Segment 2 : lun 13 (wd 0) → mar 14 (wd 1), span = 2, même label
    expect(map.get('2026-07-13')).toMatchObject({ segmentStart: true, spanDays: 2, label: LBL, visualType: 'repos' });
    expect(map.get('2026-07-14')).toEqual({ segmentStart: false });
    // Dimanche absent de la Map
    expect(map.has('2026-07-12')).toBe(false);
  });

  // 3. Semaine à cheval sur deux mois → label présent dans chaque mois
  test('mois à cheval : chaque appel mensuel retourne son segment avec le label', () => {
    const LBL = 'Repos planifié';
    // Fin juillet : mer 29 → ven 31 (wd 2→4)
    for (const iso of ['2026-07-29', '2026-07-30', '2026-07-31']) {
      setDayAbsent(iso, { label: LBL });
    }
    // Début août : lun 3 → mer 5 (wd 0→2)
    for (const iso of ['2026-08-03', '2026-08-04', '2026-08-05']) {
      setDayAbsent(iso, { label: LBL });
    }

    const mapJul = computeLeaveBlocks(PID, 2026, 6);
    const mapAug = computeLeaveBlocks(PID, 2026, 7);

    // Juillet : segment mer 29 → ven 31, spanDays = 4-2+1 = 3
    expect(mapJul.get('2026-07-29')).toMatchObject({ segmentStart: true, spanDays: 3, label: LBL });
    expect(mapJul.get('2026-07-30')).toEqual({ segmentStart: false });
    expect(mapJul.get('2026-07-31')).toEqual({ segmentStart: false });

    // Août : segment lun 3 → mer 5, spanDays = 2-0+1 = 3
    expect(mapAug.get('2026-08-03')).toMatchObject({ segmentStart: true, spanDays: 3, label: LBL });
    expect(mapAug.get('2026-08-04')).toEqual({ segmentStart: false });
    expect(mapAug.get('2026-08-05')).toEqual({ segmentStart: false });
  });

  // 4. Demi-journée isolée → pas de bloc
  test('demi-journée isolée : un seul slot absent → Map vide', () => {
    setSlotAbsent('2026-07-06', 'M'); // lundi matin uniquement

    const map = computeLeaveBlocks(PID, 2026, 6);

    expect(map.size).toBe(0);
  });

  // 4b. Journée complète isolée → pas de segment fusionné (1 seul jour = seg.length < 2)
  test('journée complète seule (M + AM du même jour) → pas de cellule fusionnée', () => {
    setDayAbsent('2026-07-06');

    const map = computeLeaveBlocks(PID, 2026, 6);

    expect(map.size).toBe(0);
  });

  // 5. Mélange de types → deux blocs distincts, jamais fusionnés ensemble
  test('types différents : pending lun→mar + maladie mer→jeu → deux blocs séparés', () => {
    // Lundi + mardi : congé en attente (pas de décision → 'pending' par défaut)
    setDayAbsent('2026-07-06');
    setDayAbsent('2026-07-07');
    // Mercredi + jeudi : arrêt maladie
    setDayAbsent('2026-07-08', { label: 'Arrêt maladie' });
    setDayAbsent('2026-07-09', { label: 'Arrêt maladie' });

    const map = computeLeaveBlocks(PID, 2026, 6);

    // Bloc pending : lun-mar (wd 0→1), spanDays = 2
    expect(map.get('2026-07-06')).toMatchObject({ segmentStart: true, spanDays: 2, visualType: 'pending' });
    expect(map.get('2026-07-07')).toEqual({ segmentStart: false });

    // Bloc maladie : mer-jeu (wd 2→3), spanDays = 2
    expect(map.get('2026-07-08')).toMatchObject({ segmentStart: true, spanDays: 2, visualType: 'sick' });
    expect(map.get('2026-07-09')).toEqual({ segmentStart: false });

    // Exactement 4 entrées, aucune fusion entre les deux blocs
    expect(map.size).toBe(4);
  });

  // 6. Trou au milieu d'une plage → scission en deux blocs
  test('trou au milieu : lun-mar absent, mer présent, jeu-ven absent → deux blocs', () => {
    setDayAbsent('2026-07-06');
    setDayAbsent('2026-07-07');
    // Mercredi Jul 8 : présent (non défini → état vide)
    setDayAbsent('2026-07-09');
    setDayAbsent('2026-07-10');

    const map = computeLeaveBlocks(PID, 2026, 6);

    // Bloc 1 : lun-mar (wd 0→1), spanDays = 2
    expect(map.get('2026-07-06')).toMatchObject({ segmentStart: true, spanDays: 2 });
    expect(map.get('2026-07-07')).toEqual({ segmentStart: false });
    // Mercredi absent de la Map (non affecté)
    expect(map.has('2026-07-08')).toBe(false);
    // Bloc 2 : jeu-ven (wd 3→4), spanDays = 2
    expect(map.get('2026-07-09')).toMatchObject({ segmentStart: true, spanDays: 2 });
    expect(map.get('2026-07-10')).toEqual({ segmentStart: false });
  });

  // Bonus : mois sans aucune absence
  test('mois sans absence → Map vide', () => {
    expect(computeLeaveBlocks(PID, 2026, 6).size).toBe(0);
  });

  // Bonus : congé approuvé → visualType différent de pending
  test('congé approuvé : visualType = "approved"', () => {
    setDayAbsent('2026-07-06', { decision: 'approved' });
    setDayAbsent('2026-07-07', { decision: 'approved' });

    const map = computeLeaveBlocks(PID, 2026, 6);

    expect(map.get('2026-07-06')).toMatchObject({ segmentStart: true, spanDays: 2, visualType: 'approved' });
  });
});
