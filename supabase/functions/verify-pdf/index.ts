// Vérification d'intégrité d'un PDF signé : recalcule le HMAC-SHA256 du PDF
// fourni et le compare avec le hmac stocké en base lors de l'upload.
// Réservé aux admins. Requiert PDF_SIGNING_SECRET dans les secrets Edge Functions.
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY           = Deno.env.get('SUPABASE_ANON_KEY')!;
const PDF_SIGNING_SECRET = Deno.env.get('PDF_SIGNING_SECRET') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://jtechserge.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SVC = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

async function computeHmac(key: string, data: Uint8Array): Promise<string> {
  const keyBytes = new TextEncoder().encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, buf);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (!PDF_SIGNING_SECRET) {
      return new Response(JSON.stringify({ error: 'PDF_SIGNING_SECRET non configuré.' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non authentifié.' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Vérifier le JWT et le rôle admin
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`,
      { headers: { apikey: ANON_KEY, Authorization: authHeader } });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const authUser = await userRes.json();

    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=role`,
      { headers: SVC });
    const [profile] = await profRes.json();
    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Réservé aux admins.' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const { signature_id, pdf_base64 } = await req.json();
    if (!signature_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: 'signature_id et pdf_base64 requis.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Récupérer le HMAC stocké en base
    const sigRes = await fetch(
      `${SUPABASE_URL}/rest/v1/monthly_signatures?id=eq.${encodeURIComponent(signature_id)}&select=pdf_hmac,person_id,year,month,status`,
      { headers: SVC });
    const [sig] = await sigRes.json();
    if (!sig) {
      return new Response(JSON.stringify({ error: 'Signature introuvable.' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (!sig.pdf_hmac) {
      return new Response(JSON.stringify({ ok: true, valid: null, reason: 'Aucun HMAC stocké pour cette signature.' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Recalculer le HMAC du PDF fourni et comparer
    const pdfBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));
    const computedHmac = await computeHmac(PDF_SIGNING_SECRET, pdfBytes);
    const valid = computedHmac === sig.pdf_hmac;

    return new Response(JSON.stringify({
      ok: true,
      valid,
      signature_id,
      person_id: sig.person_id,
      year: sig.year,
      month: sig.month,
      status: sig.status,
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
