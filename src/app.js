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
  setupWeekView, renderWeekViewASV, getWeekAlerts, computeWeekTotalHours,
  openEarlyDepPicker, openMonthPrintPopup,
} from './week-view.js';
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
function changeMonth(viewKey, delta){
  const cfg = store.CAL_VIEWS[viewKey];
  const m = cfg.navState.month + delta;
  cfg.navState.month = ((m % 12) + 12) % 12;
  renderCalendarView(viewKey);
}
function goToToday(viewKey){
  const cfg = store.CAL_VIEWS[viewKey];
  cfg.navState.month = (today.getFullYear() === cfg.year) ? today.getMonth() : 0;
  renderCalendarView(viewKey);
}

// Calcule classes + contenu d'une cellule demi-journée à partir de store.DATA. Pour une absence
// ASV, l'apparence dépend aussi du statut de la demande de congé (en attente / approuvée /
// refusée) — sans changement pour les vétérinaires, qui n'ont pas ce concept.
function cellRenderInfo(iso, personId, slot){
  const person = personOf(personId);
  const state = getSlotState(iso, personId, slot);
  const label = state === 'absent' ? getSlotLabel(iso, personId, slot) : '';
  const decision = state === 'absent' && isASVPerson(personId) ? (getLeaveDecision(iso, personId, slot) || 'pending') : null;
  const changeDecision = isASVPerson(personId) ? getChangeDecision(iso, personId, slot) : null;
  let style = '';
  let html = '';
  let title = label;
  let stateClass = state;
  if(state === 'present'){
    if(isASVPerson(personId)){
      const shType = getShiftType(iso, personId);
      if(shType === 'F'){
        stateClass = 'closing';
        html = `<span style="font-size:7.5px;font-weight:800;">F</span>`;
        title = 'Fermeture (9h→19h15)';
      } else {
        stateClass = 'opening';
        html = `<span style="font-size:7.5px;font-weight:800;">O</span>`;
        title = 'Ouverture (8h30→19h)';
      }
    } else {
      style = `background:${person.present.bg};border-color:${person.present.border};color:${person.present.text};`;
      html = `<span class="cell-mark">✓</span>`;
    }
  } else if(state === 'absent'){
    const lc = label.toLowerCase().trim();
    if(lc === 'maladie' || lc === 'arrêt maladie' || lc === 'arrêt'){
      stateClass = 'sick';
      html = `<span class="cell-mark">🤒</span>${label ? ' '+escapeHTML(label) : ''}`;
      title = `Arrêt maladie${label ? ' — '+label : ''}`;
    } else if(lc === 'repos' || lc === 'repos planifié' || lc === 'non travaillé'){
      stateClass = 'off';
      html = label ? escapeHTML(label) : '<span class="cell-mark">—</span>';
      title = 'Repos planifié (hors congé)';
    } else if(decision === 'pending'){
      stateClass = 'leave-pending';
      html = `${label ? escapeHTML(label)+' ' : ''}<span class="cell-mark">⏳</span>`;
      title = `${label ? label+' — ' : ''}En attente de validation`;
    } else if(decision === 'rejected'){
      stateClass = 'leave-rejected';
      html = `<span class="cell-mark">⚠️</span> Voir vétérinaire`;
      const comment = getLeaveDecisionComment(iso, personId, slot);
      title = `Congé refusé — merci de vous rapprocher d'un vétérinaire${comment ? ' — '+comment : ''}`;
    } else {
      if(decision === 'approved') stateClass = 'leave-approved';
      html = label ? escapeHTML(label) : `<span class="cell-mark">✈</span>`;
      if(decision === 'approved'){
        html = `<span class="cell-mark">✓</span> ${html}`;
        title = `${label ? label+' — ' : ''}Congé approuvé`;
      }
    }
  } else if(state === 'medical'){
    stateClass = 'medical';
    html = `<span class="cell-mark">🏥</span>`;
    title = 'Visite médicale d\'entreprise';
  } else {
    style = `border-left:3px solid ${hexToRgba(person.color,0.4)};`;
  }
  // Surcharge violet : modification urgente en attente de validation vétérinaire
  if(changeDecision === 'pending'){
    stateClass = 'change-pending';
    html = html || (state === 'present' ? `<span style="font-size:7.5px;font-weight:800;">${getShiftType(iso,personId)==='F'?'F':'O'}</span>` : '<span class="cell-mark">●</span>');
    title = (title ? title+' — ' : '')+'Modification en attente d\'approbation';
  } else if(changeDecision === 'rejected'){
    stateClass = 'change-rejected';
    html = (html||'') + '<span class="cell-mark" style="font-size:8px;">⚠️</span>';
    title = (title ? title+' — ' : '')+'Modification refusée — contacter un vétérinaire';
  }
  return { state, label, decision, changeDecision, style, html, title, stateClass };
}
function cellAriaLabel(iso, personId, slot){
  const person = personOf(personId);
  const { state, label, decision, stateClass } = cellRenderInfo(iso, personId, slot);
  let stateTxt;
  if(state === 'present') stateTxt = 'présent';
  else if(state === 'absent'){
    if(stateClass === 'sick') stateTxt = `arrêt maladie${label?' — '+label:''}`;
    else if(stateClass === 'off') stateTxt = 'repos planifié';
    else if(decision === 'pending') stateTxt = `demande de congé en attente${label?' — '+label:''}`;
    else if(decision === 'rejected') stateTxt = 'demande de congé refusée — voir un vétérinaire';
    else if(decision === 'approved') stateTxt = `congé approuvé${label?' — '+label:''}`;
    else stateTxt = `absent${label?' — '+label:''}`;
  } else if(state === 'medical') stateTxt = 'visite médicale d\'entreprise';
  else stateTxt = 'non renseigné';
  return `${person.short}, ${SLOT_LABELS[slot]}, ${stateTxt}. Cliquer pour changer.`;
}
// Met à jour le DOM d'une seule cellule sans tout re-rendre (utilisé pendant le drag-to-fill)
function updateCellDOM(cellEl){
  const { date:iso, person:personId, slot } = cellEl.dataset;
  const info = cellRenderInfo(iso, personId, slot);
  cellEl.className = `cal-cell state-${info.stateClass}`;
  cellEl.style.cssText = info.style;
  cellEl.innerHTML = info.html;
  cellEl.setAttribute('aria-label', cellAriaLabel(iso, personId, slot));
  cellEl.title = info.title || '';
}
// Équivalent pour la nouvelle grille-semaine (buildWeekGrid)
function updateHalfDOM(halfEl){
  const { date:iso, person:personId, slot } = halfEl.dataset;
  const info = cellRenderInfo(iso, personId, slot);
  const [y, m] = iso.split('-').map(Number);
  const locked = isMonthSigned(personId, y, m - 1);
  const noEdit = !canEditSlot(personId);
  const lockCls = locked ? ' cal-wg-half-locked' : noEdit ? ' cal-wg-half-readonly' : '';
  const stateCls = info.stateClass ? ` cal-wg-half-${info.stateClass}` : '';
  halfEl.className = `cal-wg-half${stateCls}${lockCls}`;
  halfEl.style.cssText = info.style || '';
  halfEl.innerHTML = info.html || (slot === 'M' ? 'M' : 'A');
  halfEl.title = info.title || '';
  halfEl.setAttribute('aria-label', cellAriaLabel(iso, personId, slot));
}

function buildCalendarToolbar(viewKey){
  const cfg = store.CAL_VIEWS[viewKey];
  const monthLabel = `${MONTH_NAMES[cfg.navState.month]} ${cfg.year}`;
  const todayBtn = cfg.todayNav ? `<button class="btn btn-sm" id="cal-today-${viewKey}" aria-label="Revenir au mois actuel">📍 Aujourd'hui</button>` : '';
  const hasASV = cfg.people && cfg.people.some(p=>isASVPerson(p.id));
  const paintBar = hasASV ? `
    <div class="cal-paint-bar" id="cal-paint-bar-${viewKey}">
      <span style="font-size:11px;font-weight:600;color:var(--color-text-muted);">Outil :</span>
      <button class="paint-tool${store.calMonthPaintMode==='opening'?' active':''}" data-paint="opening" title="Ouverture — 8h30→19h00">🟢 Ouverture</button>
      <button class="paint-tool${store.calMonthPaintMode==='closing'?' active':''}" data-paint="closing" title="Fermeture — 9h00→19h15">🌿 Fermeture</button>
      <button class="paint-tool${store.calMonthPaintMode==='repos'?' active':''}" data-paint="repos" title="Repos planifié (sans validation)">🟠 Repos</button>
      <button class="paint-tool${store.calMonthPaintMode==='conge'?' active':''}" data-paint="conge" title="Demande de congé (validation vétérinaires)">🔵 Congé</button>
      <button class="paint-tool${store.calMonthPaintMode==='maladie'?' active':''}" data-paint="maladie" title="Arrêt maladie (direct, hors règle 15j)">🤒 Maladie</button>
      <button class="paint-tool paint-tool-erase${store.calMonthPaintMode==='erase'?' active':''}" data-paint="erase" title="Gomme — efface la case">🧹 Gomme</button>
    </div>` : '';
  return `
    <div class="cal-toolbar">
      <div class="cal-month-nav">
        <button class="btn-icon" id="cal-prev-${viewKey}" aria-label="Mois précédent">←</button>
        <div class="cal-month-label">${monthLabel}</div>
        <button class="btn-icon" id="cal-next-${viewKey}" aria-label="Mois suivant">→</button>
        ${todayBtn}
      </div>
      <div class="cal-toolbar-actions">
        <button class="btn-icon undo-btn" id="cal-undo-${viewKey}" aria-label="Annuler la dernière action" title="Annuler la dernière action (Cmd/Ctrl+Z)" ${store.UNDO_STACK.length===0?'disabled':''}>↩️</button>
        <button class="btn btn-sm btn-danger" id="cal-clear-month-${viewKey}" aria-label="Vider le mois affiché">🗑️ Vider le mois</button>
        ${cfg.printable ? `<button class="btn btn-sm" id="cal-print-${viewKey}" title="Imprimer les fiches mensuelles ASV">🖨️ Imprimer</button>` : ''}
      </div>
    </div>
    ${paintBar}
  `;
}

