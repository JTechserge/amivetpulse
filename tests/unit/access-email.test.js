import { describe, it, expect } from 'vitest';
import { buildAccessEmail } from '../../supabase/functions/_shared/access-email.ts';
import {
  guideAudience,
  guideSections,
  renderGuideAppSection,
  renderGuideEmailHtml,
  renderGuideText,
} from '../../supabase/functions/_shared/user-guide.js';
import { COLORS } from '../../supabase/functions/_shared/email-template.ts';
import { ROLES } from '../../src/lib/feedback-payload.js';

// Le guide a une source unique (_shared/user-guide.js), lue par l'application et
// par l'email d'invitation de manage-users. Ces tests verrouillent ce que chaque
// rôle reçoit et ce que l'email contient.

const LINK = 'https://example.supabase.co/auth/v1/verify?token=abc&type=invite';

function appText(role) {
  return guideSections(role).map(renderGuideAppSection).join('\n');
}

describe('guideAudience', () => {
  it('donne au vétérinaire salarié son propre guide, pas celui des associés', () => {
    expect(guideAudience('vet_employe')).toBe('salarie');
  });
  it('associé et admin partagent le guide associé ; ASV a le sien', () => {
    expect(guideAudience('vet')).toBe('associe');
    expect(guideAudience('admin')).toBe('associe');
    expect(guideAudience('asv')).toBe('asv');
  });
  it('couvre tous les rôles connus avec une présentation et une FAQ', () => {
    for (const role of ROLES) {
      const ids = guideSections(role).map((s) => s.id);
      expect(ids[0]).toBe('intro');
      expect(ids).toContain('faq');
    }
  });
});

describe('contenu par rôle', () => {
  it("n'apprend pas au salarié ni à l'ASV des actions qui leur sont fermées", () => {
    for (const role of ['vet_employe', 'asv']) {
      const txt = appText(role);
      expect(txt).not.toContain('✓ Approuver');
      expect(txt).not.toContain('Gérer les collaborateurs');
      expect(txt).not.toContain('Demander la signature');
    }
  });
  it('décrit au salarié sa barre d’outils réelle', () => {
    const txt = appText('vet_employe');
    for (const tool of ['✅ Présence', '🔵 Congé', '🤒 Maladie', '🤕 Accident', '🧹 Gomme']) {
      expect(txt).toContain(tool);
    }
  });
  it('présente le signalement de problème à tous les rôles', () => {
    for (const role of ROLES) expect(appText(role)).toContain('Signaler un problème');
  });
  it('ne parle plus que de quatre rôles', () => {
    expect(appText('vet')).not.toMatch(/trois niveaux/i);
    expect(appText('vet')).toContain('Vétérinaire salarié');
  });
});

describe("email d'invitation", () => {
  it('embarque le guide du rôle invité, en HTML et en texte', () => {
    const asv = buildAccessEmail({ displayName: 'Léa', accessLink: LINK, isInvite: true, role: 'asv' });
    expect(asv.html).toContain('📘 Guide utilisateur');
    expect(asv.html).toContain('Signer ma feuille de présence');
    expect(asv.text).toContain('GUIDE UTILISATEUR');
    expect(asv.text).toContain('Signer ma feuille de présence');

    const salarie = buildAccessEmail({ displayName: 'Paul', accessLink: LINK, isInvite: true, role: 'vet_employe' });
    expect(salarie.html).toContain('Renseigner mes jours de présence');
    expect(salarie.html).not.toContain('Signer ma feuille de présence');
  });

  it('reprend exactement le guide de l’application, pas une copie', () => {
    const html = buildAccessEmail({ displayName: 'Léa', accessLink: LINK, isInvite: true, role: 'vet' }).html;
    expect(html).toContain(renderGuideEmailHtml('vet', COLORS));
    expect(renderGuideText('vet')).toContain('Inviter un nouveau collaborateur (admin)');
  });

  it("n'ajoute pas le guide à une réinitialisation de mot de passe", () => {
    const mail = buildAccessEmail({ displayName: 'Léa', accessLink: LINK, isInvite: false, role: 'asv' });
    expect(mail.subject).toContain('Réinitialisation');
    expect(mail.html).not.toContain('Guide utilisateur');
    expect(mail.text).not.toContain('GUIDE UTILISATEUR');
  });

  it('contient le lien d’accès', () => {
    const mail = buildAccessEmail({ displayName: 'Léa', accessLink: LINK, isInvite: true, role: 'asv' });
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.text).toContain(LINK);
  });

  it('échappe le nom saisi par l’admin', () => {
    const mail = buildAccessEmail({ displayName: '<img src=x onerror=alert(1)>', accessLink: LINK, isInvite: true, role: 'asv' });
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img src=x');
  });

  it('reste sous le seuil où Gmail tronque le message (102 Ko)', () => {
    for (const role of ROLES) {
      const { html } = buildAccessEmail({ displayName: 'Léa', accessLink: LINK, isInvite: true, role });
      expect(new TextEncoder().encode(html).length).toBeLessThan(95_000);
    }
  });
});
