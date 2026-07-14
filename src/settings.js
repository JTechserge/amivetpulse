import {
  PEOPLE, ASV_PEOPLE, allPeople, ASV_DEFAULT_COLOR_PALETTE,
  SUPABASE_URL, SUPABASE_FUNCTIONS_URL, CALENDAR_FEED_URL,
  STORAGE_KEY, personOf,
} from './config.js';
import {
  escapeHTML, slugifyName, colorRejectReason,
  fmtISO, formatHHMM, formatNum,
} from './utils.js';
import { store } from './store.js';
import { showToast, applyPersonColorVars, openConfirmModal } from './ui.js';
import { supabaseHeaders, getAuthSession, authUpdatePassword } from './auth.js';
import { reindexPresentShades, saveASVRoster, savePersonColors } from './state.js';
import { pushDataToSupabase } from './api.js';
import { openNotificationSettingsModal } from './pwa.js';
import { renderLoginScreen } from './login.js';
import { renderCalendarView } from './calendar.js';

// ── Callbacks injectés (fonctions/état restés dans app.js) ──────
let _saveData, _renderCurrentView, _snapshotBeforeChange;
let _canAccessSettings, _effectiveRole, _applyRoleToDOM, _openASVImpersonationPicker;
let _authSignOut, _authRefreshSession, _buildCalViews, _activeCalendarViewKey;

function setupSettings({
  saveData, renderCurrentView, snapshotBeforeChange,
  canAccessSettings, effectiveRole, applyRoleToDOM, openASVImpersonationPicker,
  authSignOut, authRefreshSession, buildCalViews, activeCalendarViewKey,
}) {
  _saveData = saveData;
  _renderCurrentView = renderCurrentView;
  _snapshotBeforeChange = snapshotBeforeChange;
  _canAccessSettings = canAccessSettings;
  _effectiveRole = effectiveRole;
  _applyRoleToDOM = applyRoleToDOM;
  _openASVImpersonationPicker = openASVImpersonationPicker;
  _authSignOut = authSignOut;
  _authRefreshSession = authRefreshSession;
  _buildCalViews = buildCalViews;
  _activeCalendarViewKey = activeCalendarViewKey;
}

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

function _setASVTimeFraction(personId, fraction){
  const p = ASV_PEOPLE.find(x=> x.id === personId);
  if(p){ p.timeFraction = fraction; saveASVRoster(); }
}

function addASVPerson(name, lastName=''){
  name = (name || '').trim();
  if(!name) return null;
  const person = {
    id: uniqueASVId(slugifyName(name)),
    name, short:name,
    initial: name.slice(0,2).toUpperCase(),
    color: pickDefaultASVColor(),
    present: null,
    ...(lastName ? { lastName: lastName.trim() } : {}),
  };
  ASV_PEOPLE.push(person);
  reindexPresentShades();
  saveASVRoster();
  savePersonColors();
  applyPersonColorVars();
  return person;
}

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
  // eslint-disable-next-line no-unsanitized/property
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
    _renderCurrentView();
    close();
    showToast('Couleurs appliquées', '🎨');
  };
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
}

