import { SUPABASE_URL, ANNONCE_CATEGORIES, ASV_PEOPLE, allPeople } from './config.js';
import { supabaseHeaders } from './auth.js';
import { escapeHTML } from './utils.js';
import { store } from './store.js';
import { triggerPushNotification } from './pwa.js';
import { showToast } from './ui.js';

// Module Annonces — chargement + badge
// ----------------------------------------------------------------
export function annonceViewerId(){ return store.currentUser?.person_id || store.currentUser?.id || ''; }

export async function loadAnnouncements(){
  if(!store.currentUser) return;
  try{
    const today = new Date().toISOString();
    const [annRes, readRes] = await Promise.all([
      fetch(`${SUPABASE_URL}announcements?select=*&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(today)})&order=pinned.desc,created_at.desc`, { headers: supabaseHeaders() }),
      fetch(`${SUPABASE_URL}announcement_reads?person_id=eq.${encodeURIComponent(annonceViewerId())}&select=announcement_id`, { headers: supabaseHeaders() }),
    ]);
    const anns = annRes.ok ? await annRes.json() : [];
    const reads = readRes.ok ? await readRes.json() : [];
    store.announcementsCache.list = Array.isArray(anns) ? anns : [];
    store.announcementsCache.reads = new Set((Array.isArray(reads) ? reads : []).map(r => r.announcement_id));
    store.announcementsCache.loaded = true;
    updateAnnouncementBadge();
  }catch(e){ console.warn('Annonces inaccessibles.', e); }
}

export function getUnreadCount(){
  const role = store.currentUser?.role;
  const visible = store.announcementsCache.list.filter(a => {
    if(a.target_roles === 'all') return true;
    if(a.target_roles === 'vet' && role === 'vet') return true;
    if(a.target_roles === 'asv' && role === 'asv') return true;
    return role === 'admin';
  });
  return visible.filter(a => !store.announcementsCache.reads.has(a.id)).length;
}

export function updateAnnouncementBadge(){
  const el = document.getElementById('annonces-nav-badge');
  if(!el) return;
  const n = getUnreadCount();
  el.textContent = n > 0 ? String(n) : '';
  el.className = n > 0 ? 'nav-badge' : '';
}

export async function markAnnouncementRead(annId){
  if(store.announcementsCache.reads.has(annId)) return;
  store.announcementsCache.reads.add(annId);
  updateAnnouncementBadge();
  try{
    await fetch(`${SUPABASE_URL}announcement_reads`, {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal,resolution=ignore-duplicates' }),
      body: JSON.stringify({ announcement_id: annId, person_id: annonceViewerId() }),
    });
  }catch(e){ console.warn('markAnnouncementRead error', e); }
}

export async function loadArchivedAnnouncements(){
  try{
    const today = new Date().toISOString();
    const res = await fetch(`${SUPABASE_URL}announcements?select=*&expires_at=lte.${encodeURIComponent(today)}&order=created_at.desc`, { headers: supabaseHeaders() });
    return res.ok ? (await res.json()) : [];
  }catch(e){ return []; }
}


/* ----------------------------------------------------------------
   MODULE ANNONCES — renderAnnounces()
   ---------------------------------------------------------------- */
export function renderAnnounces(){
  const container = document.getElementById('view-annonces');
  const isAdmin = store.currentUser?.role === 'admin';
  const role = store.currentUser?.role;
  const viewerId = annonceViewerId();

  const now = new Date();
  const allList = store.announcementsCache.list;
  const active = allList.filter(a => {
    if(a.target_roles === 'vet' && role === 'asv') return false;
    if(a.target_roles === 'asv' && (role === 'vet' || role === 'admin')) return false;
    return true;
  });
  const filterCat = store.announcementsCache.filter;

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
    const unread = !store.announcementsCache.reads.has(a.id);
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
    btn.onclick = ()=>{ store.announcementsCache.filter = btn.dataset.cat; renderAnnounces(); };
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

export function openAnnouncementModal(annId){
  const isAdmin = store.currentUser?.role === 'admin';
  if(!isAdmin) return;
  const existing = annId ? store.announcementsCache.list.find(a => a.id === annId) : null;
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
        store.announcementsCache.list = store.announcementsCache.list.filter(a => a.id !== existing.id);
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
        if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.message||`Erreur ${res.status}`); }
        [ann] = await res.json();
        store.announcementsCache.list = store.announcementsCache.list.map(a => a.id===ann.id?ann:a);
      } else {
        const res = await fetch(`${SUPABASE_URL}announcements`, {
          method: 'POST',
          headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=representation' }),
          body: JSON.stringify({ title, content, category, target_roles, pinned, expires_at, author_id }),
        });
        if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.message||`Erreur ${res.status}`); }
        [ann] = await res.json();
        if(pinned) store.announcementsCache.list = [ann, ...store.announcementsCache.list];
        else store.announcementsCache.list = [ann, ...store.announcementsCache.list].sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0));
      }
      close(); updateAnnouncementBadge(); renderAnnounces();
      showToast(existing?'Annonce mise à jour':'Annonce publiée', '📣');
      if(!existing){
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

