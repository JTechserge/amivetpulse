// Email d'accès envoyé par manage-users : invitation (premier accès, choix du mot
// de passe) ou réinitialisation. L'invitation embarque le guide utilisateur du
// rôle invité, rendu depuis la même source que le guide de l'application
// (_shared/user-guide.js) : les deux ne peuvent pas diverger.
//
// Module pur (aucune API Deno) : tests/unit/access-email.test.js l'importe.
import { wrapEmailHtml, buttonHtml, COLORS } from './email-template.ts';
import { renderGuideEmailHtml, renderGuideText, escapeGuideText } from './user-guide.js';

export interface AccessEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildAccessEmail(opts: {
  displayName: string;
  accessLink: string;
  isInvite: boolean;
  role?: string | null;
}): AccessEmail {
  const { displayName, accessLink, isInvite, role } = opts;
  const subject = isInvite
    ? 'Amivet PULSE — Votre invitation'
    : 'Amivet PULSE — Réinitialisation de votre mot de passe';
  const title = isInvite ? '👋 Bienvenue sur Amivet PULSE' : '🔑 Réinitialisation de votre mot de passe';
  const bodyText = isInvite
    ? `Vous avez été invité(e) à rejoindre Amivet PULSE. Cliquez sur le bouton ci-dessous pour créer votre espace et choisir votre mot de passe.`
    : `Une réinitialisation de votre mot de passe a été demandée. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.`;
  const btnLabel = isInvite ? 'Créer mon espace' : 'Choisir mon nouveau mot de passe';
  // Le guide n'accompagne que l'invitation : une réinitialisation s'adresse à
  // quelqu'un qui connaît déjà l'application.
  const withGuide = isInvite;

  const guideIntro = withGuide
    ? `<p style="font-size:13px;color:${COLORS.textMuted};line-height:1.6;margin:0 0 20px;">
          Votre guide d'utilisation figure ci-dessous. Il reste consultable à tout moment dans l'application : menu ⚙️ → <strong>Guide utilisateur &amp; FAQ</strong>.
        </p>`
    : '';

  const html = wrapEmailHtml(`
        <h1 style="font-size:18px;color:${COLORS.text};margin:0 0 4px;">${title}</h1>
        <p style="font-size:14px;color:${COLORS.textMuted};line-height:1.6;margin:0 0 20px;">
          Bonjour <strong>${escapeGuideText(displayName)}</strong>,<br>
          ${bodyText}
        </p>
        ${buttonHtml(accessLink, btnLabel)}
        <p style="font-size:12.5px;color:${COLORS.textMuted};margin:0 0 8px;">
          Ce lien est à usage unique. Si le bouton ne fonctionne pas, copiez ce lien :
        </p>
        <p style="font-size:12px;color:${COLORS.primary};word-break:break-all;margin:0 0 20px;">${accessLink}</p>
        ${guideIntro}
        <p style="font-size:12px;color:${COLORS.textFaint};margin:0;">
          Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
        </p>
        ${withGuide ? renderGuideEmailHtml(role, COLORS) : ''}
        <div style="display:none;font-size:1px;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
      `);

  const textLines = [
    `Bonjour ${displayName},`,
    '',
    bodyText,
    '',
    `${isInvite ? "Lien d'invitation" : 'Lien de réinitialisation'} (à usage unique) :`,
    accessLink,
    '',
    ...(withGuide ? [renderGuideText(role), ''] : []),
    '— Amivet PULSE',
  ].join('\n');

  return { subject, html, text: textLines };
}
