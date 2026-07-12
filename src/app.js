'use strict';
/* ================================================================
   AMIVET PLANNING — Application JS (vanilla ES2022, sans dépendance)
   ================================================================ */

/* ----------------------------------------------------------------
   1. CONSTANTES & ÉTAT GLOBAL
   ---------------------------------------------------------------- */
// 3 nuances de vert partagées, attribuées par position : les 2 associés utilisent les 2
// premières, les 3 ASV les 3 — assez proches pour rester clairement "vert" (jour travaillé)
// au premier coup d'œil, mais distinctes pour différencier les personnes dans une même vue.
const PRESENT_SHADES = [
  { bg:'#86EFAC', border:'#4ADE80', text:'#14532D' }, // vert
  { bg:'#A7F3D0', border:'#34D399', text:'#064E3B' }, // émeraude
  { bg:'#BEF264', border:'#A3E635', text:'#3F6212' }, // vert tilleul
];
const PEOPLE = [
  { id:'david',    name:'Dr. David Pelois',     short:'David',    color:'#2563EB', initial:'D', present:PRESENT_SHADES[0] },
  { id:'stephane', name:'Dr. Stéphane Maquinay', short:'Stéphane', color:'#7C3AED', initial:'S', present:PRESENT_SHADES[1] },
];
const ASV_PEOPLE = [
  { id:'marie',    name:'Marie',    short:'Marie',    color:'#DB2777', initial:'M',  present:PRESENT_SHADES[0], timeFraction:1.0 },
  { id:'johanna',  name:'Johanna',  short:'Johanna',  color:'#EA580C', initial:'Jo', present:PRESENT_SHADES[1], timeFraction:1.0 },
  { id:'julie',    name:'Julie',    short:'Julie',    color:'#059669', initial:'Ju', present:PRESENT_SHADES[2], timeFraction:0.75 },
  { id:'carla',   name:'Carla',   short:'Carla',   color:'#0EA5E9', initial:'Ca', present:PRESENT_SHADES[3], timeFraction: 7.25/35, saturdayOnly:true },
];
// Fonction plutôt que tableau figé : ASV_PEOPLE peut être modifié en place (ajout/retrait
// d'une ASV depuis le tableau de bord), donc on recalcule à chaque appel pour ne jamais
// servir une liste périmée.
function allPeople(){ return [...PEOPLE, ...ASV_PEOPLE]; }

// ----------------------------------------------------------------
// Constantes Module CP (Congés Payés)
// ----------------------------------------------------------------
const CP_DAYS_PER_MONTH = 2.5;      // jours ouvrables acquis par mois travaillé
const CP_REFERENCE_START_MONTH = 0; // janvier = index 0 (période 1 janv. N → 31 déc. N)

// ----------------------------------------------------------------
// Constantes Module Annonces
// ----------------------------------------------------------------
const ANNONCE_CATEGORIES = {
  urgent:  { label:'Urgent',  color:'#DC2626', bg:'#FEF2F2', border:'#FECACA', icon:'🚨' },
  meeting: { label:'Réunion', color:'#7C3AED', bg:'#EDE9FE', border:'#DDD6FE', icon:'🗓️' },
  task:    { label:'Tâche',   color:'#D97706', bg:'#FEF3C7', border:'#FDE68A', icon:'✅' },
  info:    { label:'Info',    color:'#0369A1', bg:'#EFF6FF', border:'#BFDBFE', icon:'ℹ️' },
};

// ----------------------------------------------------------------
// Effectif ASV dynamique — ajout/retrait depuis le tableau de bord. ASV_PEOPLE est mutée
// en place (push/splice) plutôt que réassignée : tout le reste de l'app (CAL_VIEWS,
// GROUP_VIEWS, etc.) garde une référence vers ce même tableau, donc une mutation se
// répercute automatiquement partout sans devoir reconstruire ces registres.
const ASV_ROSTER_KEY = 'amivet_asv_roster';
const ASV_DEFAULT_COLOR_PALETTE = ['#DB2777','#EA580C','#059669','#0EA5E9','#D946EF','#4F46E5','#0D9488','#DC2626'];
function slugifyName(name){
  const lower = name.toLowerCase().normalize('NFD');
  let stripped = '';
  for(const ch of lower){
    const code = ch.codePointAt(0);
    if(code >= 0x0300 && code <= 0x036f) continue; // diacritique combinant : ignoré
    stripped += ch;
  }
  return stripped.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'asv';
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
// Réattribue les nuances de vert "présent" par position : nécessaire après chaque
// ajout/retrait pour que le 1er, 2e, 3e... de la liste gardent des teintes cohérentes.
function reindexPresentShades(){
  ASV_PEOPLE.forEach((p,i)=> p.present = PRESENT_SHADES[i % PRESENT_SHADES.length]);
}
function saveASVRoster(){
  localStorage.setItem(ASV_ROSTER_KEY, JSON.stringify(ASV_PEOPLE.map(p=>({ id:p.id, name:p.name, short:p.short, initial:p.initial, color:p.color, timeFraction:p.timeFraction ?? 1.0, archived:p.archived ?? false, saturdayOnly:p.saturdayOnly ?? false }))));
}
function loadASVRoster(){
  try{
    const raw = localStorage.getItem(ASV_ROSTER_KEY);
    if(raw){
      const saved = JSON.parse(raw);
      if(Array.isArray(saved) && saved.length){
        ASV_PEOPLE.length = 0;
        saved.forEach(p=> ASV_PEOPLE.push({ id:p.id, name:p.name, short:p.short, initial:p.initial, color:p.color, present:null, timeFraction:p.timeFraction ?? 1.0, archived:p.archived ?? false, saturdayOnly:p.saturdayOnly ?? false }));
        // Fusionner Carla si absente des données sauvegardées (migration)
        if(!ASV_PEOPLE.find(p=>p.id==='carla')){
          ASV_PEOPLE.push({ id:'carla', name:'Carla', short:'Carla', color:'#0EA5E9', initial:'Ca', present:null, timeFraction:7.25/35, saturdayOnly:true });
          saveASVRoster();
        }
      }
    }
  }catch(e){ console.warn('Effectif ASV personnalisé illisible, valeurs par défaut conservées.', e); }
  reindexPresentShades();
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
// Archive une ASV : la ligne reste dans le calendrier mais devient grisée et en lecture
// seule pour tout le monde. Les données de présence sont conservées.
function archiveASVPerson(id){
  const p = ASV_PEOPLE.find(x=>x.id===id);
  if(!p) return;
  p.archived = true;
  reindexPresentShades();
  saveASVRoster();
}
function unarchiveASVPerson(id){
  const p = ASV_PEOPLE.find(x=>x.id===id);
  if(!p) return;
  p.archived = false;
  reindexPresentShades();
  saveASVRoster();
}

const SLOTS = ['M','AM'];
const SLOT_LABELS = { M:'Matin', AM:'Après-midi' };
const YEARS = [2026, 2027];
const STORAGE_KEY = 'amivet_planning_data';
const PERSON_COLORS_KEY = 'amivet_person_colors';
const VIEW_STATE_KEY = 'amivet_view_state';

/* ----------------------------------------------------------------
   1bis. COULEURS PERSONNALISABLES DES ASSOCIÉS
   ---------------------------------------------------------------- */
// Convertit un hex #rrggbb en teinte/saturation/luminosité (0-360 / 0-100 / 0-100)
function hexToHsl(hex){
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (max+min)/2;
  const d = max-min;
  if(d !== 0){
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h = ((g-b)/d) % 6; break;
      case g: h = (b-r)/d + 2; break;
      default: h = (r-g)/d + 4;
    }
    h *= 60;
    if(h < 0) h += 360;
  }
  return { h, s: s*100, l: l*100 };
}
// Renvoie une raison de refus si la couleur empiète sur les codes de statut désormais
// généralisés (présent=vert, congé validé=rouge, congé en attente=bleu foncé, vide=blanc),
// ou null si la couleur est autorisée. S'applique à n'importe quelle personne (vétérinaire
// ou ASV) puisque ces codes ne dépendent plus de l'identité de la personne.
function colorRejectReason(hex){
  if(!/^#[0-9a-fA-F]{6}$/.test(hex)) return 'couleur invalide.';
  const { h, s, l } = hexToHsl(hex);
  if(l > 92) return 'trop proche du blanc (réservé aux demi-journées vides).';
  if(s > 25 && (h <= 15 || h >= 345)) return 'trop proche du rouge (réservé aux congés validés).';
  if(s > 25 && (h >= 75 && h <= 160)) return 'trop proche du vert (réservé aux jours travaillés).';
  if(s > 25 && (h >= 200 && h <= 250)) return 'trop proche du bleu foncé (réservé aux congés en attente).';
  if(s > 25 && (h >= 40 && h <= 65)) return 'trop proche du jaune (réservé aux jours fériés).';
  return null;
}
function applyPersonColorVars(){
  allPeople().forEach(p=> document.documentElement.style.setProperty(`--color-${p.id}`, p.color));
}
function savePersonColors(){
  const colors = {};
  allPeople().forEach(p=> colors[p.id] = p.color);
  localStorage.setItem(PERSON_COLORS_KEY, JSON.stringify(colors));
}
function loadPersonColors(){
  try{
    const raw = localStorage.getItem(PERSON_COLORS_KEY);
    if(raw){
      const colors = JSON.parse(raw);
      allPeople().forEach(p=>{ if(colors[p.id]) p.color = colors[p.id]; });
    }
  }catch(e){ console.warn('Couleurs personnalisées illisibles, valeurs par défaut conservées.', e); }
  applyPersonColorVars();
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
    <p>Choisissez un nouveau mot de passe pour votre compte <strong>${escapeHTML(currentUser?.email||'')}</strong>.</p>
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

    const isAdmin = currentUser?.role === 'admin';
    const linkedPersonIds = new Set(users.map(u=>u.person_id).filter(Boolean));
    const localOnlyASV = ASV_PEOPLE.filter(p=> !p.archived && !linkedPersonIds.has(p.id));
    const localOnlyVets = PEOPLE.filter(p=> !linkedPersonIds.has(p.id) && !users.some(u=> (u.display_name||'').toLowerCase().includes(p.short.toLowerCase()) || (u.display_name||'').toLowerCase().includes(p.name.toLowerCase())));
    const localOnlyPeople = [
      ...localOnlyVets.map(p=>({ ...p, localRole:'vet', roleLabel:'Vétérinaire' })),
      ...localOnlyASV.map(p=>({ ...p, localRole:'asv', roleLabel:'ASV' })),
    ];

    const rows = users.map(u=>`<tr>
        <td style="font-weight:600;">${escapeHTML(u.display_name||'—')}</td>
        <td style="font-size:12px;color:var(--color-text-muted);">${roleLabels[u.role]||u.role||'—'}</td>
        <td style="font-size:12px;color:var(--color-text-muted);">${escapeHTML(u.email||'—')}</td>
        <td style="font-size:12px;text-align:center;">${u.can_edit_vet_calendar ? '✅' : '—'}</td>
        <td style="font-size:12px;text-align:center;">${u.can_edit_all_asv ? '✅' : '—'}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" data-edit-user="${u.id}" style="font-size:11.5px;padding:4px 8px;margin-right:4px;">Modifier</button>
          <button class="btn btn-sm" data-delete-user="${u.id}" data-delete-name="${escapeHTML(u.display_name||u.email||u.id)}" style="font-size:11.5px;padding:4px 8px;color:#B91C1C;border-color:#FCA5A5;" title="Supprimer le compte uniquement">🗑️</button>
          ${isAdmin ? `<button class="btn btn-sm" data-purge-user="${u.id}" data-purge-person="${u.person_id||''}" data-purge-name="${escapeHTML(u.display_name||u.email||u.id)}" style="font-size:11.5px;padding:4px 8px;margin-left:4px;color:#FFFFFF;background:#B91C1C;border-color:#B91C1C;" title="Suppression définitive — efface toutes les données">💣</button>` : ''}
        </td>
      </tr>`).join('');

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
        <p id="invite-error" style="color:#B91C1C;font-size:12px;display:none;margin:4px 0 0;"></p>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn" id="modal-cancel">Fermer</button>
          <button class="btn btn-primary" id="invite-btn">📧 Envoyer l'invitation</button>
        </div>
      </div>
    `;

    box.querySelector('#modal-cancel').onclick = close;
    backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };

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
                Object.keys(DATA.slots).filter(k=> k.includes(`_${personId}_`) || k.endsWith(`_${personId}`))
                  .forEach(k=> delete DATA.slots[k]);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
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
              CAL_VIEWS = buildCalViews();
              renderCalendarView(currentCalViewKey||'asv-current');
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
            Object.keys(DATA.slots).filter(k=> k.includes(`_${personId}_`) || k.endsWith(`_${personId}`))
              .forEach(k=> delete DATA.slots[k]);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
            pushDataToSupabase();
            const asvIdx = ASV_PEOPLE.findIndex(p=> p.id === personId);
            if(asvIdx !== -1){ ASV_PEOPLE.splice(asvIdx,1); reindexPresentShades(); saveASVRoster(); }
            showToast(`${name} retiré(e) du planning`, '🗑️');
            CAL_VIEWS = buildCalViews();
            renderCalendarView(currentCalViewKey||'asv-current');
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

function openEditUserModal(userId, users, onBack){
  const user = users.find(u=>u.id===userId);
  if(!user) return;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';

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
      <div style="border-top:1px solid var(--color-border);padding-top:12px;">
        <label class="text-muted" style="font-size:12px;display:block;margin-bottom:8px;">Accès au compte</label>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="edit-send-invite" style="font-size:12px;">📧 Renvoyer l'invitation</button>
          <button class="btn" id="edit-send-reset" style="font-size:12px;">🔑 Réinitialiser le mot de passe</button>
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

  box.querySelector('#edit-back').onclick = ()=> onBack();
  box.querySelector('#edit-save').onclick = async ()=>{
    const displayName = box.querySelector('#edit-display-name').value.trim();
    const email = box.querySelector('#edit-email').value.trim();
    const role = box.querySelector('#edit-role').value;
    const canVet = box.querySelector('#edit-vet-cal').checked;
    const canAsv = box.querySelector('#edit-all-asv').checked;
    const errEl = box.querySelector('#edit-error');
    if(!displayName){ errEl.textContent='Le nom est requis.'; errEl.style.display='block'; return; }
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
      showToast('Collaborateur mis à jour', '✅');
      onBack();
    }catch(e){
      errEl.textContent=e.message; errEl.style.display='block';
      box.querySelector('#edit-save').disabled = false;
    }
  };

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

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTH_SHORT = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const WEEKDAY_NAMES = ['Lu','Ma','Me','Je','Ve','Sa','Di']; // lundi = 0

// État de navigation par vue calendrier (mois affiché courant par année)
const today = new Date();

// ----------------------------------------------------------------
// Année "courante" / "prévisionnelle" — dynamiques plutôt que des littéraux figés, pour
// que la bascule annuelle (voir performYearRollover) continue de fonctionner toute seule
// chaque 1er janvier sans jamais avoir besoin de retoucher le code.
// ----------------------------------------------------------------
const CURRENT_YEAR_KEY = 'amivet_current_year';
function getCurrentYear(){
  const stored = parseInt(localStorage.getItem(CURRENT_YEAR_KEY), 10);
  return Number.isInteger(stored) ? stored : 2026;
}
function setCurrentYear(y){ localStorage.setItem(CURRENT_YEAR_KEY, String(y)); }

const calStateCurrent = { month: today.getFullYear() === getCurrentYear() ? today.getMonth() : 0 };
const calStateForecast = { month: 0 };
const calStateAsvCurrent = { month: today.getFullYear() === getCurrentYear() ? today.getMonth() : 0 };
const calStateAsvForecast = { month: 0 };

// Registre central des vues "calendrier mensuel" : chacune sait sur quelle année réelle
// elle travaille (cfg.year), quelles personnes afficher (cfg.people, en lignes) et quel
// état de navigation (mois affiché) lui appartient. Reconstruit après chaque bascule
// d'année (performYearRollover) puisque cfg.year doit alors changer.
function buildCalViews(){
  const cy = getCurrentYear();
  return {
    'vets-current':  { year:cy,   people:PEOPLE,     navState:calStateCurrent,     todayNav:true,  forecast:false, label:'Vétérinaires', containerId:'vets-sub-calendar', printable:false },
    'vets-forecast': { year:cy+1, people:PEOPLE,     navState:calStateForecast,    todayNav:false, forecast:true,  label:'Vétérinaires', containerId:'vets-sub-forecast', printable:false },
    'asv-current':   { year:cy,   people:ASV_PEOPLE, navState:calStateAsvCurrent,  todayNav:true,  forecast:false, label:'ASV',          containerId:'asv-sub-calendar',  printable:true },
    'asv-forecast':  { year:cy+1, people:ASV_PEOPLE, navState:calStateAsvForecast, todayNav:false, forecast:true,  label:'ASV',           containerId:'asv-sub-forecast',  printable:true },
  };
}
let CAL_VIEWS = buildCalViews();
const dashState = { year: getCurrentYear() };

// Onglets groupés (Vétérinaires / ASV) : chacun a 3 sous-pages (calendrier mensuel / vue
// annuelle / prévisionnel). subNavState retient la sous-page active de chaque groupe.
const subNavState = { vets:'calendar', asv:'calendar' };
const annualYearState = { vets:'current', asv:'current' }; // année affichée dans la sous-page "Vue annuelle"
const GROUP_VIEWS = {
  vets: { label:'Vétérinaires', calendarViewKey:'vets-current', forecastViewKey:'vets-forecast', calendarContainer:'vets-sub-calendar', annualContainer:'vets-sub-annual', forecastContainer:'vets-sub-forecast' },
  asv:  { label:'ASV',          calendarViewKey:'asv-current',  forecastViewKey:'asv-forecast',  calendarContainer:'asv-sub-calendar',  annualContainer:'asv-sub-annual',  forecastContainer:'asv-sub-forecast' },
};

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
  CAL_VIEWS = buildCalViews();
  calStateCurrent.month = 0;
  calStateAsvCurrent.month = 0;
  calStateForecast.month = 0;
  calStateAsvForecast.month = 0;
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

// État global d'annulation (undo) — pile de snapshots de DATA.slots avant chaque action
const UNDO_STACK = [];
const UNDO_MAX = 30;
function snapshotBeforeChange(){
  UNDO_STACK.push(JSON.stringify(DATA.slots));
  if(UNDO_STACK.length > UNDO_MAX) UNDO_STACK.shift();
  updateUndoButtons();
}
function undoLastAction(){
  if(UNDO_STACK.length === 0) return;
  DATA.slots = JSON.parse(UNDO_STACK.pop());
  saveData(false);
  renderCurrentView();
  updateUndoButtons();
  showToast('Dernière action annulée', '↩️');
}
function updateUndoButtons(){
  document.querySelectorAll('.undo-btn').forEach(btn=>{ btn.disabled = UNDO_STACK.length === 0; });
}

/* ----------------------------------------------------------------
   2. JOURS FÉRIÉS FRANÇAIS (algorithme de Meeus/Jones/Butcher)
   ---------------------------------------------------------------- */
function getFrenchHolidays(year){
  const a = year % 19, b = Math.floor(year/100), c = year % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4;
  const l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  const month = Math.floor((h+l-7*m+114)/31);
  const day = ((h+l-7*m+114) % 31) + 1;
  const easter = new Date(year, month-1, day);

  const dates = [
    new Date(year, 0, 1),                            // Jour de l'An
    new Date(easter.getTime() + 1*86400000),          // Lundi de Pâques
    new Date(year, 4, 1),                             // Fête du Travail
    new Date(year, 4, 8),                             // Victoire 1945
    new Date(easter.getTime() + 39*86400000),         // Ascension
    new Date(easter.getTime() + 50*86400000),         // Lundi de Pentecôte
    new Date(year, 6, 14),                            // Fête Nationale
    new Date(year, 7, 15),                            // Assomption
    new Date(year, 10, 1),                            // Toussaint
    new Date(year, 10, 11),                           // Armistice
    new Date(year, 11, 25),                           // Noël
  ];
  const names = ["Jour de l'An","Lundi de Pâques","Fête du Travail","Victoire 1945","Ascension","Lundi de Pentecôte","Fête Nationale","Assomption","Toussaint","Armistice","Noël"];
  const map = {};
  dates.forEach((d,idx)=>{ map[fmtISO(d)] = names[idx]; });
  return map;
}
// Cache des fériés par année pour éviter de recalculer Pâques sans cesse
const HOLIDAYS_CACHE = {};
function holidaysFor(year){
  if(!HOLIDAYS_CACHE[year]) HOLIDAYS_CACHE[year] = getFrenchHolidays(year);
  return HOLIDAYS_CACHE[year];
}
function holidayName(isoDate){
  const year = parseInt(isoDate.slice(0,4),10);
  return holidaysFor(year)[isoDate] || null;
}

/* ----------------------------------------------------------------
   3. UTILITAIRES DATES
   ---------------------------------------------------------------- */
function fmtISO(d){
  // Évite les soucis de fuseau horaire de toISOString() en construisant la chaîne localement
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function daysInMonth(year, month){ return new Date(year, month+1, 0).getDate(); }
// Lundi = 0 ... Dimanche = 6
function isoWeekday(date){ return (date.getDay() + 6) % 7; }
function isSunday(date){ return isoWeekday(date) === 6; }
function isSaturday(date){ return isoWeekday(date) === 5; }

/* ----------------------------------------------------------------
   4. PERSISTANCE (localStorage + synchronisation Supabase partagée)
   ---------------------------------------------------------------- */
// Clé "anon" Supabase : volontairement non secrète (protégée par les policies RLS côté
// base, pas par le secret) — c'est le fonctionnement normal d'une clé anon Supabase,
// faite pour être embarquée dans du code client visible publiquement.
const SUPABASE_URL      = 'https://ubowqtowyqmpraoxbaoo.supabase.co/rest/v1/';
const SUPABASE_AUTH_URL = 'https://ubowqtowyqmpraoxbaoo.supabase.co/auth/v1/';
const SUPABASE_FUNCTIONS_URL = 'https://ubowqtowyqmpraoxbaoo.supabase.co/functions/v1/';
const CALENDAR_FEED_URL = `${SUPABASE_FUNCTIONS_URL}calendar-feed`;
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVib3dxdG93eXFtcHJhb3hiYW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MzkzNjksImV4cCI6MjA5ODIxNTM2OX0.cC7vTWrK-Ykii5dtlg_6lA5quHe6rv78IRxZT-ArV_8';

// ----------------------------------------------------------------
// Authentification — état global et gestion de session
// ----------------------------------------------------------------
let currentUser = null;
// { id, email, role, person_id, display_name, can_edit_vet_calendar, can_edit_all_asv }
let adminViewMode = 'vet'; // 'vet' | 'asv' — seulement pertinent pour le rôle admin

// ----------------------------------------------------------------
// État global — Annonces
// ----------------------------------------------------------------
let announcementsCache = {
  list: [],
  reads: new Set(),
  loaded: false,
  filter: 'all', // catégorie filtrée
};
let adminImpersonatedPersonId = null; // quelle ASV l'admin imite en mode ASV
const AUTH_SESSION_KEY = 'amivet_auth_session';

function getAuthSession(){
  try{ return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY)); }catch{ return null; }
}
function saveAuthSession(s){ sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s)); }
function clearAuthSession(){ sessionStorage.removeItem(AUTH_SESSION_KEY); currentUser = null; }

function supabaseHeaders(extra){
  const session = getAuthSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;
  return Object.assign({ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${token}` }, extra || {});
}

// ----------------------------------------------------------------
// Fonctions d'authentification (Supabase Auth REST)
// ----------------------------------------------------------------
async function authSignIn(email, password){
  const res = await fetch(`${SUPABASE_AUTH_URL}token?grant_type=password`, {
    method:'POST',
    headers:{ apikey:SUPABASE_ANON_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ email, password }),
  });
  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error_description || err.message || `Erreur ${res.status}`);
  }
  const session = await res.json();
  saveAuthSession(session);
  return session;
}
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
async function authUpdatePassword(accessToken, newPassword){
  const res = await fetch(`${SUPABASE_AUTH_URL}user`, {
    method:'PUT',
    headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ password:newPassword }),
  });
  if(!res.ok) throw new Error('Erreur lors de la mise à jour du mot de passe.');
}
async function authSendPasswordReset(email){
  const res = await fetch(`${SUPABASE_AUTH_URL}recover`, {
    method:'POST',
    headers:{ apikey:SUPABASE_ANON_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ email, redirectTo:'https://jtechserge.github.io/amivetpulse/' }),
  });
  if(!res.ok) throw new Error('Impossible d\'envoyer l\'email de réinitialisation.');
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
  currentUser = {
    id: authUser.id, email: authUser.email,
    role: p.role, person_id: p.person_id, display_name: p.display_name,
    can_edit_vet_calendar: p.can_edit_vet_calendar,
    can_edit_all_asv: p.can_edit_all_asv,
  };
  return currentUser;
}

