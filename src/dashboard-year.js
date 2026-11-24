/* ================================================================
   TABLEAU DE BORD — onglet « Bascule d'année » (associés seulement)
   Règles de saisie : lib/year-settings.js ; bornes et défauts :
   lib/clinic-year.js, partagées avec save-planning qui refuse ces clés
   à tout non-associé.
   ================================================================ */
import { escapeHTML } from './utils.js';
import { store } from './store.js';
import { showToast } from './ui.js';
import { asvLockDate, parisTodayIso, rolloverDate } from './lib/clinic-year.js';
import {
  applyYearSettings,
  asvLockDateRejectReason,
  rolloverDateRejectReason,
  yearSettingsTargets,
} from './lib/year-settings.js';
import { isCurrentUserPartner } from './slots.js';

const fr = (iso) => iso.split('-').reverse().join('/');
const e = (v) => escapeHTML(String(v));

/**
 * @param {{ saveData: () => void, onSaved: () => void }} deps
 *   onSaved : re-rendu après enregistrement (l'année courante a pu changer).
 */
export function renderDashboardYear({ saveData, onSaved }) {
  const container = document.getElementById('dash-sub-year');
  if (!container) return;
  if (!isCurrentUserPartner()) {
    container.textContent = 'Réservé aux associés.';
    return;
  }
  const slots = store.DATA.slots;
  const today = parisTodayIso();
  const { rolloverYear: rY, lockYear: lY } = yearSettingsTargets(today, slots);
  const rollKey = `rollover_date_${rY}`;
  const lockKey = `asv_lock_date_${lY}`;

  // Toutes les interpolations sont des années, des dates AAAA-MM-JJ ou des
  // libellés constants, passées par escapeHTML.
  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    <div class="card" style="max-width:640px;">
      <h3 style="margin-top:0;">📆 Bascule d'année</h3>
      <p>À la date de bascule, ${e(rY)} devient l'année courante pour tout le monde et le prévisionnel ASV de ${e(rY)} est figé. Laisser un champ vide pour la règle par défaut.</p>
      <label for="year-rollover-input"><strong>Bascule vers ${e(rY)}</strong></label><br>
      <input type="date" id="year-rollover-input" min="${e(`${rY - 1}-12-01`)}" max="${e(`${rY}-01-31`)}" value="${e(slots[rollKey] || '')}">
      <p style="font-size:12px;margin:4px 0 14px;">Par défaut le ${e(fr(`${rY}-01-01`))} · entre le ${e(fr(`${rY - 1}-12-01`))} et le ${e(fr(`${rY}-01-31`))} · retenue : ${e(fr(rolloverDate(slots, rY)))}</p>
      <label for="year-lock-input"><strong>Verrou des feuilles ASV de ${e(lY - 1)}</strong></label><br>
      <input type="date" id="year-lock-input" min="${e(`${lY}-01-01`)}" max="${e(`${lY}-03-31`)}" value="${e(slots[lockKey] || '')}">
      <p style="font-size:12px;margin:4px 0 6px;">Par défaut le ${e(fr(`${lY}-01-31`))} · entre le ${e(fr(`${lY}-01-01`))} et le ${e(fr(`${lY}-03-31`))}, jamais avant la bascule · retenu : ${e(fr(asvLockDate(slots, lY)))}</p>
      <p style="font-size:12px;margin:0;">Après le verrou, seuls les associés peuvent modifier ces feuilles (bouton de clôture du mois).</p>
      <p id="year-settings-error" style="color:#B91C1C;font-size:12px;display:none;margin:10px 0 0;"></p>
      <div style="margin-top:16px;">
        <button class="btn btn-primary" id="year-settings-save">Enregistrer</button>
      </div>
    </div>
  `;
  const errorEl = container.querySelector('#year-settings-error');
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.style.display = msg ? 'block' : 'none';
  };
  let confirmedImmediate = false;
  container.querySelector('#year-settings-save').onclick = () => {
    const rollover = container.querySelector('#year-rollover-input').value;
    const lock = container.querySelector('#year-lock-input').value;
    const rollReason = rolloverDateRejectReason(rollover, rY, today, slots);
    if (rollReason) return showError(rollReason);
    // Le verrou se juge contre la bascule saisie, pas l'ancienne.
    const proposed = applyYearSettings({ ...slots }, { rolloverYear: rY, rollover, lockYear: lY, lock: null });
    const lockReason = asvLockDateRejectReason(lock, lY, today, proposed);
    if (lockReason) return showError(lockReason);
    if (rollover === today && !confirmedImmediate) {
      confirmedImmediate = true;
      return showError(
        `La bascule vers ${rY} sera immédiate et ne pourra plus être modifiée. Cliquer à nouveau sur Enregistrer pour confirmer.`
      );
    }
    applyYearSettings(slots, { rolloverYear: rY, rollover, lockYear: lY, lock });
    saveData();
    onSaved();
    showToast("Réglages de bascule d'année enregistrés", '📆');
  };
}
