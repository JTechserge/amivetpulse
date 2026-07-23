import { PEOPLE, ASV_PEOPLE, allPeople, getCurrentYear, personOf, SUPABASE_URL } from './config.js';
import { escapeHTML, fmtISO, formatFR, getWeekMondayDate } from './utils.js';
import { supabaseHeaders } from './auth.js';
import { store } from './store.js';
import { showToast, openConfirmModal } from './ui.js';
import { revokeSignature } from './signatures.js';
import { fetchSignatureArchive, fetchSignedStorageUrl } from './api.js';
import { triggerPushNotification } from './pwa.js';

import {
  buildPersonCard,
  buildBarChartSVG,
  buildRecapTable,

  buildPdfArchiveSection,
  buildASVModulationCard,
  buildASVWeeklyCapCard,
  buildASVSaturdayEquityCard,
  buildASVMonthlyTable,
} from './dashboard-stats.js';
import {
  setupLeaveRequests,
  countPendingLeaveRequests,
  renderLeaveRequestsPage,
  renderGroupConges,
  isReposLabel,
  collectAllLeaveGroups,
  collectAllChangeRequests,
  sortLeaveGroups,
  decideLeaveGroup,
  easterDate,
  getJoursFeries,
  getCPTakenDays,
  cpPeriodISO,
  getCPAcquired,
  openCPAdjustModal,
  getAbsenteeismRate,
  renderDashboardAbsences,
} from './leave-requests.js';

export {
  countPendingLeaveRequests,
  isReposLabel,
  collectAllLeaveGroups,
  collectAllChangeRequests,
  sortLeaveGroups,
  decideLeaveGroup,
  easterDate,
  getJoursFeries,
  getCPTakenDays,
  cpPeriodISO,
  getCPAcquired,
  renderGroupConges,
  openCPAdjustModal,
  getAbsenteeismRate,
  renderDashboardAbsences,
};

const today = new Date();

/* ---------- Callbacks injectés depuis app.js (évitent les deps circulaires) ---------- */
let _openResetYearModal, _saveViewState, _canEditSlot, _effectiveRole;
let _snapshotBeforeChange, _saveData, _renderCurrentView, _openDaySidebar;
let _loadInterviews;
export function setupDashboard({
  openResetYearModal,
  saveViewState,
  canEditSlot,
  effectiveRole,
  snapshotBeforeChange,
  saveData,
  renderCurrentView,
  openDaySidebar,
  loadInterviews,
}) {
  _openResetYearModal = openResetYearModal;
  _saveViewState = saveViewState;
  _canEditSlot = canEditSlot;
  _effectiveRole = effectiveRole;
  _snapshotBeforeChange = snapshotBeforeChange;
  _saveData = saveData;
  _renderCurrentView = renderCurrentView;
  _openDaySidebar = openDaySidebar;
  _loadInterviews = loadInterviews;
  setupLeaveRequests({ snapshotBeforeChange, saveData, renderDashboard });
}

/* ================================================================
   TABLEAU DE BORD — chef d'orchestre
   ================================================================ */

