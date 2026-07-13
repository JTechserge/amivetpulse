import {
  PRESENT_SHADES, PEOPLE, ASV_PEOPLE, allPeople,
  CP_DAYS_PER_MONTH, CP_REFERENCE_START_MONTH,
  ANNONCE_CATEGORIES,
  ASV_ROSTER_KEY, ASV_DEFAULT_COLOR_PALETTE,
  SLOTS, SLOT_LABELS, YEARS, STORAGE_KEY, PERSON_COLORS_KEY, VIEW_STATE_KEY,
  AUTH_SESSION_KEY,
  SUPABASE_URL, SUPABASE_AUTH_URL, SUPABASE_FUNCTIONS_URL, CALENDAR_FEED_URL, SUPABASE_ANON_KEY,
  ANNUAL_FULLTIME_HOURS, HALFDAY_HOURS, WEEKLY_MAX_HOURS,
  ASV_STD_SAT_CARLA, ASV_STD_SAT_SECOND, ASV_STD_WEEKDAY_AVG,
  CLINIC_HOURS, CLINIC_M_H, CLINIC_AM_H,
  MONTH_NAMES, MONTH_SHORT, WEEKDAY_NAMES, WEEKDAY_FULL,
  getCurrentYear, setCurrentYear, personOf,
} from './config.js';
import {
  escapeHTML, slugifyName, hexToHsl, hexToRgba, colorRejectReason,
  fmtISO, daysInMonth, isoWeekday, isSunday, isSaturday,
  holidaysFor, holidayName,
  formatHHMM, signedHHMM, roundTo15min, formatFR, formatNum,
  getWeekMondayDate,
} from './utils.js';
import { getAuthSession, saveAuthSession, supabaseHeaders, authSignIn, authUpdatePassword, authSendPasswordReset } from './auth.js';
import { reindexPresentShades, saveASVRoster, loadASVRoster, archiveASVPerson, unarchiveASVPerson, savePersonColors } from './state.js';
import { showToast, showSavedToast, openConfirmModal, applyPersonColorVars, loadPersonColors } from './ui.js';
import { pushDataToSupabase, syncFromSupabase, fetchSignatures, apiSignMonth, apiRevokeSignature } from './api.js';
import { store } from './store.js';
import { setupLogin, renderLoginScreen, renderSetPasswordScreen } from './login.js';
import { PWA, initServiceWorker, showIOSInstallTip, updatePwaOfflineBanner, triggerPushNotification, openNotificationSettingsModal, notificationStatusLabel } from './pwa.js';
import { loadAnnouncements, renderAnnounces, updateAnnouncementBadge } from './announcements.js';
import { setupSignatures, signatureKey, isMonthSigned, getSignatureDetail, loadSignatures, signMonth, revokeSignature, openSigningLinkModal, openSignConfirmModal } from './signatures.js';
import {
  slotKey, labelKey, commentKey, decisionKey, decisionCommentKey, changeKey, overtimeKey,
  isASVPerson, isWithinNextTwoWeeks,
  getLeaveDecision, setLeaveDecision, getLeaveDecisionComment, setLeaveDecisionComment,
  getChangeDecision, setChangeDecision,
  getOvertimeHours, setOvertimeHours,
  getSlotState, setSlotState, getSlotLabel, setSlotLabel,
  getDayComment, setDayComment, cycleState,
  shiftTypeKey, getShiftType, timeToMins, getDayNominal,
  earlyDepKey, getEarlyDep, setEarlyDep, getDayDeficitH,
  weekOtKey, getWeekOtMins, setWeekOtMins, getDayOtH,
  lunchOtKey, getLunchOtMins, setLunchOtMins, getDayLunchOtH, getDayAllOtH,
  dayNoteKey, getDayNote, setDayNote,
  isPersonWorkingDay,
} from './slots.js';
import { setupAnnualView, stateLabel, buildHeatmap, openAnnualDayDetail, renderAnnualViewForGroup } from './annual-view.js';
import {
  setupDashboard, renderDashboard, setDashSubTab,
  countPendingLeaveRequests, renderLeaveRequestsPage,
} from './dashboard.js';
import {
  setupWeekView, renderWeekViewASV,
} from './week-view.js';
import {
  setupCalendar, renderCalendarView, openDaySidebar, buildLegendColors,
  initCalendarInteractions, changeMonth, goToToday,
} from './calendar.js';
/* ================================================================
   AMIVET PLANNING — Application JS (vanilla ES2022, sans dépendance)
   ================================================================ */

/* ----------------------------------------------------------------
   1. CONSTANTES & ÉTAT GLOBAL
   ---------------------------------------------------------------- */


function uniqueASVId(base){
  let id = base, n = 2;
  while(PEOPLE.some(p=>p.id===id) || ASV_PEOPLE.some(p=>p.id===id)){ id = `${base}-${n}`; n++; }
  return id;
}
function pickDefaultASVColor(){
  const used = allPeople().map(p=>p.color.toLowerCase());
  const free = ASV_DEFAULT_COLOR_PALETTE.find(c=> !used.includes(c.toLowerCase()) && !colorRejectReason(c));
  return free || '#64748B';
}
function setASVTimeFraction(personId, fraction){
  const p = ASV_PEOPLE.find(x=> x.id === personId);
  if(p){ p.timeFraction = fraction; saveASVRoster(); }
}
// Ajoute une ASV au planning. Retourne la personne créée, ou null si le nom est vide.
function addASVPerson(name){
  name = (name || '').trim();
  if(!name) return null;
  const person = {
    id: uniqueASVId(slugifyName(name)),
    name, short:name,
    initial: name.slice(0,2).toUpperCase(),
    color: pickDefaultASVColor(),
    present: null,
  };
  ASV_PEOPLE.push(person);
  reindexPresentShades();
  saveASVRoster();
  savePersonColors();
  applyPersonColorVars();
  return person;
}


/* ----------------------------------------------------------------
   1bis. COULEURS PERSONNALISABLES DES ASSOCIÉS
   ---------------------------------------------------------------- */
function colorPickerRow(p){
  return `
    <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:700;color:var(--color-text);">
      ${p.short}
      <input type="color" id="color-input-${p.id}" value="${p.color}" style="width:48px;height:32px;border:1px solid var(--color-border);border-radius:6px;cursor:pointer;padding:2px;background:none;">
    </label>
  `;
}
function openColorPickerModal(){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  box.innerHTML = `
    <h3>🎨 Couleurs des associés et des ASV</h3>
    <p>Le vert, le rouge, le bleu foncé, le jaune et le blanc restent réservés aux indicateurs de statut (présent / congé validé / congé en attente / férié / vide).</p>
    <p class="settings-section-label" style="padding:0;margin-bottom:8px;">Vétérinaires</p>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      ${PEOPLE.map(colorPickerRow).join('')}
    </div>
    <p class="settings-section-label" style="padding:0;margin-bottom:8px;">ASV</p>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:6px;">
      ${ASV_PEOPLE.map(colorPickerRow).join('')}
    </div>
    <p id="color-error" style="color:#B91C1C;font-size:12px;display:none;margin:10px 0 0;"></p>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn btn-primary" id="color-save">Appliquer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  box.querySelector('#color-save').onclick = ()=>{
    const all = allPeople();
    const newColors = {};
    all.forEach(p=>{ newColors[p.id] = box.querySelector(`#color-input-${p.id}`).value; });
    const errorEl = box.querySelector('#color-error');
    const reasons = [];
    all.forEach(p=>{
      // Une couleur déjà en place (non modifiée) n'est pas re-validée : on ne pénalise pas
      // les couleurs par défaut existantes, seulement les nouveaux choix.
      if(newColors[p.id].toLowerCase() === p.color.toLowerCase()) return;
      const reason = colorRejectReason(newColors[p.id]);
      if(reason) reasons.push(`${p.short} : ${reason}`);
    });
    for(let i=0; i<all.length; i++){
      for(let j=i+1; j<all.length; j++){
        const a = all[i], b = all[j];
        if(newColors[a.id].toLowerCase() === newColors[b.id].toLowerCase()){
          reasons.push(`${a.short} et ${b.short} ne peuvent pas avoir la même couleur.`);
        }
      }
    }
    if(reasons.length){
      errorEl.textContent = reasons.join(' ');
      errorEl.style.display = 'block';
      return;
    }
    all.forEach(p=> p.color = newColors[p.id]);
    savePersonColors();
    applyPersonColorVars();
    renderCurrentView();
    close();
    showToast('Couleurs appliquées', '🎨');
  };
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
}