// Supprime les présences/absences du mois affiché — pour une personne donnée, ou pour
// tout le groupe affiché si personId est omis (dans ce cas, les commentaires de journée
// sont aussi effacés).
function clearMonth(viewKey, month, personId){
  const cfg = store.CAL_VIEWS[viewKey];
  snapshotBeforeChange();
  const nbDays = daysInMonth(cfg.year, month);
  const targets = personId ? cfg.people.filter(p=>p.id===personId) : cfg.people;
  const asvTargets = targets.filter(p=>isASVPerson(p.id));
  for(let day=1; day<=nbDays; day++){
    const iso = fmtISO(new Date(cfg.year, month, day));
    targets.forEach(p=>{
      SLOTS.forEach(slot=> setSlotState(iso, p.id, slot, 'empty'));
      setOvertimeHours(iso, p.id, 0);
    });
    // ASV : efface aussi les ajustements semaine et notes
    asvTargets.forEach(p=>{
      setEarlyDep(iso, p.id, '');
      setWeekOtMins(iso, p.id, 0);
      setDayNote(iso, p.id, '');
    });
    if(!personId) setDayComment(iso, '');
  }
  saveData();
  renderCalendarView(viewKey);
  // Si la vue hebdomadaire est affichée, la rafraîchir aussi pour refléter la suppression des TE
  if(store.subNavState.asv === 'week') renderWeekViewASV();
  const who = personId ? personOf(personId).short : cfg.people.map(p=>p.short).join(' et ');
  showToast(`${MONTH_NAMES[month]} ${cfg.year} vidé (${who})`, '🗑️');
}

// Modale de choix : que vider pour ce mois ? Les boutons sont générés dynamiquement à
// partir de cfg.people, donc le même code sert le calendrier à 2 personnes (vétérinaires)
// comme celui à 3 (ASV).
function openClearMonthModal(viewKey, month){
  const cfg = store.CAL_VIEWS[viewKey];
  const label = `${MONTH_NAMES[month]} ${cfg.year}`;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  const allLabel = cfg.people.map(p=>p.short).join(' + ');
  const hasASV = cfg.people.some(p=>isASVPerson(p.id));
  const asvWarning = hasASV ? `<p style="font-size:12px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:8px 10px;color:#92400E;margin:0 0 14px;">⚠️ Les saisies hebdomadaires (heures matin / déjeuner / après-midi) des ASV pour ce mois seront également supprimées.</p>` : '';
  box.innerHTML = `
    <h3>Vider ${label} ?</h3>
    <p>Choisissez ce qui doit être supprimé définitivement pour ${label}. Cette action est irréversible.</p>
    ${asvWarning}
    <div class="modal-actions" style="flex-direction:column;align-items:stretch;">
      <button class="btn btn-danger" id="clear-all" style="justify-content:center;">🗑️ Tout le mois (${allLabel})</button>
      ${cfg.people.map(p=>`<button class="btn btn-danger" data-clear-person="${p.id}" style="justify-content:center;color:${p.color};border-color:${hexToRgba(p.color,0.4)};">${p.short} uniquement</button>`).join('')}
      <button class="btn" id="modal-cancel" style="justify-content:center;">Annuler</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  box.querySelector('#clear-all').onclick = ()=>{ clearMonth(viewKey, month); close(); };
  box.querySelectorAll('[data-clear-person]').forEach(btn=>{
    btn.onclick = ()=>{ clearMonth(viewKey, month, btn.dataset.clearPerson); close(); };
  });
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
}

// Découpe un mois en (au plus) 2 moitiés de taille proche, la coupure tombant toujours
// juste après un dimanche (jamais au milieu d'une semaine).
function splitMonthIntoHalves(year, month){
  const nbDays = daysInMonth(year, month);
  const sundays = [];
  for(let day=1; day<nbDays; day++){
    if(isSunday(new Date(year, month, day))) sundays.push(day);
  }
  let cut = Math.ceil(nbDays/2);
  if(sundays.length){
    cut = sundays.reduce((best,d)=> Math.abs(d-nbDays/2) < Math.abs(best-nbDays/2) ? d : best, sundays[0]);
  }
  const half1 = [], half2 = [];
  for(let d=1; d<=nbDays; d++){ (d<=cut?half1:half2).push(d); }
  return [half1, half2].filter(h=>h.length>0);
}

// Renvoie la demi-journée suivant immédiatement (iso,slot), en sautant un dimanche s'il y en
// a un juste après — ou null si le jour suivant n'est pas un dimanche (rien à enjamber).
function nextSlotAcrossSunday(iso, slot){
  let date = new Date(iso+'T00:00:00');
  let slotIdx = SLOTS.indexOf(slot) + 1;
  if(slotIdx >= SLOTS.length){ slotIdx = 0; date = new Date(date.getTime()+86400000); }
  if(!isSunday(date)) return null;
  date = new Date(date.getTime()+86400000);
  return { iso: fmtISO(date), slot: SLOTS[slotIdx] };
}
// Symétrique de nextSlotAcrossSunday, vers le passé.
function prevSlotAcrossSunday(iso, slot){
  let date = new Date(iso+'T00:00:00');
  let slotIdx = SLOTS.indexOf(slot) - 1;
  if(slotIdx < 0){ slotIdx = SLOTS.length-1; date = new Date(date.getTime()-86400000); }
  if(!isSunday(date)) return null;
  date = new Date(date.getTime()-86400000);
  return { iso: fmtISO(date), slot: SLOTS[slotIdx] };
}
// Collecte toutes les demi-journées absentes contiguës à partir de (iso,slot), dans une
// direction (1 = vers le futur, -1 = vers le passé), en s'arrêtant à un dimanche.
function collectContiguousAbsentSlots(personId, iso, slot, direction){
  const result = [];
  let date = new Date(iso+'T00:00:00');
  let slotIdx = SLOTS.indexOf(slot);
  while(!isSunday(date)){
    const curIso = fmtISO(date);
    const curSlot = SLOTS[slotIdx];
    if(getSlotState(curIso, personId, curSlot) !== 'absent') break;
    if(direction > 0) result.push({iso:curIso, slot:curSlot});
    else result.unshift({iso:curIso, slot:curSlot});
    slotIdx += direction;
    if(slotIdx < 0){ slotIdx = SLOTS.length-1; date = new Date(date.getTime()-86400000); }
    else if(slotIdx >= SLOTS.length){ slotIdx = 0; date = new Date(date.getTime()+86400000); }
  }
  return result;
}
// Si l'absence saisie touche un dimanche, applique le même motif à l'absence contiguë de
// l'autre côté de ce dimanche (sans avoir à le ressaisir).
function propagateLabelAcrossSunday(personId, slots, label){
  if(!slots.length) return;
  const first = slots[0], last = slots[slots.length-1];
  const before = prevSlotAcrossSunday(first.iso, first.slot);
  if(before && getSlotState(before.iso, personId, before.slot) === 'absent'){
    collectContiguousAbsentSlots(personId, before.iso, before.slot, -1)
      .forEach(({iso,slot})=> setSlotLabel(iso, personId, slot, label));
  }
  const after = nextSlotAcrossSunday(last.iso, last.slot);
  if(after && getSlotState(after.iso, personId, after.slot) === 'absent'){
    collectContiguousAbsentSlots(personId, after.iso, after.slot, 1)
      .forEach(({iso,slot})=> setSlotLabel(iso, personId, slot, label));
  }
}

// Construit les <td> de la ligne d'une personne, en fusionnant les demi-journées
// d'absence contiguës (même motif, et pour les ASV même statut de demande de congé) en
// une seule cellule.
// Calcule les heures totales travaillées sur la semaine (lun–sam) contenant mondayDate.

// Après une saisie : vérifie le plafond 42h. Si dépassé, restaure le snapshot et affiche un toast.
// Renvoie true si la saisie a été bloquée.

// Calcule les alertes réglementaires pour la semaine se terminant par le dimanche passé.
// Renvoie un tableau de chaînes (vide = tout va bien).

function buildPersonRowCells(year, month, days, personId){
  let html = '';
  let run = null;
  const locked  = isMonthSigned(personId, year, month);
  const noEdit  = !canEditSlot(personId); // lecture seule (pas les droits sur cette ligne)
  const blocked = locked || noEdit;       // data-action="locked" bloque TOUS les handlers
  const blockCls = locked ? ' cal-cell-locked' : noEdit ? ' cal-cell-readonly' : '';
  const blockTitle = locked ? 'Feuille de présence signée — verrouillée' : noEdit ? 'Lecture seule' : '';
  const flush = ()=>{
    if(!run) return;
    const first = run.slots[0], last = run.slots[run.slots.length-1];
    const ariaRange = run.slots.length>1 ? `du ${formatFR(first.iso)} au ${formatFR(last.iso)}` : formatFR(first.iso);
    const info = cellRenderInfo(first.iso, personId, first.slot);
    const mergedMonCls = run.startMon ? ' is-monday' : '';
    html += `<td class="cal-cell state-${info.stateClass}${blockCls}${mergedMonCls}" colspan="${run.colspan}"
      ${blocked ? 'data-action="locked"' : `data-slots='${JSON.stringify(run.slots)}'`} data-person="${personId}"
      tabindex="0" role="button" title="${escapeHTML(blocked ? blockTitle : (info.title||''))}"
      aria-label="${personOf(personId).short} ${ariaRange} — ${cellAriaLabel(first.iso, personId, first.slot)}">${info.html}</td>`;
    run = null;
  };
  // Un dimanche peut être "absorbé" dans une case fusionnée (sans devenir une vraie
  // demi-journée de données) pour un congé vétérinaire (toujours validé d'office, aucune
  // approbation n'existant pour eux) ou pour une demande de congé ASV en attente ou
  // validée — à condition que le motif se poursuive identique de l'autre côté. Une demande
  // ASV refusée garde toujours le dimanche comme case "fermée" séparée.
  const canBridgeSunday = (decision)=> !isASVPerson(personId) || decision === 'pending' || decision === 'approved';
  // (pas d'accumulation OT inline — getWeekAlerts utilise computeWeekTotalHours)
  days.forEach(day=>{
    const date = new Date(year, month, day);
    const iso = fmtISO(date);
    if(isSunday(date)){
      if(run && canBridgeSunday(run.decision)){
        const nextIso = fmtISO(new Date(date.getTime() + 86400000));
        const nextState = getSlotState(nextIso, personId, 'M');
        const nextLabel = nextState === 'absent' ? getSlotLabel(nextIso, personId, 'M') : '';
        const nextDecision = nextState === 'absent' && isASVPerson(personId) ? (getLeaveDecision(nextIso, personId, 'M') || 'pending') : null;
        if(nextState === 'absent' && nextLabel === run.label && nextDecision === run.decision){
          run.colspan += 2;
          return;
        }
      }
      flush();
      if(isASVPerson(personId)){
        const alerts = getWeekAlerts(personId, iso);
        if(alerts.length > 0){
          const alertHtml = alerts.map(a => `<div style="font-size:9px;color:#DC2626;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a}</div>`).join('');
          html += `<td class="cal-cell sunday-cell" colspan="2" title="${escapeHTML(alerts.join(' · '))}" style="vertical-align:middle;padding:2px 3px;"><div style="display:flex;flex-direction:column;gap:1px;align-items:center;">${alertHtml}</div></td>`;
        } else {
          html += `<td class="cal-cell sunday-cell" colspan="2" aria-hidden="true"></td>`;
        }
      } else {
        html += `<td class="cal-cell sunday-cell" colspan="2" aria-hidden="true"></td>`;
      }
      return;
    }
    // Jour non contractuel (ex. Carla = samedi uniquement, ou jours définis par quotité)
    if(isASVPerson(personId) && !isPersonWorkingDay(personId, date)){
      flush();
      html += `<td class="cal-cell cal-cell-nonworking" colspan="2" aria-hidden="true" title="Jour non travaillé"></td>`;
      return;
    }
    const isMonday = isoWeekday(date) === 0;
    SLOTS.forEach(slot=>{
      const state = getSlotState(iso, personId, slot);
      const label = state === 'absent' ? getSlotLabel(iso, personId, slot) : '';
      const decision = state === 'absent' && isASVPerson(personId) ? (getLeaveDecision(iso, personId, slot) || 'pending') : null;
      const monCls = (isMonday && slot === 'M') ? ' is-monday' : '';
      if(state === 'absent'){
        if(run && run.label === label && run.decision === decision){ run.slots.push({iso, slot}); run.colspan += 1; }
        else { flush(); run = { label, decision, slots:[{iso, slot}], colspan:1, startMon: isMonday && slot === 'M' }; }
      } else {
        flush();
        const info = cellRenderInfo(iso, personId, slot);
        html += `<td class="cal-cell state-${info.stateClass}${blockCls}${monCls}" style="${info.style}"
          data-date="${iso}" data-person="${personId}" data-slot="${slot}" data-slot-short="${slot==='M'?'M':'A'}" ${blocked?'data-action="locked"':''}
          tabindex="0" role="button" title="${escapeHTML(blocked ? blockTitle : (info.title||''))}"
          aria-label="${cellAriaLabel(iso, personId, slot)}">${info.html}</td>`;
      }
    });
  });
  flush();
  return html;
}

