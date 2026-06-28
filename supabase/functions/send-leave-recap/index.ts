// Appelée directement par le bouton "Envoyer maintenant" du site (récapitulatif des congés
// ASV) : envoie immédiatement, sans attendre le cron quotidien ni le filtre de fréquence
// (l'utilisateur a explicitement demandé cet envoi). Le cron GitHub Actions garde son propre
// chemin (scripts/send-weekly-recap.mjs) pour l'envoi automatique périodique.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Slot = { iso: string; personId: string; slot: 'M' | 'AM'; label: string };

function isNextSlot(prev: Slot, next: Slot){
  if(prev.iso === next.iso) return prev.slot === 'M' && next.slot === 'AM';
  if(!(prev.slot === 'AM' && next.slot === 'M')) return false;
  const prevDate = new Date(prev.iso + 'T00:00:00Z');
  const nextDate = new Date(next.iso + 'T00:00:00Z');
  const diffDays = Math.round((nextDate.getTime() - prevDate.getTime()) / 86400000);
  if(diffDays === 1) return true;
  if(diffDays === 2){
    const between = new Date(prevDate.getTime() + 86400000);
    return between.getUTCDay() === 0; // dimanche entre les deux : pont, comme dans l'app
  }
  return false;
}

function formatFR(iso: string){
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC' });
}

Deno.serve(async (req) => {
  if(req.method === 'OPTIONS'){
    return new Response('ok', { headers: CORS_HEADERS });
  }
  try{
    const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/email_settings?select=recipient_email,frequency&id=eq.singleton`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    const settingsRows = await settingsRes.json();
    const recipient = settingsRows[0]?.recipient_email || 'cliniqueamivet@hotmail.fr';

    const dataRes = await fetch(`${SUPABASE_URL}/rest/v1/planning_data?select=data&id=eq.singleton`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    const dataRows = await dataRes.json();
    const slots: Record<string, string> = (dataRows[0] && dataRows[0].data) || {};

    const pending: Slot[] = [];
    const decisionRe = /^(\d{4}-\d{2}-\d{2})_([a-z0-9-]+)_(M|AM)_decision$/;
    for(const key of Object.keys(slots)){
      const m = key.match(decisionRe);
      if(m && slots[key] === 'pending'){
        const [, iso, personId, slot] = m;
        pending.push({ iso, personId, slot: slot as 'M'|'AM', label: slots[`${iso}_${personId}_${slot}_label`] || '' });
      }
    }

    const now = new Date();
    // Compte comme un passage, pour ne pas déclencher un second envoi quasi-immédiat via le
    // cron automatique juste après cet envoi manuel.
    const markRun = () => fetch(`${SUPABASE_URL}/rest/v1/email_settings?id=eq.singleton`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type':'application/json', Prefer:'return=minimal' },
      body: JSON.stringify({ last_run_at: now.toISOString() }),
    });

    if(pending.length === 0){
      await markRun();
      return new Response(JSON.stringify({ ok: true, sent: false, reason: 'no-pending' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const SLOT_ORDER = { M: 0, AM: 1 };
    pending.sort((a, b) => a.personId.localeCompare(b.personId) || a.iso.localeCompare(b.iso) || (SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]));

    const groups: { personId: string; label: string; slots: Slot[] }[] = [];
    for(const s of pending){
      const last = groups[groups.length - 1];
      if(last && last.personId === s.personId && last.label === s.label && isNextSlot(last.slots[last.slots.length - 1], s)){
        last.slots.push(s);
      } else {
        groups.push({ personId: s.personId, label: s.label, slots: [s] });
      }
    }

    const lines = groups.map(g => {
      const first = g.slots[0], last = g.slots[g.slots.length - 1];
      const range = first.iso === last.iso ? formatFR(first.iso) : `du ${formatFR(first.iso)} au ${formatFR(last.iso)}`;
      return `- ${g.personId} — ${range}${g.label ? ' — ' + g.label : ''} (${g.slots.length} demi-journée${g.slots.length > 1 ? 's' : ''})`;
    });

    const subject = `Amivet Planning — ${groups.length} demande(s) de congé ASV en attente`;
    const text = [
      'Bonjour,',
      '',
      `Récapitulatif envoyé manuellement depuis le site, des demandes de congé ASV en attente de traitement (${groups.length}) :`,
      '',
      ...lines,
      '',
      'Merci de les traiter depuis le Tableau de bord de l\'application (onglet "Demandes de congé").',
      '',
      '— Amivet Planning',
    ].join('\n');

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Amivet Planning <onboarding@resend.dev>',
        to: [recipient],
        subject,
        text,
      }),
    });
    if(!emailRes.ok) throw new Error(`Resend a répondu HTTP ${emailRes.status} — ${await emailRes.text()}`);
    await markRun();

    return new Response(JSON.stringify({ ok: true, sent: true, count: groups.length, recipient }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