// ----------------------------------------------------------------
// Helpers de permissions
// ----------------------------------------------------------------
function effectiveRole(){
  if(!currentUser) return null;
  if(currentUser.role === 'admin') return adminViewMode === 'asv' ? 'asv' : 'vet';
  return currentUser.role;
}
function canAccessDashboard(){ const r = effectiveRole(); return r === 'vet' || r === 'admin'; }
function canAccessSettings(){ return currentUser?.role === 'admin' || currentUser?.role === 'vet'; }
function canEditSlot(personId){
  if(!currentUser) return false;
  const asvPerson = ASV_PEOPLE.find(p=>p.id===personId);
  if(asvPerson?.archived) return false;
  const role = effectiveRole();
  if(role === 'vet') return true;
  if(role === 'asv'){
    const isImpersonating = currentUser.role === 'admin' && adminViewMode === 'asv';
    const myId = isImpersonating ? adminImpersonatedPersonId : currentUser.person_id;
    if(isASVPerson(personId)){
      // En impersonation : strictement la ligne de la personne choisie, comme un vrai ASV
      if(isImpersonating) return personId === myId;
      return personId === myId || currentUser.can_edit_all_asv === true;
    }
    // Calendrier vétérinaires : jamais modifiable en impersonation
    if(isImpersonating) return false;
    return currentUser.can_edit_vet_calendar === true;
  }
  return false;
}
let DATA = { version:2, slots:{} };

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && parsed.slots) { DATA = parsed; return; }
    }
  }catch(e){ console.warn('Lecture localStorage impossible, ré-initialisation.', e); }
  DATA = { version:2, slots:{} };
}
function saveData(showToast = true){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
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
  _supabasePushTimer = setTimeout(pushDataToSupabase, 900);
}
function pushDataToSupabase(){
  fetch(`${SUPABASE_URL}planning_data?id=eq.singleton`, {
    method:'PATCH',
    headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
    body: JSON.stringify({ data: DATA.slots, updated_at: new Date().toISOString() }),
  }).catch(e=> console.warn('Synchronisation Supabase impossible (hors ligne ?), données conservées en local.', e));
}
// Appelé une fois au démarrage, après le premier affichage instantané (local) : si la base
// partagée contient déjà des données, elles font foi et remplacent la copie locale. Si elle
// est vide (tout premier branchement), on y pousse la copie locale au lieu d'écraser les
// données existantes avec du vide.
async function syncFromSupabase(){
  try{
    const res = await fetch(`${SUPABASE_URL}planning_data?id=eq.singleton&select=data`, { headers: supabaseHeaders() });
    if(!res.ok) return;
    const rows = await res.json();
    const remoteSlots = rows[0] && rows[0].data;
    if(remoteSlots && Object.keys(remoteSlots).length > 0){
      DATA = { version:2, slots: remoteSlots };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
      renderCurrentView();
      updateDashboardNavBadge();
    } else if(remoteSlots !== null && remoteSlots !== undefined){
      // Supabase est vide (purge ou première utilisation) : vider aussi le cache local
      DATA = { version:2, slots:{} };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
      renderCurrentView();
      updateDashboardNavBadge();
    }
  }catch(e){ console.warn('Supabase inaccessible, données locales conservées.', e); }
}
// Signatures électroniques mensuelles (feuille de présence ASV) : un cache local simple
// (clé "personId|year|month") rechargé au démarrage et après chaque signature/annulation —
// pas besoin de la sophistication du sync push/pull de planning_data, ces écritures sont
// rares et ponctuelles (quelques-unes par mois, pas par clic).
const SIGNATURES = new Set();
let pendingSignToken = null; // token ?sign=UUID capturé dans l'URL avant authentification
let INTERVIEWS = [];
function signatureKey(personId, year, month){ return `${personId}|${year}|${month}`; }
function isMonthSigned(personId, year, month){ return SIGNATURES.has(signatureKey(personId, year, month)); }
const signatureDetails = new Map();
function getSignatureDetail(personId, year, month){ return signatureDetails.get(signatureKey(personId, year, month)) || null; }
async function loadSignatures(){
  try{
    const res = await fetch(`${SUPABASE_URL}monthly_signatures?select=*`, { headers: supabaseHeaders() });
    if(!res.ok) return;
    const rows = await res.json();
    SIGNATURES.clear();
    signatureDetails.clear();
    rows.forEach(r=>{
      const key = signatureKey(r.person_id, r.year, r.month);
      SIGNATURES.add(key);
      signatureDetails.set(key, { signedName:r.signed_name, signedAt:r.signed_at });
    });
    renderCurrentView();
  }catch(e){ console.warn('Signatures inaccessibles (hors ligne ?).', e); }
}
async function signMonth(personId, year, month, signedName){
  const res = await fetch(`${SUPABASE_URL}monthly_signatures`, {
    method:'POST',
    headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
    body: JSON.stringify({ person_id:personId, year, month, signed_name:signedName }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  await loadSignatures();
}
async function revokeSignature(personId, year, month){
  const res = await fetch(`${SUPABASE_URL}monthly_signatures?person_id=eq.${encodeURIComponent(personId)}&year=eq.${year}&month=eq.${month}`, {
    method:'DELETE',
    headers: supabaseHeaders({ Prefer:'return=minimal' }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  await loadSignatures();
}

async function loadInterviews(){
  try{
    const res = await fetch(`${SUPABASE_URL}annual_interviews?select=*`, { headers: supabaseHeaders() });
    if(!res.ok) return;
    INTERVIEWS = await res.json();
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
// Module Annonces — chargement + badge
// ----------------------------------------------------------------
function annonceViewerId(){ return currentUser?.person_id || currentUser?.id || ''; }

async function loadAnnouncements(){
  if(!currentUser) return;
  try{
    const today = new Date().toISOString();
    const [annRes, readRes] = await Promise.all([
      fetch(`${SUPABASE_URL}announcements?select=*&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(today)})&order=pinned.desc,created_at.desc`, { headers: supabaseHeaders() }),
      fetch(`${SUPABASE_URL}announcement_reads?person_id=eq.${encodeURIComponent(annonceViewerId())}&select=announcement_id`, { headers: supabaseHeaders() }),
    ]);
    const anns = annRes.ok ? await annRes.json() : [];
    const reads = readRes.ok ? await readRes.json() : [];
    announcementsCache.list = Array.isArray(anns) ? anns : [];
    announcementsCache.reads = new Set((Array.isArray(reads) ? reads : []).map(r => r.announcement_id));
    announcementsCache.loaded = true;
    updateAnnouncementBadge();
  }catch(e){ console.warn('Annonces inaccessibles.', e); }
}

function getUnreadCount(){
  const role = currentUser?.role;
  const visible = announcementsCache.list.filter(a => {
    if(a.target_roles === 'all') return true;
    if(a.target_roles === 'vet' && role === 'vet') return true;
    if(a.target_roles === 'asv' && role === 'asv') return true;
    return role === 'admin';
  });
  return visible.filter(a => !announcementsCache.reads.has(a.id)).length;
}

function updateAnnouncementBadge(){
  const el = document.getElementById('annonces-nav-badge');
  if(!el) return;
  const n = getUnreadCount();
  el.textContent = n > 0 ? String(n) : '';
  el.className = n > 0 ? 'nav-badge' : '';
}

async function markAnnouncementRead(annId){
  if(announcementsCache.reads.has(annId)) return;
  announcementsCache.reads.add(annId);
  updateAnnouncementBadge();
  try{
    await fetch(`${SUPABASE_URL}announcement_reads`, {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal,resolution=ignore-duplicates' }),
      body: JSON.stringify({ announcement_id: annId, person_id: annonceViewerId() }),
    });
  }catch(e){ console.warn('markAnnouncementRead error', e); }
}

async function loadArchivedAnnouncements(){
  try{
    const today = new Date().toISOString();
    const res = await fetch(`${SUPABASE_URL}announcements?select=*&expires_at=lte.${encodeURIComponent(today)}&order=created_at.desc`, { headers: supabaseHeaders() });
    return res.ok ? (await res.json()) : [];
  }catch(e){ return []; }
}

function slotKey(isoDate, personId, slot){ return `${isoDate}_${personId}_${slot}`; }
function labelKey(isoDate, personId, slot){ return `${isoDate}_${personId}_${slot}_label`; }
function commentKey(isoDate){ return `${isoDate}_comment`; }
function isASVPerson(personId){ return ASV_PEOPLE.some(p=>p.id===personId); }

// ----------------------------------------------------------------
// Demandes de congé ASV — statut de décision rattaché à chaque demi-journée plutôt qu'à
// une entité "demande" séparée : ça réutilise directement la logique de fusion des
// absences contiguës déjà en place (mêmes clés DATA.slots, même date ISO réelle), sans
// avoir à synchroniser deux structures de données en parallèle.
function decisionKey(isoDate, personId, slot){ return `${isoDate}_${personId}_${slot}_decision`; }
function decisionCommentKey(isoDate, personId, slot){ return `${isoDate}_${personId}_${slot}_decision_comment`; }
function getLeaveDecision(isoDate, personId, slot){ return DATA.slots[decisionKey(isoDate,personId,slot)] || null; }
function setLeaveDecision(isoDate, personId, slot, decision){
  const key = decisionKey(isoDate,personId,slot);
  if(decision) DATA.slots[key] = decision; else delete DATA.slots[key];
}
function getLeaveDecisionComment(isoDate, personId, slot){ return DATA.slots[decisionCommentKey(isoDate,personId,slot)] || ''; }
function setLeaveDecisionComment(isoDate, personId, slot, text){
  const key = decisionCommentKey(isoDate,personId,slot);
  if(text) DATA.slots[key] = text; else delete DATA.slots[key];
}

// Heures supplémentaires ASV — un nombre d'heures par personne et par jour (pas par
// demi-journée : une ASV peut faire 1h30 de plus sans que ça corresponde à un créneau M/AM).
function overtimeKey(isoDate, personId){ return `${isoDate}_${personId}_overtime`; }
function getOvertimeHours(isoDate, personId){ return parseFloat(DATA.slots[overtimeKey(isoDate,personId)]) || 0; }
function setOvertimeHours(isoDate, personId, hours){
  const key = overtimeKey(isoDate, personId);
  const n = parseFloat(hours);
  if(!isNaN(n) && n !== 0) DATA.slots[key] = n; else delete DATA.slots[key];
}

function getSlotState(isoDate, personId, slot){ return DATA.slots[slotKey(isoDate,personId,slot)] || 'empty'; }
function setSlotState(isoDate, personId, slot, state){
  const key = slotKey(isoDate,personId,slot);
  const wasAbsent = DATA.slots[key] === 'absent';
  if(state === 'empty'){
    delete DATA.slots[key];
    delete DATA.slots[labelKey(isoDate,personId,slot)];
  } else {
    DATA.slots[key] = state;
    if(state !== 'absent') delete DATA.slots[labelKey(isoDate,personId,slot)];
  }
  if(isASVPerson(personId)){
    if(state === 'absent' && !wasAbsent){
      // Nouvelle absence ASV : demande de congé automatiquement créée en attente de
      // validation vétérinaire (sauf si une décision existait déjà sur cette demi-journée,
      // ex. ré-application du même état pendant un glisser-peindre).
      if(!getLeaveDecision(isoDate, personId, slot)) setLeaveDecision(isoDate, personId, slot, 'pending');
      // Des heures sup n'ont plus de sens un jour de congé : on les efface automatiquement.
      setOvertimeHours(isoDate, personId, 0);
    } else if(state !== 'absent' && wasAbsent){
      setLeaveDecision(isoDate, personId, slot, null);
      setLeaveDecisionComment(isoDate, personId, slot, '');
    }
  }
}
function getSlotLabel(isoDate, personId, slot){ return DATA.slots[labelKey(isoDate,personId,slot)] || ''; }
function setSlotLabel(isoDate, personId, slot, label){
  const key = labelKey(isoDate,personId,slot);
  if(label) DATA.slots[key] = label; else delete DATA.slots[key];
}
function getDayComment(isoDate){ return DATA.slots[commentKey(isoDate)] || ''; }
function setDayComment(isoDate, text){
  const key = commentKey(isoDate);
  if(text) DATA.slots[key] = text; else delete DATA.slots[key];
}
// Cycle d'état d'une demi-journée : vide -> présent -> absent -> vide
function cycleState(state){
  if(state === 'empty') return 'present';
  if(state === 'present') return 'absent';
  return 'empty';
}

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
   6. TOAST
   ---------------------------------------------------------------- */
function showToast(message, icon='✓'){
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(()=> el.remove(), 15000);
}
function showSavedToast(){ showToast('Sauvegardé'); }

/* ----------------------------------------------------------------
   7. MODALE DE CONFIRMATION GÉNÉRIQUE
   ---------------------------------------------------------------- */
function openConfirmModal({title, message, confirmLabel='Confirmer', danger=true, onConfirm}){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  box.innerHTML = `
    <h3>${title}</h3>
    <p>${message}</p>
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn ${danger?'btn-danger':'btn-primary'}" id="modal-confirm">${confirmLabel}</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  box.querySelector('#modal-confirm').onclick = ()=>{ onConfirm(); close(); };
  backdrop.onclick = (e)=>{ if(e.target === backdrop) close(); };
}

/* ----------------------------------------------------------------
   8. MENU RÉGLAGES (export / import / reset)
   ---------------------------------------------------------------- */
function buildSettingsMenuHtml(){
  const isVet = canAccessSettings();
  const isAdmin = currentUser?.role === 'admin';
  const userName = currentUser?.display_name || currentUser?.email || '';
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
      <button id="action-toggle-view" role="menuitem">👁 ${adminViewMode === 'asv' ? 'Passer en vue Vétérinaires' : 'Passer en vue ASV'}</button>
      <hr>
    ` : ''}
    <div class="settings-section-label">Notifications</div>
    <button id="action-notifications" role="menuitem">🔔 Notifications</button>
    <hr>
    <div class="settings-section-label">Mon compte${userName ? ` — ${escapeHTML(userName)}` : ''}</div>
    <button id="action-change-password" role="menuitem">🔑 Changer mon mot de passe</button>
    <button id="action-logout" class="danger" role="menuitem">🚪 Se déconnecter</button>
  `;
}
function initSettingsMenu(){
  const toggle = document.getElementById('settings-toggle');
  const menu = document.getElementById('settings-menu');
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
      const blob = new Blob([JSON.stringify(DATA, null, 2)], { type:'application/json' });
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
          snapshotBeforeChange(); DATA = parsed; saveData(false); renderCurrentView();
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

  if(currentUser?.role === 'admin'){
    document.getElementById('action-toggle-view').addEventListener('click', ()=>{
      menu.classList.remove('open');
      if(adminViewMode === 'asv'){
        // Déjà en mode ASV → retour immédiat
        adminViewMode = 'vet';
        adminImpersonatedPersonId = null;
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
function openResetYearModal(year, isForecast){
  const label = isForecast ? `prévisionnel ${year}` : `année courante ${year}`;
  openConfirmModal({
    title:`Réinitialiser le ${label} ?`,
    message:`Toutes les présences, absences${isForecast ? '' : ', commentaires'} et heures saisies pour ${year} seront définitivement supprimées. Cette action est irréversible.`,
    confirmLabel:`Réinitialiser ${year}`,
    onConfirm:()=>{
      snapshotBeforeChange();
      Object.keys(DATA.slots).filter(k=>k.startsWith(`${year}-`)).forEach(k=> delete DATA.slots[k]);
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
  const sub = subNavState[group];
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
  const isForecastSubPage = (currentView === 'vets' && subNavState.vets === 'forecast') || (currentView === 'asv' && subNavState.asv === 'forecast');
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
  const sub = subNavState[group];
  if(sub === 'calendar') renderCalendarView(g.calendarViewKey);
  else if(sub === 'forecast') renderCalendarView(g.forecastViewKey);
  else if(sub === 'week' && group === 'asv') renderWeekViewASV();
  else renderAnnualViewForGroup(group);
}
function switchSubPage(group, subKey){
  const g = GROUP_VIEWS[group];
  subNavState[group] = subKey;
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
function getWeekMondayDate(date){
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
function weekPersonId(){
  // Admin en impersonation → la personne choisie (ex. Marie)
  if(currentUser?.role === 'admin' && adminViewMode === 'asv')
    return adminImpersonatedPersonId || ASV_PEOPLE[0]?.id;
  // ASV authentifiée → toujours soi-même
  if(effectiveRole() === 'asv') return currentUser?.person_id || ASV_PEOPLE[0]?.id;
  // Vétérinaires / admin (vue normale) → sélecteur dans la vue
  return weekNavState.personId || ASV_PEOPLE[0]?.id;
}
function buildWeekDayVisual(iso, personId, isEditable){
  const p = personOf(personId);
  const color = p?.color || '#0F766E';
  const isSun = isSunday(new Date(iso+'T00:00:00'));
  const hName = holidayName(iso);
  if(isSun || hName) return { morning:'', afternoon:'' };

  const mStart = getTE(iso,personId,'ms'), mEnd = getTE(iso,personId,'me');
  const aStart = getTE(iso,personId,'as'), aEnd = getTE(iso,personId,'ae');

  function block(wStart, wEnd, pStart, pDuration, cellH){
    if(!wStart && !wEnd) return '';
    const s = wStart || pStart, e = wEnd || pStart;
    const top = Math.max(0,(timeToMins(s)-timeToMins(pStart))/pDuration*cellH);
    const h   = Math.max(2,(timeToMins(e)-timeToMins(s))/pDuration*cellH);
    return `<div class="week-worked" style="top:${top.toFixed(0)}px;height:${h.toFixed(0)}px;background:${color};"></div>`;
  }
  const MH = 180, AMH = 170;
  return {
    morning:  block(mStart, mEnd,  CLINIC_HOURS.mStart,  270, MH),
    afternoon:block(aStart, aEnd,  CLINIC_HOURS.amStart, 255, AMH),
  };
}
// Génère la grille de fond (lignes toutes les 15 min, labels sur les heures pleines)
// pour une session de la vue semaine. Renvoie du HTML à insérer dans .week-vis-area.
function buildTimeGrid(sessKey, visH){
  const sess = WEEK_SESSIONS[sessKey];
  const pSM = timeToMins(sess.pS), pEM = timeToMins(sess.pE);
  const totalMins = pEM - pSM;
  let html = '';
  for(let offset = 15; offset < totalMins; offset += 15){
    const curMin = pSM + offset;
    const y = Math.round(offset / totalMins * visH);
    const isHour = curMin % 60 === 0;
    const lbl = isHour ? `${Math.floor(curMin/60)}h` : '';
    html += `<div style="position:absolute;left:0;right:0;top:${y}px;border-top:${isHour?'1px solid rgba(100,116,139,0.2)':'1px solid rgba(100,116,139,0.07)'};pointer-events:none;">${lbl?`<span style="position:absolute;left:2px;top:-8px;font-size:7.5px;line-height:1;color:rgba(100,116,139,0.5);pointer-events:none;">${lbl}</span>`:''}</div>`;
  }
  return html;
}

function renderWeekViewASV(){
  const container = document.getElementById('asv-sub-week');
  if(!container) return;
  if(!weekNavState.mondayISO) weekNavState.mondayISO = fmtISO(getWeekMondayDate(today));
  const monday = new Date(weekNavState.mondayISO+'T00:00:00');
  const days = Array.from({length:6},(_,i)=>{ const d=new Date(monday); d.setDate(d.getDate()+i); return d; });
  const pid = weekPersonId();
  const p = personOf(pid);
  const isVetUser = effectiveRole() !== 'asv';
  const baseCanEdit = isVetUser || canEditSlot(pid);
  function canEditDay(d){ return baseCanEdit && !isMonthSigned(pid, d.getFullYear(), d.getMonth()); }
  const canEditWeek = days.some(d => canEditDay(d));
  const DAY_SHORT = ['Lu','Ma','Me','Je','Ve','Sa'];
  function buildVisCell(d, session, height){
    const iso=fmtISO(d);
    if(isSunday(d)||holidayName(iso)) return `<td class="week-vis-cell" style="height:${height}px;background:#f8fafc;"></td>`;
    const sess=WEEK_SESSIONS[session];
    const sv=getTE(iso,pid,sess.s), ev=getTE(iso,pid,sess.e);
    const ce=canEditDay(d);
    const visH=ce?height-22:height;
    const pSM=timeToMins(sess.pS), pDur=timeToMins(sess.pE)-pSM;
    let block='';
    if(sv&&ev){
      const top=Math.max(0,(timeToMins(sv)-pSM)/pDur*visH);
      const bH=Math.max(2,(timeToMins(ev)-timeToMins(sv))/pDur*visH);
      const label=bH>=22?`<span class="week-block-label">${sv} → ${ev}</span>`:'';
      block=`<div class="week-worked${sess.cls}" style="top:${top.toFixed(0)}px;height:${bH.toFixed(0)}px;">${label}</div>`;
    }
    const da=`data-adj-iso="${iso}" data-adj-pid="${pid}"`;
    const noData = !sv && !ev;
    const mutedStyle = noData ? 'color:var(--color-text-muted);' : '';
    const ctrlRow=ce?`<div class="week-time-row">
      <span class="week-adj-grp">
        <button class="week-adj" ${da} data-adj-f="${sess.s}" data-adj-d="-15">▾</button>
        <span class="week-time-disp" style="${mutedStyle}">${sv||'—'}</span>
        <button class="week-adj" ${da} data-adj-f="${sess.s}" data-adj-d="+15">▴</button>
      </span>
      <span class="week-time-sep" style="${mutedStyle}">→</span>
      <span class="week-adj-grp">
        <button class="week-adj" ${da} data-adj-f="${sess.e}" data-adj-d="-15">▾</button>
        <span class="week-time-disp" style="${mutedStyle}">${ev||'—'}</span>
        <button class="week-adj" ${da} data-adj-f="${sess.e}" data-adj-d="+15">▴</button>
      </span>
    </div>`:'';
    const visAttrs=ce?`data-open-popup="${iso}" data-open-pid="${pid}" data-week-sess="${session}"`:'';
    return `<td class="week-vis-cell${session==='lunch'?' week-lunch-cell':''}" style="height:${height}px;">
      <div class="week-cell-inner">
        <div class="week-vis-area${ce?'':' no-edit'}" style="height:${visH}px;" ${visAttrs}>${buildTimeGrid(session,visH)}${block}</div>
        ${ctrlRow}
      </div>
    </td>`;
  }

  function footerCell(d, renderFn, style=''){
    const iso=fmtISO(d);
    if(isSunday(d)||holidayName(iso)) return `<td class="week-footer-cell" style="background:#f8fafc;${style}"></td>`;
    return `<td class="week-footer-cell" style="${style}">${renderFn(iso)}</td>`;
  }

  const headerRow=`<tr><th class="week-time-label" style="width:40px;font-size:9px;text-align:center;">Horaires</th>${days.map((d,i)=>{
    const iso=fmtISO(d), hN=holidayName(iso);
    const cls=`week-th${iso===fmtISO(today)?' is-today':hN?' is-holiday':''}`;
    const dd=String(d.getDate()).padStart(2,'0'), mm=String(d.getMonth()+1).padStart(2,'0');
    return `<th class="${cls}" data-week-col-iso="${iso}">${DAY_SHORT[i]}<br><strong>${dd}/${mm}</strong>${hN?`<br><span style="font-size:9px;">${escapeHTML(hN)}</span>`:''}`;
  }).join('</th>')}</tr>`;

  const mRow  = `<tr><td class="week-time-label">8h30<br>↕<br>13h00</td>${days.map(d=>buildVisCell(d,'morning',230)).join('')}</tr>`;
  const lRow  = `<tr><td class="week-lunch-label">13h–15h<br>☕</td>${days.map(d=>buildVisCell(d,'lunch',100)).join('')}</tr>`;
  const amRow = `<tr><td class="week-time-label">15h00<br>↕<br>19h15</td>${days.map(d=>buildVisCell(d,'afternoon',220)).join('')}</tr>`;

  const totRow=`<tr><td class="week-footer-label">Heures</td>${days.map(d=>footerCell(d,iso=>{
    const w=calcDayTE(iso,pid)+calcLunchTE(iso,pid);
    if(!w) return '-';
    return `<span class="week-total-h">${formatHHMM(w)}</span>`;
  })).join('')}</tr>`;

  const absRow=`<tr><td class="week-footer-label">Absent</td>${days.map(d=>footerCell(d,iso=>{
    const ab=getSlotState(iso,pid,'M')==='absent'&&getSlotState(iso,pid,'AM')==='absent';
    return `<input type="checkbox" class="week-abs-chk" data-week-abs="${iso}" data-week-pid="${pid}" ${ab?'checked':''} ${canEditDay(d)?'':'disabled'}>`;
  })).join('')}</tr>`;

  const noteRow=`<tr><td class="week-footer-label">Note</td>${days.map(d=>footerCell(d,iso=>{
    const note=getDayNote(iso,pid);
    return `<input type="text" class="week-note-input" data-week-note="${iso}" data-week-pid="${pid}" value="${escapeHTML(note)}" placeholder="…" style="width:100%;box-sizing:border-box;padding:2px 4px;border:1px solid var(--color-border);border-radius:4px;font-size:11px;font-family:inherit;" ${canEditDay(d)?'':'disabled'}>`;
  },'padding:3px;')).join('')}</tr>`;

  const asvPicker=isVetUser?`<select class="week-asv-pick" id="week-asv-pick">${ASV_PEOPLE.map(a=>`<option value="${a.id}" ${a.id===pid?'selected':''}>${escapeHTML(a.short)}</option>`).join('')}</select>`:
    `<span style="font-weight:700;color:${p?.color||'inherit'}">${escapeHTML(p?.short||'')}</span>`;
  const endDay=days[5];
  const wLabel=`${monday.getDate()} ${MONTH_NAMES[monday.getMonth()].toLowerCase()} – ${endDay.getDate()} ${MONTH_NAMES[endDay.getMonth()].toLowerCase()} ${endDay.getFullYear()}`;

  container.innerHTML=`
    <h2 class="section-title">⏱️ Vue hebdomadaire — ${escapeHTML(p?.short||'')}</h2>
    <p class="section-desc">Cliquez sur la zone colorée pour saisir les heures. Utilisez ▾ ▴ pour ajuster de 15 min. La plage 13h–15h compte en heures supplémentaires.</p>
    <div class="week-nav">
      <button class="btn-icon" id="week-prev">←</button>
      <span class="week-nav-label">${wLabel}</span>
      <button class="btn-icon" id="week-next">→</button>
      <button class="btn btn-sm" id="week-today-btn">Aujourd'hui</button>
      ${canEditWeek ? `<button class="btn btn-sm btn-danger" id="week-clear-btn" title="Effacer toutes les heures de la semaine">🗑️ Vider la semaine</button>` : ''}
      ${asvPicker}
    </div>
    <div class="week-view-wrap card" style="padding:0;">
      <table class="week-table"><thead>${headerRow}</thead><tbody>${mRow}${lRow}${amRow}${totRow}${absRow}${noteRow}</tbody></table>
    </div>`;

  container.querySelector('#week-prev').onclick=()=>{
    const d=new Date(weekNavState.mondayISO+'T00:00:00'); d.setDate(d.getDate()-7);
    weekNavState.mondayISO=fmtISO(d); renderWeekViewASV();
  };
  container.querySelector('#week-next').onclick=()=>{
    const d=new Date(weekNavState.mondayISO+'T00:00:00'); d.setDate(d.getDate()+7);
    weekNavState.mondayISO=fmtISO(d); renderWeekViewASV();
  };
  container.querySelector('#week-today-btn').onclick=()=>{ weekNavState.mondayISO=fmtISO(getWeekMondayDate(today)); renderWeekViewASV(); };
  if(canEditWeek){
    container.querySelector('#week-clear-btn').onclick=()=>{
      const label=`${monday.getDate()} ${MONTH_NAMES[monday.getMonth()].toLowerCase()} – ${days[5].getDate()} ${MONTH_NAMES[days[5].getMonth()].toLowerCase()}`;
      openConfirmModal({
        title:`Vider la semaine du ${label} ?`,
        message:`Toutes les heures saisies, absences, ajustements et notes de la semaine de ${escapeHTML(p?.short||'')} seront supprimés. Cette action est irréversible.`,
        confirmLabel:'Vider la semaine',
        onConfirm:()=>{
          snapshotBeforeChange();
          days.forEach(d=>{
            const iso=fmtISO(d);
            if(isSunday(d)||!canEditDay(d)) return;
            ['ms','me','as','ae','ls','le'].forEach(f=>{ delete DATA.slots[teKey(iso,pid,f)]; });
            setOvertimeHours(iso,pid,0);
            setDayNote(iso,pid,'');
            SLOTS.forEach(slot=>{ if(getSlotState(iso,pid,slot)!=='empty') setSlotState(iso,pid,slot,'empty'); });
          });
          saveData();
          showToast(`Semaine vidée (${escapeHTML(p?.short||'')})`,'🗑️');
          renderWeekViewASV();
        },
      });
    };
  }
  if(isVetUser) container.querySelector('#week-asv-pick').onchange=(e)=>{ weekNavState.personId=e.target.value; renderWeekViewASV(); };

  // Drag pour saisir les heures directement (clic-glisse, snap 15 min)
  function wkDragStart(e, el){
    const iso2=el.dataset.openPopup, pid2=el.dataset.openPid, sess=el.dataset.weekSess;
    if(!iso2||!pid2||!sess) return;
    const rect=el.getBoundingClientRect();
    const pct=Math.max(0,Math.min(1,(e.clientY-rect.top)/el.offsetHeight));
    const {pS,pE}=WEEK_SESSIONS[sess];
    const sm=Math.max(timeToMins(pS),Math.min(timeToMins(pE)-15,timePctToMins(pct,pS,pE)));
    weekDragCtx={iso:iso2,pid:pid2,session:sess,startMin:sm,endMin:sm+15,el,startY:e.clientY,hasDragged:false};
    // Ne pas dessiner de bloc tant que l'utilisateur n'a pas vraiment glissé
    e.preventDefault();
  }
  function wkDragMove(e){
    if(!weekDragCtx) return;
    const {el,session,startMin,startY}=weekDragCtx;
    // Seuil de 8px avant de considérer que c'est un vrai glissement
    if(!weekDragCtx.hasDragged && Math.abs(e.clientY-startY)<8) return;
    weekDragCtx.hasDragged=true;
    const {pS,pE}=WEEK_SESSIONS[session];
    const rect=el.getBoundingClientRect();
    const pct=Math.max(0,Math.min(1,(e.clientY-rect.top)/el.offsetHeight));
    const em=Math.max(startMin+15,Math.min(timeToMins(pE),timePctToMins(pct,pS,pE)));
    weekDragCtx.endMin=em;
    wkDragBlock(el,session,startMin,em);
  }
  function wkDragCommit(){
    if(!weekDragCtx) return;
    const {iso,pid:pid2,session,startMin,endMin,el,hasDragged}=weekDragCtx;
    weekDragCtx=null;
    // Pas de glissement réel → ouvrir la popup, ne laisser aucun résidu
    if(!hasDragged){
      return openWeekTimePopover(iso,pid2);
    }
    const {pS,pE,s,e:ef}=WEEK_SESSIONS[session];
    snapshotBeforeChange();
    setTE(iso,pid2,s,minsToTimeStr(Math.max(timeToMins(pS),startMin)));
    setTE(iso,pid2,ef,minsToTimeStr(Math.min(timeToMins(pE),endMin)));
    syncTEToMonthly(iso,pid2); saveData();
    if(blockIfOver42h(pid2, iso)){ renderWeekViewASV(); return; }
    renderWeekViewASV();
  }
  function wkDragBlock(el,session,sm,em){
    const {pS,pE,cls}=WEEK_SESSIONS[session];
    const pSM=timeToMins(pS), pDur=timeToMins(pE)-pSM, visH=el.offsetHeight;
    const top=Math.max(0,(sm-pSM)/pDur*visH);
    const bH=Math.max(4,(em-sm)/pDur*visH);
    let bl=el.querySelector('.week-worked');
    if(!bl){ bl=document.createElement('div'); bl.className='week-worked'+cls; el.appendChild(bl); }
    bl.style.cssText=`top:${top.toFixed(0)}px;height:${bH.toFixed(0)}px;`;
    bl.innerHTML=bH>=22?`<span class="week-block-label">${minsToTimeStr(sm)} → ${minsToTimeStr(em)}</span>`:'';
    const row=el.closest('td')?.querySelector('.week-time-row');
    if(row){ const d=row.querySelectorAll('.week-time-disp'); if(d[0])d[0].textContent=minsToTimeStr(sm); if(d[1])d[1].textContent=minsToTimeStr(em); }
  }
  container.querySelectorAll('.week-vis-area[data-open-popup]').forEach(el=>{
    el.addEventListener('mousedown',(e)=>{ if(e.button!==0) return; wkDragStart(e,el); });
    el.addEventListener('touchstart',(e)=>{ wkDragStart(e.touches[0],el); },{passive:false});
    el.addEventListener('touchend',()=>wkDragCommit(),{passive:true});
  });
  document.addEventListener('mousemove',(e)=>{ if(weekDragCtx) wkDragMove(e); });
  document.addEventListener('mouseup',()=>{ if(weekDragCtx) wkDragCommit(); });
  document.addEventListener('touchmove',(e)=>{ if(weekDragCtx){wkDragMove(e.touches[0]); e.preventDefault();} },{passive:false});

  container.addEventListener('click', e=>{
    const btn=e.target.closest('.week-adj'); if(!btn) return;
    e.stopPropagation();
    const {adjIso, adjPid, adjF, adjD}=btn.dataset;
    if(!adjIso||!adjPid||!adjF||!adjD) return;
    const LIMITS={ms:['06:00','13:00'],me:['06:00','13:00'],ls:['12:00','15:30'],le:['12:00','15:30'],as:['13:00','20:00'],ae:['13:00','20:00']};
    const [min,max]=LIMITS[adjF]||['00:00','23:30'];
    const cur=getTE(adjIso,adjPid,adjF)||(adjF.endsWith('s')?min:max);
    snapshotBeforeChange();
    setTE(adjIso,adjPid,adjF,adjTime(cur,parseInt(adjD,10),min,max));
    syncTEToMonthly(adjIso,adjPid); saveData();
    if(blockIfOver42h(adjPid, adjIso)){ renderWeekViewASV(); return; }
    renderWeekViewASV();
  });

  container.querySelectorAll('.week-abs-chk').forEach(chk=>{
    chk.addEventListener('change',()=>{
      snapshotBeforeChange();
      const iso=chk.dataset.weekAbs, pid2=chk.dataset.weekPid;
      SLOTS.forEach(slot=>setSlotState(iso,pid2,slot,chk.checked?'absent':'empty'));
      if(chk.checked) ['ms','me','as','ae','ls','le'].forEach(f=>{ delete DATA.slots[teKey(iso,pid2,f)]; });
      saveData(); renderWeekViewASV();
    });
  });
  container.querySelectorAll('.week-ot-input').forEach(inp=>{
    inp.addEventListener('change',()=>{ snapshotBeforeChange(); setOvertimeHours(inp.dataset.weekOt,inp.dataset.weekPid,inp.value); saveData(); renderWeekViewASV(); });
  });
  container.querySelectorAll('.week-note-input').forEach(inp=>{
    inp.addEventListener('change',()=>{ setDayNote(inp.dataset.weekNote,inp.dataset.weekPid,inp.value.trim()); saveData(); });
  });

  // double-click sur les entêtes de colonne → mode dev : inutile ici, géré par initCalendarInteractions
}

function openWeekTimePopover(iso, pid){
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const p = personOf(pid);
  const hasEntries = hasTE(iso,pid)||hasLunchTE(iso,pid);
  const note = getDayNote(iso,pid);
  const iStyle = 'padding:5px 7px;border:1px solid var(--color-border);border-radius:6px;font-family:inherit;font-size:13px;width:100%;box-sizing:border-box;background:var(--color-surface);color:var(--color-text);';
  function tval(f, def){ return getTE(iso,pid,f)||def; }
  function makeTimeSelect(id, curVal, minT, maxT, optional){
    const minM=timeToMins(minT), maxM=timeToMins(maxT);
    let snapped=curVal;
    if(curVal){ const [h,m]=curVal.split(':').map(Number); const sm=Math.round((h*60+m)/15)*15; snapped=`${String(Math.floor(sm/60)%24).padStart(2,'0')}:${String(sm%60).padStart(2,'0')}`; }
    let opts=optional?`<option value="">—</option>`:'';
    for(let m=minM;m<=maxM;m+=15){ const hh=Math.floor(m/60),mm=m%60; const v=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; opts+=`<option value="${v}"${v===snapped?' selected':''}>${v}</option>`; }
    return `<select id="${id}" style="${iStyle}">${opts}</select>`;
  }
  box.innerHTML = `
    <h4 style="margin-bottom:10px;">⏱️ ${escapeHTML(p?.short||pid)} — ${formatFR(iso)}</h4>
    <div style="display:grid;grid-template-columns:80px 1fr 16px 1fr;gap:6px 8px;align-items:center;margin-bottom:10px;font-size:13px;">
      <label style="font-weight:600;color:var(--color-text-muted);">Matin :</label>
      ${makeTimeSelect('te-ms',tval('ms',CLINIC_HOURS.mStart),'06:00','13:00',false)}
      <span style="text-align:center;">→</span>
      ${makeTimeSelect('te-me',tval('me',CLINIC_HOURS.mEnd),'06:00','13:00',false)}
      <label style="font-weight:600;color:#F59E0B;">13h–15h :</label>
      ${makeTimeSelect('te-ls',tval('ls',''),'12:00','15:30',true)}
      <span style="text-align:center;">→</span>
      ${makeTimeSelect('te-le',tval('le',''),'12:00','15:30',true)}
      <label style="font-weight:600;color:var(--color-text-muted);">A-midi :</label>
      ${makeTimeSelect('te-as',tval('as',CLINIC_HOURS.amStart),'13:00','20:00',false)}
      <span style="text-align:center;">→</span>
      ${makeTimeSelect('te-ae',tval('ae',CLINIC_HOURS.amEnd),'13:00','20:00',false)}
    </div>
    <p style="font-size:11px;color:var(--color-text-muted);margin:0 0 10px;">La plage 13h–15h est comptabilisée comme heures supplémentaires.</p>
    <div id="te-preview" style="font-size:12.5px;margin-bottom:10px;font-weight:600;color:var(--color-primary);"></div>
    <input type="text" id="te-note" value="${escapeHTML(note)}" placeholder="Note / commentaire…" style="width:100%;box-sizing:border-box;${iStyle}margin-bottom:12px;">
    <div class="popover-actions">
      ${hasEntries?`<button class="btn btn-sm" id="te-clear" style="color:#B91C1C;border-color:#FCA5A5;">Effacer tout</button>`:'<div></div>'}
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="te-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
  if(hasEntries) box.querySelector('#te-clear').onclick = ()=>{
    snapshotBeforeChange();
    ['ms','me','as','ae','ls','le'].forEach(f=>{ delete DATA.slots[teKey(iso,pid,f)]; });
    syncTEToMonthly(iso,pid); setDayNote(iso,pid,''); saveData(); close(); renderWeekViewASV();
  };
  const updatePreview = ()=>{
    const h = calcSessionH(box.querySelector('#te-ms').value, box.querySelector('#te-me').value)
            + calcSessionH(box.querySelector('#te-ls').value, box.querySelector('#te-le').value)
            + calcSessionH(box.querySelector('#te-as').value, box.querySelector('#te-ae').value);
    const aOT = h > 0 ? Math.round((h - 7 * getASVTimeFraction(pid)) * 10) / 10 : 0;
    box.querySelector('#te-preview').textContent = h > 0
      ? `Total : ${formatHHMM(h)}${aOT > 0 ? ` (+${formatHHMM(aOT)} supp.)` : aOT < 0 ? ` (-${formatHHMM(Math.abs(aOT))} déficit)` : ''}`
      : '';
  };
  box.querySelectorAll('select[id^="te-"]').forEach(s=>s.addEventListener('change', updatePreview));
  updatePreview();
  box.querySelector('#te-save').onclick = ()=>{
    snapshotBeforeChange();
    ['ms','me','as','ae','ls','le'].forEach(f=>{ const v=box.querySelector(`#te-${f}`).value; if(v) DATA.slots[teKey(iso,pid,f)]=v; else delete DATA.slots[teKey(iso,pid,f)]; });
    syncTEToMonthly(iso,pid);
    setDayNote(iso,pid,box.querySelector('#te-note').value.trim());
    saveData(); close();
    if(blockIfOver42h(pid, iso)){ renderWeekViewASV(); return; }
    renderWeekViewASV();
  };
  box.querySelector('#te-note').focus();
}

// Mémorise l'onglet et la sous-page affichés pour qu'un rechargement de page (F5) rouvre
// la même vue plutôt que de revenir systématiquement sur "Vétérinaires". Purement
// cosmétique : ne contient aucune donnée du planning, donc pas besoin de Supabase ici.
function saveViewState(){
  try{
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
      currentView,
      subNavState,
      annualYearState,
      dashSubTab: (typeof dashSubState !== 'undefined') ? dashSubState.tab : undefined,
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
    if(saved.subNavState) Object.assign(subNavState, saved.subNavState);
    if(saved.annualYearState) Object.assign(annualYearState, saved.annualYearState);
    if(saved.dashSubTab && typeof dashSubState !== 'undefined') dashSubState.tab = saved.dashSubTab;
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
// Renvoie la clé CAL_VIEWS du calendrier mensuel actuellement affiché, ou null si la vue
// courante n'est pas un calendrier (ex. tableau de bord, sous-page "Vue annuelle"...).
function activeCalendarViewKey(){
  const g = GROUP_VIEWS[currentView];
  if(!g) return null;
  const sub = subNavState[currentView];
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
    else if(e.key.toLowerCase() === 't' && CAL_VIEWS[viewKey].todayNav){ goToToday(viewKey); }
  });
}

/* ----------------------------------------------------------------
   11. UTILITAIRES DIVERS (échappement, couleurs)
   ---------------------------------------------------------------- */
function escapeHTML(str){
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function hexToRgba(hex, alpha){
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function personOf(id){ return PEOPLE.find(p=>p.id===id) || ASV_PEOPLE.find(p=>p.id===id); }

/* ================================================================
   12. VUE CALENDRIER (moteur partagé 2026 / 2027)
   ================================================================ */
function changeMonth(viewKey, delta){
  const cfg = CAL_VIEWS[viewKey];
  const m = cfg.navState.month + delta;
  cfg.navState.month = ((m % 12) + 12) % 12;
  renderCalendarView(viewKey);
}
function goToToday(viewKey){
  const cfg = CAL_VIEWS[viewKey];
  cfg.navState.month = (today.getFullYear() === cfg.year) ? today.getMonth() : 0;
  renderCalendarView(viewKey);
}

// Calcule classes + contenu d'une cellule demi-journée à partir de DATA. Pour une absence
// ASV, l'apparence dépend aussi du statut de la demande de congé (en attente / approuvée /
// refusée) — sans changement pour les vétérinaires, qui n'ont pas ce concept.
function cellRenderInfo(iso, personId, slot){
  const person = personOf(personId);
  const state = getSlotState(iso, personId, slot);
  const label = state === 'absent' ? getSlotLabel(iso, personId, slot) : '';
  const decision = state === 'absent' && isASVPerson(personId) ? (getLeaveDecision(iso, personId, slot) || 'pending') : null;
  let style = '';
  let html = '';
  let title = label;
  let stateClass = state;
  if(state === 'present'){
    style = `background:${person.present.bg};border-color:${person.present.border};color:${person.present.text};`;
    html = `<span class="cell-mark">✓</span>`;
  } else if(state === 'absent'){
    if(decision === 'pending'){
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
  return { state, label, decision, style, html, title, stateClass };
}
function cellAriaLabel(iso, personId, slot){
  const person = personOf(personId);
  const { state, label, decision } = cellRenderInfo(iso, personId, slot);
  let stateTxt;
  if(state === 'present') stateTxt = 'présent';
  else if(state === 'absent'){
    if(decision === 'pending') stateTxt = `demande de congé en attente${label?' — '+label:''}`;
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
  const cfg = CAL_VIEWS[viewKey];
  const monthLabel = `${MONTH_NAMES[cfg.navState.month]} ${cfg.year}`;
  const todayBtn = cfg.todayNav ? `<button class="btn btn-sm" id="cal-today-${viewKey}" aria-label="Revenir au mois actuel">📍 Aujourd'hui</button>` : '';
  return `
    <div class="cal-toolbar">
      <div class="cal-month-nav">
        <button class="btn-icon" id="cal-prev-${viewKey}" aria-label="Mois précédent">←</button>
        <div class="cal-month-label">${monthLabel}</div>
        <button class="btn-icon" id="cal-next-${viewKey}" aria-label="Mois suivant">→</button>
        ${todayBtn}
      </div>
      <div class="cal-toolbar-actions">
        <button class="btn-icon undo-btn" id="cal-undo-${viewKey}" aria-label="Annuler la dernière action" title="Annuler la dernière action (Cmd/Ctrl+Z)" ${UNDO_STACK.length===0?'disabled':''}>↩️</button>
        <button class="btn btn-sm btn-danger" id="cal-clear-month-${viewKey}" aria-label="Vider le mois affiché">🗑️ Vider le mois</button>
        ${cfg.printable ? `<button class="btn-icon" id="cal-print-${viewKey}" title="Imprimer ce calendrier" aria-label="Imprimer ce calendrier">🖨️</button>` : ''}
      </div>
    </div>
  `;
}

// Supprime les présences/absences du mois affiché — pour une personne donnée, ou pour
// tout le groupe affiché si personId est omis (dans ce cas, les commentaires de journée
// sont aussi effacés).
function clearMonth(viewKey, month, personId){
  const cfg = CAL_VIEWS[viewKey];
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
    // ASV : efface aussi les saisies hebdomadaires (heures matin/midi/après-midi) et notes
    asvTargets.forEach(p=>{
      ['ms','me','as','ae','ls','le'].forEach(f=>{ delete DATA.slots[teKey(iso,p.id,f)]; });
      setDayNote(iso, p.id, '');
    });
    if(!personId) setDayComment(iso, '');
  }
  saveData();
  renderCalendarView(viewKey);
  // Si la vue hebdomadaire est affichée, la rafraîchir aussi pour refléter la suppression des TE
  if(subNavState.asv === 'week') renderWeekViewASV();
  const who = personId ? personOf(personId).short : cfg.people.map(p=>p.short).join(' et ');
  showToast(`${MONTH_NAMES[month]} ${cfg.year} vidé (${who})`, '🗑️');
}

// Modale de choix : que vider pour ce mois ? Les boutons sont générés dynamiquement à
// partir de cfg.people, donc le même code sert le calendrier à 2 personnes (vétérinaires)
// comme celui à 3 (ASV).
function openClearMonthModal(viewKey, month){
  const cfg = CAL_VIEWS[viewKey];
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
function computeWeekTotalHours(pid, mondayDate){
  let h = 0;
  for(let d = 0; d < 6; d++){
    const dt = new Date(mondayDate); dt.setDate(dt.getDate() + d);
    if(isSunday(dt)) continue;
    const iso = fmtISO(dt);
    if(hasTE(iso, pid)){
      h += calcDayTE(iso, pid) + calcLunchTE(iso, pid);
    } else {
      if(getSlotState(iso, pid, 'M')  === 'present') h += HALFDAY_HOURS;
      if(getSlotState(iso, pid, 'AM') === 'present') h += HALFDAY_HOURS;
    }
    h += getOvertimeHours(iso, pid);
  }
  return Math.round(h * 100) / 100;
}

// Après une saisie : vérifie le plafond 42h. Si dépassé, restaure le snapshot et affiche un toast.
// Renvoie true si la saisie a été bloquée.
function blockIfOver42h(pid, isoDate){
  if(personOf(pid)?.saturdayOnly) return false;
  const mon = getWeekMondayDate(new Date(isoDate + 'T00:00:00'));
  const weekH = computeWeekTotalHours(pid, mon);
  if(weekH > WEEKLY_MAX_HOURS){
    if(UNDO_STACK.length > 0){ DATA.slots = JSON.parse(UNDO_STACK.pop()); updateUndoButtons(); }
    saveData(false);
    showToast(`Plafond 42h dépassé (${formatHHMM(weekH)}) — saisie annulée`, '🚫');
    return true;
  }
  return false;
}

// Calcule les alertes réglementaires pour la semaine se terminant par le dimanche passé.
// Renvoie un tableau de chaînes (vide = tout va bien).
function getWeekAlerts(personId, sundayISO){
  if(!isASVPerson(personId)) return [];
  const p = personOf(personId);
  if(!p) return [];
  const sun = new Date(sundayISO + 'T00:00:00');
  const mon = getWeekMondayDate(sun);
  let workDays = 0, approvedLeaveDays = 0;
  for(let d = 0; d < 6; d++){
    const dt = new Date(mon); dt.setDate(dt.getDate() + d);
    const iso = fmtISO(dt);
    const mS = getSlotState(iso, personId, 'M'), amS = getSlotState(iso, personId, 'AM');
    if(mS === 'present' || amS === 'present'){ workDays++; continue; }
    const mD = mS === 'absent' ? getLeaveDecision(iso, personId, 'M') : null;
    const aD = amS === 'absent' ? getLeaveDecision(iso, personId, 'AM') : null;
    if(mD === 'approved' || aD === 'approved') approvedLeaveDays++;
  }
  const alerts = [];
  // Règle jours travaillés
  if(p.saturdayOnly){
    const satIso = fmtISO(new Date(mon.getTime() + 5 * 86400000));
    const satOk = getSlotState(satIso, personId, 'M') === 'present' || getSlotState(satIso, personId, 'AM') === 'present';
    if(!satOk) alerts.push('Samedi non travaillé');
  } else {
    const expected = p.timeFraction >= 1 ? 4 : 3;
    const required = Math.max(0, expected - approvedLeaveDays);
    if(workDays < required) alerts.push(`${workDays}j / ${required}j attendus`);
  }
  // Règle 42h
  const weekH = computeWeekTotalHours(personId, mon);
  if(!p.saturdayOnly && weekH >= WEEKLY_MAX_HOURS) alerts.push(`${formatHHMM(weekH)} ≥ 42h`);
  return alerts;
}

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
  // Pour la première semaine du mois : ajouter les jours du mois précédent si semaine à cheval
  let weeklyOT = 0;
  if(isASVPerson(personId) && days.length > 0){
    const firstDate = new Date(year, month, days[0]);
    const firstWD = isoWeekday(firstDate); // 0=Lun … 6=Dim
    for(let i = firstWD; i > 0; i--){
      const prevDate = new Date(firstDate.getTime() - i * 86400000);
      if(!isSunday(prevDate)) weeklyOT += calcAutoOT(fmtISO(prevDate), personId);
    }
  }
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
          weeklyOT = 0;
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
      weeklyOT = 0;
      return;
    }
    if(isASVPerson(personId)) weeklyOT += calcAutoOT(iso, personId);
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

    // Calcul par personne : somme des écarts journaliers (heures travaillées − 7h×tf par jour).
    // Les jours de congé (absent, pas de saisie) contribuent 0 → pas de pénalité.
    // Les jours du mois précédent (extraDates) ne sont inclus que si la personne
    // a des saisies d'heures dans la partie courante du mois.
    const personOTs = people.map(p=>{
      const hasCurrentEntries = weekDays.some(day=>{
        const date = new Date(year, month, day);
        return !isSunday(date) && calcDayTE(fmtISO(date), p.id) > 0;
      });
      let ot = 0;
      if(hasCurrentEntries) extraDates.forEach(d=>{ ot += calcAutoOT(fmtISO(d), p.id); });
      weekDays.forEach(day=>{ const date=new Date(year,month,day); if(!isSunday(date)) ot+=calcAutoOT(fmtISO(date),p.id); });
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
      ${people.map(p=>`<div class="cal-wg-plabel${p.archived?' plabel-archived':''}" style="background:${p.present.bg};color:${p.present.text};" title="${escapeHTML(p.short)}">${escapeHTML(p.short)}</div>`).join('')}
    </div>
  </div>`;

  const legendHtml = `<div class="cal-wg-person-legend">
    ${people.map(p=>`<span class="cal-wg-person-tag" style="background:${p.present.bg};color:${p.present.text};border-color:${p.present.border};">${p.short}</span>`).join('')}
    <span class="cal-wg-status-tag cal-wg-status-absent">Congé</span>
    ${isASV?`<span class="cal-wg-status-tag cal-wg-status-pending">En attente</span>`:''}
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
            return `<div class="cal-wg-pstrip" data-person="${person.id}" style="padding:2px 3px;min-height:18px;">${als.map(a=>`<div style="font-size:9px;color:#DC2626;font-weight:700;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(a)}">${a}</div>`).join('')}</div>`;
          }).join('');
          if(perPersonAlerts) alertContent = `<div class="cal-wg-persons" style="pointer-events:none;">${perPersonAlerts}</div>`;
        }
        return `<div class="${dayCls}" data-date="${iso}">${dayHead}${alertContent}</div>`;
      }

      const personStrips = people.map(person=>{
        const locked = isMonthSigned(person.id, year, month);
        const noEdit = !canEditSlot(person.id);
        const blocked = locked || noEdit;
        const blockTitle = locked ? 'Feuille de présence signée — verrouillée' : noEdit ? 'Lecture seule' : '';
        const archived = person.archived === true;
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
      const personOTs = people.map(p=>{
        const hasCurrentEntries = weekDayNums.some(dn=>{ const d=new Date(year,month,dn); return !isSunday(d)&&calcDayTE(fmtISO(d),p.id)>0; });
        let ot = 0;
        if(hasCurrentEntries) extraDates.forEach(d=>{ ot+=calcAutoOT(fmtISO(d),p.id); });
        weekDayNums.forEach(dn=>{ const d=new Date(year,month,dn); if(!isSunday(d)) ot+=calcAutoOT(fmtISO(d),p.id); });
        return { person:p, ot:roundTo15min(ot) };
      });
      const nonZero = personOTs.filter(e=>e.ot!==0);
      if(nonZero.length>0){
        const weekTotal = roundTo15min(personOTs.reduce((s,e)=>s+e.ot,0));
        const detail = nonZero.map(e=>`<span class="${e.ot<0?'ot-neg':'ot-pos'}">${escapeHTML(e.person.short)} ${signedHHMM(e.ot)}</span>`).join('<span class="ot-sep">·</span>');
        otBarHtml = `<div class="cal-wg-week-ot"><span class="ot-week-detail">${detail}</span><span class="ot-week-sum${weekTotal<0?' ot-week-sum-neg':''}">${signedHHMM(weekTotal)}</span></div>`;
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
  const cfg = CAL_VIEWS[viewKey];
  const month = cfg.navState.month;
  return buildWeekGrid(cfg.year, month, cfg.people);
}

function buildLegendColors(people = PEOPLE){
  const hasASV = people.some(p=> isASVPerson(p.id));
  return `
    <div class="legend-row">
      ${people.map(p=>`
        <div class="legend-item"><span class="legend-swatch" style="background:${p.present.bg};border:1.5px solid ${p.present.border}"></span>${p.short} — présent (✓ = une demi-journée)</div>
      `).join('')}
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-absent);border:1.5px solid var(--color-absent-border)"></span>Absent / congé${hasASV?' approuvé':''}</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-medical);border:1.5px solid var(--color-medical-border)"></span>Visite médicale d'entreprise 🏥</div>
      ${hasASV ? `
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-leave-pending);border:1.5px solid var(--color-leave-pending-border)"></span>Demande de congé en attente</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-leave-rejected);border:1.5px solid var(--color-leave-rejected-border)"></span>Demande refusée</div>
      ` : ''}
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-holiday);border:1.5px solid var(--color-holiday)"></span>Jour férié</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-sunday);border:1.5px solid var(--color-border)"></span>${hasASV ? 'Dimanche — Motif d\'alerte' : 'Dimanche (fermé)'}</div>
    </div>
  `;
}
function buildLegend(people = PEOPLE){
  const hasASV = people.some(p=> isASVPerson(p.id));
  return `
    <div class="legend">
      ${buildLegendColors(people)}
      <div class="legend-row">
        <span class="legend-help-item">🖱️ <strong>Clic</strong> sur une case : fait défiler Vide → Présent → ${hasASV?'Demande de congé':'Absent'}</span>
        <span class="legend-help-item">↔️ <strong>Glisser</strong> le clic sur plusieurs cases : les remplit toutes d'un coup</span>
        <span class="legend-help-item">👆 <strong>Clic droit</strong> (ou appui long) sur une case : ouvre la saisie d'un motif ${hasASV?'de la demande':'d\'absence'}</span>
        ${hasASV ? `<span class="legend-help-item">📋 Chaque absence saisie est automatiquement <strong>soumise aux vétérinaires</strong> pour validation (onglet Tableau de bord → Demandes de congé)</span>` : ''}
      </div>
    </div>
  `;
}

// Panneau de signature électronique mensuelle (feuille de présence ASV) — uniquement sur
// le calendrier réel de l'année en cours, jamais sur le prévisionnel (données spéculatives,
// rien à certifier) ni côté vétérinaires (pas de feuille de présence pour eux ici).
function buildSignaturePanelHtml(viewKey){
  const cfg = CAL_VIEWS[viewKey];
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
          const isOwn = currentUser?.person_id === p.id && currentUser?.role === 'asv';
          const isAdminOrVet = currentUser?.role === 'admin' || currentUser?.role === 'vet';
          const signBtn = isOwn && !detail
            ? `<button type="button" class="btn" data-sign-person="${p.id}" style="font-size:12.5px;padding:6px 12px;">Signer ma feuille de présence</button>`
            : '';
          const adminBtn = isAdminOrVet && !detail
            ? `<button type="button" class="btn" data-admin-request-sign="${p.id}" style="font-size:12.5px;padding:6px 12px;">📧 Demander la signature</button>`
            : '';
          return `<div class="signature-row">
            <span style="color:${p.color};font-weight:700;">${escapeHTML(p.short)}</span>
            ${signedNote}
            ${signBtn}${adminBtn}
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
  const cfg = CAL_VIEWS[viewKey];
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
  const cfg = CAL_VIEWS[viewKey];
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

// Modal de fallback : affiche le lien de signature à copier/partager quand l'email échoue.
function openSigningLinkModal(signingLink, recipientLabel, emailError){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  box.innerHTML = `
    <h3>🔗 Lien de signature</h3>
    <p style="font-size:13.5px;color:var(--color-text-muted);margin-bottom:14px;">
      L'email n'a pas pu être envoyé à <strong>${escapeHTML(recipientLabel)}</strong>.
      ${emailError ? `<br><small style="color:var(--color-text-muted);word-break:break-all;">${escapeHTML(emailError)}</small><br>` : ''}
      Copiez ce lien et transmettez-le directement à la personne concernée — il est valable 7 jours et à usage unique.
    </p>
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="text" id="signing-link-input" value="${escapeHTML(signingLink)}"
        readonly style="flex:1;font-size:11px;padding:8px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface-alt);color:var(--color-text-muted);cursor:text;">
      <button class="btn btn-primary" id="copy-signing-link" style="white-space:nowrap;flex-shrink:0;">📋 Copier</button>
    </div>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn" id="modal-cancel">Fermer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
  box.querySelector('#copy-signing-link').onclick = ()=>{
    navigator.clipboard.writeText(signingLink).then(()=>{
      box.querySelector('#copy-signing-link').textContent = '✅ Copié !';
      setTimeout(()=>{ box.querySelector('#copy-signing-link').textContent = '📋 Copier'; }, 2000);
    });
  };
  box.querySelector('#signing-link-input').onclick = (e)=> e.target.select();
}

// Demande de signature : envoie un email à l'ASV avec le récap du mois + lien unique.
// La vraie signature n'est enregistrée que lorsqu'elle clique ce lien (confirm-signature).
async function requestSignatureEmail(viewKey, personId){
  const cfg = CAL_VIEWS[viewKey];
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
      showToast(`Email de signature envoyé à ${currentUser.email}`, '📧');
      renderCalendarView(viewKey);
    } else {
      // Resend ne peut pas envoyer à cet email (plan gratuit) — afficher le lien à copier
      openSigningLinkModal(data.signing_link, currentUser.email);
      renderCalendarView(viewKey);
    }
  }catch(e){
    showToast(`Échec — ${e.message || 'erreur réseau'}`, '❌');
    if(btn){ btn.disabled = false; btn.textContent = 'Signer ma feuille de présence'; }
  }
}

// Affiche le modal de confirmation de signature (déclenché après ouverture du lien email).
function openSignConfirmModal(tokenId){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  box.innerHTML = `
    <h3>✍️ Confirmer ma signature</h3>
    <p style="margin-bottom:12px;">Vous allez signer électroniquement votre feuille de présence. Votre identité, email et l'horodatage seront enregistrés de façon permanente.</p>
    <div style="background:#F0FDF9;border:1px solid #99F6E4;border-radius:8px;padding:12px 14px;font-size:13px;color:#0F766E;margin-bottom:14px;line-height:1.6;">
      <strong>Signataire :</strong> ${escapeHTML(currentUser.display_name || currentUser.email)}<br>
      <strong>Email :</strong> ${escapeHTML(currentUser.email)}
    </div>
    <p id="sign-confirm-error" style="color:#B91C1C;font-size:12px;display:none;margin:0 0 10px;"></p>
    <div class="modal-actions" style="margin-top:4px;">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn btn-primary" id="sign-do-confirm">✍️ Confirmer ma signature</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
  box.querySelector('#sign-do-confirm').onclick = async ()=>{
    const confirmBtn = box.querySelector('#sign-do-confirm');
    const errorEl = box.querySelector('#sign-confirm-error');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Signature en cours…';
    try{
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}confirm-signature`, {
        method: 'POST',
        headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ token_id: tokenId }),
      });
      const data = await res.json();
      if(!data.ok) throw new Error(data.error || 'Erreur inconnue');
      close();
      await loadSignatures();
      renderCalendarView('asv-current');
      showToast('Feuille de présence signée — email de confirmation envoyé', '✅');
    }catch(e){
      errorEl.textContent = e.message || 'Échec de la signature.';
      errorEl.style.display = 'block';
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✍️ Confirmer ma signature';
    }
  };
}

function renderCalendarView(viewKey){
  const cfg = CAL_VIEWS[viewKey];
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

/* ----------------------------------------------------------------
   MODULE ANNONCES — renderAnnounces()
   ---------------------------------------------------------------- */
function renderAnnounces(){
  const container = document.getElementById('view-annonces');
  const isAdmin = currentUser?.role === 'admin';
  const role = currentUser?.role;
  const viewerId = annonceViewerId();

  const now = new Date();
  const allList = announcementsCache.list;
  const active = allList.filter(a => {
    if(a.target_roles === 'vet' && role === 'asv') return false;
    if(a.target_roles === 'asv' && (role === 'vet' || role === 'admin')) return false;
    return true;
  });
  const filterCat = announcementsCache.filter;

  const filtered = filterCat === 'all' ? active : active.filter(a => a.category === filterCat);

  function fmtDate(iso){
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
  }
  function authorName(id){
    const p = allPeople().find(p => p.id === id);
    return p ? (p.short || p.name) : id;
  }

  const cats = [
    { id:'all', label:'Tout', icon:'📋' },
    ...Object.entries(ANNONCE_CATEGORIES).map(([id, c]) => ({ id, label:c.label, icon:c.icon })),
  ];
  const filterBar = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
    ${cats.map(c => `<button class="ann-filter-pill${filterCat===c.id?' active':''}" data-cat="${c.id}" style="border:1.5px solid ${filterCat===c.id?'var(--color-primary)':'var(--color-border)'};background:${filterCat===c.id?'var(--color-secondary)':'var(--color-card)'};color:${filterCat===c.id?'var(--color-primary)':'var(--color-text)'};padding:5px 12px;border-radius:20px;font-size:13px;cursor:pointer;">${c.icon} ${c.label}</button>`).join('')}
    ${isAdmin ? `<button id="ann-new-btn" class="btn btn-sm" style="margin-left:auto;">+ Nouvelle annonce</button>` : ''}
  </div>`;

  function cardHtml(a){
    const cat = ANNONCE_CATEGORIES[a.category] || ANNONCE_CATEGORIES.info;
    const unread = !announcementsCache.reads.has(a.id);
    const bg = unread ? cat.bg : 'var(--color-card)';
    return `<div class="ann-card" data-ann-id="${a.id}" style="position:relative;border:1.5px solid ${a.pinned?cat.color:unread?cat.border:'var(--color-border)'};border-left:${a.pinned?`4px solid ${cat.color}`:''};border-radius:10px;padding:14px 16px;margin-bottom:10px;background:${bg};cursor:pointer;">
      ${unread ? `<span style="position:absolute;top:10px;left:10px;width:8px;height:8px;border-radius:50%;background:#3B82F6;"></span>` : ''}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
        ${a.pinned?`<span style="font-size:13px;">📌</span>`:''}
        <span style="background:${cat.bg};color:${cat.color};border:1px solid ${cat.border};border-radius:12px;padding:2px 8px;font-size:11.5px;font-weight:700;">${cat.icon} ${cat.label}</span>
        <span style="font-size:12px;color:var(--color-muted);margin-left:auto;">${authorName(a.author_id)} · ${fmtDate(a.created_at)}</span>
        ${isAdmin ? `<button class="ann-edit-btn btn btn-sm" data-ann-id="${a.id}" style="font-size:11.5px;padding:3px 8px;">✎</button>` : ''}
      </div>
      <div style="font-size:14.5px;font-weight:700;color:var(--color-text);margin-bottom:4px;">${escapeHTML(a.title)}</div>
      <div style="font-size:13px;color:var(--color-text);line-height:1.55;white-space:pre-wrap;">${escapeHTML(a.content)}</div>
    </div>`;
  }

  const listHtml = filtered.length
    ? filtered.map(cardHtml).join('')
    : `<p class="text-muted" style="margin-top:16px;">Aucune annonce pour le moment.</p>`;

  container.innerHTML = `
    <h2 class="section-title">📣 Tableau d'annonces</h2>
    <div style="margin-bottom:14px;">${filterBar}</div>
    <div id="ann-list">${listHtml}</div>
    <details id="ann-archives" style="margin-top:24px;">
      <summary style="cursor:pointer;font-size:13.5px;color:var(--color-muted);font-weight:600;user-select:none;">📁 Archives (annonces expirées)</summary>
      <div id="ann-archives-list" style="margin-top:10px;opacity:0.6;"></div>
    </details>
  `;

  container.querySelectorAll('.ann-filter-pill').forEach(btn => {
    btn.onclick = ()=>{ announcementsCache.filter = btn.dataset.cat; renderAnnounces(); };
  });

  container.querySelectorAll('.ann-card').forEach(card => {
    card.onclick = async (e) => {
      if(e.target.closest('.ann-edit-btn')) return;
      const annId = card.dataset.annId;
      await markAnnouncementRead(annId);
      card.style.background = 'var(--color-card)';
      const dot = card.querySelector('span[style*="#3B82F6"]');
      if(dot) dot.remove();
    };
  });

  container.querySelectorAll('.ann-edit-btn').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); openAnnouncementModal(btn.dataset.annId); };
  });

  if(isAdmin){
    container.querySelector('#ann-new-btn').onclick = ()=> openAnnouncementModal(null);
  }

  // Archives (lazy load)
  container.querySelector('#ann-archives').addEventListener('toggle', async function(){
    if(!this.open) return;
    const archList = document.getElementById('ann-archives-list');
    archList.textContent = 'Chargement…';
    const archived = await loadArchivedAnnouncements();
    if(!archived.length){ archList.innerHTML = '<p style="font-size:13px;color:var(--color-muted);">Aucune archive.</p>'; return; }
    archList.innerHTML = archived.map(a => {
      const cat = ANNONCE_CATEGORIES[a.category] || ANNONCE_CATEGORIES.info;
      return `<div style="border:1px solid var(--color-border);border-radius:8px;padding:10px 14px;margin-bottom:8px;background:var(--color-card);">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
          <span style="background:${cat.bg};color:${cat.color};border:1px solid ${cat.border};border-radius:12px;padding:2px 8px;font-size:11.5px;">${cat.icon} ${cat.label}</span>
          <span style="font-size:12px;color:var(--color-muted);margin-left:auto;">${authorName(a.author_id)} · ${fmtDate(a.created_at)}</span>
        </div>
        <div style="font-size:13.5px;font-weight:600;">${escapeHTML(a.title)}</div>
        <div style="font-size:12.5px;color:var(--color-muted);white-space:pre-wrap;">${escapeHTML(a.content)}</div>
      </div>`;
    }).join('');
  });
}

function openAnnouncementModal(annId){
  const isAdmin = currentUser?.role === 'admin';
  if(!isAdmin) return;
  const existing = annId ? announcementsCache.list.find(a => a.id === annId) : null;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';

  const initCat = existing?.category || 'info';
  const catOptions = Object.entries(ANNONCE_CATEGORIES).map(([k, c]) => {
    const sel = k === initCat;
    return `<button type="button" class="ann-cat-btn" data-cat="${k}" style="border:1.5px solid ${c.border};background:${sel?c.bg:'var(--color-card)'};color:${c.color};padding:5px 12px;border-radius:20px;font-size:13px;cursor:pointer;font-weight:${sel?'700':'400'};">${c.icon} ${c.label}</button>`;
  }).join('');

  box.innerHTML = `
    <h3>${existing ? '✏️ Modifier l\'annonce' : '📣 Nouvelle annonce'}</h3>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Titre <span id="ann-title-count" style="font-weight:400;color:var(--color-muted);">(${existing?.title?.length||0}/80)</span></label>
        <input id="ann-title" type="text" maxlength="80" value="${escapeHTML(existing?.title||'')}" placeholder="Titre de l'annonce" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13.5px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Contenu</label>
        <textarea id="ann-content" rows="4" placeholder="Contenu de l'annonce…" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${escapeHTML(existing?.content||'')}</textarea>
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Catégorie</label>
        <div id="ann-cat-btns" style="display:flex;flex-wrap:wrap;gap:6px;">${catOptions}</div>
        <input type="hidden" id="ann-cat-val" value="${existing?.category||'info'}">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Destinataires</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${[['all','Tout le monde'],['vet','Vétérinaires uniquement'],['asv','ASV uniquement']].map(([v,l])=>
            `<label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="radio" name="ann-roles" value="${v}" ${(existing?.target_roles||'all')===v?'checked':''}> ${l}</label>`
          ).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="font-size:12.5px;font-weight:600;">📌 Épingler en haut</label>
        <input type="checkbox" id="ann-pinned" ${existing?.pinned?'checked':''}>
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Date d'expiration (optionnel)</label>
        <input id="ann-expires" type="date" value="${existing?.expires_at?existing.expires_at.slice(0,10):''}" style="padding:6px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
    </div>
    <div class="modal-actions" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;">
      ${existing?`<button class="btn btn-danger" id="ann-delete-btn" style="margin-right:auto;">🗑️ Supprimer</button>`:''}
      <button class="btn" id="ann-cancel-btn">Annuler</button>
      <button class="btn btn-primary" id="ann-save-btn">${existing?'Mettre à jour':'Publier'}</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');

  box.querySelector('#ann-cancel-btn').onclick = close;
  backdrop.onclick = e => { if(e.target===backdrop) close(); };

  const titleInput = box.querySelector('#ann-title');
  const countEl = box.querySelector('#ann-title-count');
  titleInput.oninput = ()=> { countEl.textContent = `(${titleInput.value.length}/80)`; };

  box.querySelectorAll('.ann-cat-btn').forEach(btn => {
    btn.onclick = ()=>{
      box.querySelector('#ann-cat-val').value = btn.dataset.cat;
      box.querySelectorAll('.ann-cat-btn').forEach(b => {
        const c = ANNONCE_CATEGORIES[b.dataset.cat];
        b.style.background = 'var(--color-card)'; b.style.fontWeight = '400';
      });
      const selC = ANNONCE_CATEGORIES[btn.dataset.cat];
      btn.style.background = selC.bg; btn.style.fontWeight = '700';
    };
  });

  if(existing){
    box.querySelector('#ann-delete-btn').onclick = async ()=>{
      if(!confirm(`Supprimer l'annonce "${existing.title}" ?`)) return;
      try{
        await fetch(`${SUPABASE_URL}announcements?id=eq.${existing.id}`, {
          method: 'DELETE', headers: supabaseHeaders({ Prefer:'return=minimal' }),
        });
        announcementsCache.list = announcementsCache.list.filter(a => a.id !== existing.id);
        close(); updateAnnouncementBadge(); renderAnnounces();
        showToast('Annonce supprimée', '🗑️');
      }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
    };
  }

  box.querySelector('#ann-save-btn').onclick = async ()=>{
    const title = box.querySelector('#ann-title').value.trim();
    const content = box.querySelector('#ann-content').value.trim();
    const category = box.querySelector('#ann-cat-val').value;
    const target_roles = box.querySelector('input[name="ann-roles"]:checked')?.value || 'all';
    const pinned = box.querySelector('#ann-pinned').checked;
    const expiresVal = box.querySelector('#ann-expires').value;
    const expires_at = expiresVal ? new Date(expiresVal + 'T23:59:59').toISOString() : null;
    if(!title || !content){ showToast('Titre et contenu requis', '⚠️'); return; }
    const author_id = annonceViewerId();
    try{
      let ann;
      if(existing){
        const res = await fetch(`${SUPABASE_URL}announcements?id=eq.${existing.id}`, {
          method: 'PATCH',
          headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=representation' }),
          body: JSON.stringify({ title, content, category, target_roles, pinned, expires_at }),
        });
        [ann] = await res.json();
        announcementsCache.list = announcementsCache.list.map(a => a.id===ann.id?ann:a);
      } else {
        const res = await fetch(`${SUPABASE_URL}announcements`, {
          method: 'POST',
          headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=representation' }),
          body: JSON.stringify({ title, content, category, target_roles, pinned, expires_at, author_id }),
        });
        [ann] = await res.json();
        if(pinned) announcementsCache.list = [ann, ...announcementsCache.list];
        else announcementsCache.list = [ann, ...announcementsCache.list].sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0));
      }
      close(); updateAnnouncementBadge(); renderAnnounces();
      showToast(existing?'Annonce mise à jour':'Annonce publiée', '📣');
      if(!existing && typeof triggerPushNotification === 'function'){
        const targetUsers = target_roles === 'vet' ? ['david','stephane']
          : target_roles === 'asv' ? ASV_PEOPLE.map(p=>p.id)
          : [];
        triggerPushNotification({
          type: 'announcement',
          title: `📣 ${title}`,
          body: content.length > 120 ? content.slice(0,117)+'…' : content,
          targetUsers,
          data: { type:'announcement' },
        });
      }
    }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
  };
}

/* ----------------------------------------------------------------
   13. INTERACTIONS CALENDRIER (clic, glisser-peindre, popovers, sidebar)
   ---------------------------------------------------------------- */
const WEEKDAY_FULL = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
function formatFR(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const date = new Date(y, m-1, d);
  return `${WEEKDAY_FULL[isoWeekday(date)]} ${d} ${MONTH_NAMES[m-1].toLowerCase()} ${y}`;
}
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
  const paintValue = cycleState(getSlotState(iso, personId, slot));
  dragCtx = {
    startCell: cell, paintValue, personId, moved:false, cancelled:false, touched:new Set(),
    viewKey: calViewKeyOfEventTarget(cell),
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
  dragCtx.touched.add(`${iso}_${personId}_${slot}`);
  setSlotState(iso, personId, slot, value);
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
      // re-rendu complet pour fusionner les nouvelles absences contiguës
      if(dragCtx.viewKey) renderCalendarView(dragCtx.viewKey);
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
    <button type="button" id="popover-medical" style="width:100%;margin-bottom:10px;padding:8px;border:2px solid var(--color-medical-border);background:var(--color-medical);color:var(--color-medical-text);border-radius:var(--radius-btn);font-size:13px;font-weight:700;cursor:pointer;">🏥 Visite médicale d'entreprise</button>
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
  box.querySelector('#popover-medical').onclick = ()=>{
    setSlotState(iso, personId, slot, 'medical');
    setSlotLabel(iso, personId, slot, '');
    updateHalfDOM(cell);
    saveData();
    close();
    const medTab = document.getElementById('dash-sub-medical');
    if(medTab && !medTab.classList.contains('hidden')) renderDashboardMedical();
  };
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-save').onclick = ()=>{
    const label = input.value.trim();
    setSlotLabel(iso, personId, slot, label);
    propagateLabelAcrossSunday(personId, [{iso, slot}], label);
    saveData();
    if(isASV && typeof triggerPushNotification === 'function'){
      triggerPushNotification({
        type: 'leave_request',
        title: 'Nouvelle demande de congé',
        body: `${person.short} — ${formatFR(iso)} (${SLOT_LABELS[slot]})${label ? ' · '+label : ''}`,
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
  const people = CAL_VIEWS[viewKey].people;
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

  // Double-clic sur une colonne-jour du calendrier ASV → vue hebdomadaire
  document.addEventListener('dblclick', (e)=>{
    const dayCol = e.target.closest('.cal-wg-day[data-date]');
    if(!dayCol || currentView !== 'asv' || subNavState.asv === 'week') return;
    if(dayCol.classList.contains('cal-wg-day-we')) return; // SA/DI : pas de vue semaine
    const iso = dayCol.dataset.date;
    if(!iso) return;
    weekNavState.mondayISO = fmtISO(getWeekMondayDate(new Date(iso+'T00:00:00')));
    switchSubPage('asv', 'week');
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

  document.addEventListener('click', (e)=>{
    const viewKey = calViewKeyOfEventTarget(e.target);
    if(!viewKey) return;

    if(e.target.id === `cal-prev-${viewKey}`) return changeMonth(viewKey, -1);
    if(e.target.id === `cal-next-${viewKey}`) return changeMonth(viewKey, 1);
    if(e.target.id === `cal-today-${viewKey}`) return goToToday(viewKey);
    if(e.target.id === `cal-clear-month-${viewKey}`){
      openClearMonthModal(viewKey, CAL_VIEWS[viewKey].navState.month);
      return;
    }
    if(e.target.id === `cal-undo-${viewKey}`) return undoLastAction();
    if(e.target.id === `cal-print-${viewKey}`) return window.print();

    const commentBtn = e.target.closest('[data-action="comment"]');
    if(commentBtn){ openDayCommentPopover(commentBtn.dataset.date, viewKey); return; }

    const editBtn = e.target.closest('[data-action="edit-day"]');
    if(editBtn){ openDaySidebar(editBtn.dataset.date, viewKey); return; }

    const overtimeBtn = e.target.closest('[data-action="overtime-day"]');
    if(overtimeBtn){ openOvertimeDayPopover(overtimeBtn.dataset.date, CAL_VIEWS[viewKey].people, viewKey); return; }
  });
}

/* ================================================================
   14. TABLEAU DE BORD (statistiques, graphique, table récapitulative,
       demandes de congé ASV)
   ================================================================ */
function formatNum(n){ return Number.isInteger(n) ? String(n) : n.toFixed(1); }
// Formate des heures décimales en "Xh MM" (ex: 1.25 → "1h15", 0.5 → "0h30")
function formatHHMM(h){
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${hh}h${String(mm).padStart(2,'0')}`;
}
// Comme formatHHMM mais préfixé du signe (+/-)
function signedHHMM(h){
  if(h === 0) return '0h00';
  return `${h > 0 ? '+' : '-'}${formatHHMM(h)}`;
}

// Regroupe les demi-journées d'absence ASV contiguës (même personne, même motif, même
// statut de décision, même commentaire) en "demandes" pour l'affichage côté tableau de
// bord — sur les deux années éditables (courante + prévisionnelle). Une demande qui
// chevauche un dimanche apparaît comme deux groupes distincts (limitation acceptée : ça
// n'affecte que l'affichage, l'approbation/rejet reste correcte groupe par groupe).
function collectAllLeaveGroups(){
  const groups = [];
  const years = [getCurrentYear(), getCurrentYear()+1];
  ASV_PEOPLE.forEach(person=>{
    let current = null;
    years.forEach(year=>{
      for(let month=0; month<12; month++){
        const nbDays = daysInMonth(year, month);
        for(let day=1; day<=nbDays; day++){
          const iso = fmtISO(new Date(year, month, day));
          SLOTS.forEach(slot=>{
            if(getSlotState(iso, person.id, slot) !== 'absent'){ current = null; return; }
            const label = getSlotLabel(iso, person.id, slot);
            const status = getLeaveDecision(iso, person.id, slot) || 'pending';
            const comment = getLeaveDecisionComment(iso, person.id, slot);
            if(current && current.label === label && current.status === status && current.comment === comment){
              current.slots.push({ iso, slot });
            } else {
              current = { personId: person.id, label, status, comment, slots: [{ iso, slot }] };
              groups.push(current);
            }
          });
        }
      }
    });
  });
  return groups;
}
function sortLeaveGroups(groups){
  const order = { pending:0, approved:1, rejected:2 };
  return groups.slice().sort((a,b)=> (order[a.status]-order[b.status]) || a.slots[0].iso.localeCompare(b.slots[0].iso));
}
function countPendingLeaveRequests(){ return collectAllLeaveGroups().filter(g=> g.status === 'pending').length; }
function decideLeaveGroup(group, decision, comment){
  snapshotBeforeChange();
  group.slots.forEach(({iso,slot})=>{
    setLeaveDecision(iso, group.personId, slot, decision);
    setLeaveDecisionComment(iso, group.personId, slot, comment || '');
  });
  saveData();
}

function computeYearStats(year){
  const stats = {};
  const all = allPeople();
  all.forEach(p=>{
    stats[p.id] = {
      halfDaysByMonth: new Array(12).fill(0),
      absentHalfDaysByMonth: new Array(12).fill(0),
      saturdaysByMonth: new Array(12).fill(0),
      overtimeHoursByMonth: new Array(12).fill(0),
    };
  });
  for(let month=0; month<12; month++){
    const nbDays = daysInMonth(year, month);
    for(let day=1; day<=nbDays; day++){
      const date = new Date(year, month, day);
      if(isSunday(date)) continue;
      const iso = fmtISO(date);
      const saturday = isSaturday(date);
      all.forEach(p=>{
        let presentAny = false;
        SLOTS.forEach(slot=>{
          const state = getSlotState(iso, p.id, slot);
          if(state === 'present'){ stats[p.id].halfDaysByMonth[month]++; presentAny = true; }
          else if(state === 'absent'){ stats[p.id].absentHalfDaysByMonth[month]++; }
        });
        if(saturday && presentAny) stats[p.id].saturdaysByMonth[month]++;
        stats[p.id].overtimeHoursByMonth[month] += isASVPerson(p.id) ? calcAutoOT(iso, p.id) : getOvertimeHours(iso, p.id);
      });
    }
  }
  all.forEach(p=>{
    const s = stats[p.id];
    s.totalHalfDays = s.halfDaysByMonth.reduce((a,b)=>a+b,0);
    s.totalAbsentHalfDays = s.absentHalfDaysByMonth.reduce((a,b)=>a+b,0);
    s.totalSaturdays = s.saturdaysByMonth.reduce((a,b)=>a+b,0);
    s.totalOvertimeHours = roundTo15min(s.overtimeHoursByMonth.reduce((a,b)=>a+b,0));
    let busiest = 0;
    s.halfDaysByMonth.forEach((v,i)=>{ if(v > s.halfDaysByMonth[busiest]) busiest = i; });
    s.busiestMonth = busiest;
  });
  return stats;
}

function buildPersonCard(year, personId){
  const person = personOf(personId);
  const stats = computeYearStats(year)[personId];
  const tf = person?.timeFraction ?? 1.0;
  // Cible annuelle : 230 jours × 2 demi-journées × quotité de temps
  const TARGET_HALF_DAYS = Math.round(230 * 2 * tf);
  const targetDays = TARGET_HALF_DAYS / 2;
  // Heures sup/déficit → demi-journées équivalentes (÷ 3.5h)
  const otEquivHalfDays = stats.totalOvertimeHours / HALFDAY_HOURS;
  const adjustedHalfDays = Math.round((stats.totalHalfDays + otEquivHalfDays) * 10) / 10;
  const adjustedDays = Math.round(adjustedHalfDays / 2 * 10) / 10;
  const pct = Math.min(100, TARGET_HALF_DAYS > 0 ? Math.round(adjustedHalfDays / TARGET_HALF_DAYS * 100) : 0);
  const vacationDays = stats.totalAbsentHalfDays / 2;
  const otSign = stats.totalOvertimeHours >= 0 ? '+' : '';
  const otColor = stats.totalOvertimeHours > 0 ? 'var(--color-success,#16A34A)' : stats.totalOvertimeHours < 0 ? 'var(--color-danger,#DC2626)' : 'var(--color-text-muted)';
  return `
    <div class="card person-card" data-person="${personId}" style="border-top-color:${person.color}">
      <div class="person-card-head">
        <div class="person-avatar" style="background:${person.color}">${person.initial}</div>
        <div><h3 style="font-size:16px;">${person.name}</h3><p class="text-muted" style="font-size:12px;">Bilan ${year}${tf < 1 ? ` — ${Math.round(tf*100)}%` : ''}</p></div>
      </div>
      <div class="stat-row"><span class="stat-label">Jours travaillés (ajusté)</span><span class="stat-value">${formatNum(adjustedDays)} / ${formatNum(targetDays)}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${person.color}"></div></div>
      <div class="stat-row"><span class="stat-label">Demi-journées de présence</span><span class="stat-value">${stats.totalHalfDays}</span></div>
      ${stats.totalOvertimeHours !== 0 ? `<div class="stat-row"><span class="stat-label">Heures supp. / en déficit</span><span class="stat-value" style="color:${otColor}">${signedHHMM(stats.totalOvertimeHours)}</span></div>` : ''}
      <div class="stat-row"><span class="stat-label">Samedis travaillés</span><span class="stat-value big" style="color:${person.color}">${stats.totalSaturdays}</span></div>
      <div class="stat-row"><span class="stat-label">Jours de congés</span><span class="stat-value">${formatNum(vacationDays)}</span></div>
      <div class="stat-row"><span class="stat-label">Mois le plus chargé</span><span class="stat-value">${MONTH_NAMES[stats.busiestMonth]}</span></div>
    </div>
  `;
}

function buildBarChartSVG(year){
  const stats = computeYearStats(year);
  const dVals = stats.david.halfDaysByMonth.map(h=>h/2);
  const sVals = stats.stephane.halfDaysByMonth.map(h=>h/2);
  const maxVal = Math.max(1, ...dVals, ...sVals);
  const rowH = 30, barH = 10, leftLabelW = 56, chartW = 330, viewW = 470;
  const height = 12*rowH + 6;
  let rows = '';
  for(let m=0; m<12; m++){
    const y = m*rowH + 6;
    const dW = (dVals[m]/maxVal)*chartW;
    const sW = (sVals[m]/maxVal)*chartW;
    rows += `
      <text x="0" y="${y+barH+1}" font-size="11" font-weight="700" fill="#64748B" font-family="Inter,sans-serif">${MONTH_SHORT[m]}</text>
      <rect x="${leftLabelW}" y="${y}" width="${Math.max(dW,1.5)}" height="${barH}" rx="3" fill="${PEOPLE[0].color}"></rect>
      <text x="${leftLabelW+Math.max(dW,1.5)+6}" y="${y+barH-1}" font-size="10" font-weight="700" fill="${PEOPLE[0].color}" font-family="Inter,sans-serif">${formatNum(dVals[m])}</text>
      <rect x="${leftLabelW}" y="${y+barH+3}" width="${Math.max(sW,1.5)}" height="${barH}" rx="3" fill="${PEOPLE[1].color}"></rect>
      <text x="${leftLabelW+Math.max(sW,1.5)+6}" y="${y+2*barH+2}" font-size="10" font-weight="700" fill="${PEOPLE[1].color}" font-family="Inter,sans-serif">${formatNum(sVals[m])}</text>
    `;
  }
  return `<svg viewBox="0 0 ${viewW} ${height}" width="100%" height="${height}" role="img" aria-label="Comparaison des jours travaillés par mois, ${year}">${rows}</svg>`;
}

function buildRecapTable(year){
  const stats = computeYearStats(year);
  let totalD=0, totalS=0, totalSatD=0, totalSatS=0, rows='';
  for(let m=0; m<12; m++){
    const dDays = stats.david.halfDaysByMonth[m]/2;
    const sDays = stats.stephane.halfDaysByMonth[m]/2;
    const satD = stats.david.saturdaysByMonth[m];
    const satS = stats.stephane.saturdaysByMonth[m];
    totalD+=dDays; totalS+=sDays; totalSatD+=satD; totalSatS+=satS;
    const diff = dDays - sDays;
    const diffClass = diff>0 ? 'ecart-david' : diff<0 ? 'ecart-stephane' : 'ecart-equilibre';
    const diffTxt = diff===0 ? 'Équilibre' : `+${formatNum(Math.abs(diff))} ${diff>0?'David':'Stéphane'}`;
    rows += `<tr><td>${MONTH_NAMES[m]}</td><td>${formatNum(dDays)}</td><td>${formatNum(sDays)}</td><td>${satD}</td><td>${satS}</td><td class="${diffClass}">${diffTxt}</td></tr>`;
  }
  const totalDiff = totalD - totalS;
  const totalDiffClass = totalDiff>0?'ecart-david':totalDiff<0?'ecart-stephane':'ecart-equilibre';
  const totalDiffTxt = totalDiff===0?'Équilibre':`+${formatNum(Math.abs(totalDiff))} ${totalDiff>0?'David':'Stéphane'}`;
  return `
    <div class="recap-table-scroll">
    <table class="recap-table">
      <thead><tr><th>Mois</th><th>David (j)</th><th>Stéphane (j)</th><th>Samedis David</th><th>Samedis Stéphane</th><th>Écart</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td>${formatNum(totalD)}</td><td>${formatNum(totalS)}</td><td>${totalSatD}</td><td>${totalSatS}</td><td class="${totalDiffClass}">${totalDiffTxt}</td></tr></tfoot>
    </table>
    </div>
  `;
}

// --- Variantes ASV (3 personnes) du graphique et du récapitulatif mensuel ---
function buildBarChartSVGASV(year){
  const stats = computeYearStats(year);
  const series = ASV_PEOPLE.map(p=> stats[p.id].halfDaysByMonth.map(h=>h/2));
  const maxVal = Math.max(1, ...series.flat());
  const barH = 9, gap = 2, rowH = 3*(barH+gap) + 5, leftLabelW = 56, chartW = 300, viewW = 470;
  const height = 12*rowH + 6;
  let rows = '';
  for(let m=0; m<12; m++){
    const yBase = m*rowH + 6;
    rows += `<text x="0" y="${yBase+barH+1}" font-size="11" font-weight="700" fill="#64748B" font-family="Inter,sans-serif">${MONTH_SHORT[m]}</text>`;
    ASV_PEOPLE.forEach((p,i)=>{
      const val = series[i][m];
      const w = (val/maxVal)*chartW;
      const y = yBase + i*(barH+gap);
      rows += `
        <rect x="${leftLabelW}" y="${y}" width="${Math.max(w,1.5)}" height="${barH}" rx="3" fill="${p.color}"></rect>
        <text x="${leftLabelW+Math.max(w,1.5)+6}" y="${y+barH-1}" font-size="9.5" font-weight="700" fill="${p.color}" font-family="Inter,sans-serif">${formatNum(val)}</text>
      `;
    });
  }
  return `<svg viewBox="0 0 ${viewW} ${height}" width="100%" height="${height}" role="img" aria-label="Comparaison des jours travaillés par mois pour les ASV, ${year}">${rows}</svg>`;
}

function buildRecapTableASV(year){
  const stats = computeYearStats(year);
  const totals = ASV_PEOPLE.map(()=>0);
  let grandTotal = 0, rows = '';
  for(let m=0; m<12; m++){
    const vals = ASV_PEOPLE.map((p,i)=>{
      const d = stats[p.id].halfDaysByMonth[m]/2;
      totals[i] += d;
      return d;
    });
    const monthTotal = vals.reduce((a,b)=>a+b,0);
    grandTotal += monthTotal;
    rows += `<tr><td>${MONTH_NAMES[m]}</td>${vals.map(v=>`<td>${formatNum(v)}</td>`).join('')}<td>${formatNum(monthTotal)}</td></tr>`;
  }
  return `
    <div class="recap-table-scroll">
    <table class="recap-table">
      <thead><tr><th>Mois</th>${ASV_PEOPLE.map(p=>`<th>${p.short} (j)</th>`).join('')}<th>Total ASV (j)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td>${totals.map(t=>`<td>${formatNum(t)}</td>`).join('')}<td>${formatNum(grandTotal)}</td></tr></tfoot>
    </table>
    </div>
  `;
}

// Heures supplémentaires ASV par mois — même structure que le récapitulatif de présence,
// mais en sommant getOvertimeHours() (un nombre d'heures par jour, pas par demi-journée).
function computeOvertimeStats(year){
  const stats = {};
  ASV_PEOPLE.forEach(p=> stats[p.id] = new Array(12).fill(0));
  for(let month=0; month<12; month++){
    const nbDays = daysInMonth(year, month);
    for(let day=1; day<=nbDays; day++){
      const iso = fmtISO(new Date(year, month, day));
      ASV_PEOPLE.forEach(p=>{ stats[p.id][month] += getOvertimeHours(iso, p.id); });
    }
  }
  return stats;
}
// ----------------------------------------------------------------
// Contrôle du temps de travail ASV — quotas légaux et heures réelles
// ----------------------------------------------------------------
const ANNUAL_FULLTIME_HOURS = 1607; // référence légale France (loi Aubry 2000)
const HALFDAY_HOURS = 3.5;          // 35h / 5j / 2 demi-journées
const WEEKLY_MAX_HOURS    = 42;     // plafond légal modulation (art. L3122-4 CT)
const ASV_STD_SAT_CARLA   = 7.25;  // Carla : 8:30-16:45 avec 1h pause
const ASV_STD_SAT_SECOND  = 7.0;   // 2e ASV le samedi : 9:00-16:30 avec 1h pause
const ASV_STD_WEEKDAY_AVG = 8.375; // moyenne ouverture (8,5h) + fermeture (8,25h)
const CLINIC_HOURS = { mStart:'08:30', mEnd:'13:00', amStart:'15:00', amEnd:'19:15' };
const CLINIC_M_H  = 4.5;   // 8h30→13h00
const CLINIC_AM_H = 4.25;  // 15h00→19h15

// Saisie horaire par jour/personne (vue semaine ASV)
function teKey(iso,pid,f){ return `${iso}_${pid}_te_${f}`; }
function getTE(iso,pid,f){ return DATA.slots[teKey(iso,pid,f)]||''; }
function setTE(iso,pid,f,v){ if(v) DATA.slots[teKey(iso,pid,f)]=v; else delete DATA.slots[teKey(iso,pid,f)]; }
function timeToMins(t){ if(!t)return 0; const[h,m]=t.split(':').map(Number); return h*60+(m||0); }
function minsToH(m){ return m / 60; }
function calcSessionH(s,e){ if(!s||!e)return 0; const d=timeToMins(e)-timeToMins(s); return d>0?minsToH(d):0; }
function calcDayTE(iso,pid){ return calcSessionH(getTE(iso,pid,'ms'),getTE(iso,pid,'me'))+calcSessionH(getTE(iso,pid,'as'),getTE(iso,pid,'ae')); }
function hasTE(iso,pid){ return !!(getTE(iso,pid,'ms')||getTE(iso,pid,'me')||getTE(iso,pid,'as')||getTE(iso,pid,'ae')); }

function calcLunchTE(iso,pid){ return calcSessionH(getTE(iso,pid,'ls'),getTE(iso,pid,'le')); }
function hasLunchTE(iso,pid){ return !!(getTE(iso,pid,'ls')||getTE(iso,pid,'le')); }
function calcAutoOT(iso,pid){
  const total = calcDayTE(iso,pid) + calcLunchTE(iso,pid);
  const expected = 7 * getASVTimeFraction(pid);
  return total > 0 ? total - expected : 0;
}
function roundTo15min(h){ return Math.round(h * 4) / 4; }
function dayNoteKey(iso,pid){ return `${iso}_${pid}_day_note`; }
function getDayNote(iso,pid){ return DATA.slots[dayNoteKey(iso,pid)]||''; }
function setDayNote(iso,pid,v){ if(v) DATA.slots[dayNoteKey(iso,pid)]=v; else delete DATA.slots[dayNoteKey(iso,pid)]; }
// Synchronise la saisie horaire vers le calendrier mensuel (M/AM slots + heures sup auto)
function syncTEToMonthly(iso,pid){
  if(!isASVPerson(pid)) return;
  const hasM  = !!(getTE(iso,pid,'ms')||getTE(iso,pid,'me'));
  const hasAM = !!(getTE(iso,pid,'as')||getTE(iso,pid,'ae'));
  if(hasM  && getSlotState(iso,pid,'M')  !=='absent') DATA.slots[slotKey(iso,pid,'M')]  = 'present';
  if(!hasM && getSlotState(iso,pid,'M')  ==='present') delete DATA.slots[slotKey(iso,pid,'M')];
  if(hasAM && getSlotState(iso,pid,'AM') !=='absent') DATA.slots[slotKey(iso,pid,'AM')] = 'present';
  if(!hasAM && getSlotState(iso,pid,'AM')==='present') delete DATA.slots[slotKey(iso,pid,'AM')];
  // Copier l'auto-OT dans la ligne H. +/− pour qu'il soit visible sur le calendrier mensuel
  const aOT = calcAutoOT(iso,pid);
  const key = overtimeKey(iso,pid);
  if(aOT !== 0) DATA.slots[key] = aOT;
  else if(DATA.slots[key] && DATA.slots[key] === getOvertimeHours(iso,pid)) delete DATA.slots[key];
}
function adjTime(current, deltaMin, min, max){
  const mins = timeToMins(current||min) + deltaMin;
  const clamped = Math.max(timeToMins(min), Math.min(timeToMins(max), mins));
  const h = Math.floor(clamped/60), m = clamped%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
// Définition des sessions de la vue semaine (accessible en dehors de renderWeekViewASV)
const WEEK_SESSIONS = {
  morning:  {s:'ms',e:'me',pS:CLINIC_HOURS.mStart, pE:CLINIC_HOURS.mEnd,  cls:''},
  lunch:    {s:'ls',e:'le',pS:'13:00',              pE:'15:00',            cls:' week-worked-lunch'},
  afternoon:{s:'as',e:'ae',pS:CLINIC_HOURS.amStart, pE:CLINIC_HOURS.amEnd, cls:''},
};
function snapTo15(mins){ return Math.round(mins/15)*15; }
function minsToTimeStr(m){ const h=Math.floor(m/60),mm=m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }
function timePctToMins(pct, pStartStr, pEndStr){
  return snapTo15(timeToMins(pStartStr) + pct * (timeToMins(pEndStr)-timeToMins(pStartStr)));
}
let weekDragCtx = null; // { iso, pid, session, startMin, endMin, cell }
// État de navigation de la vue semaine
const weekNavState = { mondayISO: null, personId: null };

function getASVTimeFraction(personId){ return personOf(personId)?.timeFraction ?? 1.0; }
function getASVQuota(personId){
  const p = personOf(personId);
  const f = getASVTimeFraction(personId);
  if(p?.saturdayOnly){
    // Pas de modulation : quota basé sur les samedis uniquement
    return {
      annual:  null, // hors modulation
      weekly:  ASV_STD_SAT_CARLA,
      monthly: Math.round(ASV_STD_SAT_CARLA * 52 / 12 * 10) / 10,
    };
  }
  return {
    annual:  Math.round(ANNUAL_FULLTIME_HOURS * f * 10) / 10,
    weekly:  Math.round(35 * f * 100) / 100,
    monthly: Math.round(ANNUAL_FULLTIME_HOURS * f / 12 * 10) / 10,
  };
}
function computeASVWorkedHours(personId, year, month = null){
  const months = month !== null ? [month] : Array.from({length:12}, (_, i) => i);
  let total = 0;
  for(const m of months){
    const nb = daysInMonth(year, m);
    for(let day = 1; day <= nb; day++){
      const iso = fmtISO(new Date(year, m, day));
      if(hasTE(iso, personId)){
        // Utiliser la saisie horaire précise (vue semaine)
        total += calcDayTE(iso, personId);
      } else {
        // Fallback : demi-journées du calendrier mensuel
        if(getSlotState(iso, personId, 'M')  === 'present') total += HALFDAY_HOURS;
        if(getSlotState(iso, personId, 'AM') === 'present') total += HALFDAY_HOURS;
      }
      total += getOvertimeHours(iso, personId);
    }
  }
  return Math.round(total * 10) / 10;
}
function getWeekStart(date){
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
function computeASVWorkedHoursWeek(personId, weekStartDate){
  let total = 0;
  for(let d = 0; d < 7; d++){
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + d);
    const iso = fmtISO(date);
    if(getSlotState(iso, personId, 'M')  === 'present') total += HALFDAY_HOURS;
    if(getSlotState(iso, personId, 'AM') === 'present') total += HALFDAY_HOURS;
    total += getOvertimeHours(iso, personId);
  }
  return Math.round(total * 10) / 10;
}

function buildOvertimeTableASV(year){
  const stats = computeOvertimeStats(year);
  const totals = ASV_PEOPLE.map(()=>0);
  let grandTotal = 0, rows = '';
  for(let m=0; m<12; m++){
    const vals = ASV_PEOPLE.map((p,i)=>{
      const h = stats[p.id][m];
      totals[i] += h;
      return h;
    });
    const monthTotal = vals.reduce((a,b)=>a+b,0);
    grandTotal += monthTotal;
    rows += `<tr><td>${MONTH_NAMES[m]}</td>${vals.map(v=>`<td>${v>0?formatNum(v):'—'}</td>`).join('')}<td>${monthTotal>0?formatNum(monthTotal):'—'}</td></tr>`;
  }
  return `
    <table class="recap-table">
      <thead><tr><th>Mois</th>${ASV_PEOPLE.map(p=>`<th>${p.short} (h)</th>`).join('')}<th>Total ASV (h)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total annuel</td>${totals.map(t=>`<td>${formatNum(t)}</td>`).join('')}<td>${formatNum(grandTotal)}</td></tr></tfoot>
    </table>
  `;
}

// Vue d'ensemble des feuilles de présence signées par mois/ASV, avec annulation possible
// (rouvre le mois correspondant à la modification dans le calendrier).
function buildHoursControlCard(year){
  const cy = today.getFullYear();
  const cm = today.getMonth();
  const weekStart = getWeekStart(today);
  function alertClass(worked, quota){
    if(quota <= 0) return 'ok';
    const r = worked / quota;
    return r > 1 ? 'over' : r >= 0.9 ? 'warn' : 'ok';
  }
  function barPct(worked, quota){ return Math.min(100, quota > 0 ? Math.round(worked / quota * 100) : 0); }
  function alertIcon(cls){ return cls === 'over' ? '🔴' : cls === 'warn' ? '🟡' : '🟢'; }
  function hoursItem(label, worked, quota, cls){
    return `
      <div class="hours-control-item ${cls}">
        <span class="hours-control-label">${label}</span>
        <span class="hours-control-value">${formatNum(worked)}h / ${formatNum(quota)}h ${alertIcon(cls)}</span>
        <div class="hours-progress-bar"><div class="hours-progress-fill" style="width:${barPct(worked,quota)}%;"></div></div>
      </div>`;
  }
  const rows = ASV_PEOPLE.map(p => {
    const q = getASVQuota(p.id);
    const annual  = computeASVWorkedHours(p.id, year, null);
    const monthly = computeASVWorkedHours(p.id, year === cy ? cy : year, year === cy ? cm : cm);
    const weekly  = computeASVWorkedHoursWeek(p.id, weekStart);
    return `
      <div class="hours-control-row">
        <div class="hours-control-name" style="color:${p.color};">${escapeHTML(p.short)}</div>
        <div class="hours-control-fraction">${Math.round(getASVTimeFraction(p.id)*100)}%</div>
        ${hoursItem('Semaine', weekly, q.weekly, alertClass(weekly, q.weekly))}
        ${hoursItem('Mois en cours', monthly, q.monthly, alertClass(monthly, q.monthly))}
        ${hoursItem(`Annuel ${year}`, annual, q.annual, alertClass(annual, q.annual))}
      </div>`;
  }).join('');
  return `
    <div class="card" style="margin-bottom:24px;" id="dash-hours-control-card">
      <h3 style="font-size:16px;margin-bottom:4px;">Contrôle du temps de travail ${year}</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:14px;">Base légale : ${formatNum(ANNUAL_FULLTIME_HOURS)}h/an temps plein (35h/semaine). Chaque demi-journée de présence = ${formatNum(HALFDAY_HOURS)}h + ajustements saisis.</p>
      <div class="hours-control-grid">${rows}</div>
    </div>
  `;
}

function buildSignaturesTableASV(year){
  let rows = '';
  for(let m=0; m<12; m++){
    const cells = ASV_PEOPLE.map(p=>{
      const detail = getSignatureDetail(p.id, year, m);
      if(!detail) return '<td class="text-muted">—</td>';
      const signedDate = new Date(detail.signedAt).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
      return `<td>
        <span class="signed-pill">
          ✅ ${escapeHTML(detail.signedName)} <span class="signed-pill-date">(${signedDate})</span>
          <button type="button" class="asv-remove-btn" data-revoke-signature="${p.id}|${year}|${m}" title="Annuler cette signature" aria-label="Annuler cette signature">✕</button>
        </span>
      </td>`;
    });
    rows += `<tr><td>${MONTH_NAMES[m]}</td>${cells.join('')}</tr>`;
  }
  return `
    <table class="recap-table">
      <thead><tr><th>Mois</th>${ASV_PEOPLE.map(p=>`<th>${p.short}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

const dashSubState = { tab: 'stats' };
function renderDashboard(){
  const container = document.getElementById('view-dashboard');
  const pendingCount = countPendingLeaveRequests();
  container.innerHTML = `
    <h2 class="section-title">Tableau de bord</h2>
    <p class="section-desc">Statistiques de présence et demandes de congé ASV.</p>
    <div class="sub-nav-row">
      <div class="sub-nav" id="dash-sub-nav">
        <button class="sub-tab ${dashSubState.tab==='stats'?'active':''}" data-sub="stats">🩺 Suivi vétérinaires</button>
        <button class="sub-tab ${dashSubState.tab==='hours'?'active':''}" data-sub="hours">🐾 Suivi ASV</button>
        <button class="sub-tab ${dashSubState.tab==='medical'?'active':''}" data-sub="medical">🏥 Visites médicales</button>
        <button class="sub-tab ${dashSubState.tab==='requests'?'active':''}" data-sub="requests">📋 Demandes de congé et de modification${pendingCount>0?` <span class="nav-badge">${pendingCount}</span>`:''}</button>
        <button class="sub-tab ${dashSubState.tab==='signatures'?'active':''}" data-sub="signatures">✍️ Feuilles signées</button>
        <button class="sub-tab ${dashSubState.tab==='interviews'?'active':''}" data-sub="interviews">📝 Entretiens annuels</button>
      </div>
    </div>
    <div id="dash-sub-stats" class="sub-page ${dashSubState.tab!=='stats'?'hidden':''}"></div>
    <div id="dash-sub-hours" class="sub-page ${dashSubState.tab!=='hours'?'hidden':''}"></div>
    <div id="dash-sub-medical" class="sub-page ${dashSubState.tab!=='medical'?'hidden':''}"></div>
    <div id="dash-sub-requests" class="sub-page ${dashSubState.tab!=='requests'?'hidden':''}"></div>
    <div id="dash-sub-signatures" class="sub-page ${dashSubState.tab!=='signatures'?'hidden':''}"></div>
    <div id="dash-sub-interviews" class="sub-page ${dashSubState.tab!=='interviews'?'hidden':''}"></div>
  `;
  container.querySelector('#dash-sub-nav').addEventListener('click', (e)=>{
    const btn = e.target.closest('.sub-tab');
    if(!btn) return;
    dashSubState.tab = btn.dataset.sub;
    renderDashboard();
    saveViewState();
  });
  if(dashSubState.tab === 'stats') renderDashboardStats();
  else if(dashSubState.tab === 'hours') renderDashboardHours();
  else if(dashSubState.tab === 'medical') renderDashboardMedical();
  else if(dashSubState.tab === 'signatures') renderDashboardSignatures();
  else if(dashSubState.tab === 'interviews') renderDashboardInterviews();
  else renderLeaveRequestsPage();
}
VIEW_RENDERERS['dashboard'] = renderDashboard;

function renderDashboardStats(){
  const container = document.getElementById('dash-sub-stats');
  const year = dashState.year;
  const cy = getCurrentYear();
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:0;">
      <div class="year-toggle" id="dash-year-toggle">
        <button data-year="${cy}" class="${year===cy?'active':''}">${cy}</button>
        <button data-year="${cy+1}" class="${year===cy+1?'active':''}">${cy+1}</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm btn-danger" id="dash-reset-current" title="Supprimer toutes les données ${cy}">🗑️ Réinitialiser ${cy}</button>
        <button class="btn btn-sm btn-danger" id="dash-reset-forecast" title="Supprimer toutes les données ${cy+1}">🗑️ Réinitialiser ${cy+1}</button>
      </div>
    </div>
    <div class="dash-grid" style="margin-top:18px;">
      ${PEOPLE.map(p=> buildPersonCard(year, p.id)).join('')}
    </div>
    <div class="card" style="margin-bottom:24px;">
      <h3 style="font-size:16px;margin-bottom:4px;">Comparaison mensuelle — David vs Stéphane</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Jours travaillés par mois, ${year}</p>
      <div class="chart-legend">
        ${PEOPLE.map(p=>`<span><span class="legend-swatch" style="background:${p.color};width:11px;height:11px;display:inline-block;border-radius:3px;"></span>${p.short}</span>`).join('')}
      </div>
      <div class="chart-wrap">${buildBarChartSVG(year)}</div>
    </div>
    <div class="card" style="margin-bottom:24px;">
      <h3 style="font-size:16px;margin-bottom:2px;">Récapitulatif mensuel ${year}</h3>
      <p class="text-muted" style="font-size:11.5px;margin-bottom:10px;">Écart = nombre de jours travaillés en plus, pour le vétérinaire concerné</p>
      ${buildRecapTable(year)}
    </div>
    <div id="dash-vets-cp"></div>
  `;
  container.querySelector('#dash-year-toggle').addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    dashState.year = parseInt(btn.dataset.year, 10);
    renderDashboardStats();
  });
  container.querySelector('#dash-reset-current').onclick = ()=> openResetYearModal(cy, false);
  container.querySelector('#dash-reset-forecast').onclick = ()=> openResetYearModal(cy + 1, true);
  renderGroupConges('vets', 'dash-vets-cp');
}

// --- Sous-page "Feuilles signées" : récapitulatif annuel des signatures ASV, avec
// annulation possible (rouvre le mois correspondant pour la personne concernée). ---
function renderDashboardSignatures(){
  const container = document.getElementById('dash-sub-signatures');
  const year = dashState.year;
  const cy = getCurrentYear();
  container.innerHTML = `
    <div class="year-toggle" id="dash-sig-year-toggle">
      <button data-year="${cy}" class="${year===cy?'active':''}">${cy}</button>
      <button data-year="${cy+1}" class="${year===cy+1?'active':''}">${cy+1}</button>
    </div>
    <div class="card" style="margin-top:18px;">
      <h3 style="font-size:16px;margin-bottom:4px;">Feuilles de présence signées ${year}</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Suivi des signatures électroniques mensuelles des ASV.</p>
      ${buildSignaturesTableASV(year)}
    </div>
  `;
  container.querySelectorAll('[data-revoke-signature]').forEach(btn=>{
    btn.onclick = async ()=>{
      const [personId, y, m] = btn.dataset.revokeSignature.split('|');
      openConfirmModal({
        title: 'Annuler cette signature ?',
        message: `Le mois redeviendra modifiable pour ${personOf(personId).short}.`,
        confirmLabel: 'Annuler la signature',
        onConfirm: async ()=>{
          await revokeSignature(personId, parseInt(y,10), parseInt(m,10));
          renderDashboardSignatures();
          showToast('Signature annulée', '🔓');
        },
      });
    };
  });
  container.querySelector('#dash-sig-year-toggle').addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    dashState.year = parseInt(btn.dataset.year, 10);
    renderDashboardSignatures();
  });
}

// --- Sous-page "Entretiens annuels" : suivi des entretiens annuels des ASV ---
function renderDashboardInterviews(){
  const container = document.getElementById('dash-sub-interviews');
  const year = dashState.year;
  const cy = getCurrentYear();

  function getInterview(personId){ return INTERVIEWS.find(i=>i.person_id===personId && i.year===year); }
  function isoToFR(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
  function statusBadge(itv){
    if(!itv || itv.status==='pending')
      return `<span style="color:#DC2626;font-weight:700;font-size:12px;">🔴 À planifier</span>`;
    if(itv.status==='scheduled')
      return `<span style="color:#D97706;font-weight:700;font-size:12px;">🟡 Planifié${itv.scheduled_date ? ` — ${isoToFR(itv.scheduled_date)}` : ''}</span>`;
    return `<span style="color:#16A34A;font-weight:700;font-size:12px;">🟢 Réalisé${itv.done_date ? ` — ${isoToFR(itv.done_date)}` : ''}</span>`;
  }
  function ratingDisplay(rating){
    if(!rating) return '';
    return `<span style="color:#F59E0B;font-size:14px;">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</span>`;
  }

  const cards = ASV_PEOPLE.length ? ASV_PEOPLE.map(p=>{
    const itv = getInterview(p.id);
    const isPending = !itv || itv.status==='pending';
    const interviewer = itv?.interviewer_id ? (personOf(itv.interviewer_id)?.short || itv.interviewer_id) : null;
    return `
      <div class="card" style="border-top:4px solid ${p.color};padding:18px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${p.color};display:inline-block;flex-shrink:0;"></span>
          <span style="font-weight:700;font-size:15px;">${escapeHTML(p.short)}</span>
        </div>
        <div style="margin-bottom:8px;">${statusBadge(itv)}</div>
        ${interviewer ? `<p class="text-muted" style="font-size:12px;margin-bottom:4px;">Responsable : ${escapeHTML(interviewer)}</p>` : ''}
        ${itv?.rating ? `<div style="margin-bottom:8px;">${ratingDisplay(itv.rating)}</div>` : ''}
        <button class="btn btn-sm ${isPending?'btn-primary':''}" data-itv-open="${p.id}"
          style="${isPending?'':'border:1px solid var(--color-border);'}margin-top:10px;width:100%;justify-content:center;">
          ${isPending ? '➕ Planifier' : '✏️ Voir / Modifier'}
        </button>
      </div>`;
  }).join('') : `<p class="text-muted">Aucune ASV dans le planning.</p>`;

  container.innerHTML = `
    <div class="year-toggle" id="dash-itv-year-toggle" style="margin-bottom:20px;">
      <button data-year="${cy}" class="${year===cy?'active':''}">${cy}</button>
      <button data-year="${cy+1}" class="${year===cy+1?'active':''}">${cy+1}</button>
    </div>
    <div class="dash-grid" style="--dash-cols:${Math.max(ASV_PEOPLE.length,1)};">${cards}</div>
  `;
  container.querySelector('#dash-itv-year-toggle').addEventListener('click', (e)=>{
    const btn=e.target.closest('button'); if(!btn) return;
    dashState.year=parseInt(btn.dataset.year,10); renderDashboardInterviews();
  });
  container.querySelectorAll('[data-itv-open]').forEach(btn=>{
    btn.onclick=()=> openInterviewModal(btn.dataset.itvOpen, year);
  });
}

function openInterviewModal(personId, year){
  const p = personOf(personId);
  const existing = INTERVIEWS.find(i=>i.person_id===personId && i.year===year) || {};
  const itvId = existing.id || null;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box modal-box-wide';

  const statuses = [
    {v:'pending',   l:'🔴 À planifier'},
    {v:'scheduled', l:'🟡 Planifié'},
    {v:'done',      l:'🟢 Réalisé'},
  ];
  const curStatus = existing.status || 'pending';
  const curRating = existing.rating || 0;

  function starRow(rating){
    return [1,2,3,4,5].map(n=>`<span data-star="${n}" style="font-size:26px;cursor:pointer;color:${rating>=n?'#F59E0B':'#CBD5E1'};">★</span>`).join('');
  }

  box.innerHTML = `
    <h3 style="margin-bottom:14px;">Entretien annuel ${year} — ${escapeHTML(p?.short||personId)}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
      <div>
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Statut</label>
        <select id="itv-status" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;">
          ${statuses.map(s=>`<option value="${s.v}" ${curStatus===s.v?'selected':''}>${s.l}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Vétérinaire responsable</label>
        <select id="itv-interviewer" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;">
          <option value="">—</option>
          ${PEOPLE.map(vp=>`<option value="${vp.id}" ${existing.interviewer_id===vp.id?'selected':''}>${escapeHTML(vp.short)}</option>`).join('')}
        </select>
      </div>
      <div id="itv-scheduled-wrap" style="display:${curStatus==='pending'?'none':'block'};">
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Date prévue</label>
        <input type="date" id="itv-scheduled-date" value="${existing.scheduled_date||''}"
          style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;box-sizing:border-box;">
      </div>
      <div id="itv-done-wrap" style="display:${curStatus==='done'?'block':'none'};">
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Date de réalisation</label>
        <input type="date" id="itv-done-date" value="${existing.done_date||''}"
          style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;box-sizing:border-box;">
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:6px;">Note globale</label>
      <div id="itv-rating-wrap" style="display:flex;gap:4px;">${starRow(curRating)}</div>
      <input type="hidden" id="itv-rating-val" value="${curRating}">
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Bilan objectifs N-1</label>
      <textarea id="itv-obj-prev" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHTML(existing.objectives_prev||'')}</textarea>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Objectifs N+1</label>
      <textarea id="itv-obj-next" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHTML(existing.objectives_next||'')}</textarea>
    </div>
    <div style="margin-bottom:18px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Commentaires libres</label>
      <textarea id="itv-comments" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHTML(existing.comments||'')}</textarea>
    </div>
    <p id="itv-error" style="color:#B91C1C;font-size:12px;display:none;margin:0 0 8px;"></p>
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Fermer</button>
      <button class="btn btn-primary" id="itv-save-btn">Enregistrer</button>
    </div>
  `;

  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };

  const statusSel = box.querySelector('#itv-status');
  function updateDateFields(){
    const s = statusSel.value;
    box.querySelector('#itv-scheduled-wrap').style.display = s !== 'pending' ? 'block' : 'none';
    box.querySelector('#itv-done-wrap').style.display = s === 'done' ? 'block' : 'none';
  }
  statusSel.addEventListener('change', updateDateFields);

  let currentRating = curRating;
  box.querySelector('#itv-rating-wrap').addEventListener('click', (e)=>{
    const star = e.target.closest('[data-star]');
    if(!star) return;
    currentRating = parseInt(star.dataset.star);
    // Toggle off if clicking the same star
    if(currentRating === parseInt(box.querySelector('#itv-rating-val').value)) currentRating = 0;
    box.querySelector('#itv-rating-val').value = currentRating;
    box.querySelectorAll('[data-star]').forEach((s,i)=>{
      s.style.color = currentRating >= i+1 ? '#F59E0B' : '#CBD5E1';
    });
  });

  box.querySelector('#itv-save-btn').onclick = async ()=>{
    const statusVal = box.querySelector('#itv-status').value;
    const payload = {
      person_id: personId,
      year,
      status: statusVal,
      scheduled_date: box.querySelector('#itv-scheduled-date').value || null,
      done_date: box.querySelector('#itv-done-date').value || null,
      interviewer_id: box.querySelector('#itv-interviewer').value || null,
      objectives_prev: box.querySelector('#itv-obj-prev').value.trim() || null,
      objectives_next: box.querySelector('#itv-obj-next').value.trim() || null,
      comments: box.querySelector('#itv-comments').value.trim() || null,
      rating: parseInt(box.querySelector('#itv-rating-val').value) || null,
      updated_at: new Date().toISOString(),
    };
    const errEl = box.querySelector('#itv-error');
    errEl.style.display = 'none';
    box.querySelector('#itv-save-btn').disabled = true;
    try{
      let res;
      if(itvId){
        res = await fetch(`${SUPABASE_URL}annual_interviews?id=eq.${itvId}`, {
          method:'PATCH',
          headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${SUPABASE_URL}annual_interviews`, {
          method:'POST',
          headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
          body: JSON.stringify(payload),
        });
      }
      if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.message||`HTTP ${res.status}`); }
      await loadInterviews();
      close();
      renderDashboardInterviews();
      showToast('Entretien enregistré', '✅');
      if(payload.scheduled_date && typeof triggerPushNotification === 'function'){
        triggerPushNotification({
          type: 'interview',
          title: 'Entretien annuel planifié',
          body: `Votre entretien annuel ${year} est prévu le ${formatFR(payload.scheduled_date)}.`,
          targetUsers: [personId],
          data: { type:'interview' },
        });
      }
    }catch(e){
      errEl.textContent = 'Erreur : ' + e.message;
      errEl.style.display = 'block';
      box.querySelector('#itv-save-btn').disabled = false;
    }
  };
}