// Modale de changement du mot de passe protégeant les onglets Vétérinaires et Tableau de
// bord. Demande l'ancien mot de passe pour autoriser le changement (protection légère,
// pas un vrai contrôle d'accès serveur).
function openChangeMyPasswordModal(){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  box.innerHTML = `
    <h3>🔑 Changer mon mot de passe</h3>
    <p>Choisissez un nouveau mot de passe pour votre compte <strong>${escapeHTML(store.currentUser?.email||'')}</strong>.</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <input type="password" id="pwd-new" placeholder="Nouveau mot de passe" autocomplete="new-password">
      <input type="password" id="pwd-confirm" placeholder="Confirmer le nouveau mot de passe" autocomplete="new-password">
    </div>
    <p id="pwd-error" style="color:#B91C1C;font-size:12px;display:none;margin:10px 0 0;"></p>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn btn-primary" id="pwd-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
  box.querySelector('#pwd-save').onclick = async ()=>{
    const next = box.querySelector('#pwd-new').value;
    const conf = box.querySelector('#pwd-confirm').value;
    const errorEl = box.querySelector('#pwd-error');
    const saveBtn = box.querySelector('#pwd-save');
    if(!next || next.length < 8){ errorEl.textContent='Le mot de passe doit faire au moins 8 caractères.'; errorEl.style.display='block'; return; }
    if(next !== conf){ errorEl.textContent='Les deux mots de passe ne correspondent pas.'; errorEl.style.display='block'; return; }
    saveBtn.disabled = true;
    try{
      const s = getAuthSession();
      await authUpdatePassword(s.access_token, next);
      close(); showToast('Mot de passe mis à jour', '🔑');
    }catch(e){
      errorEl.textContent = 'Erreur : '+e.message;
      errorEl.style.display = 'block';
      saveBtn.disabled = false;
    }
  };
  box.querySelector('#pwd-new').focus();
}

function openManageUsersModal(){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box modal-box-wide';
  box.innerHTML = `<h3>👥 Gestion des collaborateurs</h3><p class="text-muted" style="font-size:13px;">Chargement…</p>`;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };

  fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, {
    method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({ action:'list' }),
  }).then(r=>r.json()).then(data=>{
    if(!data.ok) throw new Error(data.error||'Erreur');
    const users = data.users;
    const roleLabels = { admin:'Admin', vet:'Vétérinaire', asv:'ASV' };

    const isAdmin = store.currentUser?.role === 'admin';
    const linkedPersonIds = new Set(users.map(u=>u.person_id).filter(Boolean));
    const localOnlyASV = ASV_PEOPLE.filter(p=> !p.archived && !linkedPersonIds.has(p.id));
    const localOnlyVets = PEOPLE.filter(p=> !linkedPersonIds.has(p.id) && !users.some(u=> (u.display_name||'').toLowerCase().includes(p.short.toLowerCase()) || (u.display_name||'').toLowerCase().includes(p.name.toLowerCase())));
    const localOnlyPeople = [
      ...localOnlyVets.map(p=>({ ...p, localRole:'vet', roleLabel:'Vétérinaire' })),
      ...localOnlyASV.map(p=>({ ...p, localRole:'asv', roleLabel:'ASV' })),
    ];

    const rows = users.map(u=>{
      const cp = u.person_id ? personOf(u.person_id) : null;
      const swatch = cp ? `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${cp.color};margin-right:6px;vertical-align:middle;flex-shrink:0;"></span>` : '';
      return `<tr>
        <td style="font-weight:600;">${swatch}${escapeHTML(u.display_name||'—')}</td>
        <td style="font-size:12px;color:var(--color-text-muted);">${roleLabels[u.role]||u.role||'—'}</td>
        <td style="font-size:12px;color:var(--color-text-muted);">${escapeHTML(u.email||'—')}</td>
        <td style="font-size:12px;text-align:center;">${u.can_edit_vet_calendar ? '✅' : '—'}</td>
        <td style="font-size:12px;text-align:center;">${u.can_edit_all_asv ? '✅' : '—'}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" data-edit-user="${u.id}" style="font-size:11.5px;padding:4px 8px;margin-right:4px;">Modifier</button>
          <button class="btn btn-sm" data-delete-user="${u.id}" data-delete-name="${escapeHTML(u.display_name||u.email||u.id)}" style="font-size:11.5px;padding:4px 8px;color:#B91C1C;border-color:#FCA5A5;" title="Supprimer le compte uniquement">🗑️</button>
          ${isAdmin ? `<button class="btn btn-sm" data-purge-user="${u.id}" data-purge-person="${u.person_id||''}" data-purge-name="${escapeHTML(u.display_name||u.email||u.id)}" style="font-size:11.5px;padding:4px 8px;margin-left:4px;color:#FFFFFF;background:#B91C1C;border-color:#B91C1C;" title="Suppression définitive — efface toutes les données">💣</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    const localASVRows = localOnlyPeople.map(p=>`<tr>
        <td style="font-weight:600;color:var(--color-text-muted);">${escapeHTML(p.short)}</td>
        <td style="font-size:12px;color:var(--color-text-muted);">${p.roleLabel}</td>
        <td style="font-size:12px;color:var(--color-text-muted);font-style:italic;">Sans compte</td>
        <td style="font-size:12px;text-align:center;">—</td>
        <td style="font-size:12px;text-align:center;">—</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" data-prefill-invite="${escapeHTML(p.short)}" data-prefill-role="${p.localRole}" style="font-size:11.5px;padding:4px 8px;">📧 Inviter</button>
          ${isAdmin ? `<button class="btn btn-sm" data-purge-local="${p.id}" data-purge-local-name="${escapeHTML(p.short)}" style="font-size:11.5px;padding:4px 8px;margin-left:4px;color:#FFFFFF;background:#B91C1C;border-color:#B91C1C;" title="Retirer du planning">💣</button>` : ''}
        </td>
      </tr>`).join('');

    box.innerHTML = `
      <h3>👥 Gestion des collaborateurs</h3>
      <div style="overflow-x:auto;margin-bottom:16px;">
        <table class="recap-table" style="min-width:600px;">
          <thead><tr>
            <th style="text-align:left;">Nom</th>
            <th style="text-align:left;">Rôle</th>
            <th style="text-align:left;">Email</th>
            <th title="Peut modifier le calendrier vétérinaires">Modif. vétos</th>
            <th title="Peut modifier toutes les lignes ASV">Modif. ASV</th>
            <th></th>
          </tr></thead>
          <tbody>${rows+localASVRows||'<tr><td colspan="6" class="text-muted" style="text-align:center;padding:16px;">Aucun collaborateur.</td></tr>'}</tbody>
        </table>
      </div>
      <div style="border-top:1px solid var(--color-border);padding-top:14px;">
        <h4 style="font-size:14px;margin-bottom:10px;">Inviter un collaborateur</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:end;margin-bottom:8px;">
          <input type="text" id="invite-name" placeholder="Nom affiché" style="padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
          <input type="email" id="invite-email" placeholder="Email" style="padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
          <select id="invite-role" style="padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
            <option value="vet">Vétérinaire</option>
            <option value="asv">ASV</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div id="invite-tf-row" style="display:none;margin-bottom:8px;">
          <label class="text-muted" style="font-size:12px;display:block;margin-bottom:6px;">Temps de travail contractuel</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            <button type="button" class="invite-tf-btn active" data-tf="full" style="padding:5px 11px;border-radius:6px;border:1px solid var(--color-primary);font-size:12.5px;cursor:pointer;background:var(--color-primary);color:#fff;">Temps plein (100%)</button>
            <button type="button" class="invite-tf-btn" data-tf="three_quarter" style="padding:5px 11px;border-radius:6px;border:1px solid var(--color-border);font-size:12.5px;cursor:pointer;background:var(--color-card);">3/4 temps (75%)</button>
            <button type="button" class="invite-tf-btn" data-tf="half" style="padding:5px 11px;border-radius:6px;border:1px solid var(--color-border);font-size:12.5px;cursor:pointer;background:var(--color-card);">Mi-temps (50%)</button>
            <button type="button" class="invite-tf-btn" data-tf="days" style="padding:5px 11px;border-radius:6px;border:1px solid var(--color-border);font-size:12.5px;cursor:pointer;background:var(--color-card);">Certains jours</button>
          </div>
          <div id="invite-tf-days" style="display:none;flex-wrap:wrap;gap:10px;margin-top:8px;">
            ${['Lun','Mar','Mer','Jeu','Ven','Sam'].map((l,i)=>`<label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" class="invite-day-cb" data-day="${i+1}"> ${l}</label>`).join('')}
          </div>
          <p id="invite-tf-summary" class="text-muted" style="font-size:12px;margin:4px 0 0;">${_tfSummaryText(1.0)}</p>
        </div>
        <p id="invite-error" style="color:#B91C1C;font-size:12px;display:none;margin:4px 0 0;"></p>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn" id="modal-cancel">Fermer</button>
          <button class="btn btn-primary" id="invite-btn">📧 Envoyer l'invitation</button>
        </div>
      </div>
    `;

    box.querySelector('#modal-cancel').onclick = close;
    backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };

    // Wire invite role → show/hide time fraction row
    const inviteRoleSel = box.querySelector('#invite-role');
    const inviteTfRow = box.querySelector('#invite-tf-row');
    const inviteTfSummary = box.querySelector('#invite-tf-summary');
    const updateInviteTf = ()=>{
      const isAsv = inviteRoleSel.value === 'asv';
      inviteTfRow.style.display = isAsv ? 'block' : 'none';
    };
    inviteRoleSel.addEventListener('change', updateInviteTf);
    updateInviteTf();
    // Wire invite TF preset buttons
    box.querySelectorAll('.invite-tf-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        box.querySelectorAll('.invite-tf-btn').forEach(b=>{ b.classList.remove('active'); b.style.background='var(--color-card)'; b.style.color=''; b.style.borderColor='var(--color-border)'; });
        btn.classList.add('active'); btn.style.background='var(--color-primary)'; btn.style.color='#fff'; btn.style.borderColor='var(--color-primary)';
        const tf = btn.dataset.tf;
        box.querySelector('#invite-tf-days').style.display = tf==='days'?'flex':'none';
        let fraction = {full:1.0,three_quarter:0.75,half:0.5}[tf];
        if(tf==='days') fraction = _computeTfFromDays(box).fraction;
        if(inviteTfSummary) inviteTfSummary.textContent = _tfSummaryText(fraction||1.0);
      });
    });
    box.querySelectorAll('.invite-day-cb').forEach(cb=> cb.addEventListener('change', ()=>{
      const r = _computeTfFromDays(box);
      if(inviteTfSummary) inviteTfSummary.textContent = _tfSummaryText(r.fraction);
    }));

    box.querySelectorAll('[data-edit-user]').forEach(btn=>{
      btn.onclick = ()=> openEditUserModal(btn.dataset.editUser, users, ()=> openManageUsersModal());
    });
    box.querySelectorAll('[data-delete-user]').forEach(btn=>{
      btn.onclick = ()=> openConfirmModal({
        title:`Supprimer le compte de ${btn.dataset.deleteName} ?`,
        message:`Le compte sera définitivement supprimé. Cette action est irréversible. Les données de planning restent enregistrées.`,
        confirmLabel:'Supprimer le compte',
        danger:true,
        onConfirm: async ()=>{
          try{
            const res = await fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, {
              method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}),
              body:JSON.stringify({ action:'delete', user_id:btn.dataset.deleteUser }),
            });
            if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.error||`Erreur ${res.status}`); }
            showToast(`Compte supprimé`, '🗑️');
            openManageUsersModal();
          }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
        },
      });
    });

    // Suppression définitive (purge complète — admin uniquement)
    box.querySelectorAll('[data-purge-user]').forEach(btn=>{
      btn.onclick = ()=>{
        const name = btn.dataset.purgeName;
        const userId = btn.dataset.purgeUser;
        const personId = btn.dataset.purgePerson || null;
        openConfirmModal({
          title:`⚠️ Suppression définitive de ${name} ?`,
          message:`Cette action est IRRÉVERSIBLE et supprime :\n\n• Toutes les présences et absences saisies\n• Toutes les signatures et demandes de congé\n• Les entretiens annuels\n• Le compte de connexion\n\nLes données ne pourront pas être récupérées.`,
          confirmLabel:`Supprimer définitivement`,
          danger:true,
          onConfirm: async ()=>{
            try{
              // 1. Nettoyer les données de planning en local
              if(personId){
                Object.keys(store.DATA.slots).filter(k=> k.includes(`_${personId}_`) || k.endsWith(`_${personId}`))
                  .forEach(k=> delete store.DATA.slots[k]);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(store.DATA));
                pushDataToSupabase();
              }
              // 2. Retirer de l'effectif ASV si présent
              const asvIdx = ASV_PEOPLE.findIndex(p=> p.id === personId);
              if(asvIdx !== -1){ ASV_PEOPLE.splice(asvIdx,1); reindexPresentShades(); saveASVRoster(); }
              // 3. Purge distante (tables Supabase + compte auth)
              const res = await fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, {
                method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}),
                body:JSON.stringify({ action:'purge', user_id:userId, person_id:personId }),
              });
              if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.error||`Erreur ${res.status}`); }
              showToast(`${name} supprimé(e) définitivement`, '🗑️');
              store.CAL_VIEWS = buildCalViews();
              renderCalendarView(activeCalendarViewKey()||'asv-current');
              openManageUsersModal();
            }catch(e){ showToast('Erreur purge : '+e.message, '⚠️'); }
          },
        });
      };
    });

    // Pré-remplir le formulaire d'invitation depuis une ligne locale (ASV ou vét)
    box.querySelectorAll('[data-prefill-invite]').forEach(btn=>{
      btn.onclick = ()=>{
        box.querySelector('#invite-name').value = btn.dataset.prefillInvite;
        box.querySelector('#invite-role').value = btn.dataset.prefillRole || 'asv';
        box.querySelector('#invite-email').focus();
        box.querySelector('#invite-email').scrollIntoView({ behavior:'smooth', block:'center' });
      };
    });

    // Purge d'un ASV local uniquement (sans compte Supabase)
    box.querySelectorAll('[data-purge-local]').forEach(btn=>{
      btn.onclick = ()=>{
        const name = btn.dataset.purgeLocalName;
        const personId = btn.dataset.purgeLocal;
        openConfirmModal({
          title:`⚠️ Retirer ${name} du planning ?`,
          message:`Cette action efface toutes les données de planning de ${name} et retire sa ligne du calendrier.\n\nElle est IRRÉVERSIBLE.`,
          confirmLabel:`Retirer définitivement`,
          danger:true,
          onConfirm: ()=>{
            Object.keys(store.DATA.slots).filter(k=> k.includes(`_${personId}_`) || k.endsWith(`_${personId}`))
              .forEach(k=> delete store.DATA.slots[k]);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store.DATA));
            pushDataToSupabase();
            const asvIdx = ASV_PEOPLE.findIndex(p=> p.id === personId);
            if(asvIdx !== -1){ ASV_PEOPLE.splice(asvIdx,1); reindexPresentShades(); saveASVRoster(); }
            showToast(`${name} retiré(e) du planning`, '🗑️');
            store.CAL_VIEWS = buildCalViews();
            renderCalendarView(activeCalendarViewKey()||'asv-current');
            openManageUsersModal();
          },
        });
      };
    });

    // Invitation
    box.querySelector('#invite-btn').onclick = async ()=>{
      const name = box.querySelector('#invite-name').value.trim();
      const email = box.querySelector('#invite-email').value.trim();
      const role = box.querySelector('#invite-role').value;
      const errEl = box.querySelector('#invite-error');
      if(!name || !email){ errEl.textContent='Nom et email requis.'; errEl.style.display='block'; return; }
      box.querySelector('#invite-btn').disabled = true;
      try{
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, {
          method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}),
          body:JSON.stringify({ action:'invite', email, display_name:name, role }),
        });
        if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.error||`Erreur ${res.status}`); }
        const inviteData = await res.json();
        // Lier le person_id au compte invité
        if(inviteData.user_id){
          let personId = null;
          if(role === 'vet'){
            // Vétérinaire : chercher dans PEOPLE par nom
            const vetLocal = PEOPLE.find(p=> name.trim().toLowerCase().includes(p.short.toLowerCase()));
            personId = vetLocal?.id || null;
          } else if(role === 'asv'){
            const existing = ASV_PEOPLE.find(p=> p.name.trim().toLowerCase() === name.trim().toLowerCase() && !linkedPersonIds.has(p.id));
            const asvPerson = existing || addASVPerson(name);
            personId = asvPerson?.id || null;
            // Appliquer le temps de travail choisi
            if(asvPerson){
              const activeBtn = box.querySelector('.invite-tf-btn.active');
              if(activeBtn){
                const PRESET_VALUES = { full:1.0, three_quarter:0.75, half:0.5 };
                const tf = activeBtn.dataset.tf;
                let tfResult;
                if(tf === 'days'){
                  const r = _computeTfFromDays(box);
                  tfResult = { fraction: r.fraction, workingDays: r.days };
                } else {
                  tfResult = { fraction: PRESET_VALUES[tf] ?? 1.0, workingDays: null };
                }
                asvPerson.timeFraction = tfResult.fraction;
                asvPerson.workingDays = tfResult.workingDays;
                saveASVRoster();
              }
            }
          }
          if(personId){
            await fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, {
              method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}),
              body:JSON.stringify({ action:'update', user_id:inviteData.user_id, person_id:personId }),
            }).catch(()=>{});
          }
        }
        box.querySelector('#invite-name').value='';
        box.querySelector('#invite-email').value='';
        errEl.style.display='none';
        box.querySelector('#invite-btn').disabled = false;
        showToast(`Invitation envoyée à ${email}`, '📧');
        openManageUsersModal();
      }catch(e){
        errEl.textContent = e.message; errEl.style.display='block';
        box.querySelector('#invite-btn').disabled = false;
      }
    };
  }).catch(err=>{
    box.innerHTML = `<h3>👥 Collaborateurs</h3><p class="text-muted">Impossible de charger la liste : ${escapeHTML(err.message)}.</p><div class="modal-actions"><button class="btn" id="modal-cancel">Fermer</button></div>`;
    box.querySelector('#modal-cancel').onclick = close;
  });
}

function buildTimeFractionUI(personId, forRole){
  if(forRole !== 'asv') return '';
  const p = personOf(personId);
  const cur = p?.timeFraction ?? 1.0;
  const workingDays = p?.workingDays || null;
  const DAY_LABELS = ['Lun','Mar','Mer','Jeu','Ven','Sam'];
  // Determine current preset
  let preset = 'custom';
  if(Math.abs(cur - 1.0) < 0.01) preset = 'full';
  else if(Math.abs(cur - 0.75) < 0.01) preset = 'three_quarter';
  else if(Math.abs(cur - 0.5) < 0.01) preset = 'half';
  else if(workingDays) preset = 'days';
  const dayChecks = DAY_LABELS.map((l,i)=> {
    const checked = workingDays ? workingDays.includes(i+1) : false;
    return `<label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" class="edit-day-cb" data-day="${i+1}" ${checked?'checked':''}> ${l}</label>`;
  }).join('');
  const customPct = Math.round(cur * 100);
  return `
    <div id="edit-tf-block" style="border-top:1px solid var(--color-border);padding-top:12px;">
      <label class="text-muted" style="font-size:12px;display:block;margin-bottom:8px;">Temps de travail contractuel</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;" id="edit-tf-presets">
        <button type="button" class="edit-tf-btn ${preset==='full'?'active':''}" data-tf="full" style="padding:5px 11px;border-radius:6px;border:1px solid var(--color-border);font-size:12.5px;cursor:pointer;${preset==='full'?'background:var(--color-primary);color:#fff;border-color:var(--color-primary);':'background:var(--color-card);'}">Temps plein (100%)</button>
        <button type="button" class="edit-tf-btn ${preset==='three_quarter'?'active':''}" data-tf="three_quarter" style="padding:5px 11px;border-radius:6px;border:1px solid var(--color-border);font-size:12.5px;cursor:pointer;${preset==='three_quarter'?'background:var(--color-primary);color:#fff;border-color:var(--color-primary);':'background:var(--color-card);'}">3/4 temps (75%)</button>
        <button type="button" class="edit-tf-btn ${preset==='half'?'active':''}" data-tf="half" style="padding:5px 11px;border-radius:6px;border:1px solid var(--color-border);font-size:12.5px;cursor:pointer;${preset==='half'?'background:var(--color-primary);color:#fff;border-color:var(--color-primary);':'background:var(--color-card);'}">Mi-temps (50%)</button>
        <button type="button" class="edit-tf-btn ${preset==='days'?'active':''}" data-tf="days" style="padding:5px 11px;border-radius:6px;border:1px solid var(--color-border);font-size:12.5px;cursor:pointer;${preset==='days'?'background:var(--color-primary);color:#fff;border-color:var(--color-primary);':'background:var(--color-card);'}">Certains jours</button>
        <button type="button" class="edit-tf-btn ${preset==='custom'?'active':''}" data-tf="custom" style="padding:5px 11px;border-radius:6px;border:1px solid var(--color-border);font-size:12.5px;cursor:pointer;${preset==='custom'?'background:var(--color-primary);color:#fff;border-color:var(--color-primary);':'background:var(--color-card);'}">Personnalisé</button>
      </div>
      <div id="edit-tf-days" style="display:${preset==='days'?'flex':'none'};flex-wrap:wrap;gap:10px;margin-bottom:8px;">${dayChecks}</div>
      <div id="edit-tf-custom" style="display:${preset==='custom'?'flex':'none'};align-items:center;gap:8px;margin-bottom:4px;">
        <input type="number" id="edit-tf-pct" min="10" max="100" step="5" value="${customPct}" style="width:80px;padding:6px 8px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;">
        <span style="font-size:13px;">% du temps plein</span>
      </div>
      <p id="edit-tf-summary" class="text-muted" style="font-size:12px;margin:2px 0 0;">${_tfSummaryText(cur)}</p>
    </div>`;
}
function _tfSummaryText(fraction){
  const q = { weekly: Math.round(35*fraction*100)/100, annual: Math.round(1607*fraction*10)/10 };
  return `→ ${formatHHMM(q.weekly)}/semaine · ${formatNum(q.annual)}h/an`;
}
function _computeTfFromDays(box){
  const checked = [...box.querySelectorAll('.edit-day-cb:checked')].map(cb=>parseInt(cb.dataset.day));
  // Mon-Fri avg = (8.5+8.25)/2 = 8.375h, Sat = 7.0h
  const weekly = checked.reduce((s,d)=> s + (d===6?7.0:8.375), 0);
  return { fraction: Math.round(weekly/35*1000)/1000, weekly, days: checked };
}
function wireTimeFractionUI(box, personId){
  if(!box.querySelector('#edit-tf-block')) return;
  const PRESET_VALUES = { full:1.0, three_quarter:0.75, half:0.5 };
  const updateSummary = ()=>{
    const active = box.querySelector('.edit-tf-btn.active');
    if(!active) return;
    const tf = active.dataset.tf;
    let fraction;
    if(tf === 'days'){
      const r = _computeTfFromDays(box);
      fraction = r.fraction;
    } else if(tf === 'custom'){
      fraction = (parseInt(box.querySelector('#edit-tf-pct').value)||100)/100;
    } else {
      fraction = PRESET_VALUES[tf] || 1.0;
    }
    box.querySelector('#edit-tf-summary').textContent = _tfSummaryText(fraction);
  };
  box.querySelectorAll('.edit-tf-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      box.querySelectorAll('.edit-tf-btn').forEach(b=>{ b.classList.remove('active'); b.style.background='var(--color-card)'; b.style.color=''; b.style.borderColor='var(--color-border)'; });
      btn.classList.add('active'); btn.style.background='var(--color-primary)'; btn.style.color='#fff'; btn.style.borderColor='var(--color-primary)';
      const tf = btn.dataset.tf;
      box.querySelector('#edit-tf-days').style.display = tf==='days'?'flex':'none';
      box.querySelector('#edit-tf-custom').style.display = tf==='custom'?'flex':'none';
      updateSummary();
    });
  });
  box.querySelectorAll('.edit-day-cb').forEach(cb=> cb.addEventListener('change', updateSummary));
  box.querySelector('#edit-tf-pct')?.addEventListener('input', updateSummary);
}
function getTimeFractionFromUI(box){
  const active = box.querySelector('.edit-tf-btn.active');
  if(!active) return null;
  const tf = active.dataset.tf;
  const PRESET_VALUES = { full:1.0, three_quarter:0.75, half:0.5 };
  if(tf === 'days'){
    const r = _computeTfFromDays(box);
    return { fraction: r.fraction, workingDays: r.days };
  } else if(tf === 'custom'){
    return { fraction: (parseInt(box.querySelector('#edit-tf-pct').value)||100)/100, workingDays: null };
  } else {
    return { fraction: PRESET_VALUES[tf] ?? 1.0, workingDays: null };
  }
}