function openChangeMyPasswordModal(){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  // eslint-disable-next-line no-unsanitized/property
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

    // eslint-disable-next-line no-unsanitized/property
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
          <input type="text" id="invite-name" placeholder="Prénom (affiché)" style="padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
          <input type="email" id="invite-email" placeholder="Email" style="padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
          <select id="invite-role" style="padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;">
            <option value="vet">Vétérinaire</option>
            <option value="asv">ASV</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div id="invite-lastname-row" style="display:none;margin-bottom:8px;">
          <input type="text" id="invite-lastname" placeholder="Nom de famille (facultatif — pour les PDF signés)" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;box-sizing:border-box;">
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
    const inviteLastnameRow = box.querySelector('#invite-lastname-row');
    const updateInviteTf = ()=>{
      const isAsv = inviteRoleSel.value === 'asv';
      inviteTfRow.style.display = isAsv ? 'block' : 'none';
      inviteLastnameRow.style.display = isAsv ? 'block' : 'none';
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
              store.CAL_VIEWS = _buildCalViews();
              renderCalendarView(_activeCalendarViewKey()||'asv-current');
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
            store.CAL_VIEWS = _buildCalViews();
            renderCalendarView(_activeCalendarViewKey()||'asv-current');
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
            const inviteLastName = (box.querySelector('#invite-lastname')?.value || '').trim();
            const existing = ASV_PEOPLE.find(p=> p.name.trim().toLowerCase() === name.trim().toLowerCase() && !linkedPersonIds.has(p.id));
            const asvPerson = existing || addASVPerson(name, inviteLastName);
            if(existing && inviteLastName){ existing.lastName = inviteLastName; saveASVRoster(); }
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
    // eslint-disable-next-line no-unsanitized/property
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

function wireTimeFractionUI(box, _personId){
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
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  const isAdmin = store.currentUser?.role === 'admin';
  const personId = user.person_id;

  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3>Modifier ${escapeHTML(user.display_name||user.email||'collaborateur')}</h3>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:4px;">Nom affiché / prénom</label>
        <input type="text" id="edit-display-name" value="${escapeHTML(user.display_name||'')}" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;box-sizing:border-box;">
      </div>
      ${personId && user.role === 'asv' ? `<div>
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:4px;">Nom de famille (facultatif — pour les PDF signés)</label>
        <input type="text" id="edit-lastname" value="${escapeHTML(personOf(personId)?.lastName||'')}"
          placeholder="ex. Martin"
          style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:7px;font-size:13px;font-family:inherit;box-sizing:border-box;">
      </div>` : ''}
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
        const lastNameInput = box.querySelector('#edit-lastname');
        const tfResult = getTimeFractionFromUI(box);
        const p = personOf(personId);
        if(p){
          if(lastNameInput !== null) p.lastName = lastNameInput.value.trim() || undefined;
          if(tfResult){ p.timeFraction = tfResult.fraction; p.workingDays = tfResult.workingDays; }
          saveASVRoster();
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
      title:`Réinitialiser le compte de ${user.display_name||user.email||'ce collaborateur'} ?`,
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
          showToast(`Compte de ${user.display_name||user.email||'ce profil'} supprimé — planning conservé`, '✅');
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
      if(res.status === 401){ await _authRefreshSession(); res = await fetch(`${SUPABASE_FUNCTIONS_URL}manage-users`, { method:'POST', headers:supabaseHeaders({'Content-Type':'application/json'}), body:JSON.stringify({ action:'send_access_email', user_id:userId, type }) }); }
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

const CALENDAR_SYNC_COLORS = ['#0F766E','#2563EB','#7C3AED','#DC2626','#16A34A','#EA580C'];

async function getCalendarSyncStatus(personId){
  const res = await fetch(`${SUPABASE_URL}rpc/get_calendar_sync_status`, {
    method:'POST',
    headers: supabaseHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ p_person_id: personId }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return rows[0] || { has_token:false, sync_presence:true, sync_absences:true, color:CALENDAR_SYNC_COLORS[0] };
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
  const active = !!status.has_token;
  const statusEl = box.querySelector(`#cal-sync-status-${person.id}`);
  statusEl.textContent = active ? '✅ Active' : '⬜ Non activée';
  const bodyEl = box.querySelector(`#cal-sync-body-${person.id}`);
  const prefsHtml = calendarSyncPreferencesHtml(person, status);
  if(active){
    // eslint-disable-next-line no-unsanitized/property
    bodyEl.innerHTML = `
      ${prefsHtml}
      ${link ? `
        <input type="text" readonly value="${escapeHTML(link)}" style="width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:6px;font-size:11.5px;font-family:inherit;margin-bottom:8px;" onclick="this.select();">
        <div class="flex gap-2">
          <button type="button" class="btn" data-copy-link style="flex:1;justify-content:center;font-size:12.5px;">Copier le lien</button>
          <button type="button" class="btn" data-revoke style="flex:1;justify-content:center;font-size:12.5px;color:#B91C1C;border-color:#FCA5A5;">Désactiver</button>
        </div>
      ` : `
        <p class="text-muted" style="font-size:11.5px;margin-bottom:8px;">Lien actif. Pour afficher et copier l'URL (ex. : ajout sur un nouveau téléphone), régénérez un nouveau lien — l'ancien sera automatiquement invalidé.</p>
        <div class="flex gap-2">
          <button type="button" class="btn btn-primary" data-generate style="flex:1;justify-content:center;font-size:12.5px;">Régénérer le lien</button>
          <button type="button" class="btn" data-revoke style="flex:1;justify-content:center;font-size:12.5px;color:#B91C1C;border-color:#FCA5A5;">Désactiver</button>
        </div>
      `}
      <p class="text-muted" style="font-size:11px;margin-top:6px;">Le même lien peut être ajouté à plusieurs téléphones/comptes. "Désactiver" coupe l'accès à tous d'un coup ; les événements déjà ajoutés disparaissent au prochain rafraîchissement automatique de chaque appareil (pas instantané — ni Apple ni Google ne permettent de forcer une suppression immédiate à distance).</p>
    `;
    wireCalendarSyncPreferences(bodyEl, person, status);
    if(link){
      bodyEl.querySelector('[data-copy-link]').onclick = ()=>{
        navigator.clipboard?.writeText(link);
        showToast('Lien copié', '📋');
      };
    } else {
      bodyEl.querySelector('[data-generate]').onclick = async ()=>{
        const token = await generateCalendarSyncToken(person.id);
        const newLink = `${CALENDAR_FEED_URL}?person=${person.id}&token=${token}`;
        renderCalendarSyncPersonBody(box, person, { ...status, has_token:true }, newLink);
        showToast(`Nouveau lien généré pour ${person.short}`, '📅');
      };
    }
    bodyEl.querySelector('[data-revoke]').onclick = async ()=>{
      await revokeCalendarSyncToken(person.id);
      renderCalendarSyncPersonBody(box, person, { ...status, has_token:false }, '');
      showToast(`Synchronisation de ${person.short} désactivée`, '📅');
    };
  } else {
    // eslint-disable-next-line no-unsanitized/property
    bodyEl.innerHTML = `
      ${prefsHtml}
      <button type="button" class="btn btn-primary" data-generate style="width:100%;justify-content:center;font-size:12.5px;">Générer mon lien</button>
    `;
    wireCalendarSyncPreferences(bodyEl, person, status);
    bodyEl.querySelector('[data-generate]').onclick = async ()=>{
      const token = await generateCalendarSyncToken(person.id);
      const newLink = `${CALENDAR_FEED_URL}?person=${person.id}&token=${token}`;
      renderCalendarSyncPersonBody(box, person, { ...status, has_token:true }, newLink);
      showToast(`Lien généré pour ${person.short}`, '📅');
    };
  }
}

function openCalendarSyncModal(){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box modal-box-wide';
  // eslint-disable-next-line no-unsanitized/property
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
      renderCalendarSyncPersonBody(box, person, status, '');
    }).catch(e=>{
      box.querySelector(`#cal-sync-status-${person.id}`).textContent = 'Connexion impossible';
      console.warn(e);
    });
  });
}

function buildSettingsMenuHtml(){
  const isVet = _canAccessSettings();
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
  // eslint-disable-next-line no-unsanitized/property
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

  if(_canAccessSettings()){
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
          _snapshotBeforeChange(); store.DATA = parsed; _saveData(false); _renderCurrentView();
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
        _applyRoleToDOM();
        initSettingsMenu();
        _renderCurrentView();
        showToast('Retour à la vue Vétérinaires', '👁');
      } else {
        // Passer en mode ASV → choisir qui imiter
        _openASVImpersonationPicker();
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
    await _authSignOut();
    renderLoginScreen();
  });
}

function openHelpModal(){
  const isAsv = _effectiveRole() === 'asv';
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

  // eslint-disable-next-line no-unsanitized/property
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
    // eslint-disable-next-line no-unsanitized/property
    content.innerHTML = item.content;
    root.querySelector('#ho-section-label').textContent = item.label;
    content.scrollTop = 0;
    if(item.id === 'faq'){
      const list = content.querySelector('#ho-faq-list');
      // eslint-disable-next-line no-unsanitized/property
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

export {
  setupSettings, openManageUsersModal, openEditUserModal, openColorPickerModal,
  openChangeMyPasswordModal, openCalendarSyncModal, buildSettingsMenuHtml,
  updateHeaderUsername, initSettingsMenu, openHelpModal,
};
