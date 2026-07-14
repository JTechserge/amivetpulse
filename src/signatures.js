import { SUPABASE_FUNCTIONS_URL } from './config.js';
import { supabaseHeaders } from './auth.js';
import { escapeHTML } from './utils.js';
import { store } from './store.js';
import { fetchSignatures, apiSignMonth, apiRevokeSignature } from './api.js';
import { showToast } from './ui.js';

let _onLoaded = null;
let _renderCalendarView = null;
export function setupSignatures({ onLoaded, renderCalendarView }) {
  _onLoaded = onLoaded;
  _renderCalendarView = renderCalendarView;
}

/* ---------- Clés + helpers de lecture ---------- */
export function signatureKey(personId, year, month) { return `${personId}|${year}|${month}`; }
export function isMonthSigned(personId, year, month) { return store.SIGNATURES.has(signatureKey(personId, year, month)); }
export function getSignatureDetail(personId, year, month) { return store.signatureDetails.get(signatureKey(personId, year, month)) || null; }

/* ---------- Chargement depuis Supabase ---------- */
export async function loadSignatures() {
  const rows = await fetchSignatures();
  if (!rows) return;
  store.SIGNATURES.clear();
  store.signatureDetails.clear();
  rows.forEach(r => {
    const key = signatureKey(r.person_id, r.year, r.month);
    store.SIGNATURES.add(key);
    store.signatureDetails.set(key, { signedName: r.signed_name, signedAt: r.signed_at });
  });
  _onLoaded?.();
}

export async function signMonth(personId, year, month, signedName) {
  await apiSignMonth(personId, year, month, signedName);
  await loadSignatures();
}
export async function revokeSignature(personId, year, month) {
  await apiRevokeSignature(personId, year, month);
  await loadSignatures();
}

/* ---------- Modal de fallback : lien de signature à copier ---------- */
export function openSigningLinkModal(signingLink, recipientLabel, emailError) {
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  // eslint-disable-next-line no-unsanitized/property
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
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  box.querySelector('#copy-signing-link').onclick = () => {
    navigator.clipboard.writeText(signingLink).then(() => {
      box.querySelector('#copy-signing-link').textContent = '✅ Copié !';
      setTimeout(() => { box.querySelector('#copy-signing-link').textContent = '📋 Copier'; }, 2000);
    });
  };
  box.querySelector('#signing-link-input').onclick = (e) => e.target.select();
}

/* ---------- Modal de confirmation de signature (lien email → click) ---------- */
export function openSignConfirmModal(tokenId) {
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3>✍️ Confirmer ma signature</h3>
    <p style="margin-bottom:12px;">Vous allez signer électroniquement votre feuille de présence. Votre identité, email et l'horodatage seront enregistrés de façon permanente.</p>
    <div style="background:#F0FDF9;border:1px solid #99F6E4;border-radius:8px;padding:12px 14px;font-size:13px;color:#0F766E;margin-bottom:14px;line-height:1.6;">
      <strong>Signataire :</strong> ${escapeHTML(store.currentUser.display_name || store.currentUser.email)}<br>
      <strong>Email :</strong> ${escapeHTML(store.currentUser.email)}
    </div>
    <p id="sign-confirm-error" style="color:#B91C1C;font-size:12px;display:none;margin:0 0 10px;"></p>
    <div class="modal-actions" style="margin-top:4px;">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn btn-primary" id="sign-do-confirm">✍️ Confirmer ma signature</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  box.querySelector('#sign-do-confirm').onclick = async () => {
    const confirmBtn = box.querySelector('#sign-do-confirm');
    const errorEl = box.querySelector('#sign-confirm-error');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Signature en cours…';
    try {
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}confirm-signature`, {
        method: 'POST',
        headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ token_id: tokenId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erreur inconnue');

      // Génération et upload du PDF (best-effort : n'empêche pas la signature en cas d'échec)
      if (data.signature_id) {
        confirmBtn.textContent = 'Génération du PDF…';
        try {
          const { generateSignaturePdf } = await import('./lib/pdf-generator.js');
          const pdfBase64 = await generateSignaturePdf({
            personId:    data.person_id,
            year:        data.year,
            month:       data.month,
            signedAt:    data.signed_at,
            signedName:  store.currentUser.display_name || store.currentUser.email,
            signatureId: data.signature_id,
          });
          await fetch(`${SUPABASE_FUNCTIONS_URL}upload-signed-pdf`, {
            method: 'POST',
            headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ signature_id: data.signature_id, pdf_base64: pdfBase64 }),
          });
        } catch (pdfErr) {
          console.warn('PDF non généré :', pdfErr);
        }
      }

      close();
      await loadSignatures();
      _renderCalendarView?.('asv-current');
      showToast('Feuille de présence signée — email de confirmation envoyé', '✅');
    } catch (e) {
      errorEl.textContent = e.message || 'Échec de la signature.';
      errorEl.style.display = 'block';
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✍️ Confirmer ma signature';
    }
  };
}
