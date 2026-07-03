// Appelée quand l'ASV clique "Confirmer ma signature" dans l'app après avoir ouvert
// le lien reçu par email. Vérifie le token, enregistre la signature avec l'auth.uid()
// et l'email du compte connecté (preuve d'identité SES eIDAS), marque le token comme
// utilisé (anti-rejeu), et envoie un email de confirmation valant reçu de signature.
import { wrapEmailHtml, APP_URL, COLORS } from '../_shared/email-template.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

Deno.serve(async (req) => {
  if(req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try{
    const authHeader = req.headers.get('Authorization');
    if(!authHeader){
      return new Response(JSON.stringify({ error: 'Non authentifié.' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const { token_id } = await req.json();
    if(!token_id){
      return new Response(JSON.stringify({ error: 'token_id manquant.' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Vérifier l'identité de l'utilisateur connecté
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: authHeader },
    });
    if(!userRes.ok){
      return new Response(JSON.stringify({ error: 'Token invalide.' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const authUser = await userRes.json();

    // Récupérer le profil
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=person_id,display_name,role`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    const [profile] = await profRes.json();
    if(!profile || !profile.person_id){
      return new Response(JSON.stringify({ error: 'Profil introuvable.' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Récupérer et valider le token
    const tokenRes = await fetch(`${SUPABASE_URL}/rest/v1/signature_tokens?id=eq.${encodeURIComponent(token_id)}&select=*`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    const [tokenRow] = await tokenRes.json();

    if(!tokenRow){
      return new Response(JSON.stringify({ error: 'Lien invalide ou introuvable.' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if(tokenRow.used_at){
      return new Response(JSON.stringify({ error: 'Ce lien a déjà été utilisé.' }), { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if(new Date(tokenRow.expires_at) < new Date()){
      return new Response(JSON.stringify({ error: 'Ce lien a expiré — demandez un nouvel email depuis l\'app.' }), { status: 410, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    // Vérifier que le compte connecté est bien celui auquel appartient le token
    if(tokenRow.person_id !== profile.person_id){
      return new Response(JSON.stringify({ error: 'Ce lien ne correspond pas à votre compte.' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const { year, month, person_id } = tokenRow;
    const displayName: string = profile.display_name || authUser.email;
    const monthLabel = `${MONTH_NAMES_FR[month]} ${year}`;
    const signedAt = new Date().toISOString();
    const signedDateFR = new Date(signedAt).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    });

    // Enregistrer la signature avec les preuves d'identité
    const sigRes = await fetch(`${SUPABASE_URL}/rest/v1/monthly_signatures`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        person_id,
        year,
        month,
        signed_at:          signedAt,
        signed_name:        displayName,
        signed_by_user_id:  authUser.id,
        signed_by_email:    authUser.email,
        token_id,
      }),
    });
    if(!sigRes.ok) throw new Error(`Erreur insertion signature HTTP ${sigRes.status} — ${await sigRes.text()}`);

    // Invalider le token (usage unique)
    await fetch(`${SUPABASE_URL}/rest/v1/signature_tokens?id=eq.${encodeURIComponent(token_id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ used_at: signedAt }),
    });

    // Email de confirmation — vaut reçu de signature électronique
    const confirmHtml = wrapEmailHtml(`
      <h1 style="font-size:18px;color:${COLORS.text};margin:0 0 4px;">✅ Feuille de présence signée</h1>
      <p style="font-size:14px;color:${COLORS.textMuted};margin:0 0 20px;">
        Bonjour <strong>${displayName}</strong>,<br>
        Votre feuille de présence pour <strong>${monthLabel}</strong> a été signée électroniquement.
        Conservez cet email comme preuve de signature.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="border:1px solid ${COLORS.border};border-radius:10px;overflow:hidden;margin-bottom:20px;">
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid ${COLORS.border};">
            <div style="font-size:11.5px;color:${COLORS.textMuted};margin-bottom:3px;">Signataire</div>
            <div style="font-size:13.5px;font-weight:700;color:${COLORS.text};">${displayName}</div>
            <div style="font-size:12px;color:${COLORS.textMuted};">${authUser.email}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid ${COLORS.border};">
            <div style="font-size:11.5px;color:${COLORS.textMuted};margin-bottom:3px;">Période certifiée</div>
            <div style="font-size:13.5px;font-weight:700;color:${COLORS.text};">${monthLabel}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid ${COLORS.border};">
            <div style="font-size:11.5px;color:${COLORS.textMuted};margin-bottom:3px;">Date et heure de signature</div>
            <div style="font-size:13.5px;font-weight:700;color:${COLORS.text};">${signedDateFR} (heure de Paris)</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;">
            <div style="font-size:11.5px;color:${COLORS.textMuted};margin-bottom:3px;">Identifiant de signature</div>
            <div style="font-size:11px;color:${COLORS.textFaint};font-family:monospace;word-break:break-all;">${token_id}</div>
          </td>
        </tr>
      </table>
      <p style="font-size:11.5px;color:${COLORS.textFaint};margin:0;">
        Signature électronique simple (SES) au sens du règlement eIDAS (UE n°910/2014).
      </p>
    `);

    const confirmText = [
      `Bonjour ${displayName},`,
      '',
      `Votre feuille de présence pour ${monthLabel} a été signée électroniquement.`,
      '',
      `Signataire : ${displayName} (${authUser.email})`,
      `Période    : ${monthLabel}`,
      `Date       : ${signedDateFR} (heure de Paris)`,
      `Identifiant: ${token_id}`,
      '',
      'Conservez cet email comme preuve de votre signature électronique (SES — règlement eIDAS).',
      '',
      '— Amivet PULSE',
    ].join('\n');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Amivet PULSE <onboarding@resend.dev>',
        to: [authUser.email],
        subject: `Amivet PULSE — Confirmation de signature — ${monthLabel}`,
        text: confirmText,
        html: confirmHtml,
      }),
    });

    return new Response(
      JSON.stringify({ ok: true, person_id, year, month, signed_at: signedAt }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
