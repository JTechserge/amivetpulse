// Reçoit le PDF base64 généré côté client après confirmation de signature,
// vérifie que l'appelant est bien le propriétaire de la signature, upload dans
// le bucket Storage signed-sheets, puis stocke le chemin dans monthly_signatures.
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;

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
      `${SUPABASE_URL}/rest/v1/monthly_signatures?id=eq.${encodeURIComponent(signature_id)}&select=id,person_id,year,month,status`,
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

    // Stocker le chemin dans la ligne de signature
    await fetch(
      `${SUPABASE_URL}/rest/v1/monthly_signatures?id=eq.${encodeURIComponent(signature_id)}`,
      {
        method: 'PATCH',
        headers: { ...SVC, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ pdf_path: pdfPath }),
      });

    return new Response(JSON.stringify({ ok: true, pdf_path: pdfPath }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