export function renderDashboard() {
  const container = document.getElementById('view-dashboard');
  const pendingCount = countPendingLeaveRequests();
  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    <h2 class="section-title">Tableau de bord</h2>
    <p class="section-desc">Statistiques de présence et demandes de congé ASV.</p>
    <div class="sub-nav-row">
      <div class="sub-nav" id="dash-sub-nav">
        <button class="sub-tab ${store.dashSubState.tab === 'stats' ? 'active' : ''}" data-sub="stats">🩺 Suivi vétérinaires</button>
        <button class="sub-tab ${store.dashSubState.tab === 'hours' ? 'active' : ''}" data-sub="hours">🐾 Suivi ASV</button>
        <button class="sub-tab ${store.dashSubState.tab === 'requests' ? 'active' : ''}" data-sub="requests">📋 Demandes de congé et de modification${pendingCount > 0 ? ` <span class="nav-badge">${pendingCount}</span>` : ''}</button>
        <button class="sub-tab ${store.dashSubState.tab === 'signatures' ? 'active' : ''}" data-sub="signatures">✍️ Feuilles signées</button>
        <button class="sub-tab ${store.dashSubState.tab === 'interviews' ? 'active' : ''}" data-sub="interviews">📝 Entretiens annuels</button>
      </div>
    </div>
    <div id="dash-sub-stats" class="sub-page ${store.dashSubState.tab !== 'stats' ? 'hidden' : ''}"></div>
    <div id="dash-sub-hours" class="sub-page ${store.dashSubState.tab !== 'hours' ? 'hidden' : ''}"></div>
    <div id="dash-sub-requests" class="sub-page ${store.dashSubState.tab !== 'requests' ? 'hidden' : ''}"></div>
    <div id="dash-sub-signatures" class="sub-page ${store.dashSubState.tab !== 'signatures' ? 'hidden' : ''}"></div>
    <div id="dash-sub-interviews" class="sub-page ${store.dashSubState.tab !== 'interviews' ? 'hidden' : ''}"></div>
  `;
  container.querySelector('#dash-sub-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.sub-tab');
    if (!btn) return;
    store.dashSubState.tab = btn.dataset.sub;
    renderDashboard();
    _saveViewState();
  });
  if (store.dashSubState.tab === 'medical') store.dashSubState.tab = 'stats'; // onglet supprimé
  if (store.dashSubState.tab === 'stats') renderDashboardStats();
  else if (store.dashSubState.tab === 'hours') renderDashboardHours();
  else if (store.dashSubState.tab === 'signatures') renderDashboardSignatures();
  else if (store.dashSubState.tab === 'interviews') renderDashboardInterviews();
  else renderLeaveRequestsPage();
}

export function renderDashboardStats() {
  const container = document.getElementById('dash-sub-stats');
  const year = store.dashState.year;
  const cy = getCurrentYear();
  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:0;">
      <div class="year-toggle" id="dash-year-toggle">
        <button data-year="${cy}" class="${year === cy ? 'active' : ''}">${cy}</button>
        <button data-year="${cy + 1}" class="${year === cy + 1 ? 'active' : ''}">${cy + 1}</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm btn-danger" id="dash-reset-current" title="Supprimer toutes les données ${cy}">🗑️ Réinitialiser ${cy}</button>
        <button class="btn btn-sm btn-danger" id="dash-reset-forecast" title="Supprimer toutes les données ${cy + 1}">🗑️ Réinitialiser ${cy + 1}</button>
      </div>
    </div>
    <div class="dash-grid" style="margin-top:18px;">
      ${PEOPLE.map((p) => buildPersonCard(year, p.id)).join('')}
    </div>
    <div class="card" style="margin-bottom:24px;">
      <h3 style="font-size:16px;margin-bottom:4px;">Comparaison mensuelle — David vs Stéphane</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Jours travaillés par mois, ${year}</p>
      <div class="chart-legend">
        ${PEOPLE.map((p) => `<span><span class="legend-swatch" style="background:${p.color};width:11px;height:11px;display:inline-block;border-radius:3px;"></span>${p.short}</span>`).join('')}
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
  container.querySelector('#dash-year-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    store.dashState.year = parseInt(btn.dataset.year, 10);
    renderDashboardStats();
  });
  container.querySelector('#dash-reset-current').onclick = () => _openResetYearModal(cy, false);
  container.querySelector('#dash-reset-forecast').onclick = () => _openResetYearModal(cy + 1, true);
  renderGroupConges('vets', 'dash-vets-cp');
}

export async function renderDashboardSignatures() {
  const container = document.getElementById('dash-sub-signatures');
  const year = store.dashState.year;
  const cy = getCurrentYear();

  // Squelette immédiat (pas de flash blanc)
  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    <div class="year-toggle" id="dash-sig-year-toggle">
      <button data-year="${cy}" class="${year === cy ? 'active' : ''}">${cy}</button>
      <button data-year="${cy + 1}" class="${year === cy + 1 ? 'active' : ''}">${cy + 1}</button>
    </div>
    <div class="card" id="dash-pdf-archive-card" style="margin-top:18px;">
      <h3 style="font-size:16px;margin-bottom:4px;">Feuilles de présence signées ${year}</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Suivi des signatures et des archives PDF — cliquez sur "📄 PDF" pour ouvrir, ✕ pour annuler.</p>
      <div id="dash-pdf-archive-body"><p class="text-muted" style="font-size:12px;">Chargement…</p></div>
    </div>
  `;

  // Toggle année
  container.querySelector('#dash-sig-year-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    store.dashState.year = parseInt(btn.dataset.year, 10);
    renderDashboardSignatures();
  });

  // Charger l'archive PDF puis injecter dans la card
  const archiveRows = await fetchSignatureArchive(year);
  const archiveBody = container.querySelector('#dash-pdf-archive-body');
  if (archiveBody) {
    // eslint-disable-next-line no-unsanitized/property
    archiveBody.innerHTML = buildPdfArchiveSection(year, archiveRows);

    // Handler : annulation de signature
    archiveBody.querySelectorAll('[data-revoke-signature]').forEach((btn) => {
      btn.onclick = async () => {
        const [personId, y, m] = btn.dataset.revokeSignature.split('|');
        openConfirmModal({
          title: 'Annuler cette signature ?',
          message: `Le mois redeviendra modifiable pour ${personOf(personId).short}.`,
          confirmLabel: 'Annuler la signature',
          onConfirm: async () => {
            await revokeSignature(personId, parseInt(y, 10), parseInt(m, 10));
            renderDashboardSignatures();
            showToast('Signature annulée', '🔓');
          },
        });
      };
    });

    // Handler : ouverture PDF (signed URL temporaire 1h)
    archiveBody.querySelectorAll('.pdf-open-btn').forEach((btn) => {
      btn.onclick = async () => {
        const path = btn.dataset.pdfPath;
        btn.disabled = true;
        const orig = btn.textContent;
        btn.textContent = '⌛';
        try {
          const url = await fetchSignedStorageUrl(path);
          window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
          showToast("Impossible d'ouvrir le PDF — " + (e.message || 'erreur'), '❌');
        } finally {
          btn.disabled = false;
          btn.textContent = orig;
        }
      };
    });
  }
}