// Ligne "Heures supplémentaires" du calendrier ASV : une case par jour (pas par
// demi-journée, contrairement aux lignes individuelles), qui ouvre une pop-up listant
// toutes les ASV pour saisir leurs heures sup de cette date en une fois.
function buildOvertimeRowCells(year, month, days, people){
  let html = '';
  // Groupe les jours en semaines Mon–Dim. La dernière semaine sans dimanche (fin de mois)
  // n'est pas affichée ici — elle sera montrée dans le mois suivant.
  const weeks = [];
  let currentWeek = [];
  days.forEach(day=>{
    currentWeek.push(day);
    if(isSunday(new Date(year, month, day))){ weeks.push(currentWeek); currentWeek = []; }
  });
  // currentWeek non vide → semaine à cheval sur mois suivant, on n'affiche pas ici

  weeks.forEach((weekDays, weekIndex)=>{
    const colspan = weekDays.length * 2;

    // Pour la première semaine à cheval sur le mois précédent : inclure les jours manquants
    let extraDates = [];
    if(weekIndex === 0){
      const firstDate = new Date(year, month, weekDays[0]);
      const firstWD = isoWeekday(firstDate); // 0=Lun … 6=Dim
      for(let i = firstWD; i > 0; i--){
        const d = new Date(firstDate.getTime() - i * 86400000);
        if(!isSunday(d)) extraDates.push(d);
      }
    }

    // Calcul par personne : écart net (OT − déficit + ajustement manuel) par jour présent.
    const isPresent=(iso,p)=> getSlotState(iso,p.id,'M')==='present'||getSlotState(iso,p.id,'AM')==='present';
    const personOTs = people.map(p=>{
      let ot = 0;
      extraDates.forEach(d=>{ const iso=fmtISO(d); if(!isSunday(d)&&isPresent(iso,p)) ot+=getDayAllOtH(iso,p.id)-getDayDeficitH(iso,p.id)+getOvertimeHours(iso,p.id); });
      weekDays.forEach(day=>{ const date=new Date(year,month,day); const iso=fmtISO(date); if(!isSunday(date)&&isPresent(iso,p)) ot+=getDayAllOtH(iso,p.id)-getDayDeficitH(iso,p.id)+getOvertimeHours(iso,p.id); });
      return { person:p, ot: roundTo15min(ot) };
    });

    const weekTotal = roundTo15min(personOTs.reduce((s, e)=> s + e.ot, 0));
    const nonZero = personOTs.filter(e=> e.ot !== 0);
    const detail = nonZero.map(e=>
      `<span class="${e.ot < 0 ? 'ot-neg' : 'ot-pos'}">${escapeHTML(e.person.short)} ${signedHHMM(e.ot)}</span>`
    ).join('<span class="ot-sep">·</span>');

    // Cellule fusionnée = jours ouvrés uniquement (sans dimanche), + cellule dimanche vide séparée
    const hasSunday = isSunday(new Date(year, month, weekDays[weekDays.length - 1]));
    const workColspan = hasSunday ? (weekDays.length - 1) * 2 : colspan;
    html += `<td class="cal-cell overtime-row-cell" colspan="${workColspan}" aria-label="Heures supp. semaine">
      <div class="ot-week-wrap">
        ${detail ? `<div class="ot-week-detail">${detail}</div>` : ''}
        ${weekTotal !== 0 ? `<div class="ot-week-sum${weekTotal < 0 ? ' ot-week-sum-neg' : ''}">${signedHHMM(weekTotal)}</div>` : ''}
      </div>
    </td>${hasSunday ? '<td class="cal-cell sunday-cell" colspan="2" aria-hidden="true"></td>' : ''}`;
  });
  return html;
}

