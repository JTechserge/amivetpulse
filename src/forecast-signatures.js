import { SUPABASE_FUNCTIONS_URL } from './config.js';
import { supabaseHeaders } from './auth.js';
import { store } from './store.js';
import { escapeHTML } from './utils.js';
import { showToast } from './ui.js';
import { fetchForecastSignatures, apiRevokeForecastSignature } from './api.js';
import { openSigningLinkModal } from './signatures.js';

// Callback enregistré par forecast.js pour rafraîchir la page ASV après signature.
let _onSigned = null;
export function setupForecastSignatures({ onSigned }) {
  _onSigned = onSigned;
}

function _key(pid, year) {
  return `${pid}|${year}`;
}

export function isForecastSigned(pid, year) {
  return store.forecastSignatures.has(_key(pid, year));
}
export function getForecastSig(pid, year) {
  return store.forecastSignatures.get(_key(pid, year)) || null;
}

export async function loadForecastSignatures() {
  const rows = await fetchForecastSignatures();
  if (!rows) return;
  store.forecastSignatures.clear();
  rows.forEach((r) => {
    store.forecastSignatures.set(_key(r.person_id, r.year), {
      signedBy: r.signed_by_name,
      signedAt: r.signed_at,
      signedByEmail: r.signed_by_email,
    });
  });
}

// Appel par le vétérinaire : envoie l'email de demande de signature à l'ASV.
// Si l'email échoue, ouvre le modal avec le lien à copier manuellement.
export async function requestForecastSignature(pid, year, asvLabel, pdfBase64 = null) {
  const body = { person_id: pid, year };
  if (pdfBase64) body.pdf_base64 = pdfBase64;
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}request-forecast-signature`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!data.email_sent) {
    openSigningLinkModal(data.signing_link, asvLabel, data.email_error);
  } else {
    showToast(`Email de signature envoyé à ${asvLabel}`, '✉️');
  }
}

// Annulation par vet/admin : suppression directe via REST (RLS autorise vet/admin).
export async function revokeForecastSig(pid, year) {
  await apiRevokeForecastSignature(pid, year);
  await loadForecastSignatures();
}

// Modal de confirmation pour l'ASV arrivant via le lien email (?sign-forecast=TOKEN).
export function openForecastSignConfirmModal(tokenId) {
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3>✍️ Signer mon prévisionnel</h3>
    <p style="margin-bottom:12px;">Vous allez signer électroniquement votre prévisionnel annuel. Votre identité, email et l'horodatage seront enregistrés de façon permanente.</p>
    <div style="background:#F0FDF9;border:1px solid #99F6E4;border-radius:8px;padding:12px 14px;font-size:13px;color:#0F766E;margin-bottom:14px;line-height:1.6;">
      <strong>Signataire :</strong> ${escapeHTML(store.currentUser.display_name || store.currentUser.email)}<br>
      <strong>Email :</strong> ${escapeHTML(store.currentUser.email)}
    </div>
    <p id="forecast-sign-confirm-error" style="color:#B91C1C;font-size:12px;display:none;margin:0 0 10px;"></p>
    <div class="modal-actions" style="margin-top:4px;">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn btn-primary" id="forecast-sign-do-confirm">✍️ Confirmer ma signature</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
  box.querySelector('#forecast-sign-do-confirm').onclick = async () => {
    const confirmBtn = box.querySelector('#forecast-sign-do-confirm');
    const errorEl = box.querySelector('#forecast-sign-confirm-error');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Signature en cours…';
    try {
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}confirm-forecast-signature`, {
        method: 'POST',
        headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ token_id: tokenId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
      close();
      await loadForecastSignatures();
      _onSigned?.();
      showToast('Prévisionnel signé avec succès', '✅');
    } catch (e) {
      errorEl.textContent = e.message || 'Échec de la signature.';
      errorEl.style.display = 'block';
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✍️ Confirmer ma signature';
    }
  };
}
