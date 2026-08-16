/* ================================================================
   TEMPS DE TRAVAIL CONTRACTUEL — ENJEU DE PAIE
   ----------------------------------------------------------------
   Ces tests protègent la valeur qui proratise les CP acquis et la
   cible annuelle. Ils ne recopient PAS la logique de production :
   ils vérifient des propriétés observables du contrat (une valeur
   inchangée à l'écran ressort intacte, une saisie illisible ne
   promeut personne à temps plein, une constante reste dérivée).
   ================================================================ */

import { describe, it, expect } from 'vitest';
import { ASV_PEOPLE, ASV_STD_SAT_CARLA, ASV_STD_SAT_SECOND, ASV_STD_WEEKDAY_AVG } from '../../src/config.js';
import {
  DAY_LABELS,
  FULLTIME_WEEKLY_HOURS,
  checkedDaySelector,
  dayCheckboxesHtml,
  daySelector,
  fractionFromDays,
  fractionFromPercent,
  percentForDisplay,
  presetForFraction,
  resolveTimeFraction,
} from '../../src/lib/time-fraction.js';

const carla = () => ASV_PEOPLE.find((p) => p.id === 'carla');

describe('la fraction de Carla reste DÉRIVÉE de la constante', () => {
  it("l'effectif par défaut vaut exactement ASV_STD_SAT_CARLA / 35", () => {
    // Assertion dure : 10 décimales. Un littéral recopié (0.21, 0.2119) échoue ici.
    expect(carla().timeFraction).toBeCloseTo(ASV_STD_SAT_CARLA / FULLTIME_WEEKLY_HOURS, 10);
  });

  it('ne vaut pas 7,25 / 35 — le bug corrigé par 5475ef0', () => {
    expect(carla().timeFraction).not.toBeCloseTo(7.25 / FULLTIME_WEEKLY_HOURS, 4);
  });

  it("s'affiche sur 21 %, ce qui est une perte d'information assumée à l'écran", () => {
    expect(percentForDisplay(carla().timeFraction)).toBe(21);
    expect(carla().timeFraction * 100).not.toBe(21);
  });
});

describe('resolveTimeFraction — une valeur non touchée ressort intacte', () => {
  it('enregistrer la fiche de Carla sans toucher au temps de travail ne change RIEN', () => {
    // Le scénario réel : le champ % est pré-rempli par percentForDisplay, l'admin
    // modifie la couleur, enregistre. L'ancien code écrivait 0,21.
    const before = carla().timeFraction;
    const r = resolveTimeFraction({
      preset: presetForFraction(before, null),
      percentValue: String(percentForDisplay(before)),
      checkedDays: [],
      currentFraction: before,
    });
    expect(r.fraction).toBe(before); // égalité stricte, pas une approximation
  });

  it('une vraie modification du pourcentage est bien enregistrée', () => {
    const r = resolveTimeFraction({
      preset: 'custom',
      percentValue: '30',
      checkedDays: [],
      currentFraction: carla().timeFraction,
    });
    expect(r.fraction).toBeCloseTo(0.3, 10);
  });

  it('un changement de preset écrase la valeur courante', () => {
    const r = resolveTimeFraction({ preset: 'half', checkedDays: [], currentFraction: 0.75 });
    expect(r.fraction).toBe(0.5);
    expect(r.workingDays).toBeNull();
  });

  it('des jours identiques ne réécrivent pas la fraction courante', () => {
    const days = [1, 2, 3];
    const current = fractionFromDays(days).fraction;
    const r = resolveTimeFraction({
      preset: 'days',
      checkedDays: [3, 1, 2], // même ensemble, autre ordre
      currentFraction: current,
      currentWorkingDays: days,
    });
    expect(r.fraction).toBe(current);
    expect(r.workingDays).toEqual(days);
  });

  it('un jour ajouté change bien la fraction', () => {
    const current = fractionFromDays([1, 2, 3]).fraction;
    const r = resolveTimeFraction({
      preset: 'days',
      checkedDays: [1, 2, 3, 4],
      currentFraction: current,
      currentWorkingDays: [1, 2, 3],
    });
    expect(r.fraction).toBeGreaterThan(current);
    expect(r.workingDays).toEqual([1, 2, 3, 4]);
  });
});

describe('fractionFromPercent — une saisie illisible ne promeut personne', () => {
  const cases = [
    ['champ vidé', ''],
    ['texte', 'abc'],
    ['zéro', '0'],
    ['négatif', '-40'],
    ['au-delà de 100', '150'],
  ];

  it.each(cases)('%s conserve la valeur courante', (_label, raw) => {
    expect(fractionFromPercent(raw, 0.75)).toBe(0.75);
  });

  it('sans valeur courante — personne neuve — retombe sur le temps plein', () => {
    expect(fractionFromPercent('', undefined)).toBe(1.0);
  });

  it('une saisie valide est convertie', () => {
    expect(fractionFromPercent('80', 0.75)).toBeCloseTo(0.8, 10);
  });
});

describe('presetForFraction — le preset affiché pour une valeur existante', () => {
  it('reconnaît les trois presets fixes', () => {
    expect(presetForFraction(1.0, null)).toBe('full');
    expect(presetForFraction(0.75, null)).toBe('three_quarter');
    expect(presetForFraction(0.5, null)).toBe('half');
  });

  it("classe la fraction de Carla en 'custom', pas en preset fixe", () => {
    expect(presetForFraction(carla().timeFraction, null)).toBe('custom');
  });

  it("classe en 'days' une fraction libre accompagnée de jours cochés", () => {
    expect(presetForFraction(0.4, [1, 2])).toBe('days');
  });

  it('traite une fraction absente comme un temps plein', () => {
    expect(presetForFraction(undefined, null)).toBe('full');
  });
});

describe('fractionFromDays — les durées viennent de config.js, pas de littéraux', () => {
  it('un samedi seul vaut la durée du samedi', () => {
    expect(fractionFromDays([6]).weekly).toBeCloseTo(ASV_STD_SAT_SECOND, 10);
  });

  it('cinq jours de semaine valent cinq fois la moyenne en semaine', () => {
    expect(fractionFromDays([1, 2, 3, 4, 5]).weekly).toBeCloseTo(5 * ASV_STD_WEEKDAY_AVG, 10);
  });

  it('la fraction est bien le rapport au temps plein', () => {
    const r = fractionFromDays([1, 2, 3, 4, 5]);
    expect(r.fraction).toBeCloseTo(r.weekly / FULLTIME_WEEKLY_HOURS, 3);
  });

  it('aucun jour coché vaut zéro, pas un temps plein', () => {
    expect(fractionFromDays([]).fraction).toBe(0);
  });
});