// Nouvelle grille hebdomadaire : remplace buildHalfTable. Chaque mois = blocs de 7 colonnes
// (Lundi → Dimanche). Pas de colspan ni de fusion : chaque demi-journée est une bande
// distincte. L'overtime ASV est calculé par semaine complète (avec dimanche dans ce mois).
function buildWeekGrid(year, month, people){
  const nbDays = daysInMonth(year, month);
  const firstWD = isoWeekday(new Date(year, month, 1)); // 0=Lun…6=Dim
  const todayISO = fmtISO(today);
  const isASV = people.length > 0 && isASVPerson(people[0].id);

  // Tableau de semaines : chaque semaine = 7 éléments (null = hors mois, ou numéro de jour)
  const weeks = [];
  let week = new Array(firstWD).fill(null);
  for(let d = 1; d <= nbDays; d++){
    week.push(d);
    if(week.length === 7){ weeks.push(week); week = []; }
  }
  if(week.length > 0){ while(week.length < 7) week.push(null); weeks.push(week); }

  const DAY_LETTERS = ['L','M','M','J','V','SA', isASV ? 'Alertes' : 'DI'];
  const head = `<div class="cal-wg-head"><div class="cal-wg-dh cal-wg-dh-label" aria-hidden="true"></div>${DAY_LETTERS.map((l,i)=>
    `<div class="cal-wg-dh${i>=5?' cal-wg-dh-we':''}" ${i===6&&isASV?'title="Motif d\'alerte réglementaire"':''}>${l}</div>`
  ).join('')}</div>`;

  const labelColHtml = `<div class="cal-wg-label-col" aria-hidden="true">
    <div class="cal-wg-label-spacer"></div>
    <div class="cal-wg-label-persons">
      ${people.map(p=>`<div class="cal-wg-plabel${p.archived?' plabel-archived':''}" style="background:${hexToRgba(p.color,0.15)};color:${p.color};border-left:3px solid ${p.color};" title="${escapeHTML(p.short)}">${escapeHTML(p.short)}</div>`).join('')}
    </div>
  </div>`;

  const legendHtml = isASV ? '' : `<div class="cal-wg-person-legend">
    ${people.map(p=>`<span class="cal-wg-person-tag" style="background:${hexToRgba(p.color,0.13)};color:${p.color};border-color:${hexToRgba(p.color,0.4)};">${p.short}</span>`).join('')}
    <span class="cal-wg-status-tag cal-wg-status-absent">Absent</span>
  </div>`;

  const weekBlocksHtml = weeks.map((weekDays, weekIdx)=>{
    const dayCols = weekDays.map((day, wd)=>{
      if(day === null) return `<div class="cal-wg-day cal-wg-day-empty" aria-hidden="true"></div>`;
      const date = new Date(year, month, day);
      const iso = fmtISO(date);
      const isSat = wd === 5, isSun = wd === 6;
      const hName = holidayName(iso);
      const comment = getDayComment(iso);
      let dayCls = 'cal-wg-day';
      if(isSat || isSun) dayCls += ' cal-wg-day-we';
      if(isSat) dayCls += ' cal-wg-day-sa';
      if(isSun) dayCls += ' cal-wg-day-su';
      if(hName) dayCls += ' cal-wg-day-holiday';
      if(iso === todayISO) dayCls += ' cal-wg-day-today';

      const toolsHtml = !isSun ? `<div class="cal-wg-tools">
        <button class="cal-wg-tool-btn${comment?' has-comment':''}" data-action="comment" data-date="${iso}" aria-label="Commentaire du ${day}/${month+1}" title="${comment?escapeHTML(comment):'Ajouter un commentaire'}">💬</button>
        <button class="cal-wg-tool-btn" data-action="edit-day" data-date="${iso}" aria-label="Édition rapide du ${day}/${month+1}">✏️</button>
      </div>` : '<div class="cal-wg-tools"></div>';

      const dayHead = `<div class="cal-wg-day-head">
        <div class="cal-wg-daynum">${day}</div>
        ${hName?`<div class="cal-wg-holiday-name" title="${escapeHTML(hName)}">${escapeHTML(hName)}</div>`:''}
        ${toolsHtml}
      </div>`;

      if(isSun){
        let alertContent = '';
        if(isASV){
          const perPersonAlerts = people.map(person => {
            const als = getWeekAlerts(person.id, iso);
            if(als.length === 0) return `<div class="cal-wg-pstrip" data-person="${person.id}" style="min-height:18px;"></div>`;
            return `<div class="cal-wg-pstrip" data-person="${person.id}" style="min-height:18px;display:flex;align-items:center;justify-content:center;"><button class="week-alert-btn" data-alert-person="${person.id}" data-alerts="${escapeHTML(JSON.stringify(als))}" title="Cliquer pour voir le détail">⚠️ ${als.length}</button></div>`;
          }).join('');
          if(perPersonAlerts) alertContent = `<div class="cal-wg-persons">${perPersonAlerts}</div>`;
        }
        return `<div class="${dayCls}" data-date="${iso}">${dayHead}${alertContent}</div>`;
      }

      const personStrips = people.map(person=>{
        const locked = isMonthSigned(person.id, year, month);
        const noEdit = !canEditSlot(person.id);
        const blocked = locked || noEdit;
        const blockTitle = locked ? 'Feuille de présence signée — verrouillée' : noEdit ? 'Lecture seule' : '';
        const archived = person.archived === true;
        if(isASVPerson(person.id) && !isPersonWorkingDay(person.id, date)){
          return `<div class="cal-wg-pstrip${archived?' pstrip-archived':''}" data-person="${person.id}"><div class="cal-wg-half cal-wg-half-nonworking" aria-hidden="true"></div><div class="cal-wg-half cal-wg-half-nonworking" aria-hidden="true"></div></div>`;
        }
        const halves = SLOTS.map(slot=>{
          const info = cellRenderInfo(iso, person.id, slot);
          const lockCls = locked ? ' cal-wg-half-locked' : noEdit ? ' cal-wg-half-readonly' : '';
          const stateCls = info.stateClass ? ` cal-wg-half-${info.stateClass}` : '';
          return `<div class="cal-wg-half${stateCls}${lockCls}"
            data-date="${iso}" data-person="${person.id}" data-slot="${slot}"
            ${blocked?'data-action="locked"':''}
            style="${info.style||''}"
            tabindex="${blocked?'-1':'0'}" role="button"
            title="${escapeHTML(blocked?blockTitle:(info.title||''))}"
            aria-label="${cellAriaLabel(iso, person.id, slot)}">${info.html||(slot==='M'?'M':'A')}</div>`;
        }).join('');
        return `<div class="cal-wg-pstrip${archived?' pstrip-archived':''}" data-person="${person.id}">${halves}</div>`;
      }).join('');

      return `<div class="${dayCls}" data-date="${iso}">${dayHead}<div class="cal-wg-persons">${personStrips}</div></div>`;
    }).join('');

    // Barre heures supplémentaires ASV : uniquement pour les semaines complètes (dimanche dans ce mois)
    let otBarHtml = '';
    if(isASV && weekDays[6] !== null){
      const weekDayNums = weekDays.filter(d => d !== null);
      let extraDates = [];
      if(weekIdx === 0){
        const firstInWeek = weekDays.find(d => d !== null);
        const firstDateInWeek = new Date(year, month, firstInWeek);
        for(let i = isoWeekday(firstDateInWeek); i > 0; i--){
          const d = new Date(firstDateInWeek.getTime() - i * 86400000);
          if(!isSunday(d)) extraDates.push(d);
        }
      }
      const isPresentWG=(iso,p)=> getSlotState(iso,p.id,'M')==='present'||getSlotState(iso,p.id,'AM')==='present';
      const personOTs = people.map(p=>{
        let ot = 0;
        extraDates.forEach(d=>{ const iso=fmtISO(d); if(!isSunday(d)&&isPresentWG(iso,p)) ot+=getDayAllOtH(iso,p.id)-getDayDeficitH(iso,p.id)+getOvertimeHours(iso,p.id); });
        weekDayNums.forEach(dn=>{ const d=new Date(year,month,dn); const iso=fmtISO(d); if(!isSunday(d)&&isPresentWG(iso,p)) ot+=getDayAllOtH(iso,p.id)-getDayDeficitH(iso,p.id)+getOvertimeHours(iso,p.id); });
        return { person:p, ot:roundTo15min(ot) };
      });
      const nonZero = personOTs.filter(e=>e.ot!==0);
      // Total heures réelles de la semaine par personne (utilise le lundi réel de la semaine)
      const _firstDay = weekDays.find(d => d !== null);
      const _mondayOfWeek = getWeekMondayDate(new Date(year, month, _firstDay));
      const personWeekH = people.map(p=>{
        const h = computeWeekTotalHours(p.id, _mondayOfWeek);
        return { person:p, h };
      });
      const weekHLine = personWeekH.map(e=>{
        if(!e.h) return null;
        const over = !e.person.saturdayOnly && e.h >= WEEKLY_MAX_HOURS;
        return `<span class="${over?'ot-neg':'ot-pos'}" title="${escapeHTML(e.person.short)} — ${formatHHMM(e.h)} cette semaine${over?' ⚠️ Plafond 42h':''}">` +
          `${escapeHTML(e.person.short)} ${formatHHMM(e.h)}${over?' ⚠️':''}</span>`;
      }).filter(Boolean);
      const weekHHtml = weekHLine.length ? `<div class="cal-wg-week-ot" style="opacity:0.85;font-size:11px;">` +
        `<span style="color:var(--color-text-muted);font-weight:600;margin-right:6px;">Total</span>` +
        `<span class="ot-week-detail">${weekHLine.join('<span class="ot-sep">·</span>')}</span></div>` : '';
      if(nonZero.length>0){
        const weekTotal = roundTo15min(personOTs.reduce((s,e)=>s+e.ot,0));
        const detail = nonZero.map(e=>`<span class="${e.ot<0?'ot-neg':'ot-pos'}">${escapeHTML(e.person.short)} ${signedHHMM(e.ot)}</span>`).join('<span class="ot-sep">·</span>');
        otBarHtml = weekHHtml + `<div class="cal-wg-week-ot"><span class="ot-week-detail">${detail}</span><span class="ot-week-sum${weekTotal<0?' ot-week-sum-neg':''}">${signedHHMM(weekTotal)}</span></div>`;
      } else if(weekHHtml){
        otBarHtml = weekHHtml;
      }
    }

    return `<div class="cal-wg-week-block"><div class="cal-wg-week">${labelColHtml}${dayCols}</div>${otBarHtml}</div>`;
  }).join('');

  return `<div class="cal-wg">${head}${legendHtml}${weekBlocksHtml}</div>`;
}