function openEditUserModal(userId, users, onBack){
  const user = users.find(u=>u.id===userId);
  if(!user) return;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  const isAdmin = store.currentUser?.role === 'admin';
  const personId = user.person_id;

  box.innerHTML = `
    <h3>Modifier ${escapeHTML(user.display_name||user.email||'collaborateur')}</h3>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:4px;">Nom affiché</label>
        <input type="text" id="edit-display-name" value="${escapeHTML(user.display_name||'')}" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;box-sizing:border-box;">
      </div>
      <div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:4px;">Adresse email</label>
        <input type="email" id="edit-email" value="${escapeHTML(user.email||'')}" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;box-sizing:border-box;">
      </div>
      <div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:4px;">Rôle</label>
        <select id="edit-role" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
          <option value="vet" ${user.role==='vet'?'selected':''}>Vétérinaire</option>
          <option value="asv" ${user.role==='asv'?'selected':''}>ASV</option>
          <option value="admin" ${user.role==='admin'?'selected':''}>Admin</option>
        </select>
      </div>
      <div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:8px;">Droits de modification des plannings</label>
        <label style="font-size:13px;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <input type="checkbox" id="edit-vet-cal" ${user.can_edit_vet_calendar?'checked':''}>
          Peut modifier le planning vétérinaires
        </label>
        <label style="font-size:13px;display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="edit-all-asv" ${user.can_edit_all_asv?'checked':''}>
          Peut modifier toutes les lignes ASV
        </label>
      </div>
      ${buildTimeFractionUI(personId, user.role)}
      ${personId ? `<div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:8px;">Couleur dans le planning</label>
        <div style="display:flex;align-items:center;gap:12px;">
          <input type="color" id="edit-person-color" value="${escapeHTML(personOf(personId)?.color||'#888888')}"
            style="width:48px;height:32px;border:1px solid var(--color-border);border-radius:6px;cursor:pointer;padding:2px;background:none;">
          <span style="font-size:12px;color:var(--color-text-muted);">Éviter le vert, rouge, bleu foncé, jaune et blanc (réservés aux statuts)</span>
        </div>
        <p id="edit-color-error" style="color:#B91C1C;font-size:12px;display:none;margin:4px 0 0;"></p>
      </div>` : ''}
      <div style="border-top:1px solid var(--color-border);padding-top:12px;">
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:8px;">Accès au compte</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" id="edit-send-invite" style="font-size:12px;">📧 Renvoyer l'invitation</button>
          <button class="btn" id="edit-send-reset" style="font-size:12px;">🔑 Réinitialiser le mot de passe</button>
          ${isAdmin && personId ? `<button class="btn" id="edit-reset-profile" style="font-size:12px;color:#B91C1C;border-color:#FCA5A5;" title="Vider les données de planning de ce profil (admin uniquement)">🗑️ Réinitialiser le profil</button>` : ''}
        </div>
        <p id="edit-access-msg" style="font-size:12px;margin:6px 0 0;display:none;"></p>
      </div>
    </div>
    <p id="edit-error" style="color:#B91C1C;font-size:12px;display:none;margin-bottom:8px;"></p>
    <div class="modal-actions">
      <button class="btn" id="edit-back">← Retour</button>
      <button class="btn btn-primary" id="edit-save">Enregistrer</button>
    </div>
  `;

  wireTimeFractionUI(box, personId);

  box.querySelector('#edit-back').onclick = ()=> onBack();
  box.querySelector('#edit-save').onclick = async ()=>{
    const displayName = box.querySelector('#edit-display-name').value.trim();
    const email = box.querySelector('#edit-email').value.trim();
    const role = box.querySelector('#edit-role').value;
    const canVet = box.querySelector('#edit-vet-cal').checked;
    const canAsv = box.querySelector('#edit-all-asv').checked;
    const errEl = box.querySelector('#edit-error');
    if(!displayName){ errEl.textContent='Le nom est requis.'; errEl.style.display='block'; return; }
    // Valider la couleur avant d'envoyer
    const colorInput = box.querySelector('#edit-person-color');
    const colorErrEl = box.querySelector('#edit-color-error');
    if(colorInput && personId){
      const reason = colorRejectReason(colorInput.value);
      if(reason){ if(colorErrEl){ colorErrEl.textContent=reason; colorErrEl.style.display='block'; } return; }
    }
    box.querySelector('#edit-save').disabled = true;
    try{
      const payload = {
        action:'update', user_id:userId,
        display_name:displayName, role,
        can_edit_vet_calendar:canVet, can_edit_all_asv:canAsv,
      };
      if(email && email !== user.email) payload.email = email;
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, {
        method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify(payload),
      });
      if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.error||`Erreur ${res.status}`); }
      // Mettre à jour la couleur en local
      if(colorInput && personId){
        const p = personOf(personId);
        if(p){ p.color = colorInput.value; savePersonColors(); applyPersonColorVars(); }
      }
      // Mettre à jour le temps de travail contractuel en local (ASV uniquement)
      if(role === 'asv' && personId){
        const tfResult = getTimeFractionFromUI(box);
        if(tfResult){
          const p = personOf(personId);
          if(p){ p.timeFraction = tfResult.fraction; p.workingDays = tfResult.workingDays; saveASVRoster(); }
        }
      }
      showToast('Collaborateur mis à jour', '✅');
      onBack();
    }catch(e){
      errEl.textContent=e.message; errEl.style.display='block';
      box.querySelector('#edit-save').disabled = false;
    }
  };

  // Réinitialisation du profil (admin uniquement) — supprime le compte Supabase (email + auth)
  // mais conserve la ligne planning et toutes les données saisies.
  // Résultat : la personne revient à l'état "Sans compte" avec bouton "Inviter".
  box.querySelector('#edit-reset-profile')?.addEventListener('click', ()=>{
    openConfirmModal({
      title:`Réinitialiser le compte de ${escapeHTML(user.display_name||user.email||'ce collaborateur')} ?`,
      message:`Le compte Supabase (email, mot de passe, accès à l'app) sera supprimé.\n\nLes données de planning et la ligne dans le calendrier restent intactes.\n\nVous pourrez ensuite inviter un nouvel email sur ce profil.\n\nCette action est irréversible.`,
      confirmLabel:'Supprimer le compte',
      danger: true,
      onConfirm: async ()=>{
        try{
          const res = await fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, {
            method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}),
            body:JSON.stringify({ action:'delete', user_id:userId }),
          });
          if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.error||`Erreur ${res.status}`); }
          showToast(`Compte de ${escapeHTML(user.display_name||user.email||'ce profil')} supprimé — planning conservé`, '✅');
          onBack();
        }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
      },
    });
  });

  const sendAccessEmail = async (type)=>{
    const msgEl = box.querySelector('#edit-access-msg');
    msgEl.style.display='none';
    box.querySelector('#edit-send-invite').disabled = true;
    box.querySelector('#edit-send-reset').disabled = true;
    try{
      let res = await fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, {
        method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({ action:'send_access_email', user_id:userId, type }),
      });
      if(res.status === 401){ await authRefreshSession(); res = await fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, { method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}), body:JSON.stringify({ action:'send_access_email', user_id:userId, type }) }); }
      if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.error||`Erreur ${res.status}`); }
      const d = await res.json();
      msgEl.style.color='var(--color-primary)';
      msgEl.textContent=`Email envoyé à ${d.email||user.email}`;
      msgEl.style.display='block';
    }catch(e){
      msgEl.style.color='#B91C1C';
      msgEl.textContent='Erreur : '+e.message;
      msgEl.style.display='block';
    }finally{
      box.querySelector('#edit-send-invite').disabled = false;
      box.querySelector('#edit-send-reset').disabled = false;
    }
  };
  box.querySelector('#edit-send-invite').onclick = ()=> sendAccessEmail('invite');
  box.querySelector('#edit-send-reset').onclick = ()=> sendAccessEmail('recovery');
}


