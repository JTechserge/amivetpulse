// Appelée par le vétérinaire quand il clique "Signer le prévisionnel" sur la page d'une ASV.
// Génère un token à usage unique, l'enregistre en base avec type='forecast',
// puis envoie un email à l'ASV contenant un lien de signature unique (valable 7 jours).
// La signature n'est enregistrée que lorsque l'ASV clique le lien et confirme
// dans l'app — en étant authentifiée, ce qui lie la signature à son compte Supabase.
import { wrapEmailHtml, buttonHtml, APP_URL, COLORS } from '../_shared/email-template.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
const TOKEN_VALID_DAYS = 7;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://jtechserge.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non authentifié.' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Vérifier l'identité du demandeur (doit être vét ou admin)
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: authHeader },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const authUser = await userRes.json();

    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=person_id,display_name,role`,
      {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      }
    );
    const [requesterProfile] = await profRes.json();
    if (!requesterProfile || !['vet', 'admin'].includes(requesterProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'Seuls les vétérinaires et admins peuvent demander une signature de prévisionnel.' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { person_id, year, pdf_base64 } = await req.json();
    if (!person_id || typeof year !== 'number') {
      return new Response(JSON.stringify({ error: 'person_id et year sont requis.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Trouver le profil de l'ASV destinataire
    const asvProfRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?person_id=eq.${encodeURIComponent(person_id)}&select=id,display_name,role`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const [asvProfile] = await asvProfRes.json();
    if (!asvProfile) {
      return new Response(JSON.stringify({ error: 'ASV introuvable — aucun compte associé à cet identifiant.' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Récupérer l'email Supabase de l'ASV
    const asvAuthRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${asvProfile.id}`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    if (!asvAuthRes.ok) {
      return new Response(JSON.stringify({ error: "Impossible de récupérer l'email de l'ASV." }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const asvAuth = await asvAuthRes.json();
    const asvEmail = asvAuth.email;
    const asvName = asvProfile.display_name || asvEmail;

    // Vérifier si le prévisionnel est déjà signé
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/forecast_signatures?person_id=eq.${encodeURIComponent(person_id)}&year=eq.${year}&select=id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const existing = await existingRes.json();
    if (existing.length > 0) {
      return new Response(JSON.stringify({ error: `Le prévisionnel ${year} de ${asvName} est déjà signé.` }), {
        status: 409,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Supprimer les anciens tokens forecast non utilisés pour cet ASV/année
    await fetch(
      `${SUPABASE_URL}/rest/v1/signature_tokens?person_id=eq.${encodeURIComponent(person_id)}&year=eq.${year}&type=eq.forecast`,
      { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );

    // Créer le nouveau token
    const expiresAt = new Date(Date.now() + TOKEN_VALID_DAYS * 86400 * 1000).toISOString();
    const tokenRes = await fetch(`${SUPABASE_URL}/rest/v1/signature_tokens`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ person_id, year, type: 'forecast', expires_at: expiresAt }),
    });
    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Erreur lors de la création du token.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const [tokenRow] = await tokenRes.json();
    const signingLink = `${APP_URL}?sign-forecast=${tokenRow.id}`;
    const vetName = requesterProfile.display_name || authUser.email;

    // Email à l'ASV
    const emailBody = `
      <p style="font-size:15px;font-weight:700;color:${COLORS.text};margin-bottom:8px;">Signature de votre prévisionnel ${year}</p>
      <p style="color:${COLORS.textMuted};font-size:13.5px;margin-bottom:16px;">
        <strong>${vetName}</strong> vous demande de signer électroniquement votre prévisionnel annuel ${year}.
        Cliquez sur le bouton ci-dessous pour visualiser et signer le document.
      </p>
      ${buttonHtml(signingLink, `Signer mon prévisionnel ${year}`)}
      <p style="font-size:12px;color:${COLORS.textFaint};margin-top:4px;">
        Ce lien est valable ${TOKEN_VALID_DAYS} jours et à usage unique.<br>
        Si vous n'avez pas été concernée par cette demande, ignorez simplement cet email.
      </p>
      <hr style="border:none;border-top:1px solid ${COLORS.border};margin:20px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F8FAFC;border-radius:8px;padding:12px 16px;"><tr><td style="font-size:12px;color:${COLORS.textMuted};">
        <strong style="color:${COLORS.text};">Année</strong> : ${year}<br>
        <strong style="color:${COLORS.text};">Demandé par</strong> : ${vetName}<br>
        <strong style="color:${COLORS.text};">Pour</strong> : ${asvName}
      </td></tr></table>`;

    let emailSent = false;
    let emailError = '';
    try {
      console.log('[brevo] sending forecast sig request to', asvEmail);
      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Amivet PULSE', email: 'jeremie.pvt@gmail.com' },
          to: [{ email: asvEmail, name: asvName }],
          subject: `Signature requise — Prévisionnel ${year} · Amivet`,
          htmlContent: wrapEmailHtml(emailBody),
          trackClicks: false,
          trackOpens: false,
          ...(pdf_base64
            ? { attachment: [{ content: pdf_base64, name: `previsionnel-${year}-${person_id}.pdf` }] }
            : {}),
        }),
      });
      const brevoBody = await emailRes.text();
      console.log('[brevo] status', emailRes.status, brevoBody);
      if (emailRes.ok) {
        emailSent = true;
      } else {
        emailError = `Brevo HTTP ${emailRes.status}: ${brevoBody}`;
      }
    } catch (err) {
      emailError = String((err as Error)?.message || err);
    }

    return new Response(JSON.stringify({ signing_link: signingLink, email_sent: emailSent, email_error: emailError }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