function buildHalfTable(year, month, days, people){
  let headCells = '';
  days.forEach(day=>{
    const date = new Date(year, month, day);
    const iso = fmtISO(date);
    const wd = isoWeekday(date);
    const sunday = wd === 6;
    const saturday = wd === 5;
    const hName = holidayName(iso);
    const isToday = fmtISO(today) === iso;
    const comment = getDayComment(iso);

    let thClasses = ['cth'];
    if(sunday) thClasses.push('is-sunday');
    if(saturday) thClasses.push('is-saturday');
    if(hName) thClasses.push('is-holiday');
    if(isToday) thClasses.push('is-today');
    if(wd === 0) thClasses.push('is-monday');

    let inner = `
      <div class="cal-weekday">${WEEKDAY_NAMES[wd]}</div>
      <div class="cal-daynum">${day}</div>
      ${hName ? `<div class="cal-holiday-dot" title="Férié — ${escapeHTML(hName)}"></div>` : ''}
    `;
    if(!sunday){
      inner += `
        <div class="cal-col-tools">
          <button class="cal-icon-btn ${comment?'has-comment':''}" data-action="comment" data-date="${iso}" aria-label="Commentaire du ${day}/${month+1}${comment?' (présent)':''}" title="${comment?escapeHTML(comment):'Ajouter un commentaire'}">💬</button>
          <button class="cal-icon-btn" data-action="edit-day" data-date="${iso}" aria-label="Édition rapide du ${day}/${month+1}">✏️</button>
        </div>
      `;
    }
    headCells += `<th colspan="2" class="${thClasses.join(' ')}" data-col-date="${iso}">${inner}</th>`;
  });

  let bodyRows = '';
  people.forEach(person=>{
    const locked = isMonthSigned(person.id, year, month);
    const archived = person.archived === true;
    const labelColor = archived ? 'var(--color-text-muted)' : person.color;
    const labelText = `${person.short}${locked?' 🔒':''}${archived?' (archivé)':''}`;
    const labelTitle = archived ? 'Archivé — lecture seule' : locked ? 'Feuille de présence signée — verrouillée' : '';
    bodyRows += `
      <tr${archived ? ' class="cal-row-archived"' : ''}>
        <th class="row-label${archived ? ' row-label-archived' : ''}" style="color:${labelColor}" ${labelTitle ? `title="${labelTitle}"` : ''}>${labelText}</th>
        ${buildPersonRowCells(year, month, days, person.id)}
      </tr>
    `;
  });
  // Ligne supplémentaire, uniquement pour le calendrier ASV : un clic sur un jour ouvre une
  // pop-up où saisir les heures sup de chacune des ASV pour cette date.
  if(people.length > 0 && isASVPerson(people[0].id)){
    bodyRows += `
      <tr>
        <th class="row-label overtime-row-label" style="color:var(--color-text-muted);" title="Heures supplémentaires">Heures supplémentaires</th>
        ${buildOvertimeRowCells(year, month, days, people)}
      </tr>
    `;
  }

  return `
    <table class="cal-table">
      <colgroup><col class="col-label">${days.map(()=>'<col><col>').join('')}</colgroup>
      <thead><tr><th class="row-label corner"></th>${headCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

function buildCalendarGrid(viewKey){
  const cfg = store.CAL_VIEWS[viewKey];
  const month = cfg.navState.month;
  return buildWeekGrid(cfg.year, month, cfg.people);
}

function buildLegendColors(people = PEOPLE){
  const hasASV = people.some(p=> isASVPerson(p.id));
  return `
    <div class="legend-row">
      ${hasASV ? `
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-opening);border:1.5px solid var(--color-opening-border)"></span><strong>O</strong> — Ouverture (8h30→19h)</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-closing);border:1.5px solid var(--color-closing-border)"></span><strong>F</strong> — Fermeture (9h→19h15)</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-off);border:1.5px solid var(--color-off-border)"></span>Repos planifié 🟠</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-sick);border:1.5px solid var(--color-sick-border)"></span>Arrêt maladie 🤒</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-absent);border:1.5px solid var(--color-absent-border)"></span>Congé validé ✅</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-leave-pending);border:1.5px solid var(--color-leave-pending-border)"></span>Congé en attente ⏳</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-leave-rejected);border:1.5px solid var(--color-leave-rejected-border)"></span>Congé refusé ⚠️</div>
      ` : `
        ${people.map(p=>`
          <div class="legend-item"><span class="legend-swatch" style="background:${p.present.bg};border:1.5px solid ${p.present.border}"></span>${p.short} — présent</div>
        `).join('')}
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-absent);border:1.5px solid var(--color-absent-border)"></span>Absent</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-medical);border:1.5px solid var(--color-medical-border)"></span>Visite médicale 🏥</div>
      `}
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-holiday);border:1.5px solid var(--color-holiday)"></span>Jour férié</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-sunday);border:1.5px solid var(--color-border)"></span>${hasASV ? 'Dimanche — Alertes semaine' : 'Dimanche (fermé)'}</div>
    </div>
  `;
}
function buildLegend(people = PEOPLE){
  const hasASV = people.some(p=> isASVPerson(p.id));
  return `
    <div class="legend">
      ${buildLegendColors(people)}
      <div class="legend-row">
        ${hasASV ? `
          <span class="legend-help-item">🎨 Choisir un <strong>outil</strong> dans la barre ci-dessus puis <strong>cliquer/glisser</strong> les cases</span>
          <span class="legend-help-item">🧹 <strong>Gomme</strong> : efface une case (retour à l'état vide)</span>
          <span class="legend-help-item">🔵 <strong>Congé</strong> : ouvre une demande soumise aux vétérinaires</span>
          <span class="legend-help-item">👆 <strong>Clic droit</strong> (ou appui long) : saisie directe du motif</span>
        ` : `
          <span class="legend-help-item">🖱️ <strong>Clic</strong> sur une case : fait défiler Vide → Présent → Absent</span>
          <span class="legend-help-item">↔️ <strong>Glisser</strong> le clic sur plusieurs cases : les remplit toutes d'un coup</span>
          <span class="legend-help-item">👆 <strong>Clic droit</strong> (ou appui long) sur une case : ouvre la saisie d'un motif d'absence</span>
        `}
      </div>
    </div>
  `;
}

// Panneau de signature électronique mensuelle (feuille de présence ASV) — uniquement sur
// le calendrier réel de l'année en cours, jamais sur le prévisionnel (données spéculatives,
// rien à certifier) ni côté vétérinaires (pas de feuille de présence pour eux ici).
function buildSignaturePanelHtml(viewKey){
  const cfg = store.CAL_VIEWS[viewKey];
  if(viewKey !== 'asv-current') return '';
  const month = cfg.navState.month;
  const monthLabel = `${MONTH_NAMES[month]} ${cfg.year}`;
  return `
    <div class="card signature-panel" style="margin-top:16px;">
      <h3 style="font-size:14px;margin-bottom:10px;">✍️ Feuille de présence — ${monthLabel}</h3>
      <div class="signature-panel-rows">
        ${cfg.people.map(p=>{
          const detail = getSignatureDetail(p.id, cfg.year, month);
          const signedNote = detail
            ? (()=>{
                const signedDate = new Date(detail.signedAt).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
                return `<span class="text-muted" style="font-size:12.5px;">✅ Signé par ${escapeHTML(detail.signedName)} le ${signedDate}</span>`;
              })()
            : '';
          const isOwn = store.currentUser?.person_id === p.id && store.currentUser?.role === 'asv';
          const isAdminOrVet = store.currentUser?.role === 'admin' || store.currentUser?.role === 'vet';
          const asvPendingNote = isOwn && !detail
            ? `<span class="text-muted" style="font-size:12px;font-style:italic;">La signature s'effectue via le lien envoyé par email par le vétérinaire.</span>`
            : '';
          const adminBtn = isAdminOrVet && !detail
            ? `<button type="button" class="btn" data-admin-request-sign="${p.id}" style="font-size:12.5px;padding:6px 12px;">📧 Demander la signature</button>`
            : '';
          return `<div class="signature-row">
            <span style="color:${p.color};font-weight:700;">${escapeHTML(p.short)}</span>
            ${signedNote}
            ${asvPendingNote}${adminBtn}
          </div>`;
        }).join('')}
      </div>
      <p class="text-muted" style="font-size:11px;margin-top:10px;">Une fois signé, le mois est verrouillé pour la personne concernée. Un vétérinaire peut annuler une signature depuis le Tableau de bord si une correction est nécessaire.</p>
    </div>
  `;
}
// Ligne visible uniquement à l'impression (la version écran a déjà le 🔒 dans l'en-tête de
// ligne, mais sur papier ce repère seul ne suffit pas à prouver qui a signé et quand).
function buildPrintSignatureStatusHtml(viewKey){
  const cfg = store.CAL_VIEWS[viewKey];
  if(viewKey !== 'asv-current') return '';
  const month = cfg.navState.month;
  const parts = cfg.people.map(p=>{
    const detail = getSignatureDetail(p.id, cfg.year, month);
    if(!detail) return `${escapeHTML(p.short)} : non signé`;
    const signedDate = new Date(detail.signedAt).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
    return `${escapeHTML(p.short)} : signé par ${escapeHTML(detail.signedName)} le ${signedDate}`;
  });
  return `<p class="print-signature-status">✍️ ${parts.join('&nbsp;&nbsp;—&nbsp;&nbsp;')}</p>`;
}
// Admin/vet demande la signature d'une ASV : envoie l'email à son compte.
async function adminRequestSignature(viewKey, personId){
  const cfg = store.CAL_VIEWS[viewKey];
  const month = cfg.navState.month;
  const btn = document.querySelector(`[data-admin-request-sign="${personId}"]`);
  if(btn){ btn.disabled = true; btn.textContent = 'Envoi…'; }
  try{
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}request-signature`, {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ year: cfg.year, month, person_id: personId, time_fraction: ASV_PEOPLE.find(p=>p.id===personId)?.timeFraction ?? 1.0 }),
    });
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'Erreur inconnue');
    const person = personOf(personId);
    if(data.email_sent){
      showToast(`Email de signature envoyé à ${person.short}`, '📧');
      renderCalendarView(viewKey);
    } else {
      openSigningLinkModal(data.signing_link, person.short, data.email_error);
      renderCalendarView(viewKey);
    }
  }catch(e){
    showToast(`Échec — ${e.message || 'erreur réseau'}`, '❌');
    if(btn){ btn.disabled = false; btn.textContent = '📧 Demander la signature'; }
  }
}