export function renderDashboardInterviews() {
  const container = document.getElementById('dash-sub-interviews');
  const year = store.dashState.year;
  const cy = getCurrentYear();

  function getInterview(personId) {
    return store.INTERVIEWS.find((i) => i.person_id === personId && i.year === year);
  }
  function isoToFR(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  function statusBadge(itv) {
    if (!itv || itv.status === 'pending')
      return `<span style="color:#DC2626;font-weight:700;font-size:12px;">🔴 À planifier</span>`;
    if (itv.status === 'scheduled')
      return `<span style="color:#D97706;font-weight:700;font-size:12px;">🟡 Planifié${itv.scheduled_date ? ` — ${isoToFR(itv.scheduled_date)}` : ''}</span>`;
    return `<span style="color:#16A34A;font-weight:700;font-size:12px;">🟢 Réalisé${itv.done_date ? ` — ${isoToFR(itv.done_date)}` : ''}</span>`;
  }
  function ratingDisplay(rating) {
    if (!rating) return '';
    return `<span style="color:#F59E0B;font-size:14px;">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`;
  }

  const cards = ASV_PEOPLE.length
    ? ASV_PEOPLE.map((p) => {
        const itv = getInterview(p.id);
        const isPending = !itv || itv.status === 'pending';
        const interviewer = itv?.interviewer_id ? personOf(itv.interviewer_id)?.short || itv.interviewer_id : null;
        return `
      <div class="card" style="border-top:4px solid ${p.color};padding:18px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${p.color};display:inline-block;flex-shrink:0;"></span>
          <span style="font-weight:700;font-size:15px;">${escapeHTML(p.short)}</span>
        </div>
        <div style="margin-bottom:8px;">${statusBadge(itv)}</div>
        ${interviewer ? `<p class="text-muted" style="font-size:12px;margin-bottom:4px;">Responsable : ${escapeHTML(interviewer)}</p>` : ''}
        ${itv?.rating ? `<div style="margin-bottom:8px;">${ratingDisplay(itv.rating)}</div>` : ''}
        <button class="btn btn-sm ${isPending ? 'btn-primary' : ''}" data-itv-open="${p.id}"
          style="${isPending ? '' : 'border:1px solid var(--color-border);'}margin-top:10px;width:100%;justify-content:center;">
          ${isPending ? '➕ Planifier' : '✏️ Voir / Modifier'}
        </button>
      </div>`;
      }).join('')
    : `<p class="text-muted">Aucune ASV dans le planning.</p>`;

  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    <div class="year-toggle" id="dash-itv-year-toggle" style="margin-bottom:20px;">
      <button data-year="${cy}" class="${year === cy ? 'active' : ''}">${cy}</button>
      <button data-year="${cy + 1}" class="${year === cy + 1 ? 'active' : ''}">${cy + 1}</button>
    </div>
    <div class="dash-grid" style="--dash-cols:${Math.max(ASV_PEOPLE.length, 1)};">${cards}</div>
  `;
  container.querySelector('#dash-itv-year-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    store.dashState.year = parseInt(btn.dataset.year, 10);
    renderDashboardInterviews();
  });
  container.querySelectorAll('[data-itv-open]').forEach((btn) => {
    btn.onclick = () => openInterviewModal(btn.dataset.itvOpen, year);
  });
}

export function openInterviewModal(personId, year) {
  const p = personOf(personId);
  const existing = store.INTERVIEWS.find((i) => i.person_id === personId && i.year === year) || {};
  const itvId = existing.id || null;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box modal-box-wide';

  const statuses = [
    { v: 'pending', l: '🔴 À planifier' },
    { v: 'scheduled', l: '🟡 Planifié' },
    { v: 'done', l: '🟢 Réalisé' },
  ];
  const curStatus = existing.status || 'pending';
  const curRating = existing.rating || 0;

  function starRow(rating) {
    return [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<span data-star="${n}" style="font-size:26px;cursor:pointer;color:${rating >= n ? '#F59E0B' : '#CBD5E1'};">★</span>`
      )
      .join('');
  }

  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3 style="margin-bottom:14px;">Entretien annuel ${year} — ${escapeHTML(p?.short || personId)}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
      <div>
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Statut</label>
        <select id="itv-status" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;">
          ${statuses.map((s) => `<option value="${s.v}" ${curStatus === s.v ? 'selected' : ''}>${s.l}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Vétérinaire responsable</label>
        <select id="itv-interviewer" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;">
          <option value="">—</option>
          ${PEOPLE.map((vp) => `<option value="${vp.id}" ${existing.interviewer_id === vp.id ? 'selected' : ''}>${escapeHTML(vp.short)}</option>`).join('')}
        </select>
      </div>
      <div id="itv-scheduled-wrap" style="display:${curStatus === 'pending' ? 'none' : 'block'};">
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Date prévue</label>
        <input type="date" id="itv-scheduled-date" value="${existing.scheduled_date || ''}"
          style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;box-sizing:border-box;">
      </div>
      <div id="itv-done-wrap" style="display:${curStatus === 'done' ? 'block' : 'none'};">
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Date de réalisation</label>
        <input type="date" id="itv-done-date" value="${existing.done_date || ''}"
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
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHTML(existing.objectives_prev || '')}</textarea>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Objectifs N+1</label>
      <textarea id="itv-obj-next" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHTML(existing.objectives_next || '')}</textarea>
    </div>
    <div style="margin-bottom:18px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Commentaires libres</label>
      <textarea id="itv-comments" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHTML(existing.comments || '')}</textarea>
    </div>
    <p id="itv-error" style="color:#B91C1C;font-size:12px;display:none;margin:0 0 8px;"></p>
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Fermer</button>
      <button class="btn btn-primary" id="itv-save-btn">Enregistrer</button>
    </div>
  `;

  backdrop.classList.add('open');
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };

  const statusSel = box.querySelector('#itv-status');
  function updateDateFields() {
    const s = statusSel.value;
    box.querySelector('#itv-scheduled-wrap').style.display = s !== 'pending' ? 'block' : 'none';
    box.querySelector('#itv-done-wrap').style.display = s === 'done' ? 'block' : 'none';
  }
  statusSel.addEventListener('change', updateDateFields);

  let currentRating = curRating;
  box.querySelector('#itv-rating-wrap').addEventListener('click', (e) => {
    const star = e.target.closest('[data-star]');
    if (!star) return;
    currentRating = parseInt(star.dataset.star);
    // Toggle off if clicking the same star
    if (currentRating === parseInt(box.querySelector('#itv-rating-val').value)) currentRating = 0;
    box.querySelector('#itv-rating-val').value = currentRating;
    box.querySelectorAll('[data-star]').forEach((s, i) => {
      s.style.color = currentRating >= i + 1 ? '#F59E0B' : '#CBD5E1';
    });
  });

  box.querySelector('#itv-save-btn').onclick = async () => {
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
    try {
      let res;
      if (itvId) {
        res = await fetch(`${SUPABASE_URL}annual_interviews?id=eq.${itvId}`, {
          method: 'PATCH',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${SUPABASE_URL}annual_interviews`, {
          method: 'POST',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || `HTTP ${res.status}`);
      }
      await _loadInterviews();
      close();
      renderDashboardInterviews();
      showToast('Entretien enregistré', '✅');
      if (payload.scheduled_date && typeof triggerPushNotification === 'function') {
        triggerPushNotification({
          type: 'interview',
          title: 'Entretien annuel planifié',
          body: `Votre entretien annuel ${year} est prévu le ${formatFR(payload.scheduled_date)}.`,
          targetUsers: [personId],
          data: { type: 'interview' },
        });
      }
    } catch (e) {
      errEl.textContent = 'Erreur : ' + e.message;
      errEl.style.display = 'block';
      box.querySelector('#itv-save-btn').disabled = false;
    }
  };
}

export function renderDashboardHours() {
  const container = document.getElementById('dash-sub-hours');
  const year = store.dashState.year;
  const cy = getCurrentYear();
  if (!store.weekNavState.mondayISO) store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(today));
  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    <div class="year-toggle" id="dash-hours-year-toggle" style="margin-bottom:16px;">
      <button data-year="${cy}" class="${year === cy ? 'active' : ''}">${cy}</button>
      <button data-year="${cy + 1}" class="${year === cy + 1 ? 'active' : ''}">${cy + 1}</button>
    </div>
    ${buildASVModulationCard(year)}
    ${year === cy ? buildASVWeeklyCapCard() : ''}
    ${buildASVSaturdayEquityCard(year)}
    ${buildASVMonthlyTable(year)}
    <div id="dash-asv-cp"></div>
  `;
  container.querySelector('#dash-hours-year-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    store.dashState.year = parseInt(btn.dataset.year, 10);
    renderDashboardHours();
  });
  renderGroupConges('asv', 'dash-asv-cp');
}

/* ================================================================
   MODULE VISITES MÉDICALES (dead code — onglet supprimé)
   ================================================================ */
export function addMonthsToDate(dateISO, months) {
  const d = new Date(dateISO + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return fmtISO(d);
}

export function getMedicalAlert(visit) {
  if (!visit) {
    return { level: 'red', label: 'À planifier', effectiveNextDate: null, daysUntil: null };
  }
  const effectiveNextDate = visit.next_visit_date || addMonthsToDate(visit.visit_date, visit.frequency_months || 60);
  const todayMs = today.getTime();
  const nextMs = new Date(effectiveNextDate + 'T00:00:00').getTime();
  const daysUntil = Math.floor((nextMs - todayMs) / 86400000);
  let level, label;
  if (daysUntil < 0) {
    level = 'red';
    label = `⛔ Dépassée (${Math.abs(daysUntil)}j)`;
  } else if (daysUntil < 90) {
    level = 'amber';
    label = `⚠️ Dans ${daysUntil}j`;
  } else {
    level = 'green';
    label = '✅ À jour';
  }
  return { level, label, effectiveNextDate, daysUntil };
}

export function renderDashboardMedical() {
  const container = document.getElementById('dash-sub-medical');
  const isAdmin = store.currentUser?.role === 'admin';
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-muted);">Chargement…</div>';

  (async () => {
    let visits = [];
    try {
      const res = await fetch(`${SUPABASE_URL}medical_visits?select=*&order=visit_date.desc`, {
        headers: supabaseHeaders(),
      });
      if (res.ok) visits = await res.json();
    } catch (e) {
      console.warn('medical_visits inaccessibles', e);
    }

    const latestByPerson = {};
    visits.forEach((v) => {
      if (!latestByPerson[v.person_id] || v.visit_date > latestByPerson[v.person_id].visit_date)
        latestByPerson[v.person_id] = v;
    });

    const people = allPeople().filter((p) => !p.archived);
    const VISIT_TYPE_LABELS = {
      embauche: 'Embauche',
      periodique: 'Périodique',
      reprise: 'Reprise',
      spontanee: 'Spontanée',
    };
    const STATUS_LABELS = {
      apte: 'Apte',
      apte_reserves: 'Apte avec réserves',
      inapte: 'Inapte',
      en_attente: 'En attente',
    };
    const levelIcon = { red: '⛔', amber: '⚠️', green: '✅' };
    const levelColor = { red: '#DC2626', amber: '#CA8A04', green: '#16A34A' };

    const rows = people
      .map((p) => {
        const v = latestByPerson[p.id] || null;
        const alert = getMedicalAlert(v);
        const nextDisplay = v
          ? alert.effectiveNextDate
            ? new Date(alert.effectiveNextDate + 'T00:00:00').toLocaleDateString('fr-FR')
            : '—'
          : '—';
        const statusLabel = v ? STATUS_LABELS[v.status] || v.status : '—';
        const reservesBtn =
          v?.status === 'apte_reserves' && v?.reserves_note
            ? `<button class="med-reserves-btn btn btn-sm" title="${escapeHTML(v.reserves_note)}" style="font-size:11px;padding:2px 6px;margin-left:4px;">ℹ️</button>`
            : '';
        return `<tr>
        <td data-label="Statut" style="padding:8px 12px;text-align:center;font-size:16px;color:${levelColor[alert.level]};">${levelIcon[alert.level]}</td>
        <td data-label="Personne" style="padding:8px 12px;font-weight:600;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px;"></span>${escapeHTML(p.short || p.name)}</td>
        <td data-label="Dernière visite" style="padding:8px 12px;">${v ? new Date(v.visit_date + 'T00:00:00').toLocaleDateString('fr-FR') : '—'}</td>
        <td data-label="Type" style="padding:8px 12px;">${v ? VISIT_TYPE_LABELS[v.visit_type] || v.visit_type : '—'}</td>
        <td data-label="Aptitude" style="padding:8px 12px;">${statusLabel}${reservesBtn}</td>
        <td data-label="Prochaine visite" style="padding:8px 12px;color:${levelColor[alert.level]};font-weight:${alert.level !== 'green' ? '600' : '400'};">${nextDisplay}</td>
        <td data-label="Actions" style="padding:8px 12px;">
          ${v && isAdmin ? `<button class="btn btn-sm med-edit-btn" data-visit-id="${v.id}" style="font-size:11.5px;padding:3px 8px;">✎</button>` : ''}
          ${!v && isAdmin ? `<button class="btn btn-sm btn-primary med-add-btn" data-pid="${p.id}" style="font-size:11.5px;padding:3px 8px;">+ Ajouter</button>` : ''}
        </td>
      </tr>`;
      })
      .join('');

    // eslint-disable-next-line no-unsanitized/property
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
      ${(() => {
        const seen = {};
        const calEntries = [];
        Object.keys(store.DATA.slots).forEach((key) => {
          if (store.DATA.slots[key] !== 'medical') return;
          const m = key.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_(M|AM)$/);
          if (!m) return;
          const [, iso, pid] = m;
          const k = `${pid}_${iso}`;
          if (!seen[k]) {
            seen[k] = true;
            calEntries.push({ iso, pid });
          }
        });
        calEntries.sort((a, b) => a.iso.localeCompare(b.iso));
        if (!calEntries.length) return '';
        const rows2 = calEntries
          .map((e) => {
            const p2 = people.find((x) => x.id === e.pid);
            const dStr = new Date(e.iso + 'T00:00:00').toLocaleDateString('fr-FR');
            return `<tr>
            <td style="padding:7px 12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p2?.color || '#999'};margin-right:5px;"></span><strong>${escapeHTML(p2?.short || e.pid)}</strong></td>
            <td style="padding:7px 12px;">${dStr}</td>
            <td style="padding:7px 12px;font-size:11px;color:var(--color-text-muted);">Marqué dans le calendrier</td>
          </tr>`;
          })
          .join('');
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

    container.querySelectorAll('.med-reserves-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const note = btn.getAttribute('title');
        const box2 = document.getElementById('modal-box');
        const backdrop2 = document.getElementById('modal-backdrop');
        box2.className = 'modal-box';
        // eslint-disable-next-line no-unsanitized/property
        box2.innerHTML = `<h3>ℹ️ Réserves d'aptitude</h3><p style="font-size:13.5px;line-height:1.6;">${escapeHTML(note)}</p><div class="modal-actions"><button class="btn btn-primary" id="med-res-ok">Fermer</button></div>`;
        backdrop2.classList.add('open');
        box2.querySelector('#med-res-ok').onclick = () => backdrop2.classList.remove('open');
        backdrop2.onclick = (ev) => {
          if (ev.target === backdrop2) backdrop2.classList.remove('open');
        };
      };
    });

    if (isAdmin) {
      const openAdd = (personId) => openMedicalModal(null, visits, personId);
      const openEdit = (visitId) =>
        openMedicalModal(
          visits.find((v) => v.id === visitId),
          visits,
          null,
          () => {
            renderDashboardMedical();
          }
        );
      if (container.querySelector('#med-add-global'))
        container.querySelector('#med-add-global').onclick = () => openAdd(null);
      container.querySelectorAll('.med-add-btn').forEach((btn) => (btn.onclick = () => openAdd(btn.dataset.pid)));
      container.querySelectorAll('.med-edit-btn').forEach((btn) => (btn.onclick = () => openEdit(btn.dataset.visitId)));
    }
  })();
}

export function openMedicalModal(existingVisit, allVisits, preselectedPid, _onSaved) {
  const isAdmin = store.currentUser?.role === 'admin';
  if (!isAdmin) return;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  const people = allPeople().filter((p) => !p.archived);
  const FREQ_OPTIONS = [
    [12, '12 mois (1 an)'],
    [24, '24 mois (2 ans)'],
    [36, '36 mois (3 ans)'],
    [60, '60 mois (5 ans)'],
  ];
  const curFreq = existingVisit?.frequency_months || 60;

  function calcNextISO(visitDateISO, freqMonths) {
    return visitDateISO ? addMonthsToDate(visitDateISO, freqMonths) : '';
  }

  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3>${existingVisit ? '✎ Modifier la visite' : '🏥 Ajouter une visite médicale'}</h3>
    <div style="display:flex;flex-direction:column;gap:11px;max-height:70vh;overflow-y:auto;">
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Personne</label>
        ${
          existingVisit
            ? `<div style="font-weight:700;padding:6px 0;">${escapeHTML(people.find((p) => p.id === existingVisit.person_id)?.short || existingVisit.person_id)}</div><input type="hidden" id="med-person" value="${existingVisit.person_id}">`
            : `<select id="med-person" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">${people.map((p) => `<option value="${p.id}"${p.id === preselectedPid ? ' selected' : ''}>${escapeHTML(p.short || p.name)}</option>`)}</select>`
        }
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Date de la visite</label>
        <input id="med-date" type="date" max="${fmtISO(today)}" value="${existingVisit?.visit_date || ''}" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Type de visite</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${[
            ['embauche', 'Embauche'],
            ['periodique', 'Périodique'],
            ['reprise', 'Reprise'],
            ['spontanee', 'Spontanée'],
          ]
            .map(
              ([v, l]) =>
                `<label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;border:1px solid var(--color-border);padding:5px 10px;border-radius:20px;"><input type="radio" name="med-type" value="${v}" ${(existingVisit?.visit_type || 'periodique') === v ? 'checked' : ''}> ${l}</label>`
            )
            .join('')}
        </div>
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Aptitude</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${[
            ['apte', 'Apte'],
            ['apte_reserves', 'Apte avec réserves'],
            ['inapte', 'Inapte'],
            ['en_attente', 'En attente'],
          ]
            .map(
              ([v, l]) =>
                `<label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;border:1px solid var(--color-border);padding:5px 10px;border-radius:20px;"><input type="radio" name="med-status" value="${v}" ${(existingVisit?.status || 'apte') === v ? 'checked' : ''}> ${l}</label>`
            )
            .join('')}
        </div>
      </div>
      <div id="med-reserves-wrap" style="${(existingVisit?.status || 'apte') === 'apte_reserves' ? '' : 'display:none;'}">
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Réserves</label>
        <textarea id="med-reserves" rows="2" placeholder="Détail des réserves…" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${escapeHTML(existingVisit?.reserves_note || '')}</textarea>
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Fréquence de renouvellement</label>
        <select id="med-freq" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
          ${FREQ_OPTIONS.map(([v, l]) => `<option value="${v}"${v === curFreq ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Prochaine visite (calculée auto, modifiable)</label>
        <input id="med-next" type="date" value="${existingVisit?.next_visit_date || calcNextISO(existingVisit?.visit_date, curFreq)}" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Médecin du travail</label>
        <input id="med-doctor" type="text" value="${escapeHTML(existingVisit?.doctor_name || '')}" placeholder="Nom du médecin" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Notes</label>
        <textarea id="med-notes" rows="2" placeholder="Observations, suivi…" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${escapeHTML(existingVisit?.notes || '')}</textarea>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
      ${existingVisit ? `<button class="btn btn-danger" id="med-delete-btn" style="margin-right:auto;">🗑️ Supprimer</button>` : ''}
      <button class="btn" id="med-cancel">Annuler</button>
      <button class="btn btn-primary" id="med-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#med-cancel').onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };

  box.querySelectorAll('input[name="med-status"]').forEach((r) => {
    r.onchange = () => {
      box.querySelector('#med-reserves-wrap').style.display = r.value === 'apte_reserves' ? '' : 'none';
    };
  });

  const autoNext = () => {
    const dateVal = box.querySelector('#med-date').value;
    const freqVal = parseInt(box.querySelector('#med-freq').value) || 60;
    if (dateVal) box.querySelector('#med-next').value = calcNextISO(dateVal, freqVal);
  };
  box.querySelector('#med-date').onchange = autoNext;
  box.querySelector('#med-freq').onchange = autoNext;

  if (existingVisit) {
    box.querySelector('#med-delete-btn').onclick = async () => {
      if (!confirm('Supprimer cette visite ?')) return;
      try {
        await fetch(`${SUPABASE_URL}medical_visits?id=eq.${existingVisit.id}`, {
          method: 'DELETE',
          headers: supabaseHeaders({ Prefer: 'return=minimal' }),
        });
        close();
        renderDashboardMedical();
        showToast('Visite supprimée', '🗑️');
      } catch (e) {
        showToast('Erreur : ' + e.message, '⚠️');
      }
    };
  }

  box.querySelector('#med-save').onclick = async () => {
    const person_id = box.querySelector('#med-person').value;
    const visit_date = box.querySelector('#med-date').value;
    const visit_type = box.querySelector('input[name="med-type"]:checked')?.value || 'periodique';
    const status = box.querySelector('input[name="med-status"]:checked')?.value || 'apte';
    const reserves_note = status === 'apte_reserves' ? box.querySelector('#med-reserves').value.trim() : '';
    const frequency_months = parseInt(box.querySelector('#med-freq').value) || 60;
    const next_visit_date = box.querySelector('#med-next').value || null;
    const doctor_name = box.querySelector('#med-doctor').value.trim();
    const notes = box.querySelector('#med-notes').value.trim();
    if (!visit_date) {
      showToast('Date de visite requise', '⚠️');
      return;
    }
    const payload = {
      person_id,
      visit_date,
      visit_type,
      status,
      reserves_note,
      frequency_months,
      next_visit_date,
      doctor_name,
      notes,
    };
    try {
      if (existingVisit) {
        await fetch(`${SUPABASE_URL}medical_visits?id=eq.${existingVisit.id}`, {
          method: 'PATCH',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${SUPABASE_URL}medical_visits`, {
          method: 'POST',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify(payload),
        });
      }
      close();
      renderDashboardMedical();
      showToast(existingVisit ? 'Visite mise à jour' : 'Visite enregistrée', '✅');
      if (typeof triggerPushNotification === 'function') {
        const alert = getMedicalAlert(payload);
        if (alert.level === 'red' || alert.level === 'amber') {
          const p = personOf(person_id);
          triggerPushNotification({
            type: 'medical_visit',
            title: 'Visite médicale à renouveler',
            body: `${p ? p.short : person_id} — prochaine visite : ${alert.label}`,
            targetUsers: [person_id, 'david', 'stephane'],
            data: { type: 'medical_visit' },
          });
        }
      }
    } catch (e) {
      showToast('Erreur : ' + e.message, '⚠️');
    }
  };
}

/* Export explicite pour app.js (navigation par notification) */
export function setDashSubTab(tab) {
  store.dashSubState.tab = tab;
}