// --- Sous-page "Heures ASV" : suivi mensuel/annuel du temps de travail vs quota 1607h ---
function buildDashWeeklyMonthCard(year, month){
  if(!ASV_PEOPLE.length) return '';
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month+1, 0);
  // Toutes les semaines qui touchent ce mois
  const weeks = [];
  let cur = getWeekMondayDate(firstDay);
  while(cur <= lastDay){ weeks.push(new Date(cur)); cur=new Date(cur); cur.setDate(cur.getDate()+7); }

  // Heures travaillées + OT per-day (jours de congé contribuent 0, pas de pénalité)
  function weekData(mon, pid){
    let h=0, ot=0;
    for(let d=0;d<6;d++){
      const dt=new Date(mon); dt.setDate(dt.getDate()+d);
      if(isSunday(dt)) continue;
      const iso=fmtISO(dt);
      h+=calcDayTE(iso,pid)+calcLunchTE(iso,pid);
      ot+=calcAutoOT(iso,pid);
    }
    return {h, ot};
  }

  const headers=ASV_PEOPLE.map(p=>{
    const q=getASVQuota(p.id);
    const qLabel = p.saturdayOnly ? `${formatHHMM(ASV_STD_SAT_CARLA)}/sam` : `quota ${formatHHMM(q.weekly)}/sem`;
    return `<th style="text-align:right;padding:6px 10px;">${escapeHTML(p.short)}<br><span class="text-muted" style="font-size:10px;font-weight:400;">${qLabel}</span></th>`;
  }).join('');

  let rows='', monthOT=ASV_PEOPLE.map(()=>0);
  for(const mon of weeks){
    const endW=new Date(mon); endW.setDate(endW.getDate()+5);
    const wLabel=`${mon.getDate()}/${mon.getMonth()+1}–${endW.getDate()}/${endW.getMonth()+1}`;
    const isCurrentWeek = weekNavState.mondayISO && fmtISO(mon)===weekNavState.mondayISO;
    let weekOver42 = false;
    const cols=ASV_PEOPLE.map((p,i)=>{
      const {h, ot}=weekData(mon,p.id);
      const delta=h>0?roundTo15min(ot):null;
      if(delta!==null) monthOT[i]=roundTo15min(monthOT[i]+delta);
      const dColor=delta===null?'':delta>0?'#16a34a':delta<0?'#ea580c':'var(--color-text-muted)';
      const over42 = !p.saturdayOnly && h >= WEEKLY_MAX_HOURS;
      if(over42) weekOver42 = true;
      return `<td style="text-align:right;padding:5px 10px;">
        ${h>0?`<strong style="${over42?'color:#DC2626;':''}">${over42?'⚠️ ':''}${formatHHMM(h)}</strong>`:'<span class="text-muted">—</span>'}
        ${delta!==null?`<span style="font-size:11px;color:${dColor};margin-left:4px;">${signedHHMM(delta)}</span>`:''}
      </td>`;
    }).join('');
    rows+=`<tr style="${isCurrentWeek?'background:#f0fdf4;':weekOver42?'background:#FEF2F2;':''}"><td style="padding:5px 10px;font-size:12px;white-space:nowrap;color:${isCurrentWeek?'var(--color-primary)':weekOver42?'#DC2626':'inherit'};font-weight:${isCurrentWeek||weekOver42?'700':'400'};">S ${wLabel}${weekOver42?' ⚠️':''}</td>${cols}</tr>`;
  }

  // Ligne total mois avec écart et équivalent jours
  const totalCols=ASV_PEOPLE.map((p,i)=>{
    const ot=monthOT[i];
    const tf=getASVTimeFraction(p.id);
    const dayEq=ot!==0?Math.round(ot/(7*tf)*10)/10:null;
    const color=ot>0?'#16a34a':ot<0?'#ea580c':'var(--color-text-muted)';
    return `<td style="text-align:right;padding:7px 10px;font-weight:700;">
      ${ot!==0?`<span style="color:${color}">${signedHHMM(ot)}</span>
      <span class="text-muted" style="font-size:11px;"> (${dayEq>=0?'+':''}${formatNum(dayEq)}j)</span>`:'<span class="text-muted">Équilibre</span>'}
    </td>`;
  }).join('');

  return `<div class="card" style="margin-bottom:20px;overflow-x:auto;">
    <h3 style="font-size:16px;margin-bottom:10px;">Heures par semaine — ${MONTH_NAMES[month]} ${year}</h3>
    <table class="recap-table" style="min-width:400px;">
      <thead><tr><th style="text-align:left;">Semaine</th>${headers}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td style="font-weight:800;padding:7px 10px;">Écart mensuel</td>
        ${totalCols}
      </tr></tfoot>
    </table>
    <p class="text-muted" style="font-size:11px;margin-top:8px;">Écart = heures travaillées − quota hebdomadaire. Équivalent en jours = écart ÷ ${formatNum(7)} h/jour (temps plein).</p>
  </div>`;
}
// ── Carte 1 : Modulation annuelle ──────────────────────────────
function buildASVModulationCard(year){
  const cy = getCurrentYear();
  const cm = today.getMonth();
  const modulated = ASV_PEOPLE.filter(p => !p.archived && !p.saturdayOnly);
  const carlaList  = ASV_PEOPLE.filter(p => !p.archived && p.saturdayOnly);

  const rows = modulated.map(p => {
    const q      = getASVQuota(p.id);
    const worked = computeASVWorkedHours(p.id, year, null);
    const target = q.annual;
    const pct    = target ? Math.min(100, Math.round(worked / target * 100)) : 0;
    const barC   = pct > 100 ? '#DC2626' : pct >= 90 ? '#F59E0B' : p.color;
    const icon   = pct > 100 ? '🔴' : pct >= 90 ? '🟡' : '🟢';
    const tfLabel = p.timeFraction >= 1 ? 'plein temps' : `${Math.round(p.timeFraction * 100)}% temps partiel`;
    let estim = '';
    if(year === cy && cm > 0 && worked > 0 && target){
      const proj = Math.round(worked / cm * 12);
      const diff = proj - target;
      const dc   = Math.abs(diff) < 20 ? '#16A34A' : diff > 0 ? '#F59E0B' : '#EA580C';
      estim = `<div style="display:flex;justify-content:flex-end;margin-top:3px;"><span style="font-size:11px;color:${dc};">proj. fin d'année : ${formatNum(proj)}h (${diff >= 0 ? '+' : ''}${formatNum(diff)}h vs cible)</span></div>`;
    }
    const overNotif = (worked > target && target > 0)
      ? `<div style="margin-top:5px;padding:5px 8px;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;font-size:11px;color:#DC2626;display:flex;align-items:center;gap:6px;">
          <span style="flex-shrink:0;">⚠️</span><span>Heures dépassant la modulation — à régulariser sur le bulletin de <strong>décembre / janvier</strong></span>
        </div>`
      : '';
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block;flex-shrink:0;"></span>
        <span style="font-weight:700;font-size:14px;">${escapeHTML(p.short)}</span>
        <span style="font-size:11px;color:var(--color-text-muted);">${tfLabel}</span>
        <span style="margin-left:auto;font-size:13px;">${icon} <strong>${formatNum(worked)}h</strong><span style="color:var(--color-text-muted);"> / ${formatNum(target)}h</span></span>
        <span style="font-size:14px;font-weight:700;color:${barC};min-width:38px;text-align:right;">${pct}%</span>
      </div>
      <div style="background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${pct}%;background:${barC};height:100%;border-radius:99px;"></div>
      </div>
      ${estim}${overNotif}
    </div>`;
  }).join('');

  const carlaRows = carlaList.map(p => {
    const worked = computeASVWorkedHours(p.id, year, null);
    let satCount = 0;
    for(let m = 0; m < 12; m++){
      const nbM = daysInMonth(year, m);
      for(let d = 1; d <= nbM; d++){
        const dt = new Date(year, m, d); if(dt.getDay() !== 6) continue;
        const iso = fmtISO(dt);
        if(getSlotState(iso, p.id, 'M') === 'present' || getSlotState(iso, p.id, 'AM') === 'present') satCount++;
      }
    }
    return `<div style="display:flex;align-items:center;gap:10px;padding-top:14px;margin-top:4px;border-top:1px solid var(--color-border);">
      <span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block;flex-shrink:0;"></span>
      <span style="font-weight:700;font-size:14px;">${escapeHTML(p.short)}</span>
      <span style="font-size:11px;color:var(--color-text-muted);">— samedi uniquement</span>
      <span style="margin-left:auto;font-size:13px;"><strong>${satCount} samedis</strong><span style="color:var(--color-text-muted);"> · ${formatNum(worked)}h</span></span>
      <span style="font-size:11px;background:#EFF6FF;color:#1D4ED8;border-radius:4px;padding:2px 8px;white-space:nowrap;flex-shrink:0;">Hors modulation</span>
    </div>`;
  }).join('');

  return `<div class="card" style="margin-bottom:18px;">
    <div style="margin-bottom:16px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">📅 Modulation annuelle — ${year}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Cible : <strong>1 607h</strong> (plein temps) · 5 semaines CP comprises · Plafond : <strong>42h / semaine</strong></p>
    </div>
    ${rows}${carlaRows}
  </div>`;
}

// ── Carte 2 : Semaine en cours — plafond 42h ───────────────────
function buildASVWeeklyCapCard(){
  const mon  = weekNavState.mondayISO ? new Date(weekNavState.mondayISO+'T00:00:00') : getWeekMondayDate(today);
  const endW = new Date(mon); endW.setDate(endW.getDate() + 5);
  const fmt  = d => `${d.getDate()}/${d.getMonth()+1}`;
  const asv  = ASV_PEOPLE.filter(p => !p.archived);
  let anyAlert = false;

  const rows = asv.map(p => {
    let h = 0;
    for(let d = 0; d < 6; d++){
      const dt = new Date(mon); dt.setDate(dt.getDate() + d);
      if(isSunday(dt)) continue;
      const iso = fmtISO(dt);
      if(hasTE(iso, p.id)){
        h += calcDayTE(iso, p.id) + calcLunchTE(iso, p.id);
      } else {
        if(getSlotState(iso, p.id, 'M')  === 'present') h += HALFDAY_HOURS;
        if(getSlotState(iso, p.id, 'AM') === 'present') h += HALFDAY_HOURS;
      }
      h += getOvertimeHours(iso, p.id);
    }
    h = Math.round(h * 100) / 100;
    const cap  = WEEKLY_MAX_HOURS;
    const over = !p.saturdayOnly && h >= cap;
    const near = !p.saturdayOnly && h >= cap * 0.85 && !over;
    if(over) anyAlert = true;
    const barC = over ? '#DC2626' : near ? '#F59E0B' : p.color;
    const pct  = p.saturdayOnly
      ? Math.min(100, Math.round(h / ASV_STD_SAT_CARLA * 100))
      : Math.min(100, Math.round(h / cap * 100));
    const hStr = h > 0 ? formatHHMM(h) : '—';
    const suffix = p.saturdayOnly
      ? `<span style="font-size:11px;color:var(--color-text-muted);"> (samedi)</span>`
      : `<span style="font-size:11px;color:var(--color-text-muted);"> / ${cap}h</span>${over ? ' ⚠️' : ''}`;
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;">
      <span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block;flex-shrink:0;margin-top:1px;"></span>
      <span style="font-size:13px;font-weight:600;min-width:75px;">${escapeHTML(p.short)}</span>
      <div style="flex:1;background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${pct}%;background:${barC};height:100%;border-radius:99px;"></div>
      </div>
      <span style="font-size:13px;font-weight:${over?'700':'400'};color:${over?'#DC2626':near?'#F59E0B':'inherit'};min-width:100px;text-align:right;">${hStr}${suffix}</span>
    </div>`;
  }).join('');

  return `<div class="card" style="margin-bottom:18px;${anyAlert?'border-left:3px solid #DC2626;':''}">
    <div style="margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">⏱ Semaine du ${fmt(mon)} au ${fmt(endW)}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Plafond légal : <strong>42h</strong> / semaine (art. L3122-4 CT)</p>
    </div>
    ${anyAlert ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:8px 12px;margin-bottom:14px;color:#DC2626;font-size:13px;font-weight:600;">⚠️ Plafond de 42h atteint cette semaine</div>` : ''}
    ${rows}
  </div>`;
}

// ── Carte 3 : Équité des samedis ───────────────────────────────
function buildASVSaturdayEquityCard(year){
  const asv = ASV_PEOPLE.filter(p => !p.archived && !p.saturdayOnly);
  if(!asv.length) return '';
  const counts = Object.fromEntries(asv.map(p => [p.id, 0]));
  for(let m = 0; m < 12; m++){
    const nbM = daysInMonth(year, m);
    for(let d = 1; d <= nbM; d++){
      const dt = new Date(year, m, d); if(dt.getDay() !== 6) continue;
      const iso = fmtISO(dt);
      asv.forEach(p => {
        if(getSlotState(iso, p.id, 'M') === 'present' || getSlotState(iso, p.id, 'AM') === 'present') counts[p.id]++;
      });
    }
  }
  const vals = asv.map(p => counts[p.id]);
  const avg  = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
  const maxV = Math.max(...vals, 1);
  const rows = asv.map(p => {
    const v      = counts[p.id];
    const diff   = Math.round((v - avg) * 10) / 10;
    const diffStr = Math.abs(diff) < 0.6 ? 'équilibre ✅' : `${diff > 0 ? '+' : ''}${diff} vs moy.${Math.abs(diff) > 2 ? ' ⚠️' : ''}`;
    const diffC  = Math.abs(diff) <= 1 ? '#16A34A' : '#EA580C';
    const barW   = Math.round(v / maxV * 100);
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;">
      <span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block;flex-shrink:0;"></span>
      <span style="font-size:13px;font-weight:600;min-width:75px;">${escapeHTML(p.short)}</span>
      <div style="flex:1;background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${barW}%;background:${p.color};height:100%;border-radius:99px;"></div>
      </div>
      <span style="font-size:14px;font-weight:700;min-width:30px;text-align:right;">${v}</span>
      <span style="font-size:12px;color:${diffC};min-width:120px;">${diffStr}</span>
    </div>`;
  }).join('');
  return `<div class="card" style="margin-bottom:18px;">
    <div style="margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">🗓 Équité des samedis — ${year}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Répartition des samedis entre Marie, Johanna et Julie · Moy. : <strong>${avg} samedis</strong></p>
    </div>
    ${rows}
  </div>`;
}

