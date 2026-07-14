// Reçoit le PDF base64 généré côté client après confirmation de signature,
// vérifie que l'appelant est bien le propriétaire de la signature, upload dans
// le bucket Storage signed-sheets, stocke le chemin dans monthly_signatures,
// puis envoie le PDF en pièce jointe à l'ASV par email.
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;

const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

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

    const { signature_id, pdf_base64 } = await req.json();
    if (!signature_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Vérifier le JWT et récupérer l'uid
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`,
      { headers: { apikey: ANON_KEY, Authorization: authHeader } });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const authUser = await userRes.json();

    // Récupérer le person_id du compte connecté
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=person_id`,
      { headers: SVC });
    const [profile] = await profRes.json();
    if (!profile?.person_id) {
      return new Response(JSON.stringify({ error: 'Profil introuvable.' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Récupérer la signature et vérifier l'appartenance
    const sigRes = await fetch(
      `${SUPABASE_URL}/rest/v1/monthly_signatures?id=eq.${encodeURIComponent(signature_id)}&select=id,person_id,year,month,status,signed_name,signed_at`,
      { headers: SVC });
    const [sig] = await sigRes.json();
    if (!sig) {
      return new Response(JSON.stringify({ error: 'Signature introuvable.' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (sig.person_id !== profile.person_id) {
      return new Response(JSON.stringify({ error: 'Accès refusé.' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (sig.status !== 'signed') {
      return new Response(JSON.stringify({ error: 'Signature non active.' }),
        { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Chemin : {person_id}/{year}-{MM}-{uuid}.pdf  (month est 0-indexé en base → +1 pour affichage)
    const mm = String(sig.month + 1).padStart(2, '0');
    const pdfPath = `${sig.person_id}/${sig.year}-${mm}-${sig.id}.pdf`;
    const pdfBytes = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/signed-sheets/${pdfPath}`,
      {
        method: 'POST',
        headers: { ...SVC, 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
        body: pdfBytes,
      });
    if (!uploadRes.ok) {
      throw new Error(`Upload Storage HTTP ${uploadRes.status} — ${await uploadRes.text()}`);
    }

    // Stocker le chemin dans la ligne de signature
    await fetch(
      `${SUPABASE_URL}/rest/v1/monthly_signatures?id=eq.${encodeURIComponent(signature_id)}`,
      {
        method: 'PATCH',
        headers: { ...SVC, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ pdf_path: pdfPath }),
      });

    // Envoyer le PDF en pièce jointe à l'ASV (best-effort, n'empêche pas la réponse)
    const monthLabel = `${MONTH_NAMES_FR[sig.month]} ${sig.year}`;
    const signedDateFR = new Date(sig.signed_at).toLocaleString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    });
    const displayName: string = sig.signed_name || authUser.email;
    const filename = `feuille-presence-${sig.person_id}-${sig.year}-${mm}.pdf`;

    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Amivet PULSE <onboarding@resend.dev>',
        to: [authUser.email],
        subject: `Amivet PULSE — Feuille de présence ${monthLabel} — Copie PDF`,
        html: `<p>Bonjour <strong>${displayName}</strong>,</p>
               <p>Veuillez trouver en pièce jointe votre feuille de présence pour <strong>${monthLabel}</strong>, signée électroniquement le ${signedDateFR} (heure de Paris).</p>
               <p style="font-size:12px;color:#888;">Amivet PULSE · Signature électronique simple (SES) au sens du règlement eIDAS (UE n°910/2014)</p>`,
        attachments: [{ filename, content: pdf_base64 }],
      }),
    }).catch(e => console.warn('Email PDF non envoyé :', e));

    return new Response(JSON.stringify({ ok: true, pdf_path: pdfPath }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
