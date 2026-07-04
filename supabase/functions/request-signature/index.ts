// Appelée par l'ASV quand elle clique "Signer ma feuille de présence" dans l'app.
// Génère un token à usage unique, l'enregistre en base, puis envoie un email contenant
// le récapitulatif du mois ET un lien de signature unique (valable 7 jours).
// La vraie signature n'est enregistrée que lorsque l'ASV clique ce lien et confirme
// dans l'app — en étant authentifiée, ce qui lie la signature à son compte Supabase.
import { wrapEmailHtml, buttonHtml, APP_URL, COLORS } from '../_shared/email-template.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
const TOKEN_VALID_DAYS = 7;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const WEEKDAYS_FR = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];

function padZ(n: number){ return String(n).padStart(2, '0'); }


Deno.serve(async (req) => {
  if(req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try{
    const authHeader = req.headers.get('Authorization');
    if(!authHeader){
      return new Response(JSON.stringify({ error: 'Non authentifié.' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Identifier l'utilisateur depuis son JWT
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: authHeader },
    });
    if(!userRes.ok){
      return new Response(JSON.stringify({ error: 'Token invalide.' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const authUser = await userRes.json();

    // Récupérer le profil du demandeur (person_id, rôle)
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${authUser.id}&select=person_id,display_name,role`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    const profile = (await profRes.json())[0];
    if(!profile){
      return new Response(JSON.stringify({ error: 'Profil introuvable.' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const { year, month, person_id: requestedPersonId } = await req.json();
    if(typeof year !== 'number' || typeof month !== 'number'){
      return new Response(JSON.stringify({ error: 'year et month sont requis.' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    let personId: string;
    let displayName: string;
    let targetEmail: string;

    if(profile.role === 'asv'){
      // L'ASV signe pour elle-même
      if(!profile.person_id) return new Response(JSON.stringify({ error: 'Profil ASV sans person_id.' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      personId = profile.person_id;
      displayName = profile.display_name || authUser.email;
      targetEmail = authUser.email;
    } else if(profile.role === 'admin' || profile.role === 'vet'){
      // Admin/vétérinaire demande la signature d'une ASV spécifique
      if(!requestedPersonId){
        return new Response(JSON.stringify({ error: 'person_id requis pour admin/vet.' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
      // Récupérer le profil de l'ASV ciblée
      const asvProfRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?person_id=eq.${encodeURIComponent(requestedPersonId)}&select=id,display_name,role`, {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
      const [asvProfile] = await asvProfRes.json();
      if(!asvProfile || asvProfile.role !== 'asv'){
        return new Response(JSON.stringify({ error: 'ASV introuvable pour ce person_id.' }), { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
      // Récupérer l'email de l'ASV via l'API admin Auth
      const asvUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${asvProfile.id}`, {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
      if(!asvUserRes.ok) throw new Error(`Récupération email ASV HTTP ${asvUserRes.status}`);
      const asvUser = await asvUserRes.json();
      personId = requestedPersonId;
      displayName = asvProfile.display_name || asvUser.email;
      targetEmail = asvUser.email;
    } else {
      return new Response(JSON.stringify({ error: 'Rôle non autorisé.' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const now = new Date();

    // Réutiliser un token valide existant pour ce mois (évite les doublons si l'ASV clique
    // plusieurs fois sur "Signer" avant d'avoir ouvert l'email)
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/signature_tokens?person_id=eq.${encodeURIComponent(personId)}&year=eq.${year}&month=eq.${month}&select=id,expires_at`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    const existing = await existingRes.json();
    if(!Array.isArray(existing)){
      throw new Error(`Erreur lecture signature_tokens : ${JSON.stringify(existing)}`);
    }
    // Un token encore présent en base = non utilisé (les tokens sont supprimés après usage)
    const validExisting = (existing as {id:string;expires_at:string}[]).find(t => new Date(t.expires_at) > now);

    let tokenId: string;
    if(validExisting){
      tokenId = validExisting.id;
    } else {
      const expiresAt = new Date(now.getTime() + TOKEN_VALID_DAYS * 86400000).toISOString();
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/signature_tokens`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify({ person_id: personId, year, month, expires_at: expiresAt }),
      });
      if(!insertRes.ok) throw new Error(`Création token HTTP ${insertRes.status}`);
      const [newToken] = await insertRes.json();
      tokenId = newToken.id;
    }

    // Construire le récapitulatif mensuel depuis planning_data
    const dataRes = await fetch(`${SUPABASE_URL}/rest/v1/planning_data?select=data&id=eq.singleton`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    const [dataRow] = await dataRes.json();
    const slots: Record<string, string> = dataRow?.data || {};

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayRows: string[] = [];
    let hasAnyData = false;
    let workingDays = 0;
    let presentHalfDays = 0;
    let approvedLeaveHalfDays = 0;
    let pendingHalfDaysTotal = 0;
    let totalOvertimeHours = 0;
    const approvedByLabel: Record<string, number> = {};
    const pendingByLabel:  Record<string, number> = {};

    function cellHtml(state: string, label: string, decision: string | null): string {
      if(state === 'present') return `<span style="color:#16A34A;">Présent</span>`;
      if(state === 'absent'){
        const txt = label || 'Absence';
        if(decision === 'approved') return `<span style="color:${COLORS.text};">✅ ${txt}</span>`;
        return `<span style="color:#DC2626;">⏳ ${txt}</span>`;
      }
      return `<span style="color:#94A3B8;">—</span>`;
    }

    for(let day = 1; day <= daysInMonth; day++){
      const iso = `${year}-${padZ(month + 1)}-${padZ(day)}`;
      const date = new Date(year, month, day);
      const wd = date.getDay();
      if(wd === 0) continue; // dimanche uniquement — clinique ouverte le samedi

      const mState    = slots[`${iso}_${personId}_M`]           || 'empty';
      const amState   = slots[`${iso}_${personId}_AM`]          || 'empty';
      const mLabel    = slots[`${iso}_${personId}_M_label`]     || '';
      const amLabel   = slots[`${iso}_${personId}_AM_label`]    || '';
      const mDecision = slots[`${iso}_${personId}_M_decision`]  || null;
      const amDecision= slots[`${iso}_${personId}_AM_decision`] || null;

      if(mState !== 'empty' || amState !== 'empty') hasAnyData = true;
      workingDays++;

      const presentDay   = (mState === 'present' ? 1 : 0) + (amState === 'present' ? 1 : 0);
      const approvedDay  = (mState === 'absent' && mDecision === 'approved' ? 1 : 0)
                         + (amState === 'absent' && amDecision === 'approved' ? 1 : 0);
      const pendingDay   = (mState === 'absent' && mDecision !== 'approved' ? 1 : 0)
                         + (amState === 'absent' && amDecision !== 'approved' ? 1 : 0);
      presentHalfDays       += presentDay;
      approvedLeaveHalfDays += approvedDay;
      pendingHalfDaysTotal  += pendingDay;

      // Heures sup/déficit : valeur saisie manuellement dans la ligne du calendrier ASV
      const dayOvertimeH = Math.round((parseFloat(slots[`${iso}_${personId}_overtime`]) || 0) * 10) / 10;
      totalOvertimeHours += dayOvertimeH;

      if(mState === 'absent' && mLabel && mLabel !== 'Absence non précisée'){
        if(mDecision === 'approved') approvedByLabel[mLabel] = (approvedByLabel[mLabel]||0)+1;
        else pendingByLabel[mLabel] = (pendingByLabel[mLabel]||0)+1;
      }
      if(amState === 'absent' && amLabel && amLabel !== 'Absence non précisée'){
        if(amDecision === 'approved') approvedByLabel[amLabel] = (approvedByLabel[amLabel]||0)+1;
        else pendingByLabel[amLabel] = (pendingByLabel[amLabel]||0)+1;
      }

      const otSign  = dayOvertimeH > 0 ? '+' : '';
      const otColor = dayOvertimeH > 0 ? '#16A34A' : dayOvertimeH < 0 ? '#DC2626' : '#94A3B8';
      const otCell  = dayOvertimeH === 0
        ? `<span style="color:#94A3B8;">—</span>`
        : `<span style="color:${otColor};font-weight:600;">${otSign}${dayOvertimeH}h</span>`;

      dayRows.push(`<tr style="background:${day%2===0?'#F8FAFC':'#FFFFFF'};">
        <td style="padding:5px 10px;font-size:12px;color:#0F172A;white-space:nowrap;">${WEEKDAYS_FR[wd]} ${day}</td>
        <td style="padding:5px 10px;font-size:12px;">${cellHtml(mState, mLabel, mDecision)}</td>
        <td style="padding:5px 10px;font-size:12px;">${cellHtml(amState, amLabel, amDecision)}</td>
        <td style="padding:5px 10px;font-size:12px;text-align:right;">${otCell}</td>
      </tr>`);
    }

    const monthLabel = `${MONTH_NAMES_FR[month]} ${year}`;
    const signingLink = `${APP_URL}?sign=${encodeURIComponent(tokenId)}`;
    const expiryLabel = `${TOKEN_VALID_DAYS} jours`;

    totalOvertimeHours = Math.round(totalOvertimeHours * 10) / 10;
    const otSign  = totalOvertimeHours >= 0 ? '+' : '';
    const otColor = totalOvertimeHours > 0 ? '#16A34A' : totalOvertimeHours < 0 ? '#DC2626' : '#94A3B8';

    function labelRows(map: Record<string, number>, icon: string, color: string): string {
      return Object.entries(map).sort((a,b)=>b[1]-a[1])
        .map(([lbl, cnt]) => `<tr><td style="padding:3px 10px 3px 22px;font-size:11.5px;color:${color};">${icon} ${lbl}</td><td style="padding:3px 10px;font-size:11.5px;color:${color};text-align:right;">${cnt} demi-j.</td></tr>`).join('');
    }
    const approvedRows = labelRows(approvedByLabel, '✅', COLORS.text);
    const pendingRows  = labelRows(pendingByLabel,  '⏳', '#DC2626');

    const summaryHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.border};border-radius:10px;overflow:hidden;margin-bottom:20px;"><thead><tr style="background:${COLORS.secondary};"><th colspan="2" style="padding:8px 12px;font-size:12px;color:${COLORS.textMuted};text-align:left;font-weight:600;letter-spacing:.04em;">RÉCAPITULATIF DU MOIS</th></tr></thead><tbody>
<tr style="background:#FFF;"><td style="padding:5px 10px;font-size:12px;color:${COLORS.text};">Jours ouvrés</td><td style="padding:5px 10px;font-size:12px;color:${COLORS.text};text-align:right;">${workingDays} j.</td></tr>
<tr style="background:#F8FAFC;"><td style="padding:5px 10px;font-size:12px;color:${COLORS.text};">Demi-journées travaillées</td><td style="padding:5px 10px;font-size:12px;color:${COLORS.text};text-align:right;">${presentHalfDays} demi-j.</td></tr>
${approvedLeaveHalfDays > 0 ? `<tr style="background:#FFF;"><td style="padding:5px 10px;font-size:12px;color:${COLORS.text};">Congés approuvés ✅</td><td style="padding:5px 10px;font-size:12px;color:${COLORS.text};text-align:right;">${approvedLeaveHalfDays} demi-j.</td></tr>${approvedRows}` : ''}
<tr style="background:#F8FAFC;"><td style="padding:5px 10px;font-size:12px;color:#DC2626;">Congés en attente ⏳</td><td style="padding:5px 10px;font-size:12px;color:#DC2626;text-align:right;">${pendingHalfDaysTotal} demi-j.</td></tr>${pendingRows}
<tr style="background:#FFF;border-top:2px solid ${COLORS.border};"><td style="padding:7px 10px;font-size:13px;font-weight:700;color:${COLORS.text};">Total heures supplémentaires / en moins</td><td style="padding:7px 10px;font-size:13px;font-weight:700;color:${otColor};text-align:right;">${otSign}${totalOvertimeHours}h</td></tr>
</tbody></table>`;

    const recapTable = hasAnyData
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid ${COLORS.border};border-radius:10px;overflow:hidden;margin-bottom:20px;">
           <thead>
             <tr style="background:${COLORS.primary};">
               <th style="padding:8px 10px;font-size:12px;color:#FFF;text-align:left;font-weight:600;">Jour</th>
               <th style="padding:8px 10px;font-size:12px;color:#FFF;text-align:left;font-weight:600;">Matin</th>
               <th style="padding:8px 10px;font-size:12px;color:#FFF;text-align:left;font-weight:600;">Après-midi</th>
               <th style="padding:8px 10px;font-size:12px;color:#FFF;text-align:right;font-weight:600;">+/− h</th>
             </tr>
           </thead>
           <tbody>${dayRows.join('')}</tbody>
         </table>`
      : `<p style="font-size:13px;color:${COLORS.textMuted};background:#F8FAFC;border-radius:8px;padding:12px 14px;margin-bottom:20px;">
           Aucune donnée de présence enregistrée pour ${monthLabel}.
         </p>`;

    const html = wrapEmailHtml(`
      <h1 style="font-size:18px;color:${COLORS.text};margin:0 0 4px;">✍️ Signature de feuille de présence</h1>
      <p style="font-size:14px;color:${COLORS.textMuted};margin:0 0 20px;">
        Bonjour <strong>${displayName}</strong>,<br>
        Voici votre feuille de présence pour <strong>${monthLabel}</strong>.
        Vérifiez les informations ci-dessous puis signez en cliquant sur le bouton.
      </p>
      ${summaryHtml}
      ${recapTable}
      <p style="font-size:12.5px;color:${COLORS.textMuted};margin:0 0 16px;">
        En signant, vous certifiez que ces informations sont exactes.
        Ce lien est à usage unique et valable ${expiryLabel}.
      </p>
      ${buttonHtml(signingLink, '✍️ Je certifie et signe ma feuille de présence')}
      <p style="font-size:12px;color:${COLORS.textFaint};margin:0;">
        Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
      </p>
    `);

    const text = [
      `Bonjour ${displayName},`,
      '',
      `Votre feuille de présence pour ${monthLabel} est prête à signer.`,
      '',
      `Cliquez sur ce lien pour signer (à usage unique, valable ${expiryLabel}) :`,
      signingLink,
      '',
      'En signant, vous certifiez que les informations de présence sont exactes.',
      '',
      '— Amivet PULSE',
    ].join('\n');

    // Tenter l'envoi email — si Resend refuse (plan gratuit limité à l'email du compte),
    // on renvoie quand même le lien de signature pour que l'admin puisse le partager manuellement.
    let emailSent = false;
    let emailError = '';
    try{
      console.log('[brevo] sending to', targetEmail);
      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Amivet PULSE', email: 'jeremie.pvt@gmail.com' },
          to: [{ email: targetEmail, name: displayName }],
          subject: `Amivet PULSE — Signature feuille de présence ${monthLabel}`,
          textContent: text,
          htmlContent: html,
          trackClicks: false,
          trackOpens: false,
        }),
      });
      const brevoBody = await emailRes.text();
      console.log('[brevo] status', emailRes.status, brevoBody);
      if(emailRes.ok){ emailSent = true; }
      else { emailError = `Brevo HTTP ${emailRes.status}: ${brevoBody}`; }
    }catch(err){ emailError = String((err as Error)?.message || err); }

    return new Response(JSON.stringify({ ok: true, email_sent: emailSent, email_error: emailError, signing_link: signingLink }), {
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
