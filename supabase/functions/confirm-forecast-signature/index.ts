// Appelée quand l'ASV clique "Confirmer ma signature" sur la page du prévisionnel.
// Vérifie le token (type='forecast', non expiré, correspond au compte connecté),
// enregistre la signature dans forecast_signatures, puis supprime le token (anti-rejeu).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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
      return new Response(JSON.stringify({ error: 'Non authentifié.' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const { token_id } = await req.json();
    if (!token_id) {
      return new Response(JSON.stringify({ error: 'token_id manquant.' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Vérifier l'identité du compte connecté
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: authHeader },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const authUser = await userRes.json();

    // Récupérer le profil Supabase
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=person_id,display_name,role`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const [profile] = await profRes.json();
    if (!profile?.person_id) {
      return new Response(JSON.stringify({ error: 'Profil introuvable.' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Récupérer et valider le token
    const tokenRes = await fetch(
      `${SUPABASE_URL}/rest/v1/signature_tokens?id=eq.${encodeURIComponent(token_id)}&select=*`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const [tokenRow] = await tokenRes.json();

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: 'Lien invalide ou introuvable.' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (tokenRow.type !== 'forecast') {
      return new Response(JSON.stringify({ error: "Ce lien n'est pas un lien de signature de prévisionnel." }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Ce lien a expiré — demandez un nouvel email de signature depuis l'app." }), { status: 410, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (tokenRow.person_id !== profile.person_id) {
      return new Response(JSON.stringify({ error: 'Ce lien ne correspond pas à votre compte.' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const { year, person_id } = tokenRow;
    const displayName: string = profile.display_name || authUser.email;
    const signedAt = new Date().toISOString();

    // Enregistrer la signature (contrainte unique person_id+year empêche les doublons)
    const sigRes = await fetch(`${SUPABASE_URL}/rest/v1/forecast_signatures`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        person_id,
        year,
        signed_at: signedAt,
        signed_by_uid: authUser.id,
        signed_by_name: displayName,
        signed_by_email: authUser.email,
      }),
    });
    if (!sigRes.ok) throw new Error(`Erreur insertion signature HTTP ${sigRes.status} — ${await sigRes.text()}`);
    const [insertedSig] = await sigRes.json();

    // Supprimer le token après usage (anti-rejeu)
    await fetch(`${SUPABASE_URL}/rest/v1/signature_tokens?id=eq.${encodeURIComponent(token_id)}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });

    return new Response(
      JSON.stringify({ ok: true, person_id, year, signed_at: signedAt, signature_id: insertedSig?.id ?? '' }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
