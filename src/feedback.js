/* ================================================================
   AMIVET PLANNING — Signalements
   Ouvert à tous les rôles : ASV, vétérinaire salarié, associé, admin.
   Toute la logique testable vit dans ./lib/feedback-payload.js ; ce module
   ne garde que le DOM et l'appel réseau.
   ================================================================ */
import { SUPABASE_URL } from './config.js';
import { supabaseHeaders } from './auth.js';
import { store } from './store.js';
import { showToast } from './ui.js';
import { escapeHTML } from './utils.js';
import {
  describeScreen,
  buildFeedbackPayload,
  matchesStatusFilter,
  resolvedAtFor,
  isOpenStatus,
  MESSAGE_MAX,
} from './lib/feedback-payload.js';

// Injectée au build depuis CACHE_VERSION de public/sw.js (cf. vite.config.js),
// la seule valeur que le déploiement incrémente réellement. 'dev' hors build.
const APP_VERSION = import.meta.env?.VITE_APP_VERSION || 'dev';

const SEVERITY_CHOICES = [
  { key: 'bloquant', label: '🛑 Bloquant', hint: 'je ne peux pas travailler' },
  { key: 'normal', label: '⚠️ Gênant', hint: 'contournable' },
  { key: 'confort', label: '💡 Confort', hint: 'suggestion' },
];

/**
 * Lit l'écran courant dans le DOM plutôt que dans l'état : c'est ce que
 * l'utilisateur voit au moment où il clique, et ça évite de faire remonter
 * `currentView` (variable privée d'app.js) jusqu'ici.
 */
function currentScreen() {
  const activeTab = document.querySelector('.nav-tab.active') || document.querySelector('.mb-tab.active');
  const view = activeTab?.dataset.view || null;
  const section = view ? document.getElementById(`view-${view}`) : null;
  const subTab = section?.querySelector('.sub-tab.active')?.dataset.sub || null;
  const impersonating = store.currentUser?.role === 'admin' && store.adminViewMode === 'asv';
  return describeScreen({ view, subTab, impersonating });
}

function resetSendButton(sendBtn) {
  sendBtn.disabled = false;
  sendBtn.textContent = 'Envoyer';
}

