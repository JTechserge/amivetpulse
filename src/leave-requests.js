import { ASV_PEOPLE, PEOPLE, allPeople, SLOTS, SLOT_LABELS,
  getCurrentYear, personOf, CP_DAYS_PER_MONTH, SUPABASE_URL,
} from './config.js';
import { escapeHTML, daysInMonth, fmtISO, formatFR } from './utils.js';
import { store } from './store.js';
import { supabaseHeaders } from './auth.js';
import { showToast } from './ui.js';
import { getSlotState, getSlotLabel, getLeaveDecision, getLeaveDecisionComment,
  setLeaveDecision, setLeaveDecisionComment,
  getChangeDecision, setChangeDecision, getShiftType, isASVPerson,
} from './slots.js';
import { triggerPushNotification } from './pwa.js';

const today = new Date();

/* Callbacks injectés depuis dashboard.js pour éviter les imports circulaires. */
let _snapshotBeforeChange, _saveData, _renderDashboard;
export function setupLeaveRequests({ snapshotBeforeChange, saveData, renderDashboard }){
  _snapshotBeforeChange = snapshotBeforeChange;
  _saveData             = saveData;
  _renderDashboard      = renderDashboard;
}

/* ================================================================
   DEMANDES DE CONGÉ ASV
   ================================================================ */

// Repos planifié ne nécessite pas d'approbation vétérinaire → exclu des demandes de congé.
export function isReposLabel(label){ const lc=(label||'').toLowerCase().trim(); return lc==='repos'||lc==='repos planifié'||lc==='non travaillé'; }

export function collectAllLeaveGroups(){
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
            if(isReposLabel(label)){ current = null; return; }
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

export function collectAllChangeRequests(){
  const results = [];
  const years = [getCurrentYear(), getCurrentYear()+1];
  ASV_PEOPLE.forEach(person=>{
    years.forEach(year=>{
      for(let month=0; month<12; month++){
        const nbDays = daysInMonth(year, month);
        for(let day=1; day<=nbDays; day++){
          const iso = fmtISO(new Date(year, month, day));
          SLOTS.forEach(slot=>{
            const dec = getChangeDecision(iso, person.id, slot);
            if(!dec) return;
            const state = getSlotState(iso, person.id, slot);
            const label = getSlotLabel(iso, person.id, slot);
            results.push({ personId: person.id, iso, slot, state, label, status: dec });
          });
        }
      }
    });
  });
  return results.sort((a,b)=>a.iso.localeCompare(b.iso));
}

export function sortLeaveGroups(groups){
  const order = { pending:0, approved:1, rejected:2 };
  return groups.slice().sort((a,b)=> (order[a.status]-order[b.status]) || a.slots[0].iso.localeCompare(b.slots[0].iso));
}

export function countPendingLeaveRequests(){
  const leavePending = collectAllLeaveGroups().filter(g=> g.status==='pending').length;
  const changePending = collectAllChangeRequests().filter(r=> r.status==='pending').length;
  return leavePending + changePending;
}

export function decideLeaveGroup(group, decision, comment){
  _snapshotBeforeChange();
  group.slots.forEach(({iso,slot})=>{
    setLeaveDecision(iso, group.personId, slot, decision);
    setLeaveDecisionComment(iso, group.personId, slot, comment || '');
  });
  _saveData();
}

// --- Sous-page "Demandes de congé" : liste groupée, triée en attente -> approuvées ->
// refusées, avec actions d'approbation/refus (refus avec commentaire obligatoire). ---
export function renderLeaveRequestsPage(){
  const container = document.getElementById('dash-sub-requests');
  const groups = sortLeaveGroups(collectAllLeaveGroups());
  const changeReqs = collectAllChangeRequests();
  const statusLabel = { pending:'En attente', approved:'Approuvée', rejected:'Refusée' };
  const statusClass = { pending:'leave-pending', approved:'leave-approved', rejected:'leave-rejected' };

  // ── Section : modifications urgentes (2 semaines) ──
  const stateLabel = (r)=>{
    if(r.state==='present'){
      const sh = getShiftType(r.iso, r.personId);
      return sh==='F' ? 'Poste Fermeture' : 'Poste Ouverture';
    }
    if(r.state==='absent') return r.label || 'Absence';
    return r.state;
  };
  const chgStatusClass = { pending:'change-pending', rejected:'change-rejected' };
  const chgStatusLabel = { pending:'En attente', rejected:'Refusée' };
  const changeRows = changeReqs.map((r, ci)=>{
    const person = personOf(r.personId);
    const dateStr = `${formatFR(r.iso)} (${SLOT_LABELS[r.slot]})`;
    const actions = r.status === 'pending' ? `
      <div class="flex gap-2" style="margin-top:8px;">
        <button class="btn btn-sm btn-primary" data-chg-approve="${ci}">✓ Approuver</button>
        <button class="btn btn-sm btn-danger" data-chg-reject="${ci}">✕ Refuser</button>
      </div>` : '';
    return `
      <div class="card" data-chg-group="${ci}" style="margin-bottom:10px;border-left:4px solid var(--color-change-pending);">
        <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <strong style="color:var(--color-change-pending);">🔔 ${person.short}</strong> — ${dateStr}
            <p class="text-muted" style="font-size:12px;margin-top:2px;">${escapeHTML(stateLabel(r))}</p>
          </div>
          <span class="leave-status-badge ${chgStatusClass[r.status]||'leave-pending'}">${chgStatusLabel[r.status]||r.status}</span>
        </div>
        ${actions}
      </div>`;
  }).join('');

  // ── Section : demandes de congé classiques ──
  const leaveRows = groups.map((g, idx)=>{
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
      </div>`;
  }).join('');

  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    ${changeReqs.length ? `
      <p class="section-desc" style="margin-bottom:10px;font-weight:600;color:var(--color-change-pending);">🔔 Modifications urgentes (dans les 2 semaines)</p>
      ${changeRows}
      <hr style="margin:16px 0;border:none;border-top:1px solid var(--color-border);">
    ` : ''}
    <p class="section-desc" style="margin-bottom:14px;">Demandes de congé ASV — ${getCurrentYear()} et ${getCurrentYear()+1}.</p>
    ${groups.length ? leaveRows : `<p class="text-muted">Aucune demande de congé pour le moment.</p>`}
  `;

  // Handlers : modifications urgentes
  container.querySelectorAll('[data-chg-approve]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = changeReqs[parseInt(btn.dataset.chgApprove,10)];
      _snapshotBeforeChange();
      setChangeDecision(r.iso, r.personId, r.slot, null); // approuvé = flag retiré
      _saveData();
      _renderDashboard();
      showToast('Modification approuvée', '✓');
    });
  });
  container.querySelectorAll('[data-chg-reject]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = changeReqs[parseInt(btn.dataset.chgReject,10)];
      _snapshotBeforeChange();
      setChangeDecision(r.iso, r.personId, r.slot, 'rejected');
      _saveData();
      _renderDashboard();
      showToast('Modification refusée', '✕');
    });
  });

  // Handlers : demandes de congé classiques
  container.querySelectorAll('[data-approve]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const g = groups[parseInt(btn.dataset.approve,10)];
      decideLeaveGroup(g, 'approved', '');
      if(typeof triggerPushNotification === 'function'){
        triggerPushNotification({ type:'leave_approved', title:'Demande de congé approuvée', body:`Votre demande du ${formatFR(g.slots[0].iso)} a été approuvée.`, targetUsers:[g.personId], data:{type:'leave_approved'} });
      }
      _renderDashboard();
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
        triggerPushNotification({ type:'leave_rejected', title:'Demande de congé refusée', body:`Votre demande du ${formatFR(g.slots[0].iso)} a été refusée — ${comment}`, targetUsers:[g.personId], data:{type:'leave_rejected'} });
      }
      _renderDashboard();
      showToast('Demande refusée', '✕');
    });
  });
}

