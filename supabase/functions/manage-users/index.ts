import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wrapEmailHtml, buttonHtml, APP_URL, COLORS } from '../_shared/email-template.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  vet: 'Vétérinaire',
  asv: 'ASV',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Non authentifié.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Vérifier l'identité du demandeur via l'API Auth (évite la récursion RLS de user_profiles)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authHeader },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const authUser = await userRes.json();

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

      // generateLink crée l'utilisateur ET retourne le lien d'invitation SANS envoyer
      // l'email Supabase par défaut — on envoie notre propre email aux couleurs du site.
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: APP_URL },
      });
      if (linkError) throw new Error(linkError.message);

      const inviteLink = linkData.properties.action_link;
      const userId = linkData.user.id;

      // Créer le profil dans user_profiles
      const { error: profileError } = await adminClient.from('user_profiles').upsert({
        id: userId,
        role,
        display_name,
        person_id: person_id || null,
        can_edit_vet_calendar: false,
        can_edit_all_asv: false,
      });
      if (profileError) throw new Error(profileError.message);

      // Email d'invitation personnalisé via Resend
      const roleLabel = ROLE_LABELS[role] || role;
      const html = wrapEmailHtml(`
        <h1 style="font-size:18px;color:${COLORS.text};margin:0 0 4px;">👋 Bienvenue sur Amivet PULSE</h1>
        <p style="font-size:14px;color:${COLORS.textMuted};line-height:1.6;margin:0 0 20px;">
          Bonjour <strong>${display_name}</strong>,<br>
          Vous avez été invité(e) à rejoindre <strong>Amivet PULSE</strong> en tant que <strong>${roleLabel}</strong>.
          Cliquez sur le bouton ci-dessous pour créer votre espace et choisir votre mot de passe.
        </p>
        ${buttonHtml(inviteLink, 'Créer mon espace')}
        <p style="font-size:12.5px;color:${COLORS.textMuted};margin:0 0 8px;">
          Ce lien est valable 24 heures. Si le bouton ne fonctionne pas, copiez ce lien :
        </p>
        <p style="font-size:12px;color:${COLORS.primary};word-break:break-all;margin:0 0 20px;">${inviteLink}</p>
        <p style="font-size:12px;color:${COLORS.textFaint};margin:0;">
          Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
        </p>
      `);

      const text = [
        `Bonjour ${display_name},`,
        '',
        `Vous avez été invité(e) à rejoindre Amivet PULSE en tant que ${roleLabel}.`,
        '',
        'Cliquez sur ce lien pour créer votre espace (valable 24 heures) :',
        inviteLink,
        '',
        '— Amivet PULSE',
      ].join('\n');

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Amivet PULSE <onboarding@resend.dev>',
          to: [email],
          subject: 'Amivet PULSE — Votre invitation',
          text,
          html,
        }),
      });
      if (!emailRes.ok) throw new Error(`Email non envoyé (Resend HTTP ${emailRes.status})`);

      return new Response(JSON.stringify({ ok: true, user_id: userId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const { user_id } = body;
      if (!user_id) return new Response(JSON.stringify({ error: 'user_id requis.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { error: delError } = await adminClient.auth.admin.deleteUser(user_id);
      if (delError) throw new Error(delError.message);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Action inconnue : ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