async function submitFeedback({ message, severity, close, sendBtn }) {
  let payload;
  try {
    payload = buildFeedbackPayload({
      user: store.currentUser,
      screen: currentScreen(),
      appVersion: APP_VERSION,
      userAgent: navigator.userAgent,
      message,
      severity,
    });
  } catch (err) {
    // Erreur de saisie ou de session : le message est déjà affichable tel quel.
    showToast(err.message, '⚠️');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Envoi…';
  try {
    const res = await fetch(`${SUPABASE_URL}feedback`, {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // Ne rien avaler : un signalement perdu en silence est pire que pas de
      // bouton du tout, l'utilisateur croirait avoir prévenu.
      console.error('[feedback] insertion refusée', res.status, await res.text());
      showToast('Envoi impossible. Réessayez, ou prévenez Jérémie directement.', '⚠️');
      resetSendButton(sendBtn);
      return;
    }
  } catch (err) {
    console.error('[feedback] envoi impossible', err);
    showToast("Pas de réseau : le signalement n'a pas été envoyé.", '⚠️');
    resetSendButton(sendBtn);
    return;
  }

  close();
  showToast('Signalement envoyé. Merci !', '🚩');
}

export function openFeedbackModal() {
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';

  const severityBtns = SEVERITY_CHOICES.map(
    (s) =>
      `<button type="button" class="btn fb-sev-btn" data-sev="${s.key}" aria-pressed="${s.key === 'normal'}" title="${s.hint}">${s.label}</button>`
  ).join('');

  // Template entièrement constant : aucune donnée utilisateur n'y entre.
  // Le message saisi est relu via .value, jamais réinjecté en HTML.
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3>🚩 Signaler un problème</h3>
    <p style="font-size:13px;color:var(--color-muted);margin-top:-6px;">
      L'écran, votre rôle et la version de l'application sont joints automatiquement.
      Seul Jérémie voit les signalements.
    </p>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label for="fb-message" style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">
          Que s'est-il passé ?
          <span id="fb-count" style="font-weight:400;color:var(--color-muted);">(0/${MESSAGE_MAX})</span>
        </label>
        <textarea id="fb-message" rows="5" maxlength="${MESSAGE_MAX}"
          placeholder="Ex. : en cliquant sur Prévisionnel, la page reste vide."
          style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);"></textarea>
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Gravité</label>
        <div id="fb-sev-btns" style="display:flex;flex-wrap:wrap;gap:6px;">${severityBtns}</div>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn" id="fb-cancel-btn">Annuler</button>
      <button class="btn btn-primary" id="fb-send-btn">Envoyer</button>
    </div>
  `;

  backdrop.classList.add('open');
  const close = () => backdrop.classList.remove('open');

  const textarea = box.querySelector('#fb-message');
  const countEl = box.querySelector('#fb-count');
  const sendBtn = box.querySelector('#fb-send-btn');
  let severity = 'normal';

  const paintSeverity = () => {
    box.querySelectorAll('.fb-sev-btn').forEach((b) => {
      const on = b.dataset.sev === severity;
      b.setAttribute('aria-pressed', String(on));
      b.style.fontWeight = on ? '700' : '400';
      b.style.outline = on ? '2px solid var(--color-accent, currentColor)' : 'none';
    });
  };
  paintSeverity();

  box.querySelectorAll('.fb-sev-btn').forEach((b) => {
    b.onclick = () => {
      severity = b.dataset.sev;
      paintSeverity();
    };
  });

  textarea.oninput = () => {
    countEl.textContent = `(${textarea.value.trim().length}/${MESSAGE_MAX})`;
  };

  box.querySelector('#fb-cancel-btn').onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
  sendBtn.onclick = () => submitFeedback({ message: textarea.value, severity, close, sendBtn });

  textarea.focus();
}

/* ================================================================
   Vue administrateur — sous-onglet du tableau de bord.
   Réservée au rôle RÉEL 'admin' : canAccessDashboard() ne convient pas,
   il passe par effectiveRole() et laisse entrer les vétérinaires associés.
   ================================================================ */

const STATUS_LABELS = {
  nouveau: '🆕 Nouveau',
  en_cours: '🔧 En cours',
  decision_humaine: '⚖️ Décision humaine',
  corrige: '✅ Corrigé',
  rejete: '🚫 Rejeté',
};

const SEVERITY_LABELS = {
  bloquant: '🛑 Bloquant',
  normal: '⚠️ Gênant',
  confort: '💡 Confort',
};

const FILTERS = [
  { key: 'ouverts', label: 'À traiter' },
  { key: 'nouveau', label: 'Nouveaux' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'decision_humaine', label: 'Décision humaine' },
  { key: 'tous', label: 'Tous' },
];

let _feedbackList = [];
let _feedbackFilter = 'ouverts';
let _feedbackError = null;

export function isFeedbackAdmin() {
  return store.currentUser?.role === 'admin';
}

export async function loadFeedback() {
  if (!isFeedbackAdmin()) {
    _feedbackList = [];
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}feedback?select=*&order=created_at.desc`, {
      headers: supabaseHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _feedbackList = await res.json();
    _feedbackError = null;
  } catch (err) {
    // Une liste vide et une liste inaccessible ne se ressemblent pas :
    // afficher l'erreur plutôt que « aucun signalement ».
    console.error('[feedback] lecture impossible', err);
    _feedbackList = [];
    _feedbackError = 'Impossible de charger les signalements.';
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

async function patchFeedback(id, patch, btn) {
  const previousLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';
  try {
    const res = await fetch(`${SUPABASE_URL}feedback?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error('[feedback] mise à jour refusée', err);
    showToast('Mise à jour impossible.', '⚠️');
    btn.disabled = false;
    btn.textContent = previousLabel;
    return;
  }
  await loadFeedback();
  renderDashboardFeedback();
  showToast('Signalement mis à jour');
}

export function renderDashboardFeedback() {
  const host = document.getElementById('dash-sub-feedback');
  if (!host) return;
  if (!isFeedbackAdmin()) {
    host.textContent = '';
    return;
  }

  const rows = _feedbackList.filter((r) => matchesStatusFilter(r, _feedbackFilter));
  const openCount = _feedbackList.filter((r) => isOpenStatus(r.status)).length;

  const filterBtns = FILTERS.map((f) => {
    const on = f.key === _feedbackFilter;
    return `<button type="button" class="btn fb-filter-btn" data-filter="${f.key}" aria-pressed="${on}" style="font-weight:${on ? '700' : '400'};">${f.label}</button>`;
  }).join('');

  const statusOptions = (current) =>
    Object.entries(STATUS_LABELS)
      .map(([k, label]) => `<option value="${k}" ${k === current ? 'selected' : ''}>${escapeHTML(label)}</option>`)
      .join('');

  const cards = rows
    .map(
      (r) => `
      <div class="card" data-id="${escapeHTML(r.id)}" style="border:1px solid var(--color-border);border-radius:8px;padding:12px;margin-bottom:10px;background:var(--color-card);">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;font-size:12.5px;color:var(--color-muted);">
          <strong style="color:var(--color-text);">${escapeHTML(SEVERITY_LABELS[r.severity] || r.severity || '')}</strong>
          <span>${escapeHTML(formatDate(r.created_at))}</span>
          <span>· ${escapeHTML(r.role || '')}</span>
          <span>· ${escapeHTML(r.screen || 'écran inconnu')}</span>
          <span>· v${escapeHTML(r.app_version || '?')}</span>
          <span style="margin-left:auto;">${escapeHTML(STATUS_LABELS[r.status] || r.status || '')}</span>
        </div>
        <div style="font-size:13.5px;line-height:1.55;white-space:pre-wrap;margin:8px 0;">${escapeHTML(r.message || '')}</div>
        <details style="font-size:12px;color:var(--color-muted);margin-bottom:8px;">
          <summary style="cursor:pointer;">Détail technique</summary>
          <div style="word-break:break-all;margin-top:4px;">${escapeHTML(r.user_agent || '—')}</div>
        </details>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          <select class="fb-status" style="padding:6px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">${statusOptions(r.status)}</select>
          <input class="fb-note" type="text" maxlength="500" placeholder="Note interne (optionnel)" value="${escapeHTML(r.admin_note || '')}" style="flex:1;min-width:180px;padding:6px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
          <button class="btn btn-primary fb-save">Enregistrer</button>
        </div>
      </div>`
    )
    .join('');

  const body = _feedbackError
    ? `<p style="color:var(--color-danger,#b00);">${escapeHTML(_feedbackError)}</p>`
    : rows.length
      ? cards
      : `<p style="color:var(--color-muted);">Aucun signalement dans ce filtre.</p>`;

  // Toute donnée utilisateur passe par escapeHTML ci-dessus ; le reste du
  // gabarit est constant.
  // eslint-disable-next-line no-unsanitized/property
  host.innerHTML = `
    <p class="section-desc">${openCount} signalement${openCount > 1 ? 's' : ''} à traiter. Visible de vous seul.</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${filterBtns}</div>
    ${body}
  `;

  host.querySelectorAll('.fb-filter-btn').forEach((b) => {
    b.onclick = () => {
      _feedbackFilter = b.dataset.filter;
      renderDashboardFeedback();
    };
  });

  host.querySelectorAll('.card').forEach((card) => {
    const saveBtn = card.querySelector('.fb-save');
    if (!saveBtn) return;
    saveBtn.onclick = () => {
      const status = card.querySelector('.fb-status').value;
      const note = card.querySelector('.fb-note').value.trim();
      patchFeedback(
        card.dataset.id,
        {
          status,
          admin_note: note || null,
          resolved_at: resolvedAtFor(status),
        },
        saveBtn
      );
    };
  });
}