/* signatures.js — openSigningLinkModal, requestSignatureEmail (reste ici), openSignConfirmModal */
// Demande de signature : envoie un email à l'ASV avec le récap du mois + lien unique.
// La vraie signature n'est enregistrée que lorsqu'elle clique ce lien (confirm-signature).
async function requestSignatureEmail(viewKey, personId){
  const cfg = store.CAL_VIEWS[viewKey];
  const month = cfg.navState.month;
  const btn = document.querySelector(`[data-sign-person="${personId}"]`);
  if(btn){ btn.disabled = true; btn.textContent = 'Envoi…'; }
  try{
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}request-signature`, {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ year: cfg.year, month, time_fraction: ASV_PEOPLE.find(p=>p.id===personId)?.timeFraction ?? 1.0 }),
    });
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'Erreur inconnue');
    if(data.email_sent){
      showToast(`Email de signature envoyé à ${store.currentUser.email}`, '📧');
      renderCalendarView(viewKey);
    } else {
      // Resend ne peut pas envoyer à cet email (plan gratuit) — afficher le lien à copier
      openSigningLinkModal(data.signing_link, store.currentUser.email);
      renderCalendarView(viewKey);
    }
  }catch(e){
    showToast(`Échec — ${e.message || 'erreur réseau'}`, '❌');
    if(btn){ btn.disabled = false; btn.textContent = 'Signer ma feuille de présence'; }
  }
}

function renderCalendarView(viewKey){
  const cfg = store.CAL_VIEWS[viewKey];
  const container = document.getElementById(cfg.containerId);
  if(!container || !cfg) return;
  const banner = cfg.forecast ? `
    <div class="forecast-banner">⚠️ Vue prévisionnelle — données indicatives non confirmées</div>
  ` : '';
  const title = cfg.forecast
    ? `<h2 class="section-title">Prévisionnel ${cfg.year} — ${cfg.label}</h2>`
    : `<h2 class="section-title">Calendrier ${cfg.year} — ${cfg.label}</h2>`;
  container.innerHTML = `
    ${banner}
    ${title}
    <p class="section-desc">Cliquez sur une cellule pour faire défiler Vide → Présent → Absent. Clic droit (ou appui long) sur une cellule pour saisir un motif d'absence.</p>
    ${buildCalendarToolbar(viewKey)}
    ${buildCalendarGrid(viewKey)}
    ${buildPrintSignatureStatusHtml(viewKey)}
    ${buildLegend(cfg.people)}
    ${buildSignaturePanelHtml(viewKey)}
  `;
  container.querySelectorAll('[data-sign-person]').forEach(btn=>{
    btn.onclick = ()=> requestSignatureEmail(viewKey, btn.dataset.signPerson);
  });
  container.querySelectorAll('[data-admin-request-sign]').forEach(btn=>{
    btn.onclick = ()=> adminRequestSignature(viewKey, btn.dataset.adminRequestSign);
  });
}
VIEW_RENDERERS['vets'] = ()=> renderGroupSubPage('vets');
VIEW_RENDERERS['asv'] = ()=> renderGroupSubPage('asv');
VIEW_RENDERERS['annonces'] = renderAnnounces;
/* announcements.js — renderAnnounces, openAnnouncementModal */

/* ----------------------------------------------------------------
   13. INTERACTIONS CALENDRIER (clic, glisser-peindre, popovers, sidebar)
   ---------------------------------------------------------------- */
function calViewKeyOfEventTarget(target){
  const section = target.closest('[data-cal-view]');
  return section ? section.dataset.calView : null;
}

function cycleCellAndSave(cell){
  snapshotBeforeChange();
  const { date:iso, person:personId, slot } = cell.dataset;
  const next = cycleState(getSlotState(iso, personId, slot));
  setSlotState(iso, personId, slot, next);
  updateHalfDOM(cell);
  saveData();
}

// --- Glisser-peindre (drag-to-fill) + appui long ---
let dragCtx = null;
function startDrag(cell){
  snapshotBeforeChange();
  const { date:iso, person:personId, slot } = cell.dataset;
  const isASVDrag = currentView === 'asv' && isASVPerson(personId);
  let paintValue;
  if(isASVDrag && (store.calMonthPaintMode === 'opening' || store.calMonthPaintMode === 'closing')){
    paintValue = 'present';
  } else if(isASVDrag && (store.calMonthPaintMode === 'repos' || store.calMonthPaintMode === 'conge' || store.calMonthPaintMode === 'maladie')){
    paintValue = 'absent';
  } else if(isASVDrag && store.calMonthPaintMode === 'erase'){
    paintValue = 'empty';
  } else {
    paintValue = cycleState(getSlotState(iso, personId, slot));
  }
  dragCtx = {
    startCell: cell, paintValue, personId, moved:false, cancelled:false, touched:new Set(),
    viewKey: calViewKeyOfEventTarget(cell),
    paintMode: isASVDrag ? store.calMonthPaintMode : null,
    longPressTimer: setTimeout(()=>{
      if(dragCtx && !dragCtx.moved){
        dragCtx.cancelled = true;
        openAbsenceLabelPopover(cell, true);
        dragCtx = null;
      }
    }, 480)
  };
}
function applyPaint(cell, value){
  const { date:iso, person:personId, slot } = cell.dataset;
  dragCtx.touched.add(`${iso}|${personId}|${slot}`);
  if(dragCtx.paintMode === 'opening'){
    setSlotState(iso, personId, slot, 'present');
    store.DATA.slots[shiftTypeKey(iso, personId)] = 'O';
  } else if(dragCtx.paintMode === 'closing'){
    setSlotState(iso, personId, slot, 'present');
    store.DATA.slots[shiftTypeKey(iso, personId)] = 'F';
  } else if(dragCtx.paintMode === 'repos'){
    setSlotState(iso, personId, slot, 'absent');
    setSlotLabel(iso, personId, slot, 'Repos planifié');
    setLeaveDecision(iso, personId, slot, null); // repos ne requiert pas d'approbation
  } else if(dragCtx.paintMode === 'maladie'){
    setSlotState(iso, personId, slot, 'absent');
    setSlotLabel(iso, personId, slot, 'Arrêt maladie');
  } else if(dragCtx.paintMode === 'erase'){
    setSlotState(iso, personId, slot, 'empty');
    setSlotLabel(iso, personId, slot, '');
    delete store.DATA.slots[shiftTypeKey(iso, personId)];
    setChangeDecision(iso, personId, slot, null); // effacement = plus de demande d'approbation
  } else {
    setSlotState(iso, personId, slot, value);
  }
  // Vue mensuelle ASV : toute modification dans les 14 prochains jours → approbation vétérinaire
  if(dragCtx.paintMode && dragCtx.paintMode !== 'erase' && isASVPerson(personId) && isWithinNextTwoWeeks(iso)){
    setChangeDecision(iso, personId, slot, 'pending');
  }
  updateHalfDOM(cell);
}
function enterDragCell(cell){
  if(!dragCtx || dragCtx.cancelled) return;
  dragCtx.moved = true;
  clearTimeout(dragCtx.longPressTimer);
  // On ignore les cases de l'autre collaborateur : seul celui sélectionné au clic initial
  // peut être peint/fusionné pendant ce glisser.
  if(cell.dataset.person !== dragCtx.personId) return;
  applyPaint(cell, dragCtx.paintValue);
}
function endDrag(){
  if(!dragCtx) return;
  clearTimeout(dragCtx.longPressTimer);
  if(!dragCtx.cancelled){
    if(!dragCtx.moved) applyPaint(dragCtx.startCell, dragCtx.paintValue);
    if(dragCtx.touched.size > 0){
      saveData();
      if(dragCtx.viewKey) renderCalendarView(dragCtx.viewKey);
      // Congé uniquement : soumettre aux vétérinaires pour validation
      if(dragCtx.paintMode === 'conge'){
        const slotsArr = Array.from(dragCtx.touched).map(k=>{ const [iso2,pid2,slot2]=k.split('|'); return {iso:iso2,slot:slot2}; });
        const pid2 = dragCtx.personId;
        const vk = dragCtx.viewKey;
        setTimeout(()=> openAbsenceRangePopover(slotsArr, pid2, vk), 50);
      }
      // Maladie : notification info aux vétérinaires (sans approbation)
      if(dragCtx.paintMode === 'maladie'){
        const person = personOf(dragCtx.personId);
        showToast(`Arrêt maladie de ${person?.short||dragCtx.personId} enregistré — les vétérinaires seront notifiés`, '🤒');
      }
    }
  }
  dragCtx = null;
}

// --- Popover : motif d'absence ---
function openAbsenceLabelPopover(cell, forceAbsent){
  const { date:iso, person:personId, slot } = cell.dataset;
  const viewKey = calViewKeyOfEventTarget(cell);
  const person = personOf(personId);
  snapshotBeforeChange();
  if(forceAbsent && getSlotState(iso,personId,slot) !== 'absent'){
    setSlotState(iso,personId,slot,'absent');
    updateHalfDOM(cell);
    saveData(false);
  }
  const currentLabel = getSlotLabel(iso,personId,slot);
  const isASV = isASVPerson(personId);
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const quickTags = ['Vacances','Formation','Congrès','Maladie','RTT','Rendez-vous médical'];
  box.innerHTML = `
    <h4>${isASV ? 'Demande de congé' : "Motif d'absence"} — ${person.short}, ${SLOT_LABELS[slot]}<br><span class="text-muted" style="font-weight:500;font-size:12px;">${formatFR(iso)}</span></h4>
    ${isASV ? `<p class="text-muted" style="font-size:12px;margin:-4px 0 12px;">Sera soumise aux vétérinaires pour validation.</p>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
      <button type="button" id="popover-sick" style="padding:7px 4px;border:2px solid var(--color-sick-border);background:var(--color-sick);color:var(--color-sick-text);border-radius:var(--radius-btn);font-size:12px;font-weight:700;cursor:pointer;">🤒 Arrêt maladie</button>
      <button type="button" id="popover-off" style="padding:7px 4px;border:2px solid var(--color-off-border);background:var(--color-off);color:var(--color-off-text);border-radius:var(--radius-btn);font-size:12px;font-weight:700;cursor:pointer;">🗓️ Repos planifié</button>
    </div>
    <div class="popover-quicktags">
      ${quickTags.map(t=>`<button type="button" class="quicktag" data-tag="${escapeHTML(t)}">${t}</button>`).join('')}
    </div>
    <input type="text" id="absence-label-input" placeholder="Motif (ex. SKI TIGNES, GRÈCE...)" value="${escapeHTML(currentLabel)}" maxlength="40">
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">${isASV ? 'Soumettre la demande' : 'Enregistrer'}</button>
    </div>
  `;
  backdrop.classList.add('open');
  const input = box.querySelector('#absence-label-input');
  input.focus(); input.select();
  box.querySelectorAll('.quicktag').forEach(tag=>{
    tag.addEventListener('click', ()=>{ input.value = tag.dataset.tag; input.focus(); });
  });
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#popover-sick').onclick = ()=>{
    setSlotLabel(iso, personId, slot, 'Maladie');
    propagateLabelAcrossSunday(personId, [{iso, slot}], 'Maladie');
    saveData(); if(viewKey) renderCalendarView(viewKey); close();
  };
  box.querySelector('#popover-off').onclick = ()=>{
    setSlotLabel(iso, personId, slot, 'Repos planifié');
    propagateLabelAcrossSunday(personId, [{iso, slot}], 'Repos planifié');
    saveData(); if(viewKey) renderCalendarView(viewKey); close();
  };
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-save').onclick = ()=>{
    const label = input.value.trim();
    // Alerte si modification de planning à moins de 15 jours (congé soumis tardivement)
    const daysBeforeDate = Math.ceil((new Date(iso+'T00:00:00') - today) / 86400000);
    const isLateRequest = isASV && daysBeforeDate >= 0 && daysBeforeDate < 15;
    if(isLateRequest) showToast(`Modification à ${daysBeforeDate}j — délai réglementaire 15j non respecté`, '⚠️');
    setSlotLabel(iso, personId, slot, label);
    propagateLabelAcrossSunday(personId, [{iso, slot}], label);
    saveData();
    if(isASV && typeof triggerPushNotification === 'function'){
      triggerPushNotification({
        type: 'leave_request',
        title: isLateRequest ? '⚠️ Demande de congé hors délai' : 'Nouvelle demande de congé',
        body: `${person.short} — ${formatFR(iso)} (${SLOT_LABELS[slot]})${label ? ' · '+label : ''}${isLateRequest ? ' — hors délai 15j' : ''}`,
        targetUsers: ['david','stephane'],
        data: { type:'leave_request' },
      });
    }
    if(viewKey) renderCalendarView(viewKey);
    close();
  };
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
}