// ── Carte 4 : Heures mensuelles — tableau compact ──────────────
function buildASVMonthlyTable(year){
  const cy = getCurrentYear();
  const cm = today.getMonth();
  const modulated = ASV_PEOPLE.filter(p => !p.archived && !p.saturdayOnly);
  if(!modulated.length) return '';
  const headers = modulated.map(p =>
    `<th style="text-align:right;padding:6px 10px;">${escapeHTML(p.short)}<br><span style="font-weight:400;font-size:10px;color:var(--color-text-muted);">quota ${formatNum(getASVQuota(p.id).monthly)}h/m</span></th>`
  ).join('');
  let rows = '';
  for(let m = 0; m < 12; m++){
    const isFuture = year === cy && m > cm;
    const isCur    = year === cy && m === cm;
    const cols = modulated.map(p => {
      if(isFuture) return `<td style="padding:5px 10px;text-align:right;color:var(--color-text-muted);">—</td>`;
      const q   = getASVQuota(p.id);
      const w   = computeASVWorkedHours(p.id, year, m);
      const pct = q.monthly > 0 ? w / q.monthly : 0;
      const icon = pct > 1.05 ? '🔴' : pct >= 0.9 ? '🟢' : w > 0 ? '🟡' : '';
      return `<td style="padding:5px 10px;text-align:right;font-size:13px;">${icon} <strong>${formatNum(w)}</strong><span style="color:var(--color-text-muted);font-size:11px;">h</span></td>`;
    }).join('');
    rows += `<tr style="${isCur ? 'background:#f0fdf4;font-weight:700;' : ''}">
      <td style="padding:5px 10px;font-size:13px;color:${isCur ? 'var(--color-primary)' : 'inherit'};">${MONTH_NAMES[m]}${isCur ? ' ←' : ''}</td>
      ${cols}
    </tr>`;
  }
  const totalCols = modulated.map(p => {
    const q   = getASVQuota(p.id);
    const w   = computeASVWorkedHours(p.id, year, null);
    const pct = q.annual > 0 ? Math.round(w / q.annual * 100) : 0;
    const c   = pct > 100 ? '#DC2626' : pct >= 90 ? '#F59E0B' : '#16A34A';
    return `<td style="padding:8px 10px;text-align:right;font-weight:700;border-top:2px solid var(--color-border);"><span style="color:${c};">${formatNum(w)}h</span><span style="font-size:11px;color:var(--color-text-muted);"> / ${formatNum(q.annual)}h (${pct}%)</span></td>`;
  }).join('');
  return `<div class="card" style="margin-bottom:18px;">
    <div style="margin-bottom:10px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">📊 Heures mensuelles — ${year}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">🟢 Quota atteint · 🟡 &lt; 90% du quota · 🔴 Dépassement</p>
    </div>
    <div style="overflow-x:auto;">
      <table class="recap-table" style="min-width:320px;width:100%;">
        <thead><tr><th style="text-align:left;">Mois</th>${headers}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td style="font-weight:800;padding:8px 10px;">Total ${year}</td>${totalCols}</tr></tfoot>
      </table>
    </div>
  </div>`;
}

