import { describe, it, expect } from 'vitest';
import {
  rowToASVPerson,
  asvPersonToInsertRow,
  asvChangedColumns,
  compareLegacyRoster,
} from '../../src/lib/asv-roster.js';

// Effectif ASV partagé : la fraction de temps proratise les CP acquis et la
// cible annuelle. Une conversion fausse ici = un récapitulatif de paie faux.

const row = {
  id: 'leo',
  name: 'Léo',
  short: 'Léo',
  initial: 'LE',
  last_name: 'Martin',
  color: '#0EA5E9',
  time_fraction: 0.2,
  working_days: [6],
  saturday_only: false,
  archived: false,
  sort_order: 4,
  updated_at: '2026-11-25T18:39:00.123456+00:00',
};

describe('rowToASVPerson', () => {
  it('convertit chaque colonne', () => {
    expect(rowToASVPerson(row)).toEqual({
      id: 'leo',
      name: 'Léo',
      short: 'Léo',
      initial: 'LE',
      lastName: 'Martin',
      color: '#0EA5E9',
      present: null,
      timeFraction: 0.2,
      workingDays: [6],
      saturdayOnly: false,
      archived: false,
      sortOrder: 4,
      updatedAt: '2026-11-25T18:39:00.123456+00:00',
    });
  });

  it('lit un numeric renvoyé en chaîne sans le transformer en temps plein', () => {
    expect(rowToASVPerson({ ...row, time_fraction: '0.75' }).timeFraction).toBe(0.75);
    // Une fraction absente n'est pas maquillée en 1 : elle reste visible comme invalide.
    expect(rowToASVPerson({ ...row, time_fraction: undefined }).timeFraction).toBeNaN();
  });

  it('garde null pour des jours non renseignés', () => {
    expect(rowToASVPerson({ ...row, working_days: null }).workingDays).toBeNull();
  });
});

describe('asvPersonToInsertRow', () => {
  it('produit une ligne complète avec la fraction choisie', () => {
    expect(
      asvPersonToInsertRow({
        id: 'nina',
        name: 'Nina',
        short: 'Nina',
        initial: 'NI',
        color: '#4F46E5',
        timeFraction: 0.6,
        workingDays: [1, 2, 3],
        sortOrder: 5,
      })
    ).toEqual({
      id: 'nina',
      name: 'Nina',
      short: 'Nina',
      initial: 'NI',
      last_name: null,
      color: '#4F46E5',
      time_fraction: 0.6,
      working_days: [1, 2, 3],
      saturday_only: false,
      archived: false,
      sort_order: 5,
    });
  });
});

describe('asvChangedColumns', () => {
  const person = rowToASVPerson(row);

  it('ne renvoie que les colonnes réellement modifiées', () => {
    expect(asvChangedColumns(person, { color: '#0EA5E9', timeFraction: 0.4, workingDays: [6] })).toEqual({
      time_fraction: 0.4,
    });
  });

  it('renvoie un objet vide quand rien ne change', () => {
    expect(asvChangedColumns(person, { lastName: 'Martin', workingDays: [6] })).toEqual({});
  });

  it('efface le nom de famille en null', () => {
    expect(asvChangedColumns(person, { lastName: null })).toEqual({ last_name: null });
    expect(asvChangedColumns(person, { lastName: '' })).toEqual({ last_name: null });
  });

  it('détecte un changement de jours travaillés', () => {
    expect(asvChangedColumns(person, { workingDays: [5, 6] })).toEqual({ working_days: [5, 6] });
    expect(asvChangedColumns(person, { workingDays: null })).toEqual({ working_days: null });
  });

  it('refuse un champ inconnu plutôt que de perdre la modification', () => {
    expect(() => asvChangedColumns(person, { timefraction: 0.5 })).toThrow(/inconnu/);
  });
});

describe('compareLegacyRoster', () => {
  const legacy = [
    { id: 'leo', short: 'Léo', timeFraction: 0.2, workingDays: [6], archived: false },
    { id: 'julie', short: 'Julie', timeFraction: 0.75, workingDays: null },
  ];
  const rows = [row, { ...row, id: 'julie', short: 'Julie', time_fraction: 0.75, working_days: null }];

  it('ne signale rien quand les effectifs concordent', () => {
    expect(compareLegacyRoster(legacy, rows)).toEqual([]);
  });

  it('ignore l’ordre des jours', () => {
    const l = [{ ...legacy[0], workingDays: [3, 1] }];
    const r = [{ ...row, working_days: [1, 3] }];
    expect(compareLegacyRoster(l, r)).toEqual([]);
  });

  it('signale fraction, jours, archivage et personnes manquantes de part et d’autre', () => {
    const l = [
      { id: 'leo', short: 'Léo', timeFraction: 0.21, workingDays: [5, 6], archived: true },
      { id: 'carla', short: 'Carla', timeFraction: 0.207 },
    ];
    const diffs = compareLegacyRoster(l, rows);
    expect(diffs).toHaveLength(5);
    expect(diffs).toContain('Carla : présente sur ce poste, absente de la base');
    expect(diffs).toContain('Julie : présente en base, absente de ce poste');
    expect(diffs).toContain('Léo : temps de travail 0.21 sur ce poste, 0.2 en base');
    expect(diffs).toContain('Léo : jours travaillés [5,6] sur ce poste, [6] en base');
    expect(diffs).toContain('Léo : archivée sur ce poste, active en base');
  });

  it('traite une fraction absente de la clé historique comme un temps plein', () => {
    const l = [{ id: 'julie', short: 'Julie', workingDays: null }];
    const r = [{ ...row, id: 'julie', short: 'Julie', time_fraction: 1, working_days: null }];
    expect(compareLegacyRoster(l, r)).toEqual([]);
  });
});