// Synchronisation calendrier (lien d'abonnement ICS) : chaque vétérinaire active/désactive
// la sienne indépendamment depuis ce même panneau, pas d'identité par compte sur ce site —
// comme pour le reste de l'app, c'est une protection légère basée sur le lien lui-même. Le
// même lien peut être ajouté à plusieurs téléphones/comptes ; le désactiver coupe l'accès
// pour tous d'un coup. CALENDAR_FEED_URL est défini plus bas, juste après
// SUPABASE_FUNCTIONS_URL (section Persistance) — les fonctions ci-dessous ne le lisent
// qu'au moment de l'appel, jamais pendant le chargement initial du script, donc l'ordre
// des déclarations n'a pas d'impact.
const CALENDAR_SYNC_COLORS = ['#0F766E','#2563EB','#7C3AED','#DC2626','#16A34A','#EA580C'];
async function getCalendarSyncStatus(personId){
  const res = await fetch(`${SUPABASE_URL}rpc/get_calendar_sync_status`, {
    method:'POST',
    headers: supabaseHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ p_person_id: personId }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return rows[0] || { token:null, sync_presence:true, sync_absences:true, color:CALENDAR_SYNC_COLORS[0] };
}
async function generateCalendarSyncToken(personId){
  const res = await fetch(`${SUPABASE_URL}rpc/generate_calendar_sync_token`, {
    method:'POST',
    headers: supabaseHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ p_person_id: personId }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function revokeCalendarSyncToken(personId){
  const res = await fetch(`${SUPABASE_URL}rpc/revoke_calendar_sync_token`, {
    method:'POST',
    headers: supabaseHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ p_person_id: personId }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
}
async function updateCalendarSyncPreferences(personId, syncPresence, syncAbsences, color){
  const res = await fetch(`${SUPABASE_URL}rpc/update_calendar_sync_preferences`, {
    method:'POST',
    headers: supabaseHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ p_person_id: personId, p_sync_presence: syncPresence, p_sync_absences: syncAbsences, p_color: color }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
}
function calendarSyncPersonBlockHtml(person){
  return `
    <div class="card" style="padding:14px 16px;" id="cal-sync-block-${person.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <span style="font-size:13.5px;font-weight:700;color:${person.color};">${escapeHTML(person.short)}</span>
        <span class="text-muted" id="cal-sync-status-${person.id}" style="font-size:12px;">Chargement…</span>
      </div>
      <div id="cal-sync-body-${person.id}" style="margin-top:10px;"></div>
    </div>
  `;
}
function calendarSyncPreferencesHtml(person, status){
  return `
    <div style="margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;margin-bottom:4px;">
        <input type="checkbox" data-pref-presence ${status.sync_presence?'checked':''}> Jours de présence
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;margin-bottom:8px;">
        <input type="checkbox" data-pref-absences ${status.sync_absences?'checked':''}> Jours d'absence
      </label>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        ${CALENDAR_SYNC_COLORS.map(c=>`
          <button type="button" data-pref-color="${c}" aria-label="Couleur ${c}"
            style="width:20px;height:20px;border-radius:50%;background:${c};border:2px solid ${c===status.color?'#0F172A':'transparent'};cursor:pointer;padding:0;"></button>
        `).join('')}
      </div>
      <button type="button" class="btn" data-save-prefs style="width:100%;justify-content:center;font-size:12px;padding:6px;">Enregistrer ces préférences</button>
    </div>
  `;
}
function wireCalendarSyncPreferences(prefsEl, person, status){
  let selectedColor = status.color;
  prefsEl.querySelectorAll('[data-pref-color]').forEach(btn=>{
    btn.onclick = ()=>{
      selectedColor = btn.dataset.prefColor;
      prefsEl.querySelectorAll('[data-pref-color]').forEach(b=>{
        b.style.border = `2px solid ${b.dataset.prefColor === selectedColor ? '#0F172A' : 'transparent'}`;
      });
    };
  });
  prefsEl.querySelector('[data-save-prefs]').onclick = async ()=>{
    const syncPresence = prefsEl.querySelector('[data-pref-presence]').checked;
    const syncAbsences = prefsEl.querySelector('[data-pref-absences]').checked;
    await updateCalendarSyncPreferences(person.id, syncPresence, syncAbsences, selectedColor);
    showToast(`Préférences de ${person.short} enregistrées`, '📅');
  };
}
function renderCalendarSyncPersonBody(box, person, status, link){
  const active = !!status.token;
  const statusEl = box.querySelector(`#cal-sync-status-${person.id}`);
  statusEl.textContent = active ? '✅ Active' : '⬜ Non activée';
  const bodyEl = box.querySelector(`#cal-sync-body-${person.id}`);
  const prefsHtml = calendarSyncPreferencesHtml(person, status);
  if(active){
    bodyEl.innerHTML = `
      ${prefsHtml}
      <input type="text" readonly value="${escapeHTML(link)}" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:6px;font-size:11.5px;font-family:inherit;margin-bottom:8px;" onclick="this.select();">
      <div class="flex gap-2">
        <button type="button" class="btn" data-copy-link style="flex:1;justify-content:center;font-size:12.5px;">Copier le lien</button>
        <button type="button" class="btn" data-revoke style="flex:1;justify-content:center;font-size:12.5px;color:#B91C1C;border-color:#FCA5A5;">Désactiver</button>
      </div>
      <p class="text-muted" style="font-size:11px;margin-top:6px;">Le même lien peut être ajouté à plusieurs téléphones/comptes. "Désactiver" coupe l'accès à tous d'un coup ; les événements déjà ajoutés disparaissent au prochain rafraîchissement automatique de chaque appareil (pas instantané — ni Apple ni Google ne permettent de forcer une suppression immédiate à distance).</p>
    `;
    wireCalendarSyncPreferences(bodyEl, person, status);
    bodyEl.querySelector('[data-copy-link]').onclick = ()=>{
      navigator.clipboard?.writeText(link);
      showToast('Lien copié', '📋');
    };
    bodyEl.querySelector('[data-revoke]').onclick = async ()=>{
      await revokeCalendarSyncToken(person.id);
      renderCalendarSyncPersonBody(box, person, { ...status, token:null }, '');
      showToast(`Synchronisation de ${person.short} désactivée`, '📅');
    };
  } else {
    bodyEl.innerHTML = `
      ${prefsHtml}
      <button type="button" class="btn btn-primary" data-generate style="width:100%;justify-content:center;font-size:12.5px;">Générer mon lien</button>
    `;
    wireCalendarSyncPreferences(bodyEl, person, status);
    bodyEl.querySelector('[data-generate]').onclick = async ()=>{
      const token = await generateCalendarSyncToken(person.id);
      const newLink = `${CALENDAR_FEED_URL}?person=${person.id}&token=${token}`;
      renderCalendarSyncPersonBody(box, person, { ...status, token }, newLink);
      showToast(`Lien généré pour ${person.short}`, '📅');
    };
  }
}
function openCalendarSyncModal(){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box modal-box-wide';
  box.innerHTML = `
    <h3>📅 Synchronisation calendrier</h3>
    <p>Chaque vétérinaire peut abonner son calendrier iPhone ou Android à son planning Amivet. Une fois le lien ajouté, la mise à jour est automatique (toutes les quelques heures, gérée par le téléphone) — sens unique du planning vers le téléphone.</p>
    <div class="cal-sync-grid">${PEOPLE.map(p=> calendarSyncPersonBlockHtml(p)).join('')}</div>
    <p class="text-muted" style="font-size:11.5px;line-height:1.6;margin-top:14px;">
      <strong>iPhone :</strong> ouvrez le lien copié dans Safari, ou Réglages → Calendrier → Comptes → Ajouter un compte → Autre → Ajouter un calendrier en abonnement. La couleur choisie est reprise automatiquement.<br>
      <strong>Android :</strong> sur calendar.google.com (ordinateur), "Autres agendas" → "À partir de l'URL", collez le lien — il apparaît ensuite automatiquement sur le téléphone via le compte Google synchronisé. Google ne reprend pas toujours la couleur choisie ici : vous pouvez la réajuster vous-même dans Google Agenda si besoin.
    </p>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn" id="modal-cancel">Fermer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };

  PEOPLE.forEach(person=>{
    getCalendarSyncStatus(person.id).then(status=>{
      const link = status.token ? `${CALENDAR_FEED_URL}?person=${person.id}&token=${status.token}` : '';
      renderCalendarSyncPersonBody(box, person, status, link);
    }).catch(e=>{
      box.querySelector(`#cal-sync-status-${person.id}`).textContent = 'Connexion impossible';
      console.warn(e);
    });
  });
}

// État de navigation par vue calendrier (mois affiché courant par année)
const today = new Date();

// ----------------------------------------------------------------
// Année "courante" / "prévisionnelle" — dynamiques plutôt que des littéraux figés, pour
// que la bascule annuelle (voir performYearRollover) continue de fonctionner toute seule
// chaque 1er janvier sans jamais avoir besoin de retoucher le code.
// ----------------------------------------------------------------


// Cal state + store.CAL_VIEWS → store.js (see initCalState() below)
function buildCalViews(){
  const cy = getCurrentYear();
  return {
    'vets-current':  { year:cy,   people:PEOPLE,     navState:store.calStateCurrent,     todayNav:true,  forecast:false, label:'Vétérinaires', containerId:'vets-sub-calendar', printable:false },
    'vets-forecast': { year:cy+1, people:PEOPLE,     navState:store.calStateForecast,    todayNav:false, forecast:true,  label:'Vétérinaires', containerId:'vets-sub-forecast', printable:false },
    'asv-current':   { year:cy,   people:ASV_PEOPLE, navState:store.calStateAsvCurrent,  todayNav:true,  forecast:false, label:'ASV',          containerId:'asv-sub-calendar',  printable:true },
    'asv-forecast':  { year:cy+1, people:ASV_PEOPLE, navState:store.calStateAsvForecast, todayNav:false, forecast:true,  label:'ASV',          containerId:'asv-sub-forecast',  printable:true },
  };
}
function initCalState(){
  const cy = getCurrentYear();
  const m = today.getFullYear() === cy ? today.getMonth() : 0;
  store.calStateCurrent.month = m;
  store.calStateAsvCurrent.month = m;
  store.CAL_VIEWS = buildCalViews();
  store.dashState.year = cy;
}
const GROUP_VIEWS = {
  vets: { label:'Vétérinaires', calendarViewKey:'vets-current', forecastViewKey:'vets-forecast', calendarContainer:'vets-sub-calendar', annualContainer:'vets-sub-annual', forecastContainer:'vets-sub-forecast' },
  asv:  { label:'ASV',          calendarViewKey:'asv-current',  forecastViewKey:'asv-forecast',  calendarContainer:'asv-sub-calendar',  annualContainer:'asv-sub-annual',  forecastContainer:'asv-sub-forecast' },
};

initCalState();

// Verrou par mot de passe (protection légère) des onglets sensibles. Le mot de passe
// lui-même n'existe nulle part dans ce code source (public sur GitHub) : il est stocké
// sous forme de hash dans Supabase, vérifié via des fonctions RPC qui ne renvoient que
// vrai/faux (voir supabase-schema-3-password-security.sql).

// ----------------------------------------------------------------
// Bascule annuelle automatique (current -> current+1, forecast -> forecast+1)
// ----------------------------------------------------------------
function isYearRolloverDue(){ return today.getFullYear() > getCurrentYear(); }
function performYearRollover(){
  const fromYear = getCurrentYear();
  const toYear = fromYear + 1;
  setCurrentYear(toYear);
  store.CAL_VIEWS = buildCalViews();
  store.calStateCurrent.month = 0;
  store.calStateAsvCurrent.month = 0;
  store.calStateForecast.month = 0;
  store.calStateAsvForecast.month = 0;
  document.getElementById('rollover-banner')?.remove();
  renderCurrentView();
  showToast(`Calendrier basculé sur ${toYear}`, '🔄');
}
function renderRolloverBanner(){
  if(!isYearRolloverDue()) return;
  if(document.getElementById('rollover-banner')) return;
  const fromYear = getCurrentYear(), toYear = fromYear + 1;
  const bar = document.createElement('div');
  bar.id = 'rollover-banner';
  bar.className = 'rollover-banner';
  bar.innerHTML = `
    <span>📅 Nous sommes en ${today.getFullYear()} — le calendrier ${fromYear} peut basculer sur ${toYear} (le prévisionnel ${toYear} devient le calendrier courant, ${toYear+1} est proposé en prévisionnel).</span>
    <div class="rollover-actions">
      <button class="btn btn-sm btn-primary" id="rollover-confirm">Basculer maintenant</button>
      <button class="btn-icon" id="rollover-dismiss" aria-label="Plus tard">✕</button>
    </div>
  `;
  document.getElementById('app-main').prepend(bar);
  bar.querySelector('#rollover-confirm').onclick = performYearRollover;
  bar.querySelector('#rollover-dismiss').onclick = ()=> bar.remove();
}

const UNDO_MAX = 30;
function snapshotBeforeChange(){
  store.UNDO_STACK.push(JSON.stringify(store.DATA.slots));
  if(store.UNDO_STACK.length > UNDO_MAX) store.UNDO_STACK.shift();
  updateUndoButtons();
}
function undoLastAction(){
  if(store.UNDO_STACK.length === 0) return;
  store.DATA.slots = JSON.parse(store.UNDO_STACK.pop());
  saveData(false);
  renderCurrentView();
  updateUndoButtons();
  showToast('Dernière action annulée', '↩️');
}
function updateUndoButtons(){
  document.querySelectorAll('.undo-btn').forEach(btn=>{ btn.disabled = store.UNDO_STACK.length === 0; });
}


/* ----------------------------------------------------------------
   4. PERSISTANCE (localStorage + synchronisation Supabase partagée)
   ---------------------------------------------------------------- */

// ----------------------------------------------------------------
// Authentification — état global et gestion de session
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// État global — Annonces
// ----------------------------------------------------------------

function clearAuthSession(){ sessionStorage.removeItem(AUTH_SESSION_KEY); store.currentUser = null; }

// ----------------------------------------------------------------
// Fonctions d'authentification (Supabase Auth REST)
// ----------------------------------------------------------------
async function authSignOut(){
  const s = getAuthSession();
  if(s?.access_token){
    await fetch(`${SUPABASE_AUTH_URL}logout`, {
      method:'POST',
      headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${s.access_token}` },
    }).catch(()=>{});
  }
  clearAuthSession();
}
async function authRefreshSession(){
  const s = getAuthSession();
  if(!s?.refresh_token){ clearAuthSession(); return null; }
  const res = await fetch(`${SUPABASE_AUTH_URL}token?grant_type=refresh_token`, {
    method:'POST',
    headers:{ apikey:SUPABASE_ANON_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ refresh_token:s.refresh_token }),
  });
  if(!res.ok){ clearAuthSession(); return null; }
  const session = await res.json();
  saveAuthSession(session);
  return session;
}
async function loadCurrentUser(){
  const s = getAuthSession();
  if(!s?.access_token) return null;
  // Vérifier le token Supabase Auth
  let authRes = await fetch(`${SUPABASE_AUTH_URL}user`, {
    headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${s.access_token}` },
  });
  if(authRes.status === 401){
    const refreshed = await authRefreshSession();
    if(!refreshed) return null;
    authRes = await fetch(`${SUPABASE_AUTH_URL}user`, {
      headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${refreshed.access_token}` },
    });
  }
  if(!authRes.ok) return null;
  const authUser = await authRes.json();
  // Charger le profil depuis user_profiles
  const profRes = await fetch(`${SUPABASE_URL}user_profiles?id=eq.${authUser.id}&select=*`, {
    headers: supabaseHeaders(),
  });
  if(!profRes.ok) return null;
  const profiles = await profRes.json();
  if(!profiles.length) return null;
  const p = profiles[0];
  store.currentUser = {
    id: authUser.id, email: authUser.email,
    role: p.role, person_id: p.person_id, display_name: p.display_name,
    can_edit_vet_calendar: p.can_edit_vet_calendar,
    can_edit_all_asv: p.can_edit_all_asv,
  };
  return store.currentUser;
}

// ----------------------------------------------------------------
// Helpers de permissions
// ----------------------------------------------------------------
function effectiveRole(){
  if(!store.currentUser) return null;
  if(store.currentUser.role === 'admin') return store.adminViewMode === 'asv' ? 'asv' : 'vet';
  return store.currentUser.role;
}
function canAccessDashboard(){ const r = effectiveRole(); return r === 'vet' || r === 'admin'; }
function canAccessSettings(){ return store.currentUser?.role === 'admin' || store.currentUser?.role === 'vet'; }
function canEditSlot(personId){
  if(!store.currentUser) return false;
  const asvPerson = ASV_PEOPLE.find(p=>p.id===personId);
  if(asvPerson?.archived) return false;
  const role = effectiveRole();
  if(role === 'vet') return true;
  if(role === 'asv'){
    const isImpersonating = store.currentUser.role === 'admin' && store.adminViewMode === 'asv';
    const myId = isImpersonating ? store.adminImpersonatedPersonId : store.currentUser.person_id;
    if(isASVPerson(personId)){
      // En impersonation : strictement la ligne de la personne choisie, comme un vrai ASV
      if(isImpersonating) return personId === myId;
      return personId === myId || store.currentUser.can_edit_all_asv === true;
    }
    // Calendrier vétérinaires : jamais modifiable en impersonation
    if(isImpersonating) return false;
    return store.currentUser.can_edit_vet_calendar === true;
  }
  return false;
}

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && parsed.slots) { store.DATA = parsed; return; }
    }
  }catch(e){ console.warn('Lecture localStorage impossible, ré-initialisation.', e); }
  store.DATA = { version:2, slots:{} };
}
function saveData(showToast = true){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store.DATA));
  updateDashboardNavBadge();
  scheduleSupabasePush();
  if(showToast) showSavedToast();
}

// --- Synchronisation Supabase : la base partagée fait foi entre tous les appareils, le
// localStorage ne sert que de cache instantané pour le premier affichage et le hors-ligne.
let _supabasePushTimer = null;
function scheduleSupabasePush(){
  clearTimeout(_supabasePushTimer);
  // Attend une courte pause après la dernière modification (ex. fin d'un glisser-peindre)
  // pour grouper les écritures plutôt que d'envoyer une requête à chaque case cochée.
  _supabasePushTimer = setTimeout(()=> pushDataToSupabase(store.DATA.slots), 900);
}
// Signatures électroniques mensuelles (feuille de présence ASV) : un cache local simple
// (clé "personId|year|month") rechargé au démarrage et après chaque signature/annulation —
// pas besoin de la sophistication du sync push/pull de planning_data, ces écritures sont
// rares et ponctuelles (quelques-unes par mois, pas par clic).
/* signatures.js — signatureKey, isMonthSigned, loadSignatures, signMonth, revokeSignature */

async function loadInterviews(){
  try{
    const res = await fetch(`${SUPABASE_URL}annual_interviews?select=*`, { headers: supabaseHeaders() });
    if(!res.ok) return;
    store.INTERVIEWS = await res.json();
  }catch(e){ console.warn('Entretiens inaccessibles.', e); }
}

// Notifie le nombre de demandes de congé ASV en attente directement sur l'onglet "Tableau
// de bord", visible depuis n'importe quelle page de l'app (pas seulement quand on y est).
function updateDashboardNavBadge(){
  const el = document.getElementById('dash-nav-badge');
  const n = countPendingLeaveRequests();
  if(el){
    el.textContent = n > 0 ? String(n) : '';
    el.className = n > 0 ? 'nav-badge' : '';
  }
  if('setAppBadge' in navigator){
    if(n > 0) navigator.setAppBadge(n).catch(()=>{});
    else navigator.clearAppBadge().catch(()=>{});
  }
}

// ----------------------------------------------------------------
/* announcements.js — annonceViewerId, loadAnnouncements, renderAnnounces, etc. */

/* slots.js — slotKey, labelKey, getSlotState/setSlotState, etc. */

/* ----------------------------------------------------------------
   5. DONNÉES DE DÉMONSTRATION
   ---------------------------------------------------------------- */
// Marque une plage de jours (bornes incluses) comme absente avec un motif, pour une personne donnée
function seedAbsenceRange(personId, fromISO, toISO, label){
  let d = new Date(fromISO+'T00:00:00');
  const end = new Date(toISO+'T00:00:00');
  while(d <= end){
    if(!isSunday(d)){
      const iso = fmtISO(d);
      SLOTS.forEach(slot=>{
        setSlotState(iso, personId, slot, 'absent');
        setSlotLabel(iso, personId, slot, label);
      });
    }
    d = new Date(d.getTime() + 86400000);
  }
}

function seedDemoData(){
  // --- 2026 : données réelles (issues du planning Excel de la clinique) ---
  // Janvier à août : présence par défaut Lu-Sa pour les deux associés (les jours fériés
  // restent vides, comme dans le fichier source, qui ne contient pas non plus de données
  // au-delà du mois d'août 2026 — sept./oct./nov./déc. ne sont donc pas pré-remplis).
  for(let month=0; month<=7; month++){
    const nbDays = daysInMonth(2026, month);
    for(let day=1; day<=nbDays; day++){
      const date = new Date(2026, month, day);
      const iso = fmtISO(date);
      if(isSunday(date) || holidayName(iso)) continue;
      setSlotState(iso,'david','M','present');
      setSlotState(iso,'david','AM','present');
      setSlotState(iso,'stephane','M','present');
      setSlotState(iso,'stephane','AM','present');
    }
  }
  // Congés et événements identifiés sur le planning d'origine
  seedAbsenceRange('david', '2026-01-12', '2026-01-16', 'Perche');
  seedAbsenceRange('david', '2026-01-26', '2026-01-31', 'Ski');
  seedAbsenceRange('david', '2026-02-09', '2026-02-13', 'Perche');
  seedAbsenceRange('stephane', '2026-05-01', '2026-05-02', '70 ans de Michel');
  seedAbsenceRange('stephane', '2026-05-13', '2026-05-14', 'Baptême Lucas');
  seedAbsenceRange('david', '2026-05-19', '2026-05-23', 'Florence et Erwan');
  seedAbsenceRange('stephane', '2026-06-19', '2026-06-20', 'Week-end Pivot');
  seedAbsenceRange('stephane', '2026-06-24', '2026-06-28', 'Barcelone GP');
  seedAbsenceRange('stephane', '2026-10-10', '2026-10-11', 'Marathon Cologne');

  // --- 2027 : janvier (prévisionnel) ---
  const nbDaysJan2027 = daysInMonth(2027,0);
  for(let day=1; day<=nbDaysJan2027; day++){
    const date = new Date(2027,0,day);
    if(isSunday(date)) continue;
    const iso = fmtISO(date);
    const wd = isoWeekday(date);
    if(wd <=3){ setSlotState(iso,'david','M','present'); setSlotState(iso,'david','AM','present'); }
    else if(wd === 4){ setSlotState(iso,'david','M','absent'); setSlotState(iso,'david','AM','absent'); }
    if(wd >=1 && wd <=4){ setSlotState(iso,'stephane','M','present'); setSlotState(iso,'stephane','AM','present'); }
    else if(wd === 0){ setSlotState(iso,'stephane','M','absent'); setSlotState(iso,'stephane','AM','absent'); }
  }
  ['2027-01-12','2027-01-13','2027-01-14'].forEach(iso=>{
    setSlotState(iso,'stephane','M','absent'); setSlotLabel(iso,'stephane','M','Formation chirurgie');
    setSlotState(iso,'stephane','AM','absent'); setSlotLabel(iso,'stephane','AM','Formation chirurgie');
  });
  // --- 2027 : semaine de congés David en février ---
  for(let day=8; day<=12; day++){
    const date = new Date(2027,1,day);
    if(isSunday(date)) continue;
    const iso = fmtISO(date);
    setSlotState(iso,'david','M','absent'); setSlotLabel(iso,'david','M','Vacances hiver');
    setSlotState(iso,'david','AM','absent'); setSlotLabel(iso,'david','AM','Vacances hiver');
  }
  saveData(false);
}


/* ----------------------------------------------------------------
   8. MENU RÉGLAGES (export / import / reset)
   ---------------------------------------------------------------- */
function buildSettingsMenuHtml(){
  const isVet = canAccessSettings();
  const isAdmin = store.currentUser?.role === 'admin';
  const userName = store.currentUser?.display_name || store.currentUser?.email || '';
  return `
    ${isVet ? `
      <div class="settings-section-label">Personnalisation</div>
      <button id="action-colors" role="menuitem">🎨 Couleurs des associés</button>
      <hr>
      <div class="settings-section-label">Synchronisation</div>
      <button id="action-calendar-sync" role="menuitem">📅 Synchronisation calendrier</button>
      <hr>
      <div class="settings-section-label">Données</div>
      <button id="action-export" role="menuitem">⬇️ Exporter JSON</button>
      <button id="action-import" role="menuitem">⬆️ Importer JSON</button>
      <input type="file" id="import-file-input" accept="application/json" class="hidden" aria-hidden="true">
      <hr>
      <div class="settings-section-label">Collaborateurs</div>
      <button id="action-manage-users" role="menuitem">👥 Gérer les collaborateurs</button>
      <hr>
    ` : ''}
    ${isAdmin ? `
      <div class="settings-section-label">Mode d'affichage</div>
      <button id="action-toggle-view" role="menuitem">👁 ${store.adminViewMode === 'asv' ? 'Passer en vue Vétérinaires' : 'Passer en vue ASV'}</button>
      <hr>
    ` : ''}
    <div class="settings-section-label">Notifications</div>
    <button id="action-notifications" role="menuitem">🔔 Notifications</button>
    <hr>
    <div class="settings-section-label">Aide</div>
    <button id="action-help" role="menuitem">❓ Guide utilisateur & FAQ</button>
    <hr>
    <div class="settings-section-label">Mon compte${userName ? ` — ${escapeHTML(userName)}` : ''}</div>
    <button id="action-change-password" role="menuitem">🔑 Changer mon mot de passe</button>
    <button id="action-logout" class="danger" role="menuitem">🚪 Se déconnecter</button>
  `;
}
function updateHeaderUsername(){
  const el = document.getElementById('header-username');
  if(!el) return;
  const name = store.currentUser?.display_name || store.currentUser?.email || '';
  el.textContent = name ? name : '';
  el.style.display = name ? 'inline' : 'none';
}
function initSettingsMenu(){
  const toggle = document.getElementById('settings-toggle');
  const menu = document.getElementById('settings-menu');
  updateHeaderUsername();
  menu.innerHTML = buildSettingsMenuHtml();

  toggle.addEventListener('click', (e)=>{
    e.stopPropagation();
    const willOpen = !menu.classList.contains('open');
    menu.classList.toggle('open', willOpen);
    toggle.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (e)=>{
    if(!menu.contains(e.target) && e.target !== toggle){
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded','false');
    }
  });

  if(canAccessSettings()){
    document.getElementById('action-colors').addEventListener('click', ()=>{
      menu.classList.remove('open'); openColorPickerModal();
    });
    document.getElementById('action-calendar-sync').addEventListener('click', ()=>{
      menu.classList.remove('open'); openCalendarSyncModal();
    });
    document.getElementById('action-export').addEventListener('click', ()=>{
      const blob = new Blob([JSON.stringify(store.DATA, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `amivet_planning_${fmtISO(new Date())}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      menu.classList.remove('open'); showToast('Export JSON téléchargé', '⬇️');
    });
    const fileInput = document.getElementById('import-file-input');
    document.getElementById('action-import').addEventListener('click', ()=>{ menu.classList.remove('open'); fileInput.click(); });
    fileInput.addEventListener('change', (e)=>{
      const file = e.target.files[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const parsed = JSON.parse(reader.result);
          if(!parsed || typeof parsed.slots !== 'object') throw new Error('Format invalide');
          snapshotBeforeChange(); store.DATA = parsed; saveData(false); renderCurrentView();
          showToast('Import réussi', '⬆️');
        }catch{ showToast('Fichier JSON invalide', '⚠️'); }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });
    document.getElementById('action-manage-users').addEventListener('click', ()=>{
      menu.classList.remove('open'); openManageUsersModal();
    });
  }

  if(store.currentUser?.role === 'admin'){
    document.getElementById('action-toggle-view').addEventListener('click', ()=>{
      menu.classList.remove('open');
      if(store.adminViewMode === 'asv'){
        // Déjà en mode ASV → retour immédiat
        store.adminViewMode = 'vet';
        store.adminImpersonatedPersonId = null;
        applyRoleToDOM();
        initSettingsMenu();
        renderCurrentView();
        showToast('Retour à la vue Vétérinaires', '👁');
      } else {
        // Passer en mode ASV → choisir qui imiter
        openASVImpersonationPicker();
      }
    });
  }

  document.getElementById('action-help').addEventListener('click', ()=>{
    menu.classList.remove('open'); openHelpModal();
  });
  document.getElementById('action-notifications').addEventListener('click', ()=>{
    menu.classList.remove('open'); openNotificationSettingsModal();
  });
  document.getElementById('action-change-password').addEventListener('click', ()=>{
    menu.classList.remove('open'); openChangeMyPasswordModal();
  });
  document.getElementById('action-logout').addEventListener('click', async ()=>{
    menu.classList.remove('open');
    await authSignOut();
    renderLoginScreen();
  });
}
function openHelpModal(){
  const isAsv = effectiveRole() === 'asv';
  document.getElementById('help-overlay-root')?.remove();
  const root = document.createElement('div');
  root.id = 'help-overlay-root';

  /* ---- Contenu commun ---- */
  const sectionIntroVet = `
<h2 class="ho-title">🎯 À propos d'Amivet PULSE</h2>
<p class="ho-lead">Amivet PULSE est l'outil de gestion RH et planning centralisé de la Clinique Vétérinaire Amivet. Il remplace les feuilles papier, emails et tableurs par une interface unique accessible depuis n'importe quel appareil.</p>
<div class="ho-cards">
  <div class="ho-card"><div class="ho-card-icon">📅</div><strong>Planning centralisé</strong><p>Présences, absences et congés de tous les collaborateurs (vétérinaires et ASV) en temps réel.</p></div>
  <div class="ho-card"><div class="ho-card-icon">⏱️</div><strong>Suivi des heures ASV</strong><p>Heures nominales par poste, H.supp. soir et midi, départs anticipés — calculés automatiquement chaque jour.</p></div>
  <div class="ho-card"><div class="ho-card-icon">✍️</div><strong>Signature électronique</strong><p>Les feuilles de présence ASV sont envoyées et signées électroniquement, avec horodatage et archivage.</p></div>
  <div class="ho-card"><div class="ho-card-icon">📋</div><strong>Gestion des congés</strong><p>Compteurs de CP, ancienneté et RTT tenus à jour automatiquement. Approbation des demandes en un clic.</p></div>
  <div class="ho-card"><div class="ho-card-icon">📣</div><strong>Communication interne</strong><p>Annonces ciblées par rôle (vétérinaires ou ASV) avec accusé de lecture intégré.</p></div>
  <div class="ho-card"><div class="ho-card-icon">🔐</div><strong>Accès sécurisé par rôle</strong><p>Trois niveaux d'accès : Admin, Vétérinaire, ASV. Chaque collaborateur voit uniquement ce qui le concerne.</p></div>
</div>
<div class="ho-info">
  <strong>Qui utilise Amivet PULSE ?</strong><br>
  • <strong>Admin</strong> : accès complet — gestion des comptes, paramétrage, toutes les vues.<br>
  • <strong>Vétérinaires</strong> : gestion des plannings, approbation des congés, envoi des feuilles de présence ASV, tableau de bord.<br>
  • <strong>ASV</strong> : consultation de leur propre planning, demandes d'absence, signature des feuilles de présence.
</div>`;

  const sectionIntroAsv = `
<h2 class="ho-title">🎯 À propos d'Amivet PULSE</h2>
<p class="ho-lead">Amivet PULSE est l'outil de gestion de planning de la Clinique Vétérinaire Amivet. Il vous permet de consulter votre planning en temps réel, de soumettre vos demandes d'absence et de signer électroniquement votre feuille de présence mensuelle.</p>
<div class="ho-cards">
  <div class="ho-card"><div class="ho-card-icon">📅</div><strong>Votre planning</strong><p>Consultez vos postes, présences et absences semaine par semaine ou mois par mois.</p></div>
  <div class="ho-card"><div class="ho-card-icon">⏱️</div><strong>Vos heures</strong><p>Visualisez vos heures travaillées, vos H.supp. et vos départs anticipés au quotidien.</p></div>
  <div class="ho-card"><div class="ho-card-icon">✍️</div><strong>Signature en ligne</strong><p>Recevez et signez votre feuille de présence mensuelle par email en quelques secondes.</p></div>
  <div class="ho-card"><div class="ho-card-icon">🏖️</div><strong>Demandes d'absence</strong><p>Soumettez vos congés, RTT ou absences directement depuis le planning.</p></div>
</div>
<div class="ho-info">
  <strong>Ce que vous ne pouvez pas faire</strong> (réservé aux vétérinaires et à l'admin) :<br>
  Saisir les postes d'autres ASV, approuver des demandes, envoyer des feuilles de présence, accéder au tableau de bord ou gérer les comptes.
</div>`;

  const sectionRoutineVet = `
<h2 class="ho-title">📅 Routine d'utilisation</h2>
<h3 class="ho-subtitle">Au quotidien</h3>
<div class="ho-steps">
  <div class="ho-step"><span class="ho-step-num">1</span><div><strong>Vérifier les badges rouges</strong> — Un badge sur le Tableau de bord ou les onglets signale une demande en attente ou une nouvelle annonce.</div></div>
  <div class="ho-step"><span class="ho-step-num">2</span><div><strong>Saisir les absences imprévues</strong> — Une urgence, une maladie ? Allez dans 🩺 Vétérinaires > Calendrier mensuel et cliquez sur la case du jour pour enregistrer l'absence.</div></div>
  <div class="ho-step"><span class="ho-step-num">3</span><div><strong>Approuver les demandes urgentes</strong> — Toute modification dans les 14 prochains jours apparaît en violet. Rendez-vous dans Tableau de bord > Demandes pour statuer.</div></div>
</div>
<h3 class="ho-subtitle">En cours de semaine</h3>
<div class="ho-steps">
  <div class="ho-step"><span class="ho-step-num">1</span><div><strong>Mettre à jour les postes ASV</strong> — Si le roulement change (O/F), aller dans 🐾 ASV > Vue hebdomadaire et ajuster le poste de chaque ASV pour les jours concernés.</div></div>
  <div class="ho-step"><span class="ho-step-num">2</span><div><strong>Saisir les H.supp. et départs</strong> — En fin de journée ou le lendemain, saisir les heures supplémentaires de soirée, midi ou les départs anticipés de chaque ASV.</div></div>
</div>
<h3 class="ho-subtitle">En fin de mois (avant le 5 du mois suivant)</h3>
<div class="ho-steps">
  <div class="ho-step"><span class="ho-step-num">1</span><div><strong>Vérifier chaque ASV semaine par semaine</strong> — 🐾 ASV > Vue hebdomadaire, faire défiler toutes les semaines du mois pour s'assurer que postes, H.supp. et départs sont corrects.</div></div>
  <div class="ho-step"><span class="ho-step-num">2</span><div><strong>Envoyer la feuille de présence</strong> — Bouton ✍️ dans la vue hebdomadaire → choisir le mois → l'email est envoyé automatiquement à l'ASV.</div></div>
  <div class="ho-step"><span class="ho-step-num">3</span><div><strong>Suivre les signatures</strong> — Tableau de bord > Feuilles signées. L'ASV a 7 jours pour signer. Relancez si nécessaire en renvoyant la feuille.</div></div>
</div>`;

  const sectionRoutineAsv = `
<h2 class="ho-title">📅 Routine d'utilisation</h2>
<h3 class="ho-subtitle">En cours de mois</h3>
<div class="ho-steps">
  <div class="ho-step"><span class="ho-step-num">1</span><div><strong>Consulter votre planning</strong> — Chaque semaine, vérifiez votre poste (O ou F), vos H.supp. et votre total dans 🐾 ASV > Vue hebdomadaire.</div></div>
  <div class="ho-step"><span class="ho-step-num">2</span><div><strong>Soumettre une absence</strong> — Besoin d'un congé ? Cliquez sur le jour dans la vue hebdomadaire ou mensuelle et soumettez votre demande.</div></div>
  <div class="ho-step"><span class="ho-step-num">3</span><div><strong>Suivre l'approbation</strong> — Les cases violettes signalent une modification dans les 14 prochains jours en attente de validation. Une fois approuvée, la couleur change.</div></div>
</div>
<h3 class="ho-subtitle">En fin de mois</h3>
<div class="ho-steps">
  <div class="ho-step"><span class="ho-step-num">1</span><div><strong>Recevoir l'email de présence</strong> — Votre responsable vous envoie un récapitulatif complet (jours, H.supp., départs anticipés).</div></div>
  <div class="ho-step"><span class="ho-step-num">2</span><div><strong>Vérifier les informations</strong> — Lisez attentivement le tableau détaillé. Si une erreur est présente, contactez votre responsable <em>avant</em> de signer.</div></div>
  <div class="ho-step"><span class="ho-step-num">3</span><div><strong>Signer</strong> — Cliquez sur le bouton vert ✍️. Votre signature est horodatée et archivée. Le lien est à usage unique.</div></div>
</div>`;

  const sectionScenariosVet = `
<h2 class="ho-title">🔄 Scénarios pas à pas</h2>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Saisir une absence vétérinaire</div>
  <div class="ho-scenario-body">
    <div class="ho-step"><span class="ho-step-num">1</span><div>Aller dans <strong>🩺 Vétérinaires</strong> > <strong>Calendrier mensuel</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">2</span><div>Cliquer sur la case <strong>Matin</strong> ou <strong>Après-midi</strong> du jour concerné</div></div>
    <div class="ho-step"><span class="ho-step-num">3</span><div>Sélectionner le type d'absence dans le menu : Congé annuel, RTT, Formation, Maladie, Récupération…</div></div>
    <div class="ho-step"><span class="ho-step-num">4</span><div>Confirmer — la case prend la couleur du type d'absence et les compteurs se mettent à jour</div></div>
    <div class="ho-tip">💡 Double-clic sur la colonne d'un jour ouvre l'édition rapide pour saisir matin ET après-midi en une seule fois, avec un champ commentaire.</div>
  </div>
</div>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Saisir les heures d'une ASV sur la semaine</div>
  <div class="ho-scenario-body">
    <div class="ho-step"><span class="ho-step-num">1</span><div>Aller dans <strong>🐾 ASV</strong> > <strong>Vue hebdomadaire</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">2</span><div>Sélectionner l'ASV dans le menu déroulant en haut de la vue</div></div>
    <div class="ho-step"><span class="ho-step-num">3</span><div>Pour chaque jour : cliquer sur la ligne pour ouvrir le panneau de saisie → choisir le poste <strong>O</strong> (Ouverture) ou <strong>F</strong> (Fermeture)</div></div>
    <div class="ho-step"><span class="ho-step-num">4</span><div>Si H.supp. de soirée : saisir les minutes dépassées après 19h / 19h15</div></div>
    <div class="ho-step"><span class="ho-step-num">5</span><div>Si H.supp. de midi : saisir les minutes de dépassement sur la pause déjeuner</div></div>
    <div class="ho-step"><span class="ho-step-num">6</span><div>Si départ anticipé : saisir l'heure réelle de départ (ex : 18h30) — l'écart est calculé automatiquement</div></div>
    <div class="ho-step"><span class="ho-step-num">7</span><div>Le total journalier et le total hebdomadaire se recalculent en temps réel</div></div>
    <div class="ho-tip">💡 Double-clic sur une cellule mensuelle d'une ASV pour naviguer directement vers la vue hebdomadaire correspondante.</div>
  </div>
</div>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Envoyer et suivre une feuille de présence</div>
  <div class="ho-scenario-body">
    <div class="ho-step"><span class="ho-step-num">1</span><div>Vérifier que toutes les semaines du mois sont correctement remplies pour l'ASV concernée</div></div>
    <div class="ho-step"><span class="ho-step-num">2</span><div>🐾 ASV > Vue hebdomadaire → cliquer sur <strong>✍️ Envoyer la feuille</strong> (bouton en haut à droite)</div></div>
    <div class="ho-step"><span class="ho-step-num">3</span><div>Sélectionner le mois à faire signer → confirmer</div></div>
    <div class="ho-step"><span class="ho-step-num">4</span><div>L'ASV reçoit un email avec le récapitulatif détaillé (jours, postes, H.supp., départs, solde net)</div></div>
    <div class="ho-step"><span class="ho-step-num">5</span><div>Suivre la signature dans <strong>📊 Tableau de bord</strong> > <strong>Feuilles signées</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">6</span><div>Si l'ASV n'a pas signé sous 7 jours : renvoyer la feuille depuis la vue hebdomadaire</div></div>
    <div class="ho-tip">⚠️ Vérifiez bien les heures AVANT d'envoyer — l'ASV signe en certifiant que les données sont exactes.</div>
  </div>
</div>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Approuver ou refuser une demande</div>
  <div class="ho-scenario-body">
    <div class="ho-step"><span class="ho-step-num">1</span><div>Un badge rouge apparaît sur l'onglet <strong>📊 Tableau de bord</strong> → cliquer sur l'onglet</div></div>
    <div class="ho-step"><span class="ho-step-num">2</span><div>Aller dans <strong>Demandes de congé et de modification</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">3</span><div>Consulter la demande : date, type d'absence, collaborateur</div></div>
    <div class="ho-step"><span class="ho-step-num">4</span><div>Cliquer <strong>✅ Approuver</strong> ou <strong>❌ Refuser</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">5</span><div>Le collaborateur voit immédiatement le statut mis à jour dans son planning</div></div>
    <div class="ho-tip">💡 Les cellules violettes dans le planning ASV indiquent des modifications récentes en attente d'approbation (dans les 14 prochains jours).</div>
  </div>
</div>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Inviter un nouveau collaborateur</div>
  <div class="ho-scenario-body">
    <div class="ho-step"><span class="ho-step-num">1</span><div>⚙️ → <strong>Gérer les collaborateurs</strong> → <strong>Inviter un collaborateur</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">2</span><div>Renseigner le prénom, l'email et le rôle (ASV ou Vétérinaire)</div></div>
    <div class="ho-step"><span class="ho-step-num">3</span><div>Pour un rôle ASV : définir le temps de travail contractuel (Temps plein, ¾ temps, Mi-temps, Certains jours, Personnalisé)</div></div>
    <div class="ho-step"><span class="ho-step-num">4</span><div>Cliquer <strong>Inviter</strong> → un email d'invitation est envoyé automatiquement</div></div>
    <div class="ho-step"><span class="ho-step-num">5</span><div>Le collaborateur clique sur le lien dans l'email et choisit son mot de passe</div></div>
    <div class="ho-step"><span class="ho-step-num">6</span><div>Il apparaît dans la liste des collaborateurs et accède immédiatement à l'app</div></div>
  </div>
</div>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Consulter et ajuster les compteurs de congés</div>
  <div class="ho-scenario-body">
    <div class="ho-step"><span class="ho-step-num">1</span><div>Aller dans <strong>📊 Tableau de bord</strong> > <strong>Suivi vétérinaires</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">2</span><div>Chaque praticien affiche ses compteurs : CP acquis, pris, restants, ancienneté, récupération, jours travaillés vs objectif annuel</div></div>
    <div class="ho-step"><span class="ho-step-num">3</span><div>Pour ajuster manuellement (report de congés, correction) : cliquer <strong>✎ Ajuster</strong> → saisir la valeur de correction et un commentaire</div></div>
    <div class="ho-tip">💡 Les ajustements sont tracés avec la date et le commentaire pour l'historique RH.</div>
  </div>
</div>`;

  const sectionScenariosAsv = `
<h2 class="ho-title">🔄 Scénarios pas à pas</h2>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Consulter mon planning de la semaine</div>
  <div class="ho-scenario-body">
    <div class="ho-step"><span class="ho-step-num">1</span><div>Aller dans <strong>🐾 ASV</strong> > <strong>Vue hebdomadaire</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">2</span><div>Votre nom est affiché en haut de la vue</div></div>
    <div class="ho-step"><span class="ho-step-num">3</span><div>Utilisez les flèches ← → pour naviguer entre les semaines</div></div>
    <div class="ho-step"><span class="ho-step-num">4</span><div>Chaque ligne correspond à un jour. La colonne <strong>Poste</strong> indique O (Ouverture) ou F (Fermeture)</div></div>
    <div class="ho-step"><span class="ho-step-num">5</span><div>La dernière colonne <strong>Total</strong> affiche votre total journalier en heures</div></div>
    <div class="ho-tip">💡 Double-clic sur un jour dans la vue mensuelle pour accéder directement à la semaine correspondante.</div>
  </div>
</div>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Demander un congé ou signaler une absence</div>
  <div class="ho-scenario-body">
    <div class="ho-step"><span class="ho-step-num">1</span><div>Aller dans <strong>🐾 ASV</strong> > <strong>Vue hebdomadaire</strong> ou <strong>Calendrier mensuel</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">2</span><div>Cliquer sur la case du jour concerné (Matin ou Après-midi)</div></div>
    <div class="ho-step"><span class="ho-step-num">3</span><div>Sélectionner le type d'absence : Congé annuel, RTT, Maladie, Congé sans solde…</div></div>
    <div class="ho-step"><span class="ho-step-num">4</span><div>Confirmer la demande</div></div>
    <div class="ho-step"><span class="ho-step-num">5</span><div>Si la date est dans les <strong>14 prochains jours</strong>, la case apparaît en <span style="color:#6D28D9;font-weight:600;">violet</span> — elle attend l'approbation de votre responsable</div></div>
    <div class="ho-step"><span class="ho-step-num">6</span><div>Une fois approuvée, la case prend la couleur standard du type d'absence</div></div>
    <div class="ho-tip">⚠️ Les repos planifiés (jours de repos définis dans votre roulement) ne nécessitent pas d'approbation.</div>
  </div>
</div>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Signer ma feuille de présence</div>
  <div class="ho-scenario-body">
    <div class="ho-step"><span class="ho-step-num">1</span><div>En fin de mois, vous recevez un email intitulé <strong>"Signature de feuille de présence — [mois]"</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">2</span><div>Ouvrez l'email et lisez le <strong>récapitulatif du mois</strong> : jours ouvrés, jours travaillés, H.supp., départs anticipés, solde net</div></div>
    <div class="ho-step"><span class="ho-step-num">3</span><div>Faites défiler pour consulter le <strong>tableau détaillé jour par jour</strong> : poste, matin, après-midi, H.supp., départ anticipé, total</div></div>
    <div class="ho-step"><span class="ho-step-num">4</span><div>Si tout est correct, cliquez sur <strong>✍️ Je certifie et signe ma feuille de présence</strong></div></div>
    <div class="ho-step"><span class="ho-step-num">5</span><div>Vous êtes redirigé vers une page de confirmation. Votre signature est enregistrée avec la date et l'heure</div></div>
    <div class="ho-tip">⚠️ Le lien est à <strong>usage unique et valable 7 jours</strong>. En cas d'erreur dans les données, contactez votre responsable AVANT de signer — la signature certifie que les informations sont exactes.</div>
  </div>
</div>

<div class="ho-scenario">
  <div class="ho-scenario-head">📌 Comprendre ma feuille de présence</div>
  <div class="ho-scenario-body">
    <div class="ho-cards" style="margin-top:8px;">
      <div class="ho-card"><div class="ho-card-icon">🟦</div><strong>Poste O — Ouverture</strong><p>8h30 → 19h00 (pause déjeuner 2h) = <strong>8h30 de travail effectif</strong></p></div>
      <div class="ho-card"><div class="ho-card-icon">🟩</div><strong>Poste F — Fermeture</strong><p>9h00 → 19h15 (pause déjeuner 2h) = <strong>8h15 de travail effectif</strong></p></div>
      <div class="ho-card"><div class="ho-card-icon">🟨</div><strong>Samedi</strong><p>9h00 → 16h30 = <strong>7h00 de travail effectif</strong> (convention clinique)</p></div>
      <div class="ho-card"><div class="ho-card-icon">➕</div><strong>H.supp. soirée</strong><p>Chaque minute après 19h/19h15 est comptée en heure supplémentaire.</p></div>
      <div class="ho-card"><div class="ho-card-icon">➕</div><strong>H.supp. midi</strong><p>Dépassement de la pause déjeuner standard (ex : retour en salle 30 min plus tôt).</p></div>
      <div class="ho-card"><div class="ho-card-icon">➖</div><strong>Départ anticipé</strong><p>Départ avant 19h/19h15. L'écart est déduit du total du jour.</p></div>
    </div>
    <div class="ho-tip" style="margin-top:12px;">Le <strong>Solde net H.supp.</strong> en bas de votre feuille = total H.supp. − total départs anticipés sur le mois entier.</div>
  </div>
</div>`;

  const sectionFeaturesVet = `
<h2 class="ho-title">📖 Fonctionnalités détaillées</h2>
<h3 class="ho-subtitle">📊 Tableau de bord</h3>
<div class="ho-cards">
  <div class="ho-card"><div class="ho-card-icon">🩺</div><strong>Suivi vétérinaires</strong><p>Compteurs annuels (CP, ancienneté, récupération), jours travaillés vs objectif 228j. Ajustement manuel des soldes avec historique tracé.</p></div>
  <div class="ho-card"><div class="ho-card-icon">🐾</div><strong>Suivi ASV</strong><p>Heures effectuées, H.supp. cumulées, départs anticipés et solde net par ASV sur la période choisie.</p></div>
  <div class="ho-card"><div class="ho-card-icon">📋</div><strong>Demandes</strong><p>Toutes les demandes de congé et modifications en attente. Approbation ou refus en un clic. Les modifications urgentes (violet) apparaissent en priorité.</p></div>
  <div class="ho-card"><div class="ho-card-icon">✍️</div><strong>Feuilles signées</strong><p>Historique complet des signatures électroniques ASV avec date, heure et identité du signataire.</p></div>
  <div class="ho-card"><div class="ho-card-icon">📝</div><strong>Entretiens & visites</strong><p>Suivi des visites médicales et entretiens annuels de chaque collaborateur.</p></div>
</div>
<h3 class="ho-subtitle">🩺 Vétérinaires</h3>
<div class="ho-cards">
  <div class="ho-card"><div class="ho-card-icon">📅</div><strong>Calendrier mensuel</strong><p>Saisie présences/absences par demi-journée. 15+ types d'absence (CP, RTT, Formation, Maladie…). Commentaires par jour. Impression A4.</p></div>
  <div class="ho-card"><div class="ho-card-icon">🗓️</div><strong>Vue annuelle</strong><p>Vue condensée 12 mois pour identifier les périodes creuses et les chevauchements d'absences.</p></div>
  <div class="ho-card"><div class="ho-card-icon">🔮</div><strong>Prévisionnel</strong><p>Planification prospective sur l'année N+1. Données isolées des totaux réels.</p></div>
</div>
<h3 class="ho-subtitle">🐾 ASV</h3>
<div class="ho-cards">
  <div class="ho-card"><div class="ho-card-icon">⏱️</div><strong>Vue hebdomadaire</strong><p>Poste O/F par jour, H.supp. soirée et midi en minutes, départ anticipé en heure réelle. Total auto. Bouton ✍️ envoi feuille de présence.</p></div>
  <div class="ho-card"><div class="ho-card-icon">📅</div><strong>Calendrier mensuel</strong><p>Vue consolidée toutes ASV ou par ASV. Double-clic → vue hebdomadaire. Impression mensuelle A4 disponible.</p></div>
  <div class="ho-card"><div class="ho-card-icon">🗓️</div><strong>Vue annuelle</strong><p>Présences annuelles et compteurs d'heures par ASV.</p></div>
</div>
<h3 class="ho-subtitle">⚙️ Réglages</h3>
<div class="ho-cards">
  <div class="ho-card"><div class="ho-card-icon">👥</div><strong>Collaborateurs</strong><p>Inviter, modifier (rôle, email, temps de travail), réinitialiser un compte ou le supprimer définitivement.</p></div>
  <div class="ho-card"><div class="ho-card-icon">🎨</div><strong>Couleurs</strong><p>Personnaliser la couleur d'affichage de chaque vétérinaire.</p></div>
  <div class="ho-card"><div class="ho-card-icon">📅</div><strong>Sync calendrier</strong><p>Lien iCal compatible Google Agenda, Apple Calendrier, Outlook.</p></div>
  <div class="ho-card"><div class="ho-card-icon">⬇️⬆️</div><strong>Export / Import</strong><p>Sauvegarde complète JSON et restauration.</p></div>
</div>`;

  const sectionFaqVet = `
<h2 class="ho-title">💬 Questions fréquentes</h2>
<div class="ho-faq-list" id="ho-faq-list"></div>`;

  const sectionFaqAsv = sectionFaqVet;

  const faqDataVet = [
    { q:'Comment approuver une demande de congé ?', a:'Tableau de bord → <strong>Demandes de congé et de modification</strong> → cliquez ✅ Approuver ou ❌ Refuser. Le collaborateur est notifié immédiatement.' },
    { q:'Comment envoyer une feuille de présence à une ASV ?', a:'🐾 ASV > Vue hebdomadaire → sélectionner l\'ASV → bouton <strong>✍️ Envoyer la feuille</strong> (haut à droite) → choisir le mois. L\'email est envoyé automatiquement avec le récapitulatif détaillé.' },
    { q:'Que signifie la couleur violette sur une cellule ?', a:'Une modification a été saisie dans les <strong>14 prochains jours</strong>. Elle est en attente de votre approbation dans Tableau de bord → Demandes. Tant qu\'elle n\'est pas approuvée, elle est considérée comme non officielle.' },
    { q:'Comment inviter un nouveau collaborateur ?', a:'⚙️ → Gérer les collaborateurs → Inviter un collaborateur → renseigner prénom, email, rôle et (pour les ASV) le temps de travail contractuel. Un email d\'invitation est envoyé automatiquement.' },
    { q:'Comment réinitialiser le compte d\'un collaborateur ?', a:'⚙️ → Gérer les collaborateurs → cliquer sur le collaborateur → <strong>Réinitialiser le profil</strong>. Le compte de connexion est supprimé mais le planning et la ligne dans le calendrier sont conservés. Vous pourrez ensuite l\'inviter avec un nouvel email.' },
    { q:'Comment voir les heures supplémentaires d\'une ASV ?', a:'Vue hebdomadaire ASV (colonne Total journalier et total semaine) ou Tableau de bord → <strong>Suivi ASV</strong> pour une synthèse sur la période choisie.' },
    { q:'Comment modifier les couleurs des vétérinaires ?', a:'⚙️ → <strong>Couleurs des associés</strong> → cliquer sur la pastille de couleur à côté du nom de chaque praticien.' },
    { q:'Comment synchroniser avec Google Agenda ou Apple Calendrier ?', a:'⚙️ → <strong>Synchronisation calendrier</strong> → copier le lien iCal et le coller dans votre application calendrier (Google : "Autres calendriers" → "Via une URL", Apple : "S\'abonner à un calendrier").' },
    { q:'Comment exporter les données de planning ?', a:'⚙️ → <strong>Exporter JSON</strong>. Le fichier téléchargé contient toutes les données de planning. Pour restaurer : <strong>Importer JSON</strong> et sélectionner le fichier.' },
    { q:'Comment ajouter une annonce ?', a:'📣 Annonces → <strong>+ Nouvelle annonce</strong> → rédiger le titre et le contenu → choisir les destinataires (Vétérinaires ou ASV) → <strong>Publier</strong>. Une annonce non publiée reste en brouillon.' },
    { q:'Comment planifier les congés de l\'année à venir ?', a:'🩺 Vétérinaires (ou 🐾 ASV) → <strong>Prévisionnel</strong>. Les données saisies ici sont isolées du planning en cours et servent uniquement à la planification prospective.' },
    { q:'Comment imprimer le calendrier mensuel ?', a:'Dans les vues mensuelles, un bouton <strong>Imprimer</strong> est disponible en haut de la page. Le format est optimisé A4 portrait avec logo et mise en page N&B.' },
  ];

  const faqDataAsv = [
    { q:'Comment demander un congé ?', a:'Cliquer sur la cellule du jour dans la vue hebdomadaire ou le calendrier mensuel → sélectionner le type d\'absence (Congé annuel, RTT, Maladie…) → confirmer. La demande part en attente d\'approbation.' },
    { q:'Que signifie la cellule violette ?', a:'Une modification a été saisie dans les <strong>14 prochains jours</strong>. Elle est en attente d\'approbation de votre responsable. En attendant, la modification n\'est pas encore officielle dans votre planning.' },
    { q:'Que signifient les postes O et F ?', a:'<strong>O = Ouverture</strong> : 8h30 → 19h (8h30 de travail effectif). <strong>F = Fermeture</strong> : 9h → 19h15 (8h15 de travail effectif). Samedi : 9h → 16h30 (7h effectifs).' },
    { q:'Comment signer ma feuille de présence ?', a:'Ouvrez l\'email mensuel reçu d\'Amivet PULSE → vérifier le récapitulatif → cliquer sur <strong>✍️ Je certifie et signe ma feuille de présence</strong>. Le lien est à usage unique et valable 7 jours.' },
    { q:'Que se passe-t-il si les données de ma feuille sont incorrectes ?', a:'Contactez votre responsable <strong>avant de signer</strong>. Une fois signée, la feuille est archivée. Votre responsable peut renvoyer une feuille corrigée si nécessaire.' },
    { q:'Comment voir mon total d\'heures sur la semaine ?', a:'🐾 ASV > Vue hebdomadaire → la ligne <strong>Total</strong> en bas du tableau affiche le total de la semaine. Le détail H.supp. et départs anticipés est visible sur chaque ligne de jour.' },
    { q:'Pourquoi je ne vois pas l\'onglet Tableau de bord ?', a:'Le Tableau de bord est réservé aux vétérinaires et à l\'admin. En tant qu\'ASV, vous accédez à votre planning personnel uniquement.' },
    { q:'Comment consulter les annonces de l\'équipe ?', a:'Cliquer sur <strong>📣 Annonces</strong>. Le badge rouge indique le nombre d\'annonces non lues.' },
    { q:'Mon mot de passe est perdu, que faire ?', a:'Sur l\'écran de connexion, cliquer sur <strong>Mot de passe oublié ?</strong> → entrer votre email → un lien de réinitialisation vous est envoyé.' },
  ];

  const navItemsVet = [
    { id:'intro', label:'🎯 Présentation', content: sectionIntroVet },
    { id:'routine', label:'📅 Routine', content: sectionRoutineVet },
    { id:'scenarios', label:'🔄 Scénarios', content: sectionScenariosVet },
    { id:'features', label:'📖 Fonctionnalités', content: sectionFeaturesVet },
    { id:'faq', label:'💬 FAQ', content: sectionFaqVet },
  ];
  const navItemsAsv = [
    { id:'intro', label:'🎯 Présentation', content: sectionIntroAsv },
    { id:'routine', label:'📅 Routine', content: sectionRoutineAsv },
    { id:'scenarios', label:'🔄 Scénarios', content: sectionScenariosAsv },
    { id:'faq', label:'💬 FAQ', content: sectionFaqAsv },
  ];
  const navItems = isAsv ? navItemsAsv : navItemsVet;
  const faqData = isAsv ? faqDataAsv : faqDataVet;

  root.innerHTML = `
    <div class="ho-sidebar">
      <div class="ho-sidebar-logo">❓ Guide & FAQ</div>
      <nav class="ho-nav">
        ${navItems.map((n,i)=>`<button class="ho-nav-btn${i===0?' active':''}" data-sec="${n.id}">${n.label}</button>`).join('')}
      </nav>
      <div class="ho-sidebar-footer">Amivet PULSE<br><span style="opacity:.5;font-size:11px;">Clinique Vétérinaire</span></div>
    </div>
    <div class="ho-main">
      <div class="ho-topbar">
        <span id="ho-section-label" style="font-size:14px;font-weight:600;color:var(--color-text);">${navItems[0].label}</span>
        <button id="ho-close-btn" class="btn" style="padding:5px 14px;font-size:13px;">✕ Fermer</button>
      </div>
      <div class="ho-content" id="ho-content">
        ${navItems[0].content}
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const content = root.querySelector('#ho-content');

  function renderSection(item){
    content.innerHTML = item.content;
    root.querySelector('#ho-section-label').textContent = item.label;
    content.scrollTop = 0;
    if(item.id === 'faq'){
      const list = content.querySelector('#ho-faq-list');
      if(list) list.innerHTML = faqData.map((f,i)=>`
        <div class="ho-faq-item" data-i="${i}">
          <button class="help-faq-q" aria-expanded="false"><span>${escapeHTML(f.q)}</span><span class="help-faq-chevron">▾</span></button>
          <div class="help-faq-a" style="display:none;">${f.a}</div>
        </div>`).join('');
      list?.querySelectorAll('.ho-faq-item').forEach(item=>{
        item.querySelector('.help-faq-q').onclick=function(){
          const open=this.getAttribute('aria-expanded')==='true';
          this.setAttribute('aria-expanded',String(!open));
          item.querySelector('.help-faq-a').style.display=open?'none':'block';
          item.querySelector('.help-faq-chevron').textContent=open?'▾':'▴';
        };
      });
    }
  }

  root.querySelectorAll('.ho-nav-btn').forEach(btn=>{
    btn.onclick=()=>{
      root.querySelectorAll('.ho-nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const item = navItems.find(n=>n.id===btn.dataset.sec);
      if(item) renderSection(item);
    };
  });

  const close = ()=>{ root.remove(); };
  root.querySelector('#ho-close-btn').onclick = close;
  document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown',esc); } });
}

function openResetYearModal(year, isForecast){
  const label = isForecast ? `prévisionnel ${year}` : `année courante ${year}`;
  openConfirmModal({
    title:`Réinitialiser le ${label} ?`,
    message:`Toutes les présences, absences${isForecast ? '' : ', commentaires'} et heures saisies pour ${year} seront définitivement supprimées. Cette action est irréversible.`,
    confirmLabel:`Réinitialiser ${year}`,
    onConfirm:()=>{
      snapshotBeforeChange();
      Object.keys(store.DATA.slots).filter(k=>k.startsWith(`${year}-`)).forEach(k=> delete store.DATA.slots[k]);
      saveData();
      renderCurrentView();
      showToast(`${year} réinitialisé`, '🗑️');
    }
  });
}

/* ----------------------------------------------------------------
   9. NAVIGATION ENTRE ONGLETS
   ---------------------------------------------------------------- */
let currentView = 'vets';
const VIEW_RENDERERS = {}; // rempli plus loin par chaque module de vue

function switchView(viewId){
  currentView = viewId;
  document.querySelectorAll('.nav-tab').forEach(btn=>{
    const active = btn.dataset.view === viewId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.view-section').forEach(sec=>{
    sec.classList.toggle('hidden', sec.id !== `view-${viewId}`);
  });
  renderCurrentView();
  saveViewState();
}
// Renvoie l'id du conteneur DOM de la sous-page actuellement sélectionnée pour ce groupe.
function activeSubContainer(group){
  const g = GROUP_VIEWS[group];
  const sub = store.subNavState[group];
  if(sub === 'calendar') return g.calendarContainer;
  if(sub === 'forecast') return g.forecastContainer;
  return g.annualContainer;
}
// Seul point d'entrée qui décide si le contenu réel peut s'afficher ou s'il faut montrer
// le verrou — aussi bien pour un onglet simple (tableau de bord) que pour un onglet groupé
// (vétérinaires), où le verrou doit s'afficher À L'INTÉRIEUR de la sous-page active sans
// détruire la sous-navigation (sub-nav) ni les autres sous-pages masquées.
function renderCurrentView(){
  renderRolloverBanner();
  const isForecastSubPage = (currentView === 'vets' && store.subNavState.vets === 'forecast') || (currentView === 'asv' && store.subNavState.asv === 'forecast');
  document.body.classList.toggle('forecast-theme', isForecastSubPage);
  if(currentView === 'dashboard' && !canAccessDashboard()){
    switchView('vets');
    return;
  }
  const renderer = VIEW_RENDERERS[currentView];
  if(renderer) renderer();
}

// Sous-pages "Calendrier mensuel" / "Vue annuelle" / "Prévisionnel" au sein d'un onglet
// groupé. Appelée uniquement une fois l'accès autorisé par renderCurrentView (jamais
// directement quand le groupe est protégé et verrouillé).
function renderGroupSubPage(group){
  const g = GROUP_VIEWS[group];
  const sub = store.subNavState[group];
  if(sub === 'calendar') renderCalendarView(g.calendarViewKey);
  else if(sub === 'forecast') renderCalendarView(g.forecastViewKey);
  else if(sub === 'week' && group === 'asv') renderWeekViewASV();
  else renderAnnualViewForGroup(group);
}
function switchSubPage(group, subKey){
  const g = GROUP_VIEWS[group];
  store.subNavState[group] = subKey;
  document.querySelectorAll(`#${group}-sub-nav .sub-tab`).forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.sub === subKey);
  });
  document.getElementById(g.calendarContainer).classList.toggle('hidden', subKey !== 'calendar');
  document.getElementById(g.annualContainer).classList.toggle('hidden', subKey !== 'annual');
  document.getElementById(g.forecastContainer).classList.toggle('hidden', subKey !== 'forecast');
  const weekEl = document.getElementById('asv-sub-week');
  if(weekEl) weekEl.classList.toggle('hidden', !(group === 'asv' && subKey === 'week'));
  renderCurrentView();
  saveViewState();
}

