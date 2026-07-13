// Écriture sécurisée du planning — remplace le PATCH REST direct sur planning_data.
// Vérifie les droits du demandeur côté serveur avant d'appliquer l'écriture en service_role.
// La RLS de planning_data bloque désormais tout PATCH authenticated direct (migration 20260714).
import {
  extractPersonIdFromKey,
  findChangedKeys,
  hasFullAccess,
  validateAsvWrite,
  type SlotsRecord,
} from '../_shared/planning-auth.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://jtechserge.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    // ── 1. Authentification ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Non authentifié.' }, 401);

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: authHeader },
    });
    if (!userRes.ok) return json({ error: 'Token invalide ou expiré.' }, 401);
    const authUser = await userRes.json();
    if (!authUser?.id) return json({ error: 'Token invalide.' }, 401);

    // ── 2. Profil utilisateur ────────────────────────────────────────────────
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=role,can_edit_vet_calendar,can_edit_all_asv,person_id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    const profiles = await profRes.json();
    const profile = profiles?.[0];
    if (!profile) return json({ error: 'Profil utilisateur introuvable.' }, 403);

    // ── 3. Payload ───────────────────────────────────────────────────────────
    let body: { slots?: SlotsRecord };
    try { body = await req.json(); } catch { return json({ error: 'Corps JSON invalide.' }, 400); }
    const { slots } = body;
    if (!slots || typeof slots !== 'object' || Array.isArray(slots)) {
      return json({ error: 'Le champ "slots" est requis et doit être un objet.' }, 400);
    }

    // ── 4. Vérification des droits ───────────────────────────────────────────
    if (!hasFullAccess(profile)) {
      // ASV basique : diff contre l'état actuel en base
      const currentRes = await fetch(
        `${SUPABASE_URL}/rest/v1/planning_data?id=eq.singleton&select=data`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
      );
      if (!currentRes.ok) throw new Error(`Lecture planning_data impossible (HTTP ${currentRes.status}).`);
      const currentRows = await currentRes.json();
      const currentSlots: SlotsRecord = currentRows?.[0]?.data ?? {};

      const changedKeys = findChangedKeys(currentSlots, slots);
      const authError = validateAsvWrite(changedKeys, profile.person_id);
      if (authError) return json({ error: authError }, 403);
    }

    // ── 5. Écriture en service_role (bypass RLS) ─────────────────────────────
    // Upsert : insère le singleton s'il n'existe pas encore, sinon met à jour.
    const writeRes = await fetch(`${SUPABASE_URL}/rest/v1/planning_data`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ id: 'singleton', data: slots, updated_at: new Date().toISOString() }),
    });
    if (!writeRes.ok) {
      const errText = await writeRes.text();
      throw new Error(`Écriture planning_data échouée (HTTP ${writeRes.status}): ${errText}`);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[save-planning]', e);
    return json({ error: (e as Error)?.message ?? String(e) }, 500);
  }
});
