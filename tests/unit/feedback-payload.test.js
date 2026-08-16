import { describe, it, expect } from 'vitest';
import {
  describeScreen,
  validateFeedbackMessage,
  buildFeedbackPayload,
  MESSAGE_MAX,
} from '../../src/lib/feedback-payload.js';

const ASV = { id: 'u-asv-1', role: 'asv' };
const ADMIN = { id: 'u-admin-1', role: 'admin' };

describe('describeScreen', () => {
  it('traduit vue et sous-onglet en libellés lisibles', () => {
    expect(describeScreen({ view: 'dashboard', subTab: 'hours' })).toBe(
      'Tableau de bord › Suivi ASV'
    );
    expect(describeScreen({ view: 'asv', subTab: 'week' })).toBe('ASV › Hebdomadaire');
  });

  it('conserve un onglet inconnu plutôt que de perdre le contexte', () => {
    expect(describeScreen({ view: 'labo', subTab: 'stocks' })).toBe('labo › stocks');
  });

  it("se contente de la vue quand il n'y a pas de sous-onglet", () => {
    expect(describeScreen({ view: 'annonces' })).toBe('Annonces');
  });

  it('ne renvoie jamais une chaîne vide', () => {
    expect(describeScreen({})).toBe('Écran inconnu');
    expect(describeScreen()).toBe('Écran inconnu');
  });

  it("signale un admin en vue ASV, sinon le signalement se lit à l'envers", () => {
    expect(describeScreen({ view: 'asv', subTab: 'calendar', impersonating: true })).toBe(
      'ASV › Calendrier mensuel (admin en vue ASV)'
    );
    expect(describeScreen({ view: 'asv', subTab: 'calendar' })).not.toContain('admin');
  });

  it('tronque à 200 caractères', () => {
    const long = describeScreen({ view: 'x'.repeat(150), subTab: 'y'.repeat(150) });
    expect(long).toHaveLength(200);
  });
});

describe('validateFeedbackMessage', () => {
  it('refuse un message vide ou trop court, espaces non comptés', () => {
    expect(validateFeedbackMessage('').ok).toBe(false);
    expect(validateFeedbackMessage('   ').ok).toBe(false);
    expect(validateFeedbackMessage('bug').ok).toBe(false);
    expect(validateFeedbackMessage('  bug  ').ok).toBe(false);
  });

  it('refuse un message plus long que la contrainte SQL', () => {
    const res = validateFeedbackMessage('a'.repeat(MESSAGE_MAX + 1));
    expect(res.ok).toBe(false);
    expect(res.error).toContain(String(MESSAGE_MAX));
  });

  it('accepte les bornes exactes', () => {
    expect(validateFeedbackMessage('12345').ok).toBe(true);
    expect(validateFeedbackMessage('a'.repeat(MESSAGE_MAX)).ok).toBe(true);
  });

  it('rend une erreur affichable, pas un code', () => {
    expect(validateFeedbackMessage('x').error).toMatch(/^Décrivez/);
  });
});

describe('buildFeedbackPayload', () => {
  const base = { user: ASV, message: 'le bouton semaine ne répond pas' };

  it('refuse une session absente', () => {
    expect(() => buildFeedbackPayload({ ...base, user: null })).toThrow(/Session expirée/);
    expect(() => buildFeedbackPayload({ ...base, user: { role: 'asv' } })).toThrow(
      /Session expirée/
    );
  });

  it('refuse un rôle hors des quatre connus', () => {
    expect(() => buildFeedbackPayload({ ...base, user: { id: 'u', role: 'stagiaire' } })).toThrow(
      /Rôle utilisateur inconnu/
    );
  });

  it("propage l'erreur de validation du message", () => {
    expect(() => buildFeedbackPayload({ ...base, message: 'bug' })).toThrow(/5 caractères/);
  });

  it("rattache le signalement à l'auteur réel", () => {
    expect(buildFeedbackPayload(base).reported_by).toBe('u-asv-1');
  });

  it("enregistre le rôle réel, pas le mode d'affichage", () => {
    // Un admin qui consulte en vue ASV reste un admin : c'est `screen` qui
    // porte le mode d'affichage.
    const p = buildFeedbackPayload({
      user: ADMIN,
      message: 'la colonne réalisé est vide',
      screen: 'ASV › Calendrier mensuel (admin en vue ASV)',
    });
    expect(p.role).toBe('admin');
    expect(p.screen).toContain('admin en vue ASV');
  });

  it("n'envoie aucun champ réservé à l'administration", () => {
    // Les envoyer ferait échouer le WITH CHECK de la politique d'insertion.
    const p = buildFeedbackPayload(base);
    expect(Object.keys(p).sort()).toEqual([
      'app_version',
      'message',
      'reported_by',
      'role',
      'screen',
      'severity',
      'user_agent',
    ]);
  });

  it('nettoie le message des espaces de bord', () => {
    expect(buildFeedbackPayload({ ...base, message: '  souci de connexion  ' }).message).toBe(
      'souci de connexion'
    );
  });

  it('retombe sur « normal » pour une gravité absente ou inventée', () => {
    expect(buildFeedbackPayload(base).severity).toBe('normal');
    expect(buildFeedbackPayload({ ...base, severity: 'catastrophique' }).severity).toBe('normal');
  });

  it('conserve une gravité valide', () => {
    expect(buildFeedbackPayload({ ...base, severity: 'bloquant' }).severity).toBe('bloquant');
  });

  it("borne le user-agent et l'écran", () => {
    const p = buildFeedbackPayload({
      ...base,
      userAgent: 'U'.repeat(900),
      screen: 'S'.repeat(500),
    });
    expect(p.user_agent).toHaveLength(400);
    expect(p.screen).toHaveLength(200);
  });

  it("met null plutôt qu'une chaîne vide pour le contexte manquant", () => {
    const p = buildFeedbackPayload(base);
    expect(p.screen).toBeNull();
    expect(p.app_version).toBeNull();
    expect(p.user_agent).toBeNull();
  });
});