/* ================================================================
   VUE SEMAINE ASV — saisie horaire personnelle
   ================================================================ */
// Génère une fenêtre d'impression du planning hebdomadaire d'une ASV avec cadre de signature
// Impression mensuelle — une fiche par ASV sélectionnée, tout le mois

// Popup de sélection ASV avant impression mensuelle


// Mémorise l'onglet et la sous-page affichés pour qu'un rechargement de page (F5) rouvre
// la même vue plutôt que de revenir systématiquement sur "Vétérinaires". Purement
// cosmétique : ne contient aucune donnée du planning, donc pas besoin de Supabase ici.
function saveViewState(){
  try{
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
      currentView,
      subNavState: store.subNavState,
      annualYearState: store.annualYearState,
      dashSubTab: store.dashSubState.tab,
    }));
  }catch(e){ /* stockage indisponible : tant pis, on retombera sur la vue par défaut */ }
}
// Renvoie l'id de vue à restaurer (ou null si rien de valide n'a été sauvegardé), et
// restaure au passage les sous-pages mémorisées dans les états globaux correspondants.
function loadViewState(){
  try{
    const raw = localStorage.getItem(VIEW_STATE_KEY);
    if(!raw) return null;
    const saved = JSON.parse(raw);
    if(saved.subNavState) Object.assign(store.subNavState, saved.subNavState);
    if(saved.annualYearState) Object.assign(store.annualYearState, saved.annualYearState);
    if(saved.dashSubTab) store.dashSubState.tab = saved.dashSubTab;
    return saved.currentView || null;
  }catch(e){ return null; }
}
function initNav(){
  document.getElementById('main-nav').addEventListener('click', (e)=>{
    const btn = e.target.closest('.nav-tab');
    if(btn) switchView(btn.dataset.view);
  });
  document.querySelectorAll('.sub-nav').forEach(nav=>{
    const group = nav.id.replace('-sub-nav','');
    nav.addEventListener('click', (e)=>{
      const btn = e.target.closest('.sub-tab');
      if(btn) switchSubPage(group, btn.dataset.sub);
    });
  });
}

