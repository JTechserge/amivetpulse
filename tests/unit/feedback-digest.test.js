import { describe, it, expect } from 'vitest';
import { buildDigest, isSensitive } from '../../scripts/feedback-digest.mjs';

const AT = new Date('2026-08-16T06:00:00.000Z');

function row(over = {}) {
  return {
    id: 'f-1',
    created_at: '2026-08-14T07:30:00.000Z',
    severity: 'normal',
    status: 'nouveau',
    role: 'asv',
    screen: 'ASV › Calendrier mensuel',
    app_version: 'amivet-v5',
    message: 'le bouton ne répond pas',
    admin_note: null,
    ...over,
  };
}

describe('isSensitive', () => {
  it('repère ce qui touche à la paie, aux congés ou aux signatures', () => {
    expect(isSensitive(row({ message: 'mes heures du samedi sont fausses' }))).toBe(true);
    expect(isSensitive(row({ message: 'impossible de poser un congé' }))).toBe(true);
    expect(isSensitive(row({ message: 'la feuille signée est vide' }))).toBe(true);
    expect(isSensitive(row({ message: 'un jour férié apparaît travaillé' }))).toBe(true);
  });

  it("regarde aussi l'écran, pas seulement le message", () => {
    expect(
      isSensitive(row({ message: 'colonne vide', screen: 'Tableau de bord › Feuilles signées' }))
    ).toBe(true);
  });

  it("laisse passer un signalement d'interface ordinaire", () => {
    expect(isSensitive(row({ message: 'le menu se ferme trop vite', screen: 'Annonces' }))).toBe(
      false
    );
  });

  it('ne casse pas sur une ligne incomplète', () => {
    expect(isSensitive({})).toBe(false);
    expect(isSensitive(undefined)).toBe(false);
  });
});

describe('buildDigest', () => {
  it("dit clairement qu'il n'y a rien à faire", () => {
    const md = buildDigest([], AT);
    expect(md).toContain('# Signalements à traiter — 2026-08-16');
    expect(md).toContain('Aucun signalement ouvert');
  });

  it('classe du plus bloquant au moins urgent', () => {
    const md = buildDigest(
      [
        row({ id: 'a', severity: 'confort', message: 'ce serait plus joli en bleu' }),
        row({ id: 'b', severity: 'bloquant', message: 'impossible de me connecter' }),
        row({ id: 'c', severity: 'normal', message: 'le menu clignote' }),
      ],
      AT
    );
    expect(md.indexOf('🛑 Bloquants')).toBeLessThan(md.indexOf('⚠️ Gênants'));
    expect(md.indexOf('⚠️ Gênants')).toBeLessThan(md.indexOf('💡 Confort'));
  });

  it('marque « décision humaine » ce qui touche à la paie', () => {
    const md = buildDigest([row({ message: 'mes heures de samedi sont fausses' })], AT);
    expect(md).toContain('Décision humaine requise');
    expect(md).toContain('dont 1 à décision humaine');
  });

  it("ne marque pas un signalement d'interface", () => {
    const md = buildDigest([row({ message: 'le menu clignote', screen: 'Annonces' })], AT);
    expect(md).not.toContain('Décision humaine requise');
  });

  it("n'escamote pas un signalement de gravité inconnue", () => {
    // Une gravité hors énumération viendrait forcément d'une écriture directe
    // en base ; la faire disparaître du digest serait le pire comportement.
    const md = buildDigest([row({ id: 'z', severity: 'urgentissime' })], AT);
    expect(md).toContain('Gravité inconnue');
    expect(md).toContain('z');
  });

  it('reporte le contexte utile au triage', () => {
    const md = buildDigest([row({ admin_note: 'déjà vu la semaine dernière' })], AT);
    expect(md).toContain('ASV › Calendrier mensuel');
    expect(md).toContain('amivet-v5');
    expect(md).toContain('déjà vu la semaine dernière');
    expect(md).toContain('2026-08-14 07:30');
  });

  it('cite le message en bloc, y compris sur plusieurs lignes', () => {
    const md = buildDigest([row({ message: 'première ligne\nseconde ligne' })], AT);
    expect(md).toContain('> première ligne');
    expect(md).toContain('> seconde ligne');
  });

  it('rappelle les garde-fous à chaque digest non vide', () => {
    const md = buildDigest([row()], AT);
    expect(md).toContain('sans relecture');
  });
});
