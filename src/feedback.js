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
import { describeScreen, buildFeedbackPayload, MESSAGE_MAX } from './lib/feedback-payload.js';

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
  const activeTab =
    document.querySelector('.nav-tab.active') || document.querySelector('.mb-tab.active');
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