/* ================================================================
   MODULE CP — Compteur Congés Payés
   ================================================================ */
export function easterDate(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day);
}
export function getJoursFeries(year){
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

export function getCPTakenDays(personId, startISO, endISO){
  let halfDays = 0;
  const isASV = isASVPerson(personId);
  const labelRe = /cp|cong[eé]/i;
  for(const key of Object.keys(store.DATA.slots)){
    const m = key.match(/^(\d{4}-\d{2}-\d{2})_(.+)_(M|AM)$/);
    if(!m) continue;
    const [,iso,pid] = m;
    if(pid !== personId) continue;
    if(iso < startISO || iso > endISO) continue;
    if(store.DATA.slots[key] !== 'absent') continue;
    if(isASV){
      // ASV : seules les absences avec motif CP/Congé comptent (les autres motifs
      // comme Maladie ou Formation ne consomment pas de CP)
      const label = store.DATA.slots[key.replace(/_(M|AM)$/, '_$1_label')] || '';
      if(!labelRe.test(label)) continue;
    }
    // Vétérinaires : toute absence = CP (pas de workflow de demande de congé)
    halfDays++;
  }
  return Math.round(halfDays / 2 * 100) / 100;
}

export function cpPeriodISO(referenceYear){
  const y = referenceYear;
  const start = `${y}-01-01`;
  const end   = `${y}-12-31`;
  return { start, end, label:`1 janv. ${y} → 31 déc. ${y}` };
}

export function getCPAcquired(person, referenceYear){
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

export function renderGroupConges(group, containerId){
  const container = document.getElementById(containerId || `${group}-sub-conges`);
  if(!container) return;
  const isAdmin = store.currentUser?.role === 'admin';
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

    // eslint-disable-next-line no-unsanitized/property
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

export function openCPAdjustModal(personId, year, carriedOver, extra, note, group, containerId){
  const person = allPeople().find(p=>p.id===personId);
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  // eslint-disable-next-line no-unsanitized/property
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

export function getAbsenteeismRate(personId, year, month){ // module absentéisme supprimé de l'UI
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
      if(store.DATA.slots[key] === 'absent'){
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

export function renderDashboardAbsences(){ // stub — module supprimé
  const container = document.getElementById('dash-sub-absences');
  if(container) container.innerHTML = '';
}
