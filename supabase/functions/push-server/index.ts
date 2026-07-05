// Edge Function : envoi de notifications Web Push aux collaborateurs Amivet.
// Appelée en fire-and-forget par amivet-pulse.html à chaque événement RH notable
// (demande de congé, décision, visite médicale, entretien, annonce).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Clé PRIVÉE VAPID : uniquement dans les secrets Supabase (jamais dans le code source).
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_CONTACT_EMAIL = Deno.env.get('VAPID_CONTACT_EMAIL') || 'cliniqueamivet@hotmail.fr';

webpush.setVapidDetails(`mailto:${VAPID_CONTACT_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_TYPES = new Set([
  'leave_request', 'leave_approved', 'leave_rejected',
  'medical_visit', 'interview', 'announcement',
]);

interface PushRequestBody {
  type: string;
  title: string;
  body: string;
  targetUsers?: string[];
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non supportée.' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json() as PushRequestBody;
    if (!payload.type || !VALID_TYPES.has(payload.type) || !payload.title || !payload.body) {
      return new Response(JSON.stringify({ error: 'Champs requis manquants ou type invalide.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const targetUsers = Array.isArray(payload.targetUsers) ? payload.targetUsers.filter(Boolean) : [];

    let query = admin.from('push_subscriptions').select('id, user_name, subscription_json');
    if (targetUsers.length > 0) query = query.in('user_name', targetUsers);
    const { data: subscriptions, error } = await query;
    if (error) throw error;

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      requireInteraction: !!payload.requireInteraction,
    });

    let sent = 0;
    let failed = 0;
    const staleIds: string[] = [];

    await Promise.all((subscriptions || []).map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription_json, notificationPayload);
        sent++;
      } catch (err) {
        failed++;
        // 410 Gone / 404 Not Found : l'abonnement n'existe plus côté navigateur.
        const statusCode = err?.statusCode;
        if (statusCode === 410 || statusCode === 404) staleIds.push(row.id);
        else console.warn(`Échec envoi push à ${row.user_name}`, err?.message || err);
      }
    }));

    if (staleIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(JSON.stringify({ sent, failed }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('push-server error', err);
    return new Response(JSON.stringify({ error: err.message || 'Erreur inconnue.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
