import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { wrapEmailHtml, buttonHtml, APP_URL, COLORS } from '../_shared/email-template.ts';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      return new Response(JSON.stringify({ error: "Accès réservé à l'administrateur." }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { action } = body;

    // --- LIST ---
    if (action === 'list') {
      const [{ data: profiles }, { data: authData }] = await Promise.all([
        adminClient.from('user_profiles').select('id,role,person_id,display_name,can_edit_vet_calendar,can_edit_all_asv'),
        adminClient.auth.admin.listUsers({ perPage: 1000 }),
      ]);

      const emailByUserId = new Map((authData?.users || []).map((u) => [u.id, u.email]));
      const result = (profiles || []).map((p) => ({
        ...p,
        email: emailByUserId.get(p.id) || null,
      }));

      return new Response(JSON.stringify({ ok: true, users: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- INVITE ---
    if (action === 'invite') {
      const { email, display_name, role } = body;
      if (!email || !display_name || !role) {
        return new Response(JSON.stringify({ error: 'email, display_name et role sont requis.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // inviteUserByEmail utilise l'infrastructure email de Supabase — aucune restriction
      // de domaine, fonctionne pour n'importe quelle adresse email.
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: APP_URL,
      });
      if (inviteError) throw new Error(inviteError.message);

      const userId = inviteData.user.id;

      const { error: profileError } = await adminClient.from('user_profiles').upsert({
        id: userId,
        role,
        display_name,
        person_id: null,
        can_edit_vet_calendar: false,
        can_edit_all_asv: false,
      });
      if (profileError) throw new Error(profileError.message);

      return new Response(JSON.stringify({ ok: true, user_id: userId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- UPDATE ---
    if (action === 'update') {
      const { user_id, email, display_name, role, person_id, can_edit_vet_calendar, can_edit_all_asv } = body;
      if (!user_id) return new Response(JSON.stringify({ error: 'user_id requis.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      if (email !== undefined) {
        const { error: emailError } = await adminClient.auth.admin.updateUserById(user_id, { email });
        if (emailError) throw new Error(`Email : ${emailError.message}`);
      }

      const profileUpdates: Record<string, unknown> = {};
      if (display_name !== undefined) profileUpdates.display_name = display_name;
      if (role !== undefined) profileUpdates.role = role;
      if ('person_id' in body) profileUpdates.person_id = person_id || null;
      if (can_edit_vet_calendar !== undefined) profileUpdates.can_edit_vet_calendar = can_edit_vet_calendar;
      if (can_edit_all_asv !== undefined) profileUpdates.can_edit_all_asv = can_edit_all_asv;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await adminClient.from('user_profiles').update(profileUpdates).eq('id', user_id);
        if (profileError) throw new Error(`Profil : ${profileError.message}`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- SEND_ACCESS_EMAIL ---
    if (action === 'send_access_email') {
      const { user_id, type: emailType } = body;
      if (!user_id) return new Response(JSON.stringify({ error: 'user_id requis.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { data: targetUserData, error: targetError } = await adminClient.auth.admin.getUserById(user_id);
      if (targetError || !targetUserData) throw new Error('Utilisateur introuvable.');

      const { data: targetProfile } = await adminClient.from('user_profiles').select('display_name').eq('id', user_id).single();
      const displayName = targetProfile?.display_name || targetUserData.user.email || 'Collaborateur';
      const targetEmail = targetUserData.user.email!;

      const linkType: 'invite' | 'recovery' = emailType === 'invite' ? 'invite' : 'recovery';
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: linkType,
        email: targetEmail,
        options: { redirectTo: APP_URL },
      });
      if (linkError) throw new Error(linkError.message);

      const accessLink = linkData.properties.action_link;
      const isInvite = linkType === 'invite';
      const subject = isInvite ? 'Amivet PULSE — Votre invitation' : 'Amivet PULSE — Réinitialisation de votre mot de passe';
      const title = isInvite ? '👋 Bienvenue sur Amivet PULSE' : '🔑 Réinitialisation de votre mot de passe';
      const bodyText = isInvite
        ? `Vous avez été invité(e) à rejoindre Amivet PULSE. Cliquez sur le bouton ci-dessous pour créer votre espace et choisir votre mot de passe.`
        : `Une réinitialisation de votre mot de passe a été demandée. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.`;
      const btnLabel = isInvite ? 'Créer mon espace' : 'Choisir mon nouveau mot de passe';

      const html = wrapEmailHtml(`
        <h1 style="font-size:18px;color:${COLORS.text};margin:0 0 4px;">${title}</h1>
        <p style="font-size:14px;color:${COLORS.textMuted};line-height:1.6;margin:0 0 20px;">
          Bonjour <strong>${displayName}</strong>,<br>
          ${bodyText}
        </p>
        ${buttonHtml(accessLink, btnLabel)}
        <p style="font-size:12.5px;color:${COLORS.textMuted};margin:0 0 8px;">
          Ce lien est à usage unique. Si le bouton ne fonctionne pas, copiez ce lien :
        </p>
        <p style="font-size:12px;color:${COLORS.primary};word-break:break-all;margin:0 0 20px;">${accessLink}</p>
        <p style="font-size:12px;color:${COLORS.textFaint};margin:0;">
          Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
        </p>
        <div style="display:none;font-size:1px;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
      `);

      const textLines = [
        `Bonjour ${displayName},`,
        '',
        bodyText,
        '',
        `${isInvite ? "Lien d'invitation" : 'Lien de réinitialisation'} (à usage unique) :`,
        accessLink,
        '',
        '— Amivet PULSE',
      ].join('\n');

      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Amivet PULSE', email: 'jeremie.pvt@gmail.com' },
          to: [{ email: targetEmail, name: displayName }],
          subject,
          textContent: textLines,
          htmlContent: html,
        }),
      });
      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        throw new Error(`Email non envoyé (Brevo HTTP ${emailRes.status}: ${errBody})`);
      }

      return new Response(JSON.stringify({ ok: true, email: targetEmail }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- DELETE ---
    if (action === 'delete') {
      const { user_id } = body;
      if (!user_id) return new Response(JSON.stringify({ error: 'user_id requis.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { error: delError } = await adminClient.auth.admin.deleteUser(user_id);
      if (delError) throw new Error(delError.message);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- PURGE (suppression définitive : toutes les tables + compte auth) ---
    if (action === 'purge') {
      const { user_id, person_id } = body;
      if (!user_id && !person_id) {
        return new Response(JSON.stringify({ error: 'user_id ou person_id requis.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Supprimer toutes les données liées au person_id dans chaque table concernée
      if (person_id) {
        await Promise.all([
          adminClient.from('monthly_signatures').delete().eq('person_id', person_id),
          adminClient.from('signature_tokens').delete().eq('person_id', person_id),
          adminClient.from('annual_interviews').delete().eq('person_id', person_id),
          adminClient.from('calendar_sync_tokens').delete().eq('person_id', person_id),
        ]);
      }

      // Supprimer le profil et le compte auth
      if (user_id) {
        await adminClient.from('user_profiles').delete().eq('id', user_id);
        const { error: delError } = await adminClient.auth.admin.deleteUser(user_id);
        if (delError) throw new Error(delError.message);
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Action inconnue : ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