// --- Popover : motif d'absence pour une cellule fusionnée (plusieurs demi-journées) ---
function openAbsenceRangePopover(slots, personId, viewKey){
  const person = personOf(personId);
  const isASV = isASVPerson(personId);
  const currentLabel = getSlotLabel(slots[0].iso, personId, slots[0].slot);
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const quickTags = ['Vacances','Formation','Congrès','Maladie','RTT','Rendez-vous médical'];
  const fromTxt = formatFR(slots[0].iso);
  const toTxt = formatFR(slots[slots.length-1].iso);
  box.innerHTML = `
    <h4>${isASV ? 'Demande de congé' : "Motif d'absence"} — ${person.short}<br><span class="text-muted" style="font-weight:500;font-size:12px;">${fromTxt}${slots.length>1?' → '+toTxt:''}</span></h4>
    ${isASV ? `<p class="text-muted" style="font-size:12px;margin:-4px 0 12px;">Sera soumise aux vétérinaires pour validation.</p>` : ''}
    <div class="popover-quicktags">
      ${quickTags.map(t=>`<button type="button" class="quicktag" data-tag="${escapeHTML(t)}">${t}</button>`).join('')}
    </div>
    <input type="text" id="absence-label-input" placeholder="Motif (ex. SKI TIGNES, GRÈCE...)" value="${escapeHTML(currentLabel)}" maxlength="40">
    ${slots.length>1 ? `<button type="button" class="btn btn-sm popover-split-btn" id="popover-split">🔓 Défusionner et vider ces ${slots.length} demi-journées</button>` : ''}
    <div class="popover-actions">
      <button class="btn btn-danger" id="popover-clear">Effacer</button>
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">${isASV ? 'Soumettre la demande' : 'Enregistrer'}</button>
    </div>
  `;
  backdrop.classList.add('open');
  const input = box.querySelector('#absence-label-input');
  input.focus(); input.select();
  box.querySelectorAll('.quicktag').forEach(tag=>{
    tag.addEventListener('click', ()=>{ input.value = tag.dataset.tag; input.focus(); });
  });
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-clear').onclick = ()=>{
    snapshotBeforeChange();
    slots.forEach(({iso,slot})=> setSlotState(iso, personId, slot, 'empty'));
    saveData();
    if(viewKey) renderCalendarView(viewKey);
    close();
  };
  box.querySelector('#popover-save').onclick = ()=>{
    snapshotBeforeChange();
    const label = input.value.trim();
    slots.forEach(({iso,slot})=> setSlotLabel(iso, personId, slot, label));
    propagateLabelAcrossSunday(personId, slots, label);
    saveData();
    if(isASV && typeof triggerPushNotification === 'function'){
      triggerPushNotification({
        type: 'leave_request',
        title: 'Nouvelle demande de congé',
        body: `${person.short} — ${fromTxt}${slots.length>1?' → '+toTxt:''}${label ? ' · '+label : ''}`,
        targetUsers: ['david','stephane'],
        data: { type:'leave_request' },
      });
    }
    if(viewKey) renderCalendarView(viewKey);
    close();
  };
  const splitBtn = box.querySelector('#popover-split');
  if(splitBtn){
    splitBtn.onclick = ()=>{
      snapshotBeforeChange();
      // La défusion purge entièrement chaque demi-journée (état + motif) plutôt que de
      // les laisser absentes avec le même texte répété sur chaque case éclatée.
      slots.forEach(({iso,slot})=> setSlotState(iso, personId, slot, 'empty'));
      saveData();
      if(viewKey) renderCalendarView(viewKey);
      close();
    };
  }
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
}

// --- Popover : commentaire de journée ---
function openDayCommentPopover(iso, viewKey){
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const current = getDayComment(iso);
  box.innerHTML = `
    <h4>💬 Commentaire — ${formatFR(iso)}</h4>
    <textarea id="day-comment-input" rows="3" placeholder="Ex. Réunion fournisseur, journée portes ouvertes...">${escapeHTML(current)}</textarea>
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  box.querySelector('#day-comment-input').focus();
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-save').onclick = ()=>{
    snapshotBeforeChange();
    setDayComment(iso, box.querySelector('#day-comment-input').value.trim());
    saveData();
    renderCalendarView(viewKey);
    close();
  };
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
}

// --- Popover : heures supplémentaires du jour, pour toutes les ASV à la fois (déclenché
// depuis la ligne "Heures supplémentaires" du calendrier ASV). ---
function openOvertimeDayPopover(iso, people, viewKey){
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const [y, m] = iso.split('-').map(Number);
  box.innerHTML = `
    <h4>⏱️ Ajustement d'heures<br><span class="text-muted" style="font-weight:500;font-size:12px;">${formatFR(iso)} — positif = heures sup, négatif = départ anticipé</span></h4>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
      ${people.map(p=>{
        const signed = isMonthSigned(p.id, y, m-1);
        const noRight = !canEditSlot(p.id);
        const readonly = signed || noRight;
        const readonlyTitle = signed ? 'Feuille de présence signée — verrouillée' : 'Lecture seule';
        return `
        <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:700;color:var(--color-text);">
          <span><span class="legend-swatch" style="background:${p.color};width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:middle;"></span>${p.short}${signed?' 🔒':''}</span>
          <input type="number" step="0.5" data-overtime-popover-input data-person="${p.id}" ${readonly?`disabled title="${readonlyTitle}"`:''}
            value="${getOvertimeHours(iso, p.id) || ''}" placeholder="0" style="width:80px;padding:7px 9px;border:1px solid var(--color-border);border-radius:6px;font-family:inherit;font-size:13px;${readonly?'opacity:0.55;':''}">
        </label>
      `;}).join('')}
    </div>
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-save').onclick = ()=>{
    snapshotBeforeChange();
    box.querySelectorAll('[data-overtime-popover-input]').forEach(input=>{
      if(input.disabled) return;
      setOvertimeHours(iso, input.dataset.person, input.value);
    });
    saveData();
    renderCalendarView(viewKey);
    close();
  };
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
}

// --- Sidebar : édition rapide de toute la journée ---
function sidebarPersonBlock(iso, person){
  const isASV = isASVPerson(person.id);
  const [sy, sm] = iso.split('-').map(Number);
  if(isASV && isMonthSigned(person.id, sy, sm-1)){
    return `
      <div class="sidebar-person-block">
        <div class="sidebar-person-title"><span class="legend-swatch" style="background:${person.color};width:11px;height:11px;border-radius:50%;display:inline-block;"></span>${person.name}</div>
        <p class="text-muted" style="font-size:12px;margin:8px 0 0;">🔒 Feuille de présence signée pour ce mois — verrouillée. Un vétérinaire peut annuler la signature depuis le Tableau de bord si besoin.</p>
      </div>
    `;
  }
  if(!canEditSlot(person.id)){
    // Lecture seule : afficher l'état sans permettre de le modifier
    const stateLabel = (s)=>({ empty:'Vide', present:'Présent', absent: isASV?'Congé':'Absent' }[s]||s);
    return `
      <div class="sidebar-person-block">
        <div class="sidebar-person-title"><span class="legend-swatch" style="background:${person.color};width:11px;height:11px;border-radius:50%;display:inline-block;"></span>${person.name}</div>
        <p class="text-muted" style="font-size:11px;margin:6px 0 8px;">Lecture seule</p>
        ${SLOTS.map(slot=>{
          const state = getSlotState(iso, person.id, slot);
          const label = getSlotLabel(iso, person.id, slot);
          return `<p style="font-size:12.5px;margin:4px 0;"><strong>${SLOT_LABELS[slot]} :</strong> ${stateLabel(state)}${label ? ` — ${escapeHTML(label)}` : ''}</p>`;
        }).join('')}
        ${(()=>{ const h = getOvertimeHours(iso, person.id); return h !== 0 ? `<p class="text-muted" style="font-size:12px;margin:6px 0 0;">Ajustement : ${signedHHMM(h)}</p>` : ''; })()}
      </div>
    `;
  }
  return `
    <div class="sidebar-person-block">
      <div class="sidebar-person-title"><span class="legend-swatch" style="background:${person.color};width:11px;height:11px;border-radius:50%;display:inline-block;"></span>${person.name}</div>
      ${SLOTS.map(slot=>{
        const state = getSlotState(iso, person.id, slot);
        const label = getSlotLabel(iso, person.id, slot);
        const decision = state==='absent' && isASV ? (getLeaveDecision(iso, person.id, slot) || 'pending') : null;
        const btnStyle = (s)=>{
          if(state!==s) return '';
          if(s==='present') return `background:${person.present.bg};border-color:${person.present.border};color:${person.present.text};`;
          if(s==='absent') return `background:var(--color-absent);border-color:var(--color-absent-border);color:var(--color-absent-text);`;
          return `background:var(--color-secondary);border-color:var(--color-text-muted);color:var(--color-text);`;
        };
        const decisionNote = decision === 'pending' ? `<p class="text-muted" style="font-size:11.5px;margin:6px 0 0;">⏳ En attente de validation</p>`
          : decision === 'rejected' ? `<p style="font-size:11.5px;margin:6px 0 0;color:var(--color-leave-rejected-text);">⚠️ Refusée${getLeaveDecisionComment(iso,person.id,slot) ? ' — '+escapeHTML(getLeaveDecisionComment(iso,person.id,slot)) : ''}</p>`
          : decision === 'approved' ? `<p class="text-muted" style="font-size:11.5px;margin:6px 0 0;">✓ Approuvée</p>`
          : '';
        return `
          <p class="text-muted" style="font-size:11.5px;margin:10px 0 5px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">${SLOT_LABELS[slot]}</p>
          <div class="sidebar-state-row">
            ${['empty','present','absent'].map(s=>`
              <button type="button" class="sidebar-state-btn ${state===s?'active':''}" style="${btnStyle(s)}"
                data-state-btn data-person="${person.id}" data-slot="${slot}" data-state="${s}">
                ${s==='empty'?'Vide':s==='present'?'Présent':(isASV?'Congé':'Absent')}
              </button>
            `).join('')}
          </div>
          ${state==='absent' ? `<input type="text" data-label-input data-person="${person.id}" data-slot="${slot}" value="${escapeHTML(label)}" placeholder="Motif">` : ''}
          ${decisionNote}
        `;
      }).join('')}
      ${isASV && canEditSlot(person.id) ? `
        <p class="text-muted" style="font-size:11.5px;margin:14px 0 5px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Ajustement d'heures (ce jour)</p>
        <p class="text-muted" style="font-size:11px;margin:0 0 6px;">+ heures supplémentaires &nbsp;/&nbsp; − départ anticipé</p>
        <input type="number" step="0.5" data-overtime-input data-person="${person.id}"
          value="${getOvertimeHours(iso, person.id) || ''}" placeholder="Ex. 1.5 ou -1">
      ` : isASV ? `
        ${(()=>{ const h = getOvertimeHours(iso, person.id); return h !== 0 ? `<p class="text-muted" style="font-size:12px;margin:10px 0 0;">Ajustement : ${signedHHMM(h)} (lecture seule)</p>` : ''; })()}
      ` : ''}
    </div>
  `;
}
function openDaySidebar(iso, viewKey){
  const people = store.CAL_VIEWS[viewKey].people;
  const overlay = document.getElementById('sidebar-overlay');
  const sidebar = document.getElementById('day-sidebar');
  const closeSidebar = ()=>{ overlay.classList.remove('open'); sidebar.classList.remove('open'); };
  const renderBody = ()=>{
    sidebar.innerHTML = `
      <div class="day-sidebar-head">
        <h3>✏️ ${formatFR(iso)}</h3>
        <button class="btn-icon" id="sidebar-close" aria-label="Fermer le panneau">✕</button>
      </div>
      <div class="day-sidebar-body">
        ${people.map(p=> sidebarPersonBlock(iso,p)).join('')}
        <div class="sidebar-person-block">
          <div class="sidebar-person-title">💬 Commentaire de la journée</div>
          <textarea id="sidebar-comment" rows="3" placeholder="Commentaire...">${escapeHTML(getDayComment(iso))}</textarea>
        </div>
      </div>
    `;
    sidebar.querySelector('#sidebar-close').onclick = closeSidebar;
    sidebar.querySelectorAll('[data-state-btn]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        snapshotBeforeChange();
        const { person:personId, slot, state } = btn.dataset;
        setSlotState(iso, personId, slot, state);
        if(state !== 'absent') setSlotLabel(iso, personId, slot, '');
        saveData();
        renderBody();
        renderCalendarView(viewKey);
      });
    });
    sidebar.querySelectorAll('[data-label-input]').forEach(input=>{
      input.addEventListener('change', ()=>{
        snapshotBeforeChange();
        setSlotLabel(iso, input.dataset.person, input.dataset.slot, input.value.trim());
        saveData();
        renderCalendarView(viewKey);
      });
    });
    sidebar.querySelectorAll('[data-overtime-input]').forEach(input=>{
      input.addEventListener('change', ()=>{
        snapshotBeforeChange();
        setOvertimeHours(iso, input.dataset.person, input.value);
        saveData();
        renderCalendarView(viewKey);
      });
    });
    sidebar.querySelector('#sidebar-comment').addEventListener('change', (e)=>{
      snapshotBeforeChange();
      setDayComment(iso, e.target.value.trim());
      saveData();
      renderCalendarView(viewKey);
    });
  };
  overlay.onclick = closeSidebar;
  renderBody();
  overlay.classList.add('open');
  sidebar.classList.add('open');
}

