import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Vérifier que l'appelant est authentifié et a le rôle admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Non authentifié.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Client avec clé service pour les opérations admin (bypass RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Vérifier l'identité du demandeur via l'API Auth (évite la récursion RLS de user_profiles)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authHeader },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const authUser = await userRes.json();

    // Lire le profil via service role (bypass RLS) pour éviter la récursion infinie
    const { data: profile } = await adminClient.from('user_profiles').select('role').eq('id', authUser.id).single();
    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès réservé à l\'administrateur.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'invite') {
      const { email, display_name, role, person_id } = body;
      if (!email || !display_name || !role) {
        return new Response(JSON.stringify({ error: 'email, display_name et role sont requis.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Inviter l'utilisateur — Supabase envoie un email avec le lien de définition du mot de passe
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: 'https://jtechserge.github.io/amivetpulse/amivet-pulse.html',
        data: { display_name, role },
      });
      if (inviteError) throw new Error(inviteError.message);

      // Créer le profil dans user_profiles
      const { error: profileError } = await adminClient.from('user_profiles').upsert({
        id: invited.user.id,
        role,
        display_name,
        person_id: person_id || null,
        can_edit_vet_calendar: false,
        can_edit_all_asv: false,
      });
      if (profileError) throw new Error(profileError.message);

      return new Response(JSON.stringify({ ok: true, user_id: invited.user.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const { user_id } = body;
      if (!user_id) return new Response(JSON.stringify({ error: 'user_id requis.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { error: delError } = await adminClient.auth.admin.deleteUser(user_id);
      if (delError) throw new Error(delError.message);
      // user_profiles se supprime en cascade grâce à ON DELETE CASCADE
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Action inconnue : ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
