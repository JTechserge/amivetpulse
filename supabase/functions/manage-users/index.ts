import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { APP_URL } from '../_shared/email-template.ts';
import { buildAccessEmail } from '../_shared/access-email.ts';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://jtechserge.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Envoi via Brevo, expéditeur unique de l'application. Lève une erreur lisible
// si Brevo refuse : l'appelant décide si l'échec est bloquant.
async function sendBrevoEmail(to: { email: string; name: string }, mail: { subject: string; html: string; text: string }) {
  const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Amivet PULSE', email: 'jeremie.pvt@gmail.com' },
      to: [to],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
    }),
  });
  if (!emailRes.ok) {
    const errBody = await emailRes.text();
    throw new Error(`Email non envoyé (Brevo HTTP ${emailRes.status}: ${errBody})`);
  }
}

// ── Suppression définitive : ce que l'action `purge` détruit ────────────────
//
// Cette liste fait autorité pour tout le projet : le front ne la duplique pas
// (cf. l'en-tête de src/lib/collaborator-removal.js). Elle est verrouillée par
// tests/unit/collaborator-purge-contract.test.js, qui lit ce fichier : ajouter
// une table à la base sans l'ajouter ici fait tomber le TNR.
//
// L'ordre va du plus périphérique vers l'effectif. La ligne d'effectif
// (vet_roster) et le compte auth sont traités séparément, APRÈS, et seulement
// si tout ce qui précède a réussi : tant que l'effectif existe, une purge
// interrompue laisse une personne visible, donc rejouable. L'inverse
// laisserait des données orphelines qu'aucune ligne de l'interface n'atteint.
const PURGE_TARGETS: Array<{ table: string; column: string }> = [
  { table: 'push_subscriptions', column: 'user_name' }, // clé = person_id, colonne mal nommée
  { table: 'announcement_reads', column: 'person_id' },
  { table: 'medical_visits', column: 'person_id' },
  { table: 'cp_adjustments', column: 'person_id' },
  { table: 'forecast_signatures', column: 'person_id' },
  { table: 'monthly_signatures', column: 'person_id' },
  { table: 'signature_tokens', column: 'person_id' },
  { table: 'annual_interviews', column: 'person_id' },
  // Porte aussi les identifiants CalDAV (colonnes caldav_*, migration
  // 20260721000001) : il n'existe pas de table caldav_credentials.
  { table: 'calendar_sync_tokens', column: 'person_id' },
];

