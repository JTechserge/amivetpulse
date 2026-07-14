// Reçoit le PDF base64 généré côté client après confirmation de signature,
// vérifie que l'appelant est bien le propriétaire de la signature, upload dans
// le bucket Storage signed-sheets, stocke le chemin dans monthly_signatures,
// puis envoie UN email de confirmation (avec PDF en pièce jointe) à l'ASV.
// Cet email remplace les deux anciens : "Confirmation de signature" + "Copie PDF".
import { wrapEmailHtml, COLORS } from '../_shared/email-template.ts';
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
const BREVO_API_KEY       = Deno.env.get('BREVO_API_KEY')!;
const PDF_SIGNING_SECRET  = Deno.env.get('PDF_SIGNING_SECRET') ?? '';

// HMAC-SHA256 du PDF — clé secrète connue uniquement de l'EF (jamais exposée au client).
async function computeHmac(key: string, data: Uint8Array): Promise<string> {
  const keyBytes = new TextEncoder().encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  // slice() retourne un ArrayBuffer strict (évite l'incompatibilité ArrayBufferLike en TS)
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, buf);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://jtechserge.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SVC = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non authentifié.' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const { signature_id, pdf_base64 } = await req.json();
    if (!signature_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Vérifier le JWT et récupérer l'uid
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`,
      { headers: { apikey: ANON_KEY, Authorization: authHeader } });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const authUser = await userRes.json();

    // Récupérer le person_id du compte connecté
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=person_id`,
      { headers: SVC });
    const [profile] = await profRes.json();
    if (!profile?.person_id) {
      return new Response(JSON.stringify({ error: 'Profil introuvable.' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Récupérer la signature et vérifier l'appartenance
    const sigRes = await fetch(
      `${SUPABASE_URL}/rest/v1/monthly_signatures?id=eq.${encodeURIComponent(signature_id)}&select=id,person_id,year,month,status,signed_name,signed_at,signed_by_email,token_id`,
      { headers: SVC });
    const [sig] = await sigRes.json();
    if (!sig) {
      return new Response(JSON.stringify({ error: 'Signature introuvable.' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (sig.person_id !== profile.person_id) {
      return new Response(JSON.stringify({ error: 'Accès refusé.' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (sig.status !== 'signed') {
      return new Response(JSON.stringify({ error: 'Signature non active.' }),
        { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Chemin : {person_id}/{year}-{MM}-{uuid}.pdf  (month est 0-indexé en base → +1 pour affichage)
    const mm = String(sig.month + 1).padStart(2, '0');
    const pdfPath = `${sig.person_id}/${sig.year}-${mm}-${sig.id}.pdf`;
    const pdfBytes = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/signed-sheets/${pdfPath}`,
      {
        method: 'POST',
        headers: { ...SVC, 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
        body: pdfBytes,
      });
    if (!uploadRes.ok) {
      throw new Error(`Upload Storage HTTP ${uploadRes.status} — ${await uploadRes.text()}`);
    }

    // Calcul du HMAC-SHA256 du PDF pour vérification d'intégrité (clé admin uniquement)
    let pdfHmac: string | undefined;
    if (PDF_SIGNING_SECRET) {
      pdfHmac = await computeHmac(PDF_SIGNING_SECRET, pdfBytes);
    }

    // Stocker le chemin (et le HMAC si disponible) dans la ligne de signature
    await fetch(
      `${SUPABASE_URL}/rest/v1/monthly_signatures?id=eq.${encodeURIComponent(signature_id)}`,
      {
        method: 'PATCH',
        headers: { ...SVC, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ pdf_path: pdfPath, ...(pdfHmac ? { pdf_hmac: pdfHmac } : {}) }),
      });

    // Email unique de confirmation avec PDF en pièce jointe (remplace les deux anciens emails)
    const monthLabel = `${MONTH_NAMES_FR[sig.month]} ${sig.year}`;
    const signedDateFR = new Date(sig.signed_at).toLocaleString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    });
    const subjectDate = new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    }).format(new Date(sig.signed_at)).replace(',', '');
    const displayName: string = sig.signed_name || authUser.email;
    const recipientEmail: string = sig.signed_by_email || authUser.email;
    const filename = `feuille-presence-${sig.person_id}-${sig.year}-${mm}.pdf`;
    const tokenId: string = sig.token_id || signature_id;

    const htmlContent = wrapEmailHtml(`
      <h1 style="font-size:18px;color:${COLORS.text};margin:0 0 4px;">✅ Feuille de présence signée</h1>
      <p style="font-size:14px;color:${COLORS.textMuted};margin:0 0 20px;">
        Bonjour <strong>${displayName}</strong>,<br>
        Votre feuille de présence pour <strong>${monthLabel}</strong> a été signée électroniquement.
        Vous trouverez le PDF en pièce jointe. Conservez cet email comme preuve de signature.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="border:1px solid ${COLORS.border};border-radius:10px;overflow:hidden;margin-bottom:20px;">
        <tr><td style="padding:12px 16px;border-bottom:1px solid ${COLORS.border};">
          <div style="font-size:11.5px;color:${COLORS.textMuted};margin-bottom:3px;">Signataire</div>
          <div style="font-size:13.5px;font-weight:700;color:${COLORS.text};">${displayName}</div>
          <div style="font-size:12px;color:${COLORS.textMuted};">${recipientEmail}</div>
        </td></tr>
        <tr><td style="padding:12px 16px;border-bottom:1px solid ${COLORS.border};">
          <div style="font-size:11.5px;color:${COLORS.textMuted};margin-bottom:3px;">Période certifiée</div>
          <div style="font-size:13.5px;font-weight:700;color:${COLORS.text};">${monthLabel}</div>
        </td></tr>
        <tr><td style="padding:12px 16px;border-bottom:1px solid ${COLORS.border};">
          <div style="font-size:11.5px;color:${COLORS.textMuted};margin-bottom:3px;">Date et heure de signature</div>
          <div style="font-size:13.5px;font-weight:700;color:${COLORS.text};">${signedDateFR} (heure de Paris)</div>
        </td></tr>
        <tr><td style="padding:12px 16px;">
          <div style="font-size:11.5px;color:${COLORS.textMuted};margin-bottom:3px;">Identifiant de signature</div>
          <div style="font-size:11px;color:${COLORS.textFaint};font-family:monospace;word-break:break-all;">${tokenId}</div>
        </td></tr>
      </table>
      <p style="font-size:11.5px;color:${COLORS.textFaint};margin:0;">
        Signature électronique simple (SES) au sens du règlement eIDAS (UE n°910/2014).
      </p>
    `);

    const textContent = [
      `Bonjour ${displayName},`,
      '',
      `Votre feuille de présence pour ${monthLabel} a été signée électroniquement.`,
      `Le PDF est joint à cet email.`,
      '',
      `Signataire : ${displayName} (${recipientEmail})`,
      `Période    : ${monthLabel}`,
      `Date       : ${signedDateFR} (heure de Paris)`,
      `Identifiant: ${tokenId}`,
      '',
      'Conservez cet email comme preuve de votre signature électronique (SES — règlement eIDAS).',
      '',
      '— Amivet PULSE',
    ].join('\n');

    fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Amivet PULSE', email: 'jeremie.pvt@gmail.com' },
        to: [{ email: recipientEmail, name: displayName }],
        subject: `Amivet PULSE — Confirmation de signature — feuille de présence ${monthLabel} — ${subjectDate}`,
        htmlContent,
        textContent,
        attachment: [{ name: filename, content: pdf_base64 }],
        trackClicks: false,
        trackOpens: false,
      }),
    }).catch(e => console.warn('Email confirmation non envoyé :', e));

    return new Response(JSON.stringify({ ok: true, pdf_path: pdfPath }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