/* ----------------------------------------------------------------
   10. RACCOURCIS CLAVIER
   ---------------------------------------------------------------- */
// Renvoie la clé store.CAL_VIEWS du calendrier mensuel actuellement affiché, ou null si la vue
// courante n'est pas un calendrier (ex. tableau de bord, sous-page "Vue annuelle"...).
function activeCalendarViewKey(){
  const g = GROUP_VIEWS[currentView];
  if(!g) return null;
  const sub = store.subNavState[currentView];
  if(sub === 'calendar') return g.calendarViewKey;
  if(sub === 'forecast') return g.forecastViewKey;
  return null;
}
function initKeyboardShortcuts(){
  document.addEventListener('keydown', (e)=>{
    if(e.target.matches && e.target.matches('input, textarea')) return;
    if((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z'){
      e.preventDefault();
      undoLastAction();
      return;
    }
    const viewKey = activeCalendarViewKey();
    if(!viewKey) return;
    if(e.key === 'ArrowLeft'){ changeMonth(viewKey, -1); }
    else if(e.key === 'ArrowRight'){ changeMonth(viewKey, 1); }
    else if(e.key.toLowerCase() === 't' && store.CAL_VIEWS[viewKey].todayNav){ goToToday(viewKey); }
  });
}

/* ----------------------------------------------------------------
   11. UTILITAIRES DIVERS (échappement, couleurs)
   ---------------------------------------------------------------- */
/* ================================================================
   12. VUE CALENDRIER (moteur partagé 2026 / 2027)
   ================================================================ */

// Calcule classes + contenu d'une cellule demi-journée à partir de store.DATA. Pour une absence
// ASV, l'apparence dépend aussi du statut de la demande de congé (en attente / approuvée /
// refusée) — sans changement pour les vétérinaires, qui n'ont pas ce concept.
// Met à jour le DOM d'une seule cellule sans tout re-rendre (utilisé pendant le drag-to-fill)
// Équivalent pour la nouvelle grille-semaine (buildWeekGrid)


// Supprime les présences/absences du mois affiché — pour une personne donnée, ou pour
// tout le groupe affiché si personId est omis (dans ce cas, les commentaires de journée
// sont aussi effacés).

// Modale de choix : que vider pour ce mois ? Les boutons sont générés dynamiquement à
// partir de cfg.people, donc le même code sert le calendrier à 2 personnes (vétérinaires)
// comme celui à 3 (ASV).

// Découpe un mois en (au plus) 2 moitiés de taille proche, la coupure tombant toujours
// juste après un dimanche (jamais au milieu d'une semaine).

// Renvoie la demi-journée suivant immédiatement (iso,slot), en sautant un dimanche s'il y en
// a un juste après — ou null si le jour suivant n'est pas un dimanche (rien à enjamber).
// Symétrique de nextSlotAcrossSunday, vers le passé.
// Collecte toutes les demi-journées absentes contiguës à partir de (iso,slot), dans une
// direction (1 = vers le futur, -1 = vers le passé), en s'arrêtant à un dimanche.
// Si l'absence saisie touche un dimanche, applique le même motif à l'absence contiguë de
// l'autre côté de ce dimanche (sans avoir à le ressaisir).

// Construit les <td> de la ligne d'une personne, en fusionnant les demi-journées
// d'absence contiguës (même motif, et pour les ASV même statut de demande de congé) en
// une seule cellule.
// Calcule les heures totales travaillées sur la semaine (lun–sam) contenant mondayDate.

// Après une saisie : vérifie le plafond 42h. Si dépassé, restaure le snapshot et affiche un toast.
// Renvoie true si la saisie a été bloquée.

// Calcule les alertes réglementaires pour la semaine se terminant par le dimanche passé.
// Renvoie un tableau de chaînes (vide = tout va bien).


// Ligne "Heures supplémentaires" du calendrier ASV : une case par jour (pas par
// demi-journée, contrairement aux lignes individuelles), qui ouvre une pop-up listant
// toutes les ASV pour saisir leurs heures sup de cette date en une fois.

// Nouvelle grille hebdomadaire : remplace buildHalfTable. Chaque mois = blocs de 7 colonnes
// (Lundi → Dimanche). Pas de colspan ni de fusion : chaque demi-journée est une bande
// distincte. L'overtime ASV est calculé par semaine complète (avec dimanche dans ce mois).


// Panneau de signature électronique mensuelle (feuille de présence ASV) — uniquement sur
// le calendrier réel de l'année en cours, jamais sur le prévisionnel (données spéculatives,
// rien à certifier) ni côté vétérinaires (pas de feuille de présence pour eux ici).
// Ligne visible uniquement à l'impression (la version écran a déjà le 🔒 dans l'en-tête de
// ligne, mais sur papier ce repère seul ne suffit pas à prouver qui a signé et quand).
// Admin/vet demande la signature d'une ASV : envoie l'email à son compte.

/* signatures.js — openSigningLinkModal, requestSignatureEmail (reste ici), openSignConfirmModal */
// Demande de signature : envoie un email à l'ASV avec le récap du mois + lien unique.
// La vraie signature n'est enregistrée que lorsqu'elle clique ce lien (confirm-signature).

VIEW_RENDERERS['vets'] = ()=> renderGroupSubPage('vets');
VIEW_RENDERERS['asv'] = ()=> renderGroupSubPage('asv');
VIEW_RENDERERS['annonces'] = renderAnnounces;
/* announcements.js — renderAnnounces, openAnnouncementModal */

/* ----------------------------------------------------------------
   13. INTERACTIONS CALENDRIER (clic, glisser-peindre, popovers, sidebar)
   ---------------------------------------------------------------- */


// --- Glisser-peindre (drag-to-fill) + appui long ---

// --- Popover : motif d'absence ---

// --- Popover : motif d'absence pour une cellule fusionnée (plusieurs demi-journées) ---

// --- Popover : commentaire de journée ---

// --- Popover : heures supplémentaires du jour, pour toutes les ASV à la fois (déclenché
// depuis la ligne "Heures supplémentaires" du calendrier ASV). ---

// --- Sidebar : édition rapide de toute la journée ---

// --- Initialisation globale des interactions calendrier (délégation sur document) ---

/* ================================================================
   14. TABLEAU DE BORD → dashboard.js
   ================================================================ */
/* renderDashboard, renderDashboard*, leave management, CP, visites médicales */
/* ================================================================
   15. VUE ANNUELLE (heatmap) → annual-view.js
   ================================================================ */
/* stateLabel, heatmapSlotColor, buildHeatmap, openAnnualDayDetail, renderAnnualViewForGroup */

/* ================================================================
   16. INITIALISATION GÉNÉRALE
   ================================================================ */

function renderImpersonationBanner(){
  const banner = document.getElementById('impersonation-banner');
  if(!banner) return;
  if(store.currentUser?.role === 'admin' && store.adminViewMode === 'asv' && store.adminImpersonatedPersonId){
    const p = personOf(store.adminImpersonatedPersonId);
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <span>👁 Mode aperçu</span>
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${p?.color||'#fff'};display:inline-block;"></span>
        Vue de <strong>${escapeHTML(p?.short||store.adminImpersonatedPersonId)}</strong>
      </span>
      <button class="imp-back" id="imp-back-btn">← Retour à ma vue</button>
    `;
    document.getElementById('imp-back-btn').onclick = ()=>{
      store.adminViewMode = 'vet';
      store.adminImpersonatedPersonId = null;
      applyRoleToDOM();
      initSettingsMenu();
      renderCurrentView();
      showToast('Retour à la vue Vétérinaires', '👁');
    };
  } else {
    banner.classList.add('hidden');
    banner.innerHTML = '';
  }
}

// Applique les classes CSS de rôle sur <body> et met à jour la bannière d'impersonation.
function applyRoleToDOM(){
  document.body.classList.toggle('role-asv', effectiveRole() === 'asv');
  document.body.classList.toggle('role-vet', effectiveRole() !== 'asv');
  renderImpersonationBanner();
}

function openASVImpersonationPicker(){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  box.innerHTML = `
    <h3>👁 Vue ASV — choisir</h3>
    <p>Sélectionnez l'ASV dont vous souhaitez voir l'expérience :</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
      ${ASV_PEOPLE.map(p=>`
        <button type="button" class="btn" data-pick-asv="${p.id}"
          style="justify-content:flex-start;gap:10px;border-color:${p.color};">
          <span style="width:10px;height:10px;border-radius:50%;background:${p.color};display:inline-block;"></span>
          ${escapeHTML(p.short)}
        </button>
      `).join('')}
    </div>
    <div class="modal-actions"><button class="btn" id="modal-cancel">Annuler</button></div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
  box.querySelectorAll('[data-pick-asv]').forEach(btn=>{
    btn.onclick = ()=>{
      store.adminImpersonatedPersonId = btn.dataset.pickAsv;
      store.adminViewMode = 'asv';
      close();
      applyRoleToDOM();
      initSettingsMenu();
      if(currentView === 'dashboard') switchView('vets');
      else renderCurrentView();
      showToast(`Vue ASV : ${personOf(store.adminImpersonatedPersonId)?.short}`, '👁');
    };
  });
}

function initApp(){
  store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(today));
  applyRoleToDOM();
  loadASVRoster();
  loadPersonColors();
  // Rafraîchir le token toutes les 45 min pour éviter les 401 après expiration
  setInterval(()=> authRefreshSession(), 45 * 60 * 1000);
  loadData();
  initNav();
  initSettingsMenu();
  initKeyboardShortcuts();
  initCalendarInteractions();
  updateDashboardNavBadge();
  const restoredView = loadViewState();
  switchSubPage('vets', store.subNavState.vets);
  switchSubPage('asv', store.subNavState.asv);
  const startView = !canAccessDashboard() && restoredView === 'dashboard' ? 'vets' : restoredView;
  switchView(VIEW_RENDERERS[startView] ? startView : 'vets');
  syncFromSupabase().then(remoteSlots=>{
    if(remoteSlots !== null){
      store.DATA = { version:2, slots: remoteSlots };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store.DATA));
      renderCurrentView();
      updateDashboardNavBadge();
    }
  });
  loadSignatures();
  loadInterviews();
  loadAnnouncements();
  document.getElementById('login-overlay').classList.add('hidden');
  // Ouvrir le modal de confirmation si l'utilisateur vient d'un lien de signature email
  if(store.pendingSignToken){
    const token = store.pendingSignToken;
    store.pendingSignToken = null;
    openSignConfirmModal(token);
  }
  if(typeof handlePwaShortcutAction === 'function') handlePwaShortcutAction();
}

