// Génère une URL signée temporaire (1h) pour un PDF du bucket signed-sheets.
// Contourne le problème auth.jwt() ->> 'role' (toujours 'authenticated' en Supabase)
// en vérifiant le rôle via user_profiles et en signant avec service_role.
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

    const { pdf_path } = await req.json();
    if (!pdf_path) {
      return new Response(JSON.stringify({ error: 'pdf_path manquant.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Vérifier le JWT
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`,
      { headers: { apikey: ANON_KEY, Authorization: authHeader } });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const authUser = await userRes.json();

    // Vérifier le rôle via user_profiles (pas via JWT — le claim 'role' est toujours 'authenticated')
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=role`,
      { headers: SVC });
    const [profile] = await profRes.json();
    if (!profile || !['vet', 'admin'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Réservé aux vétérinaires et admins.' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Télécharge le PDF directement avec service_role (bypasse la RLS Storage)
    // et le renvoie en proxy au navigateur — évite tout problème de path sur les signed URLs.
    const fileRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/signed-sheets/${pdf_path}`,
      { headers: SVC });
    if (!fileRes.ok) {
      throw new Error(`Storage fetch HTTP ${fileRes.status} — ${await fileRes.text()}`);
    }
    const pdfBytes = await fileRes.arrayBuffer();

    return new Response(pdfBytes, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=3600',
      },
    });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