function renderDashboardHours(){
  const container = document.getElementById('dash-sub-hours');
  const year = dashState.year;
  const cy   = getCurrentYear();
  if(!weekNavState.mondayISO) weekNavState.mondayISO = fmtISO(getWeekMondayDate(today));
  container.innerHTML = `
    <div class="year-toggle" id="dash-hours-year-toggle" style="margin-bottom:16px;">
      <button data-year="${cy}" class="${year===cy?'active':''}">${cy}</button>
      <button data-year="${cy+1}" class="${year===cy+1?'active':''}">${cy+1}</button>
    </div>
    ${buildASVModulationCard(year)}
    ${year === cy ? buildASVWeeklyCapCard() : ''}
    ${buildASVSaturdayEquityCard(year)}
    ${buildASVMonthlyTable(year)}
    <div id="dash-asv-cp"></div>
  `;
  container.querySelector('#dash-hours-year-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button'); if(!btn) return;
    dashState.year = parseInt(btn.dataset.year, 10); renderDashboardHours();
  });
  renderGroupConges('asv', 'dash-asv-cp');
}

// --- Sous-page "Demandes de congé" : liste groupée, triée en attente -> approuvées ->
// refusées, avec actions d'approbation/refus (refus avec commentaire obligatoire). ---
function renderLeaveRequestsPage(){
  const container = document.getElementById('dash-sub-requests');
  const groups = sortLeaveGroups(collectAllLeaveGroups());
  const statusLabel = { pending:'En attente', approved:'Approuvée', rejected:'Refusée' };
  const statusClass = { pending:'leave-pending', approved:'leave-approved', rejected:'leave-rejected' };
  const rows = groups.map((g, idx)=>{
    const person = personOf(g.personId);
    const first = g.slots[0], last = g.slots[g.slots.length-1];
    const range = first.iso === last.iso
      ? `${formatFR(first.iso)} (${SLOT_LABELS[first.slot]})`
      : `du ${formatFR(first.iso)} au ${formatFR(last.iso)}`;
    const actions = g.status === 'pending' ? `
      <div class="flex gap-2" style="margin-top:8px;">
        <button class="btn btn-sm btn-primary" data-approve="${idx}">✓ Approuver</button>
        <button class="btn btn-sm btn-danger" data-reject="${idx}">✕ Refuser</button>
      </div>
      <div class="hidden" data-reject-form="${idx}" style="margin-top:8px;">
        <textarea data-reject-comment="${idx}" rows="2" placeholder="Motif du refus (obligatoire, visible par l'équipe)"></textarea>
        <div class="flex gap-2" style="margin-top:6px;">
          <button class="btn btn-sm btn-danger" data-reject-confirm="${idx}">Confirmer le refus</button>
          <button class="btn btn-sm" data-reject-cancel="${idx}">Annuler</button>
        </div>
      </div>
    ` : g.comment ? `<p class="text-muted" style="font-size:12.5px;margin-top:6px;">💬 ${escapeHTML(g.comment)}</p>` : '';
    return `
      <div class="card" data-leave-group="${idx}" style="margin-bottom:12px;border-left:4px solid ${person.color};">
        <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <strong style="color:${person.color};">${person.short}</strong> — ${range}
            ${g.label ? `<span class="text-muted"> · ${escapeHTML(g.label)}</span>` : ''}
            <p class="text-muted" style="font-size:12px;margin-top:2px;">${g.slots.length} demi-journée${g.slots.length>1?'s':''}</p>
          </div>
          <span class="leave-status-badge ${statusClass[g.status]}">${statusLabel[g.status]}</span>
        </div>
        ${actions}
      </div>
    `;
  }).join('');
  container.innerHTML = `
    <p class="section-desc" style="margin-bottom:14px;">Toutes les demandes de congé soumises par les ASV, sur ${getCurrentYear()} et ${getCurrentYear()+1}.</p>
    ${groups.length ? rows : `<p class="text-muted">Aucune demande de congé pour le moment.</p>`}
  `;
  container.querySelectorAll('[data-approve]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const g = groups[parseInt(btn.dataset.approve,10)];
      decideLeaveGroup(g, 'approved', '');
      if(typeof triggerPushNotification === 'function'){
        triggerPushNotification({
          type: 'leave_approved',
          title: 'Demande de congé approuvée',
          body: `Votre demande du ${formatFR(g.slots[0].iso)} a été approuvée.`,
          targetUsers: [g.personId],
          data: { type:'leave_approved' },
        });
      }
      renderDashboard();
      showToast('Demande approuvée', '✓');
    });
  });
  container.querySelectorAll('[data-reject]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      container.querySelector(`[data-reject-form="${btn.dataset.reject}"]`).classList.remove('hidden');
    });
  });
  container.querySelectorAll('[data-reject-cancel]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      container.querySelector(`[data-reject-form="${btn.dataset.rejectCancel}"]`).classList.add('hidden');
    });
  });
  container.querySelectorAll('[data-reject-confirm]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = btn.dataset.rejectConfirm;
      const comment = container.querySelector(`[data-reject-comment="${idx}"]`).value.trim();
      if(!comment){ showToast('Un commentaire est nécessaire pour refuser', '⚠️'); return; }
      const g = groups[parseInt(idx,10)];
      decideLeaveGroup(g, 'rejected', comment);
      if(typeof triggerPushNotification === 'function'){
        triggerPushNotification({
          type: 'leave_rejected',
          title: 'Demande de congé refusée',
          body: `Votre demande du ${formatFR(g.slots[0].iso)} a été refusée — ${comment}`,
          targetUsers: [g.personId],
          data: { type:'leave_rejected' },
        });
      }
      renderDashboard();
      showToast('Demande refusée', '✕');
    });
  });
}