async function init(){
  // Charger l'effectif ASV dès le démarrage (indépendant de l'auth) : garantit que
  // localStorage est peuplé même sur l'écran de connexion, et que le roster est prêt
  // quel que soit le chemin d'entrée (login, recovery, invite).
  loadASVRoster();
  // Callback de réinitialisation de mot de passe : Supabase envoie le token dans le hash URL
  const hash = new URLSearchParams(window.location.hash.replace(/^#/,''));
  const query = new URLSearchParams(window.location.search);
  const type = hash.get('type') || query.get('type');
  const accessToken = hash.get('access_token') || query.get('access_token');
  if((type === 'recovery' || type === 'invite') && accessToken){
    renderSetPasswordScreen(accessToken, type === 'invite');
    return;
  }

  // Lien de signature reçu par email (?sign=UUID) — stocker le token avant l'auth,
  // puis le traiter dans initApp() une fois l'utilisateur identifié.
  const signToken = query.get('sign');
  if(signToken){
    store.pendingSignToken = signToken;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('sign');
    history.replaceState({}, '', cleanUrl.toString());
  }

  const session = getAuthSession();
  if(!session){ renderLoginScreen(); return; }
  const user = await loadCurrentUser();
  if(!user){ clearAuthSession(); renderLoginScreen(); return; }
  initApp();
}
document.addEventListener('DOMContentLoaded', init);

/* login.js — renderLoginScreen, renderForgotPasswordScreen, renderSetPasswordScreen */

/* ================================================================
   PWA — fonctions SW, install, push → src/pwa.js
   ================================================================ */

function refreshAllPwaData(){
  syncFromSupabase().then(remoteSlots=>{
    if(remoteSlots !== null){
      store.DATA = { version:2, slots: remoteSlots };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store.DATA));
      renderCurrentView();
      updateDashboardNavBadge();
    }
  });
  loadSignatures();
  if(typeof loadInterviews === 'function') loadInterviews();
  if(typeof loadAnnouncements === 'function') loadAnnouncements();
}
window.addEventListener('online', ()=>{ updatePwaOfflineBanner(); refreshAllPwaData(); });
window.addEventListener('offline', updatePwaOfflineBanner);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) refreshAllPwaData(); });