// Les annonces ne sont PAS supprimées : une consigne de service reste utile à
// la clinique après le départ de son auteur. Seul l'auteur est anonymisé.
// Ce littéral doit rester égal à REMOVED_AUTHOR_ID (src/lib/collaborator-removal.js) ;
// le test de contrat compare les deux fichiers.
const REMOVED_AUTHOR_ID = 'ancien-collaborateur';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader)
      return new Response(JSON.stringify({ error: 'Non authentifié.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Vérifier l'identité du demandeur via l'API Auth (évite la récursion RLS de user_profiles)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authHeader },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authUser = await userRes.json();

    const { data: profile } = await adminClient.from('user_profiles').select('role').eq('id', authUser.id).single();
    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: "Accès réservé à l'administrateur." }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    // --- LIST ---
    if (action === 'list') {
      const [{ data: profiles }, { data: authData }] = await Promise.all([
        adminClient
          .from('user_profiles')
          .select('id,role,person_id,display_name,can_edit_vet_calendar,can_edit_all_asv,can_edit_asv_calendar'),
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
        return new Response(JSON.stringify({ error: 'email, display_name et role sont requis.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Rate limit : max 10 invitations / heure par IP (anti-spam email)
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const { data: rlOk } = await adminClient.rpc('check_rate_limit', {
        p_key: `invite:${clientIp}`,
        p_max: 10,
        p_window_s: 3600,
      });
      if (!rlOk) {
        return new Response(JSON.stringify({ error: 'Trop de tentatives. Réessayez dans une heure.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // generateLink crée le compte et rend le lien d'invitation SANS envoyer de
      // mail : l'email part ensuite par Brevo, avec le guide utilisateur du rôle.
      // (inviteUserByEmail envoyait le modèle générique de Supabase, qui ne peut
      // pas embarquer de contenu propre au rôle.)
      const { data: linkData, error: inviteError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: APP_URL },
      });
      if (inviteError) throw new Error(inviteError.message);

      const userId = linkData.user.id;

      const { error: profileError } = await adminClient.from('user_profiles').upsert({
        id: userId,
        role,
        display_name,
        person_id: null,
        can_edit_vet_calendar: false,
        can_edit_all_asv: false,
      });
      if (profileError) throw new Error(profileError.message);

      // Le compte existe désormais : un échec d'envoi ne doit pas faire croire au
      // front que l'invitation a échoué, sinon il ne relierait pas la ligne de
      // planning (person_id). On le signale, et l'email se renvoie depuis la
      // fiche du collaborateur (« Envoyer l'invitation »).
      let emailError: string | null = null;
      try {
        const mail = buildAccessEmail({
          displayName: display_name,
          accessLink: linkData.properties.action_link,
          isInvite: true,
          role,
        });
        await sendBrevoEmail({ email, name: display_name }, mail);
      } catch (e) {
        emailError = (e as Error).message;
      }

      return new Response(
        JSON.stringify({ ok: true, user_id: userId, email_sent: emailError === null, email_error: emailError }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- UPDATE ---
    if (action === 'update') {
      const {
        user_id,
        email,
        display_name,
        role,
        person_id,
        can_edit_vet_calendar,
        can_edit_all_asv,
        can_edit_asv_calendar,
      } = body;
      if (!user_id)
        return new Response(JSON.stringify({ error: 'user_id requis.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

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
      if (can_edit_asv_calendar !== undefined) profileUpdates.can_edit_asv_calendar = can_edit_asv_calendar;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await adminClient
          .from('user_profiles')
          .update(profileUpdates)
          .eq('id', user_id);
        if (profileError) throw new Error(`Profil : ${profileError.message}`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- SEND_ACCESS_EMAIL ---
    if (action === 'send_access_email') {
      const { user_id, type: emailType } = body;
      if (!user_id)
        return new Response(JSON.stringify({ error: 'user_id requis.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      const { data: targetUserData, error: targetError } = await adminClient.auth.admin.getUserById(user_id);
      if (targetError || !targetUserData) throw new Error('Utilisateur introuvable.');

      const { data: targetProfile } = await adminClient
        .from('user_profiles')
        .select('display_name, role')
        .eq('id', user_id)
        .single();
      const displayName = targetProfile?.display_name || targetUserData.user.email || 'Collaborateur';
      const targetEmail = targetUserData.user.email!;

      let linkType: 'invite' | 'recovery' = emailType === 'invite' ? 'invite' : 'recovery';
      let { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: linkType,
        email: targetEmail,
        options: { redirectTo: APP_URL },
      });
      // Un lien d'invitation échoue si le compte a déjà été activé → fallback recovery
      if (linkError && linkType === 'invite') {
        linkType = 'recovery';
        ({ data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email: targetEmail,
          options: { redirectTo: APP_URL },
        }));
      }
      if (linkError) throw new Error(linkError.message);

      const mail = buildAccessEmail({
        displayName,
        accessLink: linkData.properties.action_link,
        // Le fallback recovery ne change pas l'intention : une invitation
        // renvoyée à quelqu'un qui ne s'est jamais connecté reste un accueil, et
        // garde le guide. Le lien recovery mène au même écran de mot de passe.
        isInvite: emailType === 'invite',
        role: targetProfile?.role,
      });
      await sendBrevoEmail({ email: targetEmail, name: displayName }, mail);

      return new Response(JSON.stringify({ ok: true, email: targetEmail }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- DELETE ---
    if (action === 'delete') {
      const { user_id } = body;
      if (!user_id)
        return new Response(JSON.stringify({ error: 'user_id requis.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      const { error: delError } = await adminClient.auth.admin.deleteUser(user_id);
      if (delError) throw new Error(delError.message);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- PURGE (suppression définitive : toutes les tables + compte auth) ---
    if (action === 'purge') {
      const { user_id, person_id } = body;
      if (!user_id && !person_id) {
        return new Response(JSON.stringify({ error: 'user_id ou person_id requis.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Supprimer toutes les données liées au person_id dans chaque table concernée.
      if (person_id) {
        // Les erreurs sont LUES, table par table. La version précédente faisait
        // un Promise.all sans regarder aucun résultat : une suppression refusée
        // passait inaperçue et la fonction répondait quand même ok:true, en
        // laissant des données derrière elle.
        const results = await Promise.all(
          PURGE_TARGETS.map(async ({ table, column }) => {
            const { error } = await adminClient.from(table).delete().eq(column, person_id);
            return error ? `${table} (${error.message})` : null;
          })
        );

        // Les annonces survivent à leur auteur ; l'auteur, lui, est anonymisé.
        const { error: authorError } = await adminClient
          .from('announcements')
          .update({ author_id: REMOVED_AUTHOR_ID })
          .eq('author_id', person_id);
        if (authorError) results.push(`announcements (${authorError.message})`);

        // Un seul échec périphérique arrête tout AVANT le compte et l'effectif :
        // la personne reste visible dans l'interface, donc la purge est rejouable.
        const failed = results.filter((r): r is string => r !== null);
        if (failed.length) throw new Error(`Purge incomplète — ${failed.join(', ')}`);
      }

      // Le compte auth part AVANT la ligne d'effectif, et son échec est fatal.
      // L'ordre inverse — celui d'origine — laissait, quand deleteUser échouait,
      // un compte encore capable d'obtenir un jeton alors que l'effectif était
      // déjà parti : plus aucune ligne de l'interface ne permettait de relancer
      // la purge, et seule une intervention en base pouvait le retirer.
      //
      // `user_profiles` est supprimé APRÈS le compte, jamais avant : la ligne
      // part de toute façon par cascade (`id references auth.users on delete
      // cascade`), et la retirer d'abord effacerait la personne de la liste des
      // comptes — donc le bouton qui sert à rejouer la purge — sans avoir
      // retiré le compte.
      if (user_id) {
        const { error: delError } = await adminClient.auth.admin.deleteUser(user_id);
        // Un compte déjà absent est le résultat voulu, pas un échec : c'est ce
        // qui rend la purge rejouable après une interruption.
        if (delError && delError.status !== 404) throw new Error(delError.message);
        await adminClient.from('user_profiles').delete().eq('id', user_id);
      }

      // La ligne d'effectif part en DERNIER, et son échec est fatal.
      // Tant qu'elle existe, une purge interrompue laisse une personne visible
      // mais vidée : état incohérent, mais réparable en relançant la purge.
      // La supprimer d'abord laisserait des données orphelines que plus aucune
      // ligne de l'interface ne permettrait d'atteindre.
      if (person_id) {
        const { error: rosterError } = await adminClient.from('vet_roster').delete().eq('id', person_id);
        if (rosterError) throw new Error(`Effectif vétérinaire : ${rosterError.message}`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Action inconnue : ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