/* ================================================================
   MODULE CP — Compteur Congés Payés
   ================================================================ */
function easterDate(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day);
}
function getJoursFeries(year){
  const easter=easterDate(year);
  function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function isoOf(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  const feries = new Set([
    `${year}-01-01`, `${year}-05-01`, `${year}-05-08`,
    `${year}-07-14`, `${year}-08-15`, `${year}-11-01`, `${year}-11-11`, `${year}-12-25`,
    isoOf(addDays(easter,1)),   // Lundi de Pâques
    isoOf(addDays(easter,39)),  // Ascension
    isoOf(addDays(easter,50)),  // Lundi de Pentecôte
  ]);
  return feries;
}

function getCPTakenDays(personId, startISO, endISO){
  let halfDays = 0;
  const isASV = isASVPerson(personId);
  const labelRe = /cp|cong[eé]/i;
  for(const key of Object.keys(DATA.slots)){
    const m = key.match(/^(\d{4}-\d{2}-\d{2})_(.+)_(M|AM)$/);
    if(!m) continue;
    const [,iso,pid] = m;
    if(pid !== personId) continue;
    if(iso < startISO || iso > endISO) continue;
    if(DATA.slots[key] !== 'absent') continue;
    if(isASV){
      // ASV : seules les absences avec motif CP/Congé comptent (les autres motifs
      // comme Maladie ou Formation ne consomment pas de CP)
      const label = DATA.slots[key.replace(/_(M|AM)$/, '_$1_label')] || '';
      if(!labelRe.test(label)) continue;
    }
    // Vétérinaires : toute absence = CP (pas de workflow de demande de congé)
    halfDays++;
  }
  return Math.round(halfDays / 2 * 100) / 100;
}

function cpPeriodISO(referenceYear){
  const y = referenceYear;
  const start = `${y}-01-01`;
  const end   = `${y}-12-31`;
  return { start, end, label:`1 janv. ${y} → 31 déc. ${y}` };
}

function getCPAcquired(person, referenceYear){
  const { start, end } = cpPeriodISO(referenceYear);
  const todayISO = fmtISO(today);
  const effectiveEnd = todayISO < end ? todayISO : end;
  const startDate = new Date(start + 'T00:00:00');
  const endDate   = new Date(effectiveEnd + 'T00:00:00');
  if(endDate < startDate) return 0;
  // Count full months elapsed (partial month = 0, full month = 1 credit)
  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  // Include the start month itself if today has passed day 1 of that month
  if(endDate.getDate() >= 1) months++;
  months = Math.max(0, Math.min(months, 12));
  return Math.round(months * CP_DAYS_PER_MONTH * (person.timeFraction ?? 1.0) * 100) / 100;
}

function renderGroupConges(group, containerId){
  const container = document.getElementById(containerId || `${group}-sub-conges`);
  if(!container) return;
  const isAdmin = currentUser?.role === 'admin';
  const cy = getCurrentYear();
  if(!renderGroupConges._year) renderGroupConges._year = {};
  let cpYear = (typeof renderGroupConges._year[group] === 'number') ? renderGroupConges._year[group] : cy;

  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-muted);">Chargement…</div>';

  (async ()=>{
    let adjustments = [];
    try{
      const res = await fetch(`${SUPABASE_URL}cp_adjustments?year=eq.${cpYear}&select=*`, { headers: supabaseHeaders() });
      if(res.ok) adjustments = await res.json();
    }catch(e){ console.warn('cp_adjustments inaccessibles', e); }

    const adjByPerson = {};
    adjustments.forEach(a => { adjByPerson[a.person_id] = a; });

    const people = (group === 'vets' ? PEOPLE : ASV_PEOPLE).filter(p => !p.archived);
    const { label: periodLabel, start: startISO, end: endISO } = cpPeriodISO(cpYear);

    function soldeColor(b){ return b >= 10 ? '#16A34A' : b >= 5 ? '#CA8A04' : '#DC2626'; }
    function swatch(c){ return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:4px;vertical-align:middle;"></span>`; }

    const rows = people.map(p=>{
      const adj = adjByPerson[p.id] || { carried_over:0, extra_days:0, extra_note:'' };
      const acquired  = getCPAcquired(p, cpYear);
      const taken     = getCPTakenDays(p.id, startISO, endISO);
      const carriedOver = parseFloat(adj.carried_over) || 0;
      const extra     = parseFloat(adj.extra_days) || 0;
      const balance   = Math.round((acquired + carriedOver + extra - taken) * 100) / 100;
      const total     = acquired + carriedOver + extra;
      const pct       = total > 0 ? Math.min(100, Math.round(taken/total*100)) : 0;
      const balC      = soldeColor(balance);
      return `<tr>
        <td style="padding:10px 12px;font-weight:600;">${swatch(p.color)}${escapeHTML(p.short||p.name)}</td>
        <td style="padding:10px 12px;text-align:center;">${acquired}j</td>
        <td style="padding:10px 12px;text-align:center;">${taken}j</td>
        <td style="padding:10px 12px;text-align:center;">${carriedOver > 0 ? carriedOver+'j' : '—'}</td>
        <td style="padding:10px 12px;text-align:center;">${extra !== 0 ? (extra>0?'+':'')+extra+'j' : '—'}</td>
        ${group !== 'vets' ? `<td style="padding:10px 12px;text-align:center;font-weight:700;color:${balC};">${balance}j</td>` : ''}
        <td style="padding:10px 12px;min-width:120px;">
          <div style="background:var(--color-border);border-radius:99px;height:6px;overflow:hidden;">
            <div style="width:${pct}%;background:${pct>100?'#DC2626':'var(--color-primary)'};height:100%;border-radius:99px;"></div>
          </div>
          <div style="font-size:11px;color:var(--color-muted);margin-top:2px;">${pct}% posés</div>
        </td>
        ${isAdmin?`<td style="padding:10px 12px;"><button class="btn btn-sm cp-adjust-btn" data-pid="${p.id}" data-carried="${carriedOver}" data-extra="${extra}" data-note="${escapeHTML(adj.extra_note||'')}">✎ Ajuster</button></td>`:''}
      </tr>`;
    }).join('');

    const yearBtns = [cpYear-1, cpYear, cpYear+1].map(y =>
      `<button class="cp-year-btn" data-year="${y}" style="border:1.5px solid ${y===cpYear?'var(--color-primary)':'var(--color-border)'};background:${y===cpYear?'var(--color-secondary)':'var(--color-card)'};color:${y===cpYear?'var(--color-primary)':'var(--color-text)'};padding:5px 14px;border-radius:20px;font-size:13px;cursor:pointer;font-weight:${y===cpYear?'700':'400'};">${y}</button>`
    ).join('');

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <div>
          <div style="font-size:13.5px;font-weight:700;color:var(--color-text);">Période de référence : ${periodLabel}</div>
          <div style="font-size:12px;color:var(--color-muted);">${CP_DAYS_PER_MONTH}j acquis/mois (proratisé selon le taux d'activité)</div>
        </div>
        <div style="display:flex;gap:6px;">${yearBtns}</div>
      </div>
      <div class="card" style="overflow-x:auto;">
        <table class="recap-table" style="min-width:600px;">
          <thead><tr>
            <th style="text-align:left;">Personne</th>
            <th style="text-align:center;">Acquis</th>
            <th style="text-align:center;">Posés</th>
            <th style="text-align:center;">Report N-1</th>
            <th style="text-align:center;">Ajust.</th>
            ${group !== 'vets' ? `<th style="text-align:center;">Solde</th>` : ''}
            <th>Progression</th>
            ${isAdmin?'<th></th>':''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="font-size:11.5px;color:var(--color-muted);margin-top:8px;">
        🟢 ≥ 10j &nbsp;🟡 5–9j &nbsp;🔴 &lt; 5j · Jours "posés" = absences marquées CP/Congé dans le calendrier.
      </div>
    `;

    container.querySelectorAll('.cp-year-btn').forEach(btn=>{
      btn.onclick = ()=>{ renderGroupConges._year[group] = parseInt(btn.dataset.year,10); renderGroupConges(group, containerId); };
    });

    if(isAdmin){
      container.querySelectorAll('.cp-adjust-btn').forEach(btn=>{
        btn.onclick = ()=> openCPAdjustModal(btn.dataset.pid, cpYear, parseFloat(btn.dataset.carried)||0, parseFloat(btn.dataset.extra)||0, btn.dataset.note||'', group, containerId);
      });
    }
  })();
}
renderGroupConges._year = {};

function openCPAdjustModal(personId, year, carriedOver, extra, note, group, containerId){
  const person = allPeople().find(p=>p.id===personId);
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  box.innerHTML = `
    <h3>✎ Ajuster les CP — ${escapeHTML(person?.short||personId)} (${year})</h3>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Report N-1 (jours)</label>
        <input id="cp-carried" type="number" step="0.5" min="0" value="${carriedOver}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13.5px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Ajustement manuel (jours, + ou −)</label>
        <input id="cp-extra" type="number" step="0.5" value="${extra}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13.5px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Motif</label>
        <textarea id="cp-note" rows="2" placeholder="Ancienneté, récupération…" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${escapeHTML(note)}</textarea>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="cp-cancel">Annuler</button>
      <button class="btn btn-primary" id="cp-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#cp-cancel').onclick = close;
  backdrop.onclick = e=>{ if(e.target===backdrop) close(); };
  box.querySelector('#cp-save').onclick = async ()=>{
    const carried_over = parseFloat(box.querySelector('#cp-carried').value)||0;
    const extra_days   = parseFloat(box.querySelector('#cp-extra').value)||0;
    const extra_note   = box.querySelector('#cp-note').value.trim();
    try{
      const res = await fetch(`${SUPABASE_URL}cp_adjustments`, {
        method:'POST',
        headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal,resolution=merge-duplicates' }),
        body: JSON.stringify({ person_id:personId, year, carried_over, extra_days, extra_note, updated_at:new Date().toISOString() }),
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      close();
      renderGroupConges(group, containerId);
      showToast(`CP ${escapeHTML(person?.short||personId)} mis à jour`, '✅');
    }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
  };
}

function getAbsenteeismRate(personId, year, month){ // module absentéisme supprimé de l'UI
  const feries = getJoursFeries(year);
  const daysInMonth = new Date(year, month+1, 0).getDate();
  let workingDays = 0;
  for(let d=1; d<=daysInMonth; d++){
    const date = new Date(year, month, d);
    const dow = date.getDay();
    if(dow===0||dow===6) continue;
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(feries.has(iso)) continue;
    workingDays++;
  }
  let absentHalves = 0;
  for(const slot of ['M','AM']){
    for(let d=1; d<=daysInMonth; d++){
      const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const key = `${iso}_${personId}_${slot}`;
      if(DATA.slots[key] === 'absent'){
        // For ASV: only count if decision is not 'rejected' (rejected means not absent)
        if(isASVPerson(personId)){
          const dec = getLeaveDecision(iso, personId, slot);
          if(dec === 'rejected') continue;
        }
        absentHalves++;
      }
    }
  }
  const absentDays = absentHalves / 2;
  const rate = workingDays > 0 ? Math.round(absentDays/workingDays*1000)/10 : 0;
  return { rate, absentDays, workingDays };
}

function renderDashboardAbsences(){ // stub — module supprimé
  const container = document.getElementById('dash-sub-absences');
  if(container) container.innerHTML = '';
}

/* ================================================================
   MODULE VISITES MÉDICALES
   ================================================================ */
function addMonthsToDate(dateISO, months){
  const d = new Date(dateISO + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return fmtISO(d);
}

function getMedicalAlert(visit){
  if(!visit){
    return { level:'red', label:'À planifier', effectiveNextDate:null, daysUntil:null };
  }
  const effectiveNextDate = visit.next_visit_date || addMonthsToDate(visit.visit_date, visit.frequency_months||60);
  const todayMs = today.getTime();
  const nextMs  = new Date(effectiveNextDate + 'T00:00:00').getTime();
  const daysUntil = Math.floor((nextMs - todayMs) / 86400000);
  let level, label;
  if(daysUntil < 0){ level='red'; label=`⛔ Dépassée (${Math.abs(daysUntil)}j)`; }
  else if(daysUntil < 90){ level='amber'; label=`⚠️ Dans ${daysUntil}j`; }
  else { level='green'; label='✅ À jour'; }
  return { level, label, effectiveNextDate, daysUntil };
}

function renderDashboardMedical(){
  const container = document.getElementById('dash-sub-medical');
  const isAdmin = currentUser?.role === 'admin';
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-muted);">Chargement…</div>';

  (async ()=>{
    let visits = [];
    try{
      const res = await fetch(`${SUPABASE_URL}medical_visits?select=*&order=visit_date.desc`, { headers: supabaseHeaders() });
      if(res.ok) visits = await res.json();
    }catch(e){ console.warn('medical_visits inaccessibles', e); }

    // Keep only latest visit per person
    const latestByPerson = {};
    visits.forEach(v => {
      if(!latestByPerson[v.person_id] || v.visit_date > latestByPerson[v.person_id].visit_date)
        latestByPerson[v.person_id] = v;
    });

    const people = allPeople().filter(p => !p.archived);
    const VISIT_TYPE_LABELS = { embauche:'Embauche', periodique:'Périodique', reprise:'Reprise', spontanee:'Spontanée' };
    const STATUS_LABELS = { apte:'Apte', apte_reserves:'Apte avec réserves', inapte:'Inapte', en_attente:'En attente' };
    const levelIcon = { red:'⛔', amber:'⚠️', green:'✅' };
    const levelColor = { red:'#DC2626', amber:'#CA8A04', green:'#16A34A' };

    const rows = people.map(p => {
      const v = latestByPerson[p.id] || null;
      const alert = getMedicalAlert(v);
      const nextDisplay = v ? (alert.effectiveNextDate ? new Date(alert.effectiveNextDate+'T00:00:00').toLocaleDateString('fr-FR') : '—') : '—';
      const statusLabel = v ? (STATUS_LABELS[v.status] || v.status) : '—';
      const reservesBtn = (v?.status === 'apte_reserves' && v?.reserves_note)
        ? `<button class="med-reserves-btn btn btn-sm" title="${escapeHTML(v.reserves_note)}" style="font-size:11px;padding:2px 6px;margin-left:4px;">ℹ️</button>` : '';
      return `<tr>
        <td data-label="Statut" style="padding:8px 12px;text-align:center;font-size:16px;color:${levelColor[alert.level]};">${levelIcon[alert.level]}</td>
        <td data-label="Personne" style="padding:8px 12px;font-weight:600;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px;"></span>${escapeHTML(p.short||p.name)}</td>
        <td data-label="Dernière visite" style="padding:8px 12px;">${v ? new Date(v.visit_date+'T00:00:00').toLocaleDateString('fr-FR') : '—'}</td>
        <td data-label="Type" style="padding:8px 12px;">${v ? (VISIT_TYPE_LABELS[v.visit_type]||v.visit_type) : '—'}</td>
        <td data-label="Aptitude" style="padding:8px 12px;">${statusLabel}${reservesBtn}</td>
        <td data-label="Prochaine visite" style="padding:8px 12px;color:${levelColor[alert.level]};font-weight:${alert.level!=='green'?'600':'400'};">${nextDisplay}</td>
        <td data-label="Actions" style="padding:8px 12px;">
          ${v && isAdmin ? `<button class="btn btn-sm med-edit-btn" data-visit-id="${v.id}" style="font-size:11.5px;padding:3px 8px;">✎</button>` : ''}
          ${!v && isAdmin ? `<button class="btn btn-sm btn-primary med-add-btn" data-pid="${p.id}" style="font-size:11.5px;padding:3px 8px;">+ Ajouter</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <div></div>
        ${isAdmin ? `<button class="btn btn-sm btn-primary" id="med-add-global">+ Ajouter une visite</button>` : ''}
      </div>
      <div class="card" style="overflow-x:auto;margin-bottom:16px;">
        <table class="recap-table" style="min-width:600px;">
          <thead><tr>
            <th style="text-align:center;">Statut</th>
            <th>Personne</th>
            <th>Dernière visite</th>
            <th>Type</th>
            <th>Aptitude</th>
            <th>Prochaine visite</th>
            ${isAdmin ? '<th></th>' : ''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${(()=>{
        // Visites médicales marquées directement dans le calendrier (état 'medical' dans DATA.slots)
        const seen = {};
        const calEntries = [];
        Object.keys(DATA.slots).forEach(key=>{
          if(DATA.slots[key] !== 'medical') return;
          const m = key.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_(M|AM)$/);
          if(!m) return;
          const [,iso,pid] = m;
          const k = `${pid}_${iso}`;
          if(!seen[k]){ seen[k]=true; calEntries.push({iso,pid}); }
        });
        calEntries.sort((a,b)=>a.iso.localeCompare(b.iso));
        if(!calEntries.length) return '';
        const rows2 = calEntries.map(e=>{
          const p2 = people.find(x=>x.id===e.pid);
          const dStr = new Date(e.iso+'T00:00:00').toLocaleDateString('fr-FR');
          return `<tr>
            <td style="padding:7px 12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p2?.color||'#999'};margin-right:5px;"></span><strong>${escapeHTML(p2?.short||e.pid)}</strong></td>
            <td style="padding:7px 12px;">${dStr}</td>
            <td style="padding:7px 12px;font-size:11px;color:var(--color-text-muted);">Marqué dans le calendrier</td>
          </tr>`;
        }).join('');
        return `<div class="card" style="margin-bottom:16px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--color-medical-text);">📅 Rendez-vous planifiés dans le calendrier</div>
          <div style="overflow-x:auto;"><table class="recap-table" style="min-width:360px;">
            <thead><tr><th>Personne</th><th>Date</th><th>Source</th></tr></thead>
            <tbody>${rows2}</tbody>
          </table></div>
        </div>`;
      })()}
      <div style="background:var(--color-secondary);border:1px solid var(--color-border);border-radius:10px;padding:14px 16px;font-size:12.5px;color:var(--color-muted);">
        📋 <strong>Référence légale — Article R4624-10 du Code du travail</strong><br>
        Visite d'aptitude à l'embauche obligatoire. Renouvellement périodique tous les 5 ans
        (surveillance simple) ou tous les 2 ans (surveillance renforcée : exposition aux risques).
      </div>
    `;

    // Reserves popover
    container.querySelectorAll('.med-reserves-btn').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const note = btn.getAttribute('title');
        const box2 = document.getElementById('modal-box');
        const backdrop2 = document.getElementById('modal-backdrop');
        box2.className = 'modal-box';
        box2.innerHTML = `<h3>ℹ️ Réserves d'aptitude</h3><p style="font-size:13.5px;line-height:1.6;">${escapeHTML(note)}</p><div class="modal-actions"><button class="btn btn-primary" id="med-res-ok">Fermer</button></div>`;
        backdrop2.classList.add('open');
        box2.querySelector('#med-res-ok').onclick = ()=> backdrop2.classList.remove('open');
        backdrop2.onclick = ev=>{ if(ev.target===backdrop2) backdrop2.classList.remove('open'); };
      };
    });

    if(isAdmin){
      const openAdd = (personId) => openMedicalModal(null, visits, personId);
      const openEdit = (visitId) => openMedicalModal(visits.find(v=>v.id===visitId), visits, null, ()=>{ renderDashboardMedical(); });
      if(container.querySelector('#med-add-global'))
        container.querySelector('#med-add-global').onclick = ()=> openAdd(null);
      container.querySelectorAll('.med-add-btn').forEach(btn => btn.onclick = ()=> openAdd(btn.dataset.pid));
      container.querySelectorAll('.med-edit-btn').forEach(btn => btn.onclick = ()=> openEdit(btn.dataset.visitId));
    }
  })();
}

function openMedicalModal(existingVisit, allVisits, preselectedPid, onSaved){
  const isAdmin = currentUser?.role === 'admin';
  if(!isAdmin) return;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  const people = allPeople().filter(p=>!p.archived);
  const FREQ_OPTIONS = [[12,'12 mois (1 an)'],[24,'24 mois (2 ans)'],[36,'36 mois (3 ans)'],[60,'60 mois (5 ans)']];
  const curFreq = existingVisit?.frequency_months || 60;

  function calcNextISO(visitDateISO, freqMonths){ return visitDateISO ? addMonthsToDate(visitDateISO, freqMonths) : ''; }

  box.innerHTML = `
    <h3>${existingVisit ? '✎ Modifier la visite' : '🏥 Ajouter une visite médicale'}</h3>
    <div style="display:flex;flex-direction:column;gap:11px;max-height:70vh;overflow-y:auto;">
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Personne</label>
        ${existingVisit
          ? `<div style="font-weight:700;padding:6px 0;">${escapeHTML(people.find(p=>p.id===existingVisit.person_id)?.short||existingVisit.person_id)}</div><input type="hidden" id="med-person" value="${existingVisit.person_id}">`
          : `<select id="med-person" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">${people.map(p=>`<option value="${p.id}"${p.id===preselectedPid?' selected':''}>${escapeHTML(p.short||p.name)}</option>`)}</select>`
        }
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Date de la visite</label>
        <input id="med-date" type="date" max="${fmtISO(today)}" value="${existingVisit?.visit_date||''}" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Type de visite</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${[['embauche','Embauche'],['periodique','Périodique'],['reprise','Reprise'],['spontanee','Spontanée']].map(([v,l])=>
            `<label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;border:1px solid var(--color-border);padding:5px 10px;border-radius:20px;"><input type="radio" name="med-type" value="${v}" ${(existingVisit?.visit_type||'periodique')===v?'checked':''}> ${l}</label>`
          ).join('')}
        </div>
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Aptitude</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${[['apte','Apte'],['apte_reserves','Apte avec réserves'],['inapte','Inapte'],['en_attente','En attente']].map(([v,l])=>
            `<label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;border:1px solid var(--color-border);padding:5px 10px;border-radius:20px;"><input type="radio" name="med-status" value="${v}" ${(existingVisit?.status||'apte')===v?'checked':''}> ${l}</label>`
          ).join('')}
        </div>
      </div>
      <div id="med-reserves-wrap" style="${(existingVisit?.status||'apte')==='apte_reserves'?'':'display:none;'}">
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Réserves</label>
        <textarea id="med-reserves" rows="2" placeholder="Détail des réserves…" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${escapeHTML(existingVisit?.reserves_note||'')}</textarea>
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Fréquence de renouvellement</label>
        <select id="med-freq" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
          ${FREQ_OPTIONS.map(([v,l])=>`<option value="${v}"${v===curFreq?' selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Prochaine visite (calculée auto, modifiable)</label>
        <input id="med-next" type="date" value="${existingVisit?.next_visit_date || calcNextISO(existingVisit?.visit_date, curFreq)}" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Médecin du travail</label>
        <input id="med-doctor" type="text" value="${escapeHTML(existingVisit?.doctor_name||'')}" placeholder="Nom du médecin" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Notes</label>
        <textarea id="med-notes" rows="2" placeholder="Observations, suivi…" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${escapeHTML(existingVisit?.notes||'')}</textarea>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
      ${existingVisit?`<button class="btn btn-danger" id="med-delete-btn" style="margin-right:auto;">🗑️ Supprimer</button>`:''}
      <button class="btn" id="med-cancel">Annuler</button>
      <button class="btn btn-primary" id="med-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#med-cancel').onclick = close;
  backdrop.onclick = e=>{ if(e.target===backdrop) close(); };

  // Toggle reserves textarea
  box.querySelectorAll('input[name="med-status"]').forEach(r=>{
    r.onchange = ()=>{
      box.querySelector('#med-reserves-wrap').style.display = r.value==='apte_reserves'?'':'none';
    };
  });

  // Auto-calc next date when visit date or frequency changes
  const autoNext = ()=>{
    const dateVal = box.querySelector('#med-date').value;
    const freqVal = parseInt(box.querySelector('#med-freq').value)||60;
    if(dateVal) box.querySelector('#med-next').value = calcNextISO(dateVal, freqVal);
  };
  box.querySelector('#med-date').onchange = autoNext;
  box.querySelector('#med-freq').onchange = autoNext;

  if(existingVisit){
    box.querySelector('#med-delete-btn').onclick = async ()=>{
      if(!confirm('Supprimer cette visite ?')) return;
      try{
        await fetch(`${SUPABASE_URL}medical_visits?id=eq.${existingVisit.id}`, {
          method:'DELETE', headers: supabaseHeaders({ Prefer:'return=minimal' }),
        });
        close(); renderDashboardMedical(); showToast('Visite supprimée', '🗑️');
      }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
    };
  }

  box.querySelector('#med-save').onclick = async ()=>{
    const person_id     = box.querySelector('#med-person').value;
    const visit_date    = box.querySelector('#med-date').value;
    const visit_type    = box.querySelector('input[name="med-type"]:checked')?.value || 'periodique';
    const status        = box.querySelector('input[name="med-status"]:checked')?.value || 'apte';
    const reserves_note = status==='apte_reserves' ? box.querySelector('#med-reserves').value.trim() : '';
    const frequency_months = parseInt(box.querySelector('#med-freq').value)||60;
    const next_visit_date = box.querySelector('#med-next').value || null;
    const doctor_name   = box.querySelector('#med-doctor').value.trim();
    const notes         = box.querySelector('#med-notes').value.trim();
    if(!visit_date){ showToast('Date de visite requise', '⚠️'); return; }
    const payload = { person_id, visit_date, visit_type, status, reserves_note, frequency_months, next_visit_date, doctor_name, notes };
    try{
      if(existingVisit){
        await fetch(`${SUPABASE_URL}medical_visits?id=eq.${existingVisit.id}`, {
          method:'PATCH', headers: supabaseHeaders({ 'Content-Type':'application/json', Prefer:'return=minimal' }),
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${SUPABASE_URL}medical_visits`, {
          method:'POST', headers: supabaseHeaders({ 'Content-Type':'application/json', Prefer:'return=minimal' }),
          body: JSON.stringify(payload),
        });
      }
      close(); renderDashboardMedical(); showToast(existingVisit?'Visite mise à jour':'Visite enregistrée', '✅');
      if(typeof triggerPushNotification === 'function'){
        const alert = getMedicalAlert(payload);
        if(alert.level === 'red' || alert.level === 'amber'){
          const p = personOf(person_id);
          triggerPushNotification({
            type: 'medical_visit',
            title: 'Visite médicale à renouveler',
            body: `${p ? p.short : person_id} — prochaine visite : ${alert.label}`,
            targetUsers: [person_id, 'david', 'stephane'],
            data: { type:'medical_visit' },
          });
        }
      }
    }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
  };
}

/* ================================================================
   15. VUE ANNUELLE (heatmap)
   ================================================================ */
function stateLabel(iso, personId, slot){
  const state = getSlotState(iso, personId, slot);
  if(state === 'present') return 'Présent';
  if(state === 'absent'){
    const l = getSlotLabel(iso, personId, slot);
    if(isASVPerson(personId)){
      const decision = getLeaveDecision(iso, personId, slot) || 'pending';
      if(decision === 'pending') return `Demande de congé en attente${l?' ('+escapeHTML(l)+')':''}`;
      if(decision === 'rejected') return 'Congé refusé — voir un vétérinaire';
      return `Congé approuvé${l?' ('+escapeHTML(l)+')':''}`;
    }
    return l ? `Absent (${escapeHTML(l)})` : 'Absent';
  }
  return '—';
}

// Couleur d'une demi-journée pour la heatmap : présent = couleur de la personne, absent =
// rouge (congé vétérinaire ou ASV approuvé), demande ASV en attente = cyan, refusée =
// gris, vide = blanc.
// Reprend exactement les mêmes couleurs que le calendrier mensuel (cellRenderInfo) pour
// que la heatmap et la grille restent visuellement identiques case pour case.
function heatmapSlotColor(person, iso, slot){
  const state = getSlotState(iso, person.id, slot);
  if(state === 'present') return person.present.bg;
  if(state === 'absent'){
    if(isASVPerson(person.id)){
      const decision = getLeaveDecision(iso, person.id, slot) || 'pending';
      if(decision === 'pending') return 'var(--color-leave-pending)';
      if(decision === 'rejected') return 'var(--color-leave-rejected)';
    }
    return 'var(--color-absent)';
  }
  return '#ffffff';
}
function buildHeatmap(year, people = PEOPLE){
  const dayHeaderCells = Array.from({length:31}, (_,i)=>`<th>${i+1}</th>`).join('');
  let rows = '';
  for(let month=0; month<12; month++){
    const nbDays = daysInMonth(year, month);
    // Ligne fine "jours de la semaine" propre à ce mois — le 1er d'un mois ne tombe pas
    // forcément le même jour de semaine que le 1er du mois suivant, donc cette ligne est
    // recalculée à chaque bloc plutôt que d'être un en-tête partagé sur toute l'année.
    let weekdayCols = '';
    for(let day=1; day<=31; day++){
      if(day > nbDays){ weekdayCols += `<td class="heatmap-weekday-cell empty-cell"></td>`; continue; }
      const wd = isoWeekday(new Date(year, month, day));
      weekdayCols += `<td class="heatmap-weekday-cell${wd===6?' is-sunday':wd===5?' is-saturday':''}">${WEEKDAY_NAMES[wd][0]}</td>`;
    }
    rows += `<tr class="heatmap-weekday-row"><th class="heatmap-month-label" rowspan="${people.length+1}">${MONTH_SHORT[month]}</th><th class="heatmap-row-label"></th>${weekdayCols}</tr>`;
    people.forEach(person=>{
      let cols = '';
      for(let day=1; day<=31; day++){
        if(day > nbDays){ cols += `<td><div class="heatmap-cell empty-cell"></div></td>`; continue; }
        const date = new Date(year, month, day);
        const iso = fmtISO(date);
        if(isSunday(date)){
          cols += `<td><div class="heatmap-cell" style="background:var(--color-sunday);cursor:default;" title="${formatFR(iso)} — Fermé"></div></td>`;
          continue;
        }
        const mState = getSlotState(iso, person.id, 'M');
        const amState = getSlotState(iso, person.id, 'AM');
        const colorM = heatmapSlotColor(person, iso, 'M'), colorAM = heatmapSlotColor(person, iso, 'AM');
        let style = mState === amState
          ? `background:${colorM};`
          : `background:linear-gradient(to bottom, ${colorM} 50%, ${colorAM} 50%);`;
        const hName = holidayName(iso);
        if(hName) style += 'box-shadow:0 0 0 2px var(--color-holiday) inset;';
        const overtime = getOvertimeHours(iso, person.id);
        const title = `${formatFR(iso)}${hName?' — '+hName:''} — Matin : ${stateLabel(iso,person.id,'M')} · Après-midi : ${stateLabel(iso,person.id,'AM')}${overtime>0?' · +'+formatNum(overtime)+'h sup.':''}`;
        cols += `<td><div class="heatmap-cell" data-date="${iso}" style="${style}" title="${escapeHTML(title)}" tabindex="0" role="button" aria-label="Détail du ${formatFR(iso)}"></div></td>`;
      }
      rows += `<tr><th class="heatmap-row-label" style="color:${person.color}">${person.short}</th>${cols}</tr>`;
    });
  }
  return `
    <div class="heatmap-wrap">
      <table class="heatmap-table">
        <colgroup><col class="col-month"><col class="col-label">${'<col>'.repeat(31)}</colgroup>
        <thead><tr><th></th><th></th>${dayHeaderCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// Popover de détail jour, partagé par la vue annuelle vétérinaires et la vue annuelle
// ASV : affiche le statut de chaque personne de `people`, et le bouton « Éditer ce jour »
// saute dans le calendrier mensuel correspondant à viewKey (clé de CAL_VIEWS).
function openAnnualDayDetail(iso, people, viewKey){
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const hName = holidayName(iso);
  const comment = getDayComment(iso);
  const personRows = people.map(p=>`
    <p style="font-size:13px;margin:5px 0;"><strong style="color:${p.color}">${p.short}</strong> — Matin : ${stateLabel(iso,p.id,'M')} · Après-midi : ${stateLabel(iso,p.id,'AM')}</p>
  `).join('');
  box.innerHTML = `
    <h4>${formatFR(iso)}${hName ? ` <span class="cal-holiday-badge">Férié</span>` : ''}</h4>
    ${comment ? `<p class="text-muted" style="font-size:12.5px;margin:8px 0;">💬 ${escapeHTML(comment)}</p>` : ''}
    <div style="margin:10px 0;">${personRows}</div>
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Fermer</button>
      <button class="btn btn-primary" id="popover-edit">Éditer ce jour</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-edit').onclick = ()=>{
    close();
    const month = parseInt(iso.split('-')[1], 10) - 1;
    CAL_VIEWS[viewKey].navState.month = month;
    const group = viewKey.startsWith('asv') ? 'asv' : 'vets';
    switchSubPage(group, viewKey.endsWith('forecast') ? 'forecast' : 'calendar');
    switchView(group);
    setTimeout(()=> openDaySidebar(iso, viewKey), 50);
  };
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
}

// Sous-page "Vue annuelle" d'un onglet groupé — factorisée pour servir aussi bien
// Vétérinaires que ASV : même heatmap, même bascule année courante / prévisionnelle.
function renderAnnualViewForGroup(group){
  const g = GROUP_VIEWS[group];
  const container = document.getElementById(g.annualContainer);
  const mode = annualYearState[group];
  const viewKey = mode === 'current' ? g.calendarViewKey : g.forecastViewKey;
  const cfg = CAL_VIEWS[viewKey];
  container.innerHTML = `
    <h2 class="section-title">Vue Annuelle ${cfg.year} — ${g.label}</h2>
    <p class="section-desc" style="margin-bottom:12px;">Heatmap de présence — cliquez une cellule pour voir le détail du jour.</p>
    <div class="year-toggle" id="${group}-annual-year-toggle" style="margin-bottom:12px;">
      <button data-mode="current" class="${mode==='current'?'active':''}">${CAL_VIEWS[g.calendarViewKey].year}</button>
      <button data-mode="forecast" class="${mode==='forecast'?'active':''}">${CAL_VIEWS[g.forecastViewKey].year}</button>
    </div>
    <div class="card" style="padding:14px;">${buildHeatmap(cfg.year, cfg.people)}</div>
    <div class="legend" style="margin-top:12px;padding:10px 16px;">${buildLegendColors(cfg.people)}</div>
  `;
  container.querySelector(`#${group}-annual-year-toggle`).addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    annualYearState[group] = btn.dataset.mode;
    renderAnnualViewForGroup(group);
    saveViewState();
  });
  container.querySelectorAll('.heatmap-cell[data-date]').forEach(cell=>{
    cell.addEventListener('click', ()=> openAnnualDayDetail(cell.dataset.date, cfg.people, viewKey));
    cell.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openAnnualDayDetail(cell.dataset.date, cfg.people, viewKey); }
    });
  });
}