/* ---------------- Raccourcis manifest + navigation au clic sur une notification ---------------- */
function navigateForNotificationType(type){
  if(typeof store.currentUser === 'undefined' || !store.currentUser) return;
  switch(type){
    case 'leave_request': case 'leave_approved': case 'leave_rejected':
      if(canAccessDashboard()){ switchView('dashboard'); setDashSubTab('requests'); renderDashboard(); }
      break;
    case 'medical_visit':
      if(canAccessDashboard()){ switchView('dashboard'); setDashSubTab('stats'); renderDashboard(); }
      break;
    case 'interview':
      if(canAccessDashboard()){ switchView('dashboard'); setDashSubTab('interviews'); renderDashboard(); }
      break;
    case 'announcement':
      switchView('annonces');
      break;
  }
}
function handlePwaShortcutAction(){
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if(!action) return;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('action');
  cleanUrl.searchParams.delete('source');
  history.replaceState({}, '', cleanUrl.toString());

  if(action === 'new-leave'){
    // Pas de formulaire dédié pour une nouvelle demande : on amène l'ASV sur son
    // calendrier, où peindre une absence crée automatiquement la demande en attente.
    switchView('asv');
    switchSubPage('asv', 'calendar');
  } else if(action === 'week-view'){
    switchView('asv');
    switchSubPage('asv', 'week');
  } else {
    navigateForNotificationType({
      'dashboard-requests':'leave_request', 'dashboard-medical':'medical_visit',
      'dashboard-interviews':'interview', 'announcements':'announcement',
    }[action]);
  }
}

/* push subscriptions + notification settings → pwa.js */

/* ---------------- Amorçage ---------------- */
setupCalendar({ snapshotBeforeChange, saveData, switchSubPage, canEditSlot, undoLastAction, getCurrentView: ()=>currentView });
setupWeekView({ saveData, snapshotBeforeChange, renderCurrentView, canEditSlot, effectiveRole, switchSubPage, updateUndoButtons });
setupLogin({ loadCurrentUser, initApp });
setupSignatures({ onLoaded: renderCurrentView, renderCalendarView });
setupAnnualView({ switchSubPage, switchView, openDaySidebar, saveViewState, buildLegendColors, GROUP_VIEWS });
setupDashboard({ openResetYearModal, saveViewState, canEditSlot, effectiveRole, snapshotBeforeChange, saveData, renderCurrentView, openDaySidebar, loadInterviews });
VIEW_RENDERERS['dashboard'] = renderDashboard;
initServiceWorker(navigateForNotificationType);
setTimeout(showIOSInstallTip, 4000);
updatePwaOfflineBanner();

/* ============================================================
   Mobile (≤767px) — bottom nav, bottom sheets, FAB
   ============================================================ */
(function initMobileUI(){
  function debounce(fn, ms){ let t; return function(){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,arguments),ms); }; }

  /* ── Bottom Tab Bar ── */
  const TABS = [
    { view:'dashboard', icon:'📊', label:'Tableau de bord', shortLabel:'Tableau',  badgeId:'dash-nav-badge' },
    { view:'vets',      icon:'🩺', label:'Vétérinaires',    shortLabel:'Vétos',     badgeId:null },
    { view:'asv',       icon:'🐾', label:'ASV',              shortLabel:'ASV',       badgeId:null },
    { view:'annonces',  icon:'📣', label:'Annonces',         shortLabel:'Annonces',  badgeId:'annonces-nav-badge' },
  ];
  let bottomNav=null, fab=null;

  function createBottomNav(){
    const nav=document.createElement('nav');
    nav.id='mobile-bottom-nav';
    nav.setAttribute('aria-label','Navigation principale');
    TABS.forEach(tab=>{
      const btn=document.createElement('button');
      btn.className='mb-tab'; btn.dataset.view=tab.view;
      btn.setAttribute('aria-label',tab.label);
      const icon=document.createElement('span'); icon.className='mb-icon'; icon.textContent=tab.icon;
      const lbl=document.createElement('span');  lbl.className='mb-label'; lbl.textContent=tab.shortLabel;
      btn.appendChild(icon); btn.appendChild(lbl);
      if(tab.badgeId){
        const bw=document.createElement('span'); bw.id='mb-'+tab.badgeId; bw.className='mb-badge';
        btn.appendChild(bw);
      }
      btn.addEventListener('click',()=>{ if(typeof switchView==='function') switchView(tab.view); });
      nav.appendChild(btn);
    });
    return nav;
  }

  function syncBottomNav(){
    if(!bottomNav) return;
    const activeView=document.querySelector('.nav-tab.active')?.dataset.view;
    bottomNav.querySelectorAll('.mb-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));
    TABS.forEach(tab=>{
      if(!tab.badgeId) return;
      const src=document.getElementById(tab.badgeId);
      const dst=document.getElementById('mb-'+tab.badgeId);
      if(src&&dst) dst.innerHTML=src.innerHTML;
    });
  }

  function mountBottomNav(){
    if(bottomNav||window.innerWidth>=768) return;
    bottomNav=createBottomNav();
    document.getElementById('app').appendChild(bottomNav);
    syncBottomNav();
    const obs=new MutationObserver(syncBottomNav);
    document.querySelectorAll('.nav-tab').forEach(b=>obs.observe(b,{attributes:true,attributeFilter:['class']}));
    ['dash-nav-badge','annonces-nav-badge'].forEach(id=>{
      const el=document.getElementById(id); if(el) obs.observe(el,{childList:true,subtree:true,characterData:true});
    });
  }
  function unmountBottomNav(){ if(bottomNav){ bottomNav.remove(); bottomNav=null; } }

  /* ── FAB ── */
  function mountFAB(){
    if(fab||window.innerWidth>=768) return;
    if(typeof switchView!=='function'||typeof switchSubPage!=='function') return;
    fab=document.createElement('button');
    fab.id='mobile-fab'; fab.setAttribute('aria-label','Demander un congé'); fab.textContent='+';
    fab.addEventListener('click',()=>{ switchView('asv'); switchSubPage('asv','calendar'); });
    document.getElementById('app').appendChild(fab);
  }
  function unmountFAB(){ if(fab){ fab.remove(); fab=null; } }

  /* ── Drag-handle + swipe-to-dismiss ── */
  function addSheetHandle(el, dismissFn){
    if(window.innerWidth>=768) return;
    // Retire l'ancien handle s'il existe (re-render du contenu)
    el.querySelectorAll(':scope > .mobile-sheet-handle').forEach(h=>h.remove());
    const handle=document.createElement('div');
    handle.className='mobile-sheet-handle';
    el.insertBefore(handle, el.firstChild);

    let startY=0, startT=0, swiping=false;
    handle.addEventListener('touchstart',e=>{
      startY=e.touches[0].clientY; startT=Date.now(); swiping=false;
      el.style.transition='none';
    },{passive:true});
    handle.addEventListener('touchmove',e=>{
      const dy=e.touches[0].clientY-startY;
      if(dy>0){ swiping=true; el.style.transform=`translateY(${dy}px)`; }
    },{passive:true});
    handle.addEventListener('touchend',e=>{
      const dy=e.changedTouches[0].clientY-startY;
      const vel=dy/Math.max(1,Date.now()-startT);
      el.style.transition=''; el.style.transform='';
      if(swiping && dy>80 && vel>0.3) dismissFn();
    });
  }

  /* ── Sidebar ── */
  (function(){
    const sidebar=document.getElementById('day-sidebar');
    const overlay=document.getElementById('sidebar-overlay');
    if(!sidebar) return;
    const dismiss=()=>{ sidebar.classList.remove('open'); overlay&&overlay.classList.remove('open'); };
    new MutationObserver(()=>{ if(window.innerWidth<768) addSheetHandle(sidebar,dismiss); })
      .observe(sidebar,{childList:true});
  })();

  /* ── Modal ── */
  (function(){
    const box=document.getElementById('modal-box');
    const backdrop=document.getElementById('modal-backdrop');
    if(!box||!backdrop) return;
    const dismiss=()=>backdrop.classList.remove('open');
    new MutationObserver(()=>{ if(window.innerWidth<768) addSheetHandle(box,dismiss); })
      .observe(box,{childList:true});
    new MutationObserver(()=>{
      if(backdrop.classList.contains('open')&&window.innerWidth<768) addSheetHandle(box,dismiss);
    }).observe(backdrop,{attributes:true,attributeFilter:['class']});
  })();

  /* ── Popover ── */
  (function(){
    const box=document.getElementById('popover-box');
    const backdrop=document.getElementById('popover-backdrop');
    if(!box||!backdrop) return;
    const dismiss=()=>backdrop.classList.remove('open');
    new MutationObserver(()=>{ if(window.innerWidth<768) addSheetHandle(box,dismiss); })
      .observe(box,{childList:true});
    new MutationObserver(()=>{
      if(backdrop.classList.contains('open')&&window.innerWidth<768) addSheetHandle(box,dismiss);
    }).observe(backdrop,{attributes:true,attributeFilter:['class']});
  })();

  /* ── Resize ── */
  function onResize(){
    if(window.innerWidth<768){ mountBottomNav(); mountFAB(); }
    else { unmountBottomNav(); unmountFAB(); }
  }
  window.addEventListener('resize',debounce(onResize,200));
  onResize();
})();