// --- Initialisation globale des interactions calendrier (délégation sur document) ---
function initCalendarInteractions(){
  // Les cases interactives sont désormais des .cal-wg-half (grille-semaine).
  // data-action="locked" bloque tous les handlers pour les mois signés / lecture seule.
  document.addEventListener('mousedown', (e)=>{
    const cell = e.target.closest('.cal-wg-half');
    if(!cell || cell.dataset.action) return;
    if(!canEditSlot(cell.dataset.person)) return;
    e.preventDefault();
    startDrag(cell);
  });
  document.addEventListener('mouseover', (e)=>{
    if(!dragCtx) return;
    const cell = e.target.closest('.cal-wg-half');
    if(cell && !cell.dataset.action && canEditSlot(cell.dataset.person)) enterDragCell(cell);
  });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchstart', (e)=>{
    const cell = e.target.closest('.cal-wg-half');
    if(!cell || cell.dataset.action) return;
    if(!canEditSlot(cell.dataset.person)) return;
    startDrag(cell);
  }, { passive:true });
  document.addEventListener('touchmove', (e)=>{
    if(!dragCtx) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = el && el.closest('.cal-wg-half');
    if(cell && !cell.dataset.action) enterDragCell(cell);
  }, { passive:true });
  document.addEventListener('touchend', endDrag);

  // Double-clic sur une colonne-jour (vue hebdomadaire) ou une cellule mensuelle ASV → vue semaine
  document.addEventListener('dblclick', (e)=>{
    // Vue hebdomadaire : colonne-jour entière
    const dayCol = e.target.closest('.cal-wg-day[data-date]');
    if(dayCol && currentView === 'asv' && store.subNavState.asv !== 'week'){
      if(!dayCol.classList.contains('cal-wg-day-we')){
        const iso = dayCol.dataset.date;
        if(iso){ store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(new Date(iso+'T00:00:00'))); switchSubPage('asv','week'); }
      }
      return;
    }
    // Vue mensuelle : cellule individuelle avec data-date
    const monthCell = e.target.closest('.cal-cell[data-date]');
    if(monthCell && currentView === 'asv' && (store.subNavState.asv === 'calendar' || store.subNavState.asv === 'forecast')){
      if(monthCell.classList.contains('sunday-cell')) return;
      const iso = monthCell.dataset.date;
      if(!iso) return;
      const d = new Date(iso+'T00:00:00');
      if(d.getDay() === 0) return; // dimanche
      const personId = monthCell.dataset.person;
      if(personId) store.weekNavState.personId = personId;
      store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(d));
      switchSubPage('asv', 'week');
    }
  });

  document.addEventListener('contextmenu', (e)=>{
    const cell = e.target.closest('.cal-wg-half');
    if(!cell || cell.dataset.action) return;
    if(!canEditSlot(cell.dataset.person)) return;
    e.preventDefault();
    if(dragCtx){ clearTimeout(dragCtx.longPressTimer); dragCtx = null; }
    openAbsenceLabelPopover(cell, true);
  });

  document.addEventListener('keydown', (e)=>{
    const cell = e.target.closest && e.target.closest('.cal-wg-half');
    if(!cell) return;
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      if(cell.dataset.action){
        // Case verrouillée : ne rien faire
      } else if(!canEditSlot(cell.dataset.person)){
        // Lecture seule
      } else {
        cycleCellAndSave(cell);
      }
    }
  });

  // Boutons paint-tool (sélection de l'outil de peinture mensuelle)
  document.addEventListener('click', (e)=>{
    const paintBtn = e.target.closest('.paint-tool');
    if(paintBtn && paintBtn.dataset.paint){
      store.calMonthPaintMode = paintBtn.dataset.paint;
      document.querySelectorAll('.paint-tool').forEach(b=>b.classList.toggle('active', b.dataset.paint===store.calMonthPaintMode));
      return;
    }
  });

  // Badge d'alertes semaine → popup détail
  document.addEventListener('click', (e)=>{
    const alertBtn = e.target.closest('.week-alert-btn');
    if(!alertBtn) return;
    const pid = alertBtn.dataset.alertPerson;
    const als = JSON.parse(alertBtn.dataset.alerts || '[]');
    const person = personOf(pid);
    const backdrop = document.getElementById('popover-backdrop');
    const box = document.getElementById('popover-box');
    box.innerHTML = `
      <div class="popover-title">⚠️ Alertes semaine — ${escapeHTML(person?.short || pid)}</div>
      <ul style="margin:8px 0 16px;padding-left:20px;font-size:13px;line-height:1.9;">
        ${als.map(a=>`<li style="color:#DC2626;font-weight:600;">${escapeHTML(a)}</li>`).join('')}
      </ul>
      <div class="popover-actions"><button class="btn" id="popover-cancel">Fermer</button></div>
    `;
    backdrop.classList.add('open');
    box.querySelector('#popover-cancel').onclick = ()=> backdrop.classList.remove('open');
  });

  // Sélection outil semaine (Départ anticipé / H.supp.)
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('.week-tool-btn');
    if(!btn || !btn.dataset.weekTool) return;
    store.weekNavState.weekTool = btn.dataset.weekTool;
    renderWeekViewASV();
  });

  // Clic sur cellule après-midi → départ anticipé
  document.addEventListener('click', (e)=>{
    const cell = e.target.closest('.week-am-cell[data-am-iso]');
    if(!cell) return;
    openEarlyDepPicker(cell.dataset.amIso, cell.dataset.amPid);
  });

  // Drag sur les slots H.supp.
  const otDragCtx = { active:false, iso:null, pid:null, zone:'evening', startSlot:0, curSlot:0, _preview:0 };
  function otApplyDrag(slot){
    if(!otDragCtx.active) return;
    otDragCtx.curSlot = slot;
    const maxSlot = Math.max(otDragCtx.startSlot, slot);
    document.querySelectorAll(`.week-ot-slot[data-ot-iso="${otDragCtx.iso}"][data-ot-zone="${otDragCtx.zone}"]`).forEach(el=>{
      el.classList.toggle('drag-preview', parseInt(el.dataset.otSlot,10) <= maxSlot);
    });
    otDragCtx._preview = maxSlot + 1;
  }
  document.addEventListener('mousedown', (e)=>{
    const slot = e.target.closest('.week-ot-slot.interactive');
    if(!slot) return;
    e.preventDefault();
    otDragCtx.active = true;
    otDragCtx.iso = slot.dataset.otIso;
    otDragCtx.pid = slot.dataset.otPid;
    otDragCtx.zone = slot.dataset.otZone || 'evening';
    otDragCtx.startSlot = parseInt(slot.dataset.otSlot, 10);
    otDragCtx.curSlot = otDragCtx.startSlot;
    otDragCtx._preview = otDragCtx.startSlot + 1;
    otApplyDrag(otDragCtx.startSlot);
  });
  document.addEventListener('mousemove', (e)=>{
    if(!otDragCtx.active) return;
    const slot = e.target.closest('.week-ot-slot.interactive');
    if(slot && slot.dataset.otIso === otDragCtx.iso && slot.dataset.otZone === otDragCtx.zone)
      otApplyDrag(parseInt(slot.dataset.otSlot, 10));
  });
  document.addEventListener('mouseup', ()=>{
    if(!otDragCtx.active) return;
    otDragCtx.active = false;
    const newMins = (otDragCtx._preview || 0) * 15;
    snapshotBeforeChange();
    if(otDragCtx.zone === 'lunch') setLunchOtMins(otDragCtx.iso, otDragCtx.pid, newMins);
    else setWeekOtMins(otDragCtx.iso, otDragCtx.pid, newMins);
    saveData();
    renderWeekViewASV();
  });

  document.addEventListener('click', (e)=>{
    const viewKey = calViewKeyOfEventTarget(e.target);
    if(!viewKey) return;

    if(e.target.id === `cal-prev-${viewKey}`) return changeMonth(viewKey, -1);
    if(e.target.id === `cal-next-${viewKey}`) return changeMonth(viewKey, 1);
    if(e.target.id === `cal-today-${viewKey}`) return goToToday(viewKey);
    if(e.target.id === `cal-clear-month-${viewKey}`){
      openClearMonthModal(viewKey, store.CAL_VIEWS[viewKey].navState.month);
      return;
    }
    if(e.target.id === `cal-undo-${viewKey}`) return undoLastAction();
    if(e.target.id === `cal-print-${viewKey}`) return openMonthPrintPopup(viewKey);

    const commentBtn = e.target.closest('[data-action="comment"]');
    if(commentBtn){ openDayCommentPopover(commentBtn.dataset.date, viewKey); return; }

    const editBtn = e.target.closest('[data-action="edit-day"]');
    if(editBtn){ openDaySidebar(editBtn.dataset.date, viewKey); return; }

    const overtimeBtn = e.target.closest('[data-action="overtime-day"]');
    if(overtimeBtn){ openOvertimeDayPopover(overtimeBtn.dataset.date, store.CAL_VIEWS[viewKey].people, viewKey); return; }
  });
}

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