/* ================================================================
   16. INITIALISATION GÉNÉRALE
   ================================================================ */

function renderImpersonationBanner(){
  const banner = document.getElementById('impersonation-banner');
  if(!banner) return;
  if(currentUser?.role === 'admin' && adminViewMode === 'asv' && adminImpersonatedPersonId){
    const p = personOf(adminImpersonatedPersonId);
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <span>👁 Mode aperçu</span>
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${p?.color||'#fff'};display:inline-block;"></span>
        Vue de <strong>${escapeHTML(p?.short||adminImpersonatedPersonId)}</strong>
      </span>
      <button class="imp-back" id="imp-back-btn">← Retour à ma vue</button>
    `;
    document.getElementById('imp-back-btn').onclick = ()=>{
      adminViewMode = 'vet';
      adminImpersonatedPersonId = null;
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
      adminImpersonatedPersonId = btn.dataset.pickAsv;
      adminViewMode = 'asv';
      close();
      applyRoleToDOM();
      initSettingsMenu();
      if(currentView === 'dashboard') switchView('vets');
      else renderCurrentView();
      showToast(`Vue ASV : ${personOf(adminImpersonatedPersonId)?.short}`, '👁');
    };
  });
}

function initApp(){
  weekNavState.mondayISO = fmtISO(getWeekMondayDate(today));
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
  switchSubPage('vets', subNavState.vets);
  switchSubPage('asv', subNavState.asv);
  const startView = !canAccessDashboard() && restoredView === 'dashboard' ? 'vets' : restoredView;
  switchView(VIEW_RENDERERS[startView] ? startView : 'vets');
  syncFromSupabase();
  loadSignatures();
  loadInterviews();
  loadAnnouncements();
  document.getElementById('login-overlay').classList.add('hidden');
  // Ouvrir le modal de confirmation si l'utilisateur vient d'un lien de signature email
  if(pendingSignToken){
    const token = pendingSignToken;
    pendingSignToken = null;
    openSignConfirmModal(token);
  }
  if(typeof handlePwaShortcutAction === 'function') handlePwaShortcutAction();
}

async function init(){
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
    pendingSignToken = signToken;
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

/* ----------------------------------------------------------------
   17. ÉCRANS D'AUTHENTIFICATION
   ---------------------------------------------------------------- */
function renderLoginContent(html){ document.getElementById('login-content').innerHTML = html; }

function renderLoginScreen(errorMsg=''){
  document.getElementById('login-overlay').classList.remove('hidden');
  renderLoginContent(`
    <form class="login-form" id="login-form" novalidate>
      <input type="email" id="login-email" placeholder="Adresse email" required autocomplete="email">
      <input type="password" id="login-password" placeholder="Mot de passe" required autocomplete="current-password">
      ${errorMsg ? `<p class="login-error">${escapeHTML(errorMsg)}</p>` : ''}
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:2px;">Se connecter</button>
    </form>
    <div class="login-footer">
      <button type="button" class="link-button" id="forgot-btn">Mot de passe oublié ?</button>
    </div>
  `);
  document.getElementById('login-form').onsubmit = async (e)=>{
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pwd = document.getElementById('login-password').value;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Connexion…';
    try{
      await authSignIn(email, pwd);
      const user = await loadCurrentUser();
      if(!user) throw new Error('Profil introuvable — contactez un administrateur.');
      initApp();
    }catch(err){ renderLoginScreen(err.message || 'Identifiants incorrects.'); }
  };
  document.getElementById('forgot-btn').onclick = renderForgotPasswordScreen;
}

function renderForgotPasswordScreen(){
  renderLoginContent(`
    <form class="login-form" id="forgot-form" novalidate>
      <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:14px;text-align:left;">
        Saisissez votre adresse email pour recevoir un lien de réinitialisation.
      </p>
      <input type="email" id="forgot-email" placeholder="Adresse email" required autocomplete="email">
      <p id="forgot-msg" style="font-size:12.5px;display:none;margin-bottom:8px;"></p>
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Envoyer le lien</button>
    </form>
    <div class="login-footer">
      <button type="button" class="link-button" id="back-login">← Retour</button>
    </div>
  `);
  document.getElementById('forgot-form').onsubmit = async (e)=>{
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const btn = e.target.querySelector('button[type=submit]');
    const msg = document.getElementById('forgot-msg');
    btn.disabled = true; btn.textContent = 'Envoi…';
    try{
      await authSendPasswordReset(email);
      msg.textContent = 'Email envoyé ! Vérifiez votre boîte de réception.';
      msg.style.color = 'var(--color-primary)'; msg.style.display = 'block';
    }catch(err){
      msg.textContent = err.message; msg.style.color = '#B91C1C'; msg.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Envoyer le lien';
    }
  };
  document.getElementById('back-login').onclick = renderLoginScreen;
}

function renderSetPasswordScreen(accessToken, isFirstLogin=false){
  document.getElementById('login-overlay').classList.remove('hidden');
  renderLoginContent(`
    <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:14px;text-align:left;">
      ${isFirstLogin ? 'Bienvenue ! Choisissez votre mot de passe pour activer votre compte.' : 'Choisissez votre nouveau mot de passe.'}
    </p>
    <form class="login-form" id="set-pwd-form" novalidate>
      <input type="password" id="set-pwd-new" placeholder="Nouveau mot de passe (8 car. min.)" autocomplete="new-password">
      <input type="password" id="set-pwd-confirm" placeholder="Confirmer le mot de passe" autocomplete="new-password">
      <p id="set-pwd-error" class="login-error" style="display:none;"></p>
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Définir le mot de passe</button>
    </form>
  `);
  document.getElementById('set-pwd-form').onsubmit = async (e)=>{
    e.preventDefault();
    const next = document.getElementById('set-pwd-new').value;
    const conf = document.getElementById('set-pwd-confirm').value;
    const errEl = document.getElementById('set-pwd-error');
    const btn = e.target.querySelector('button[type=submit]');
    if(next.length < 8){ errEl.textContent='Au moins 8 caractères.'; errEl.style.display='block'; return; }
    if(next !== conf){ errEl.textContent='Les mots de passe ne correspondent pas.'; errEl.style.display='block'; return; }
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try{
      await authUpdatePassword(accessToken, next);
      // Nettoyer le hash de l'URL pour éviter de ré-entrer dans ce flux
      history.replaceState(null,'', window.location.pathname);
      // La session est maintenant valide, charger l'utilisateur
      const user = await loadCurrentUser();
      if(user){ initApp(); }
      else { renderLoginScreen('Mot de passe défini. Connectez-vous.'); }
    }catch(err){
      errEl.textContent = err.message; errEl.style.display='block';
      btn.disabled=false; btn.textContent='Définir le mot de passe';
    }
  };
}

/* ================================================================
   PWA — Service Worker, installation, hors-ligne, notifications push
   ================================================================ */

// Clé PUBLIQUE VAPID uniquement — la clé privée ne vit que dans les secrets Supabase
// (VAPID_PRIVATE_KEY), jamais ici.
const VAPID_PUBLIC_KEY = 'BD8PsjUf5CnogfRdI81PvKKHT9C7OGV7tqPQ29Ic8kkcarkqyFRa-YbUQam_OHI8xZWnz1rzkFhicB_UMb5CMHI';
const PWA_PROMPT_INTERVAL_DAYS = 14;
const PWA_IOS_PROMPT_KEY = 'pwa_ios_prompt_ts';
const PWA_ANDROID_PROMPT_KEY = 'pwa_android_prompt_ts';

window.PWA = {
  isIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent); },
  isInstalled(){ return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; },
  supportsPush(){ return 'PushManager' in window && 'serviceWorker' in navigator; },
};

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/* ---------------- Service Worker : enregistrement + bandeau de mise à jour ---------------- */
let swRegistration = null;
function showPwaUpdateBanner(){
  const banner = document.getElementById('pwa-update-banner');
  if(!banner) return;
  banner.innerHTML = `Mise à jour disponible <button id="pwa-reload-btn">Recharger</button>`;
  banner.style.display = 'block';
  banner.querySelector('#pwa-reload-btn').onclick = ()=> window.location.reload();
}
function initServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg)=>{
    swRegistration = reg;
    reg.addEventListener('updatefound', ()=>{
      const newWorker = reg.installing;
      if(!newWorker) return;
      newWorker.addEventListener('statechange', ()=>{
        if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
          showPwaUpdateBanner();
        }
      });
    });
  }).catch((err)=> console.warn('Échec enregistrement Service Worker', err));

  navigator.serviceWorker.addEventListener('message', (event)=>{
    if(event.data && event.data.type === 'pwa-notification-click'){
      navigateForNotificationType(event.data.notificationType);
    }
  });
}

/* ---------------- Bandeau d'installation iOS (pas de beforeinstallprompt sur iOS) ---------------- */
function shouldShowInstallPrompt(key){
  const last = parseInt(localStorage.getItem(key), 10);
  if(!Number.isFinite(last)) return true;
  return (Date.now() - last) / 86400000 >= PWA_PROMPT_INTERVAL_DAYS;
}
function markInstallPromptShown(key){ localStorage.setItem(key, String(Date.now())); }

function showIOSInstallTip(){
  if(!PWA.isIOS() || PWA.isInstalled()) return;
  if(!shouldShowInstallPrompt(PWA_IOS_PROMPT_KEY)) return;
  const tip = document.getElementById('pwa-ios-install-tip');
  if(!tip) return;
  tip.innerHTML = `
    <button class="pwa-tip-close" aria-label="Fermer">✕</button>
    <strong>Installez Amivet RH</strong><br>
    Appuyez sur <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong> pour installer l'app et activer les notifications.
  `;
  tip.style.display = 'block';
  tip.querySelector('.pwa-tip-close').onclick = ()=>{
    tip.style.display = 'none';
    markInstallPromptShown(PWA_IOS_PROMPT_KEY);
  };
}

/* ---------------- Bandeau d'installation Android ---------------- */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  if(!shouldShowInstallPrompt(PWA_ANDROID_PROMPT_KEY)) return;
  const banner = document.getElementById('pwa-android-install-banner');
  if(!banner) return;
  banner.innerHTML = `
    <button class="pwa-tip-close" aria-label="Fermer">✕</button>
    <strong>Installez Amivet RH</strong><br>
    Ajoutez l'app à votre écran d'accueil pour un accès rapide et les notifications.
    <div><button id="pwa-android-install-btn">Installer l'app</button></div>
  `;
  banner.style.display = 'block';
  banner.querySelector('.pwa-tip-close').onclick = ()=>{
    banner.style.display = 'none';
    markInstallPromptShown(PWA_ANDROID_PROMPT_KEY);
  };
  banner.querySelector('#pwa-android-install-btn').onclick = async ()=>{
    banner.style.display = 'none';
    markInstallPromptShown(PWA_ANDROID_PROMPT_KEY);
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    }
  };
});

/* ---------------- Indicateur hors-ligne + resynchronisation ---------------- */
function updatePwaOfflineBanner(){
  const banner = document.getElementById('pwa-offline-banner');
  if(!banner) return;
  banner.textContent = 'Mode hors-ligne — données du dernier chargement';
  banner.style.display = navigator.onLine ? 'none' : 'block';
}
function refreshAllPwaData(){
  if(typeof syncFromSupabase === 'function') syncFromSupabase();
  if(typeof loadSignatures === 'function') loadSignatures();
  if(typeof loadInterviews === 'function') loadInterviews();
  if(typeof loadAnnouncements === 'function') loadAnnouncements();
}
window.addEventListener('online', ()=>{ updatePwaOfflineBanner(); refreshAllPwaData(); });
window.addEventListener('offline', updatePwaOfflineBanner);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) refreshAllPwaData(); });

/* ---------------- Raccourcis manifest + navigation au clic sur une notification ---------------- */
function navigateForNotificationType(type){
  if(typeof currentUser === 'undefined' || !currentUser) return;
  switch(type){
    case 'leave_request': case 'leave_approved': case 'leave_rejected':
      if(canAccessDashboard()){ switchView('dashboard'); dashSubState.tab = 'requests'; renderDashboard(); }
      break;
    case 'medical_visit':
      if(canAccessDashboard()){ switchView('dashboard'); dashSubState.tab = 'medical'; renderDashboard(); }
      break;
    case 'interview':
      if(canAccessDashboard()){ switchView('dashboard'); dashSubState.tab = 'interviews'; renderDashboard(); }
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

/* ---------------- Abonnement push ---------------- */
function currentPushPersonId(){ return currentUser?.person_id || null; }

async function savePushSubscription(sub){
  const user_name = currentPushPersonId();
  if(!user_name) return;
  await fetch(`${SUPABASE_URL}push_subscriptions`, {
    method: 'POST',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      user_name,
      subscription_json: sub.toJSON(),
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    }),
  });
}
async function deletePushSubscription(){
  const user_name = currentPushPersonId();
  if(!user_name) return;
  await fetch(`${SUPABASE_URL}push_subscriptions?user_name=eq.${encodeURIComponent(user_name)}`, {
    method: 'DELETE',
    headers: supabaseHeaders(),
  });
}

async function subscribeToPush(){
  if(!PWA.supportsPush()) throw new Error('Notifications non supportées sur cet appareil.');
  const permission = await Notification.requestPermission();
  if(permission !== 'granted') throw new Error('Permission refusée.');
  const reg = swRegistration || await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if(!sub){
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await savePushSubscription(sub);
  return sub;
}
async function unsubscribeFromPush(){
  if(!('serviceWorker' in navigator)) return;
  const reg = swRegistration || await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if(sub) await sub.unsubscribe();
  await deletePushSubscription();
}

// Envoi fire-and-forget vers l'Edge Function : ne bloque jamais l'UI sur le résultat.
function triggerPushNotification({ type, title, body, targetUsers = [], data = {}, requireInteraction = false }){
  fetch(`${SUPABASE_FUNCTIONS_URL}push-server`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ type, title, body, targetUsers, data, requireInteraction }),
  }).catch((e)=> console.warn('Envoi notification push impossible (ignoré)', e));
}

/* ---------------- Section "Notifications" du menu réglages ---------------- */
function notificationStatusLabel(){
  if(!PWA.supportsPush()) return { text:'Non disponible sur cet appareil', tone:'muted' };
  if(PWA.isIOS() && !PWA.isInstalled()) return { text:'Installez l\'app pour activer les notifications', tone:'muted' };
  if(Notification.permission === 'granted') return { text:'Activées', tone:'ok' };
  if(Notification.permission === 'denied') return { text:'Bloquées', tone:'danger' };
  return { text:'Non configurées', tone:'muted' };
}
async function openNotificationSettingsModal(){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';

  const renderBody = ()=>{
    const status = notificationStatusLabel();
    const isIOSNotInstalled = PWA.isIOS() && !PWA.isInstalled();
    const isBlocked = Notification.permission === 'denied';
    const canOffer = PWA.supportsPush() && !isIOSNotInstalled && Notification.permission !== 'granted';
    box.innerHTML = `
      <h3>🔔 Notifications</h3>
      <p>Statut actuel : <strong>${status.text}</strong></p>
      ${isIOSNotInstalled ? `<p class="text-muted" style="font-size:12.5px;">Sur iPhone/iPad, les notifications ne fonctionnent que si l'app est installée : Partager → Sur l'écran d'accueil.</p>` : ''}
      ${isBlocked ? `<p class="text-muted" style="font-size:12.5px;">Les notifications sont bloquées par le navigateur. Autorisez-les dans Réglages &gt; Safari &gt; Amivet RH (ou l'équivalent sur votre navigateur), puis revenez ici.</p>` : ''}
      ${canOffer ? `<button class="btn btn-primary" id="notif-enable-btn" style="width:100%;justify-content:center;margin-top:10px;">Activer les notifications</button>` : ''}
      ${status.tone === 'ok' ? `<button class="btn" id="notif-disable-btn" style="width:100%;justify-content:center;margin-top:10px;">Désactiver les notifications</button>` : ''}
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn" id="modal-cancel">Fermer</button>
      </div>
    `;
    const enableBtn = box.querySelector('#notif-enable-btn');
    if(enableBtn) enableBtn.onclick = async ()=>{
      enableBtn.disabled = true; enableBtn.textContent = 'Activation…';
      try{
        await subscribeToPush();
        showToast('Notifications activées', '🔔');
        renderBody();
      }catch(e){
        // iOS 17.4+ (UE, DMA) supprime le mode standalone : la souscription échoue
        // silencieusement côté OS — on l'explique plutôt que de laisser une erreur brute.
        showToast(e.message || 'Impossible d\'activer les notifications sur cet appareil', '⚠️');
        renderBody();
      }
    };
    const disableBtn = box.querySelector('#notif-disable-btn');
    if(disableBtn) disableBtn.onclick = async ()=>{
      disableBtn.disabled = true;
      await unsubscribeFromPush();
      showToast('Notifications désactivées', '🔕');
      renderBody();
    };
    box.querySelector('#modal-cancel').onclick = ()=> backdrop.classList.remove('open');
  };
  renderBody();
  backdrop.classList.add('open');
  backdrop.onclick = (e)=>{ if(e.target === backdrop) backdrop.classList.remove('open'); };
}

/* ---------------- Amorçage ---------------- */
initServiceWorker();
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
