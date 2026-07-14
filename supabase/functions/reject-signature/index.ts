// Annule une signature active : status → 'rejected', conservée en base pour l'historique.
// Réservé aux vétérinaires et admins. Les ASV ne peuvent pas rejeter leur propre signature.
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

    const { person_id, year, month } = await req.json();
    if (!person_id || year === undefined || month === undefined) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants.' }),
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

    // Vérifier que l'appelant est vet ou admin
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=role`,
      { headers: SVC });
    const [profile] = await profRes.json();
    if (!profile || !['vet', 'admin'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Réservé aux vétérinaires et admins.' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Retrouver la signature active
    const sigRes = await fetch(
      `${SUPABASE_URL}/rest/v1/monthly_signatures?person_id=eq.${encodeURIComponent(person_id)}&year=eq.${year}&month=eq.${month}&status=eq.signed&select=id`,
      { headers: SVC });
    const [sig] = await sigRes.json();
    if (!sig) {
      return new Response(JSON.stringify({ error: 'Aucune signature active trouvée.' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Passer en status 'rejected' — conservé en base pour l'historique
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/monthly_signatures?id=eq.${sig.id}`,
      {
        method: 'PATCH',
        headers: { ...SVC, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          status:      'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by: authUser.id,
        }),
      });
    if (!patchRes.ok) {
      throw new Error(`PATCH signature HTTP ${patchRes.status} — ${await patchRes.text()}`);
    }

    return new Response(JSON.stringify({ ok: true }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
