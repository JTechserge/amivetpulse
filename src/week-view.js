import { ASV_PEOPLE, MONTH_NAMES, WEEKLY_MAX_HOURS, personOf } from './config.js';
import { escapeHTML, fmtISO, isSunday, holidayName, formatHHMM, daysInMonth, getWeekMondayDate } from './utils.js';
import { store } from './store.js';
import { showToast, openConfirmModal } from './ui.js';
import {
  isASVPerson,
  isPersonWorkingDay,
  getSlotState,
  getSlotLabel,
  getShiftType,
  shiftTypeKey,
  getDayNominal,
  getDayAllOtH,
  getDayDeficitH,
  getPlusMins,
  setPlusMins,
  getMinusMins,
  setMinusMins,
  getOvertimeHours,
  isMonthClosed,
  getSlotNominalH,
  getSlotShiftType,
} from './slots.js';
import { isMonthSigned } from './signatures.js';

// État "aujourd'hui" local au module (équivalent au const today d'app.js — même jour au chargement).
const today = new Date();

// ── Callbacks injectés (fonctions restées dans app.js) ──────────
let _saveData, _snapshotBeforeChange, _renderCurrentView;
let _canEditSlot, _effectiveRole, _switchSubPage, _updateUndoButtons;

function setupWeekView({
  saveData,
  snapshotBeforeChange,
  renderCurrentView,
  canEditSlot,
  effectiveRole,
  switchSubPage,
  updateUndoButtons,
}) {
  _saveData = saveData;
  _snapshotBeforeChange = snapshotBeforeChange;
  _renderCurrentView = renderCurrentView;
  _canEditSlot = canEditSlot;
  _effectiveRole = effectiveRole;
  _switchSubPage = switchSubPage;
  _updateUndoButtons = updateUndoButtons;
}

function weekPersonId() {
  // Admin en impersonation → la personne choisie (ex. Marie)
  if (store.currentUser?.role === 'admin' && store.adminViewMode === 'asv')
    return store.adminImpersonatedPersonId || ASV_PEOPLE[0]?.id;
  // ASV authentifiée → toujours soi-même
  if (_effectiveRole() === 'asv') return store.currentUser?.person_id || ASV_PEOPLE[0]?.id;
  // Vétérinaires / admin (vue normale) → sélecteur dans la vue
  return store.weekNavState.personId || ASV_PEOPLE[0]?.id;
}

function openMonthPrintWindow(pids, year, month) {
  // Extraire le logo déjà chargé dans le DOM via canvas (évite tout problème de chargement URL)
  function getLogoDataUrl() {
    const img = document.querySelector('img.brand-logo') || document.querySelector('img.login-logo');
    if (!img || !img.complete || !img.naturalWidth) return '';
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/png');
    } catch {
      return img.src;
    }
  }
  const logoSrc = getLogoDataUrl();
  const DOW_FR = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const nb = daysInMonth(year, month);

  // @page margin:0 → les marges du dialog navigateur n'écrasent rien
  // Toutes les marges sont gérées via padding dans .sheet
  const printStyle = `
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0;
          font-family: Arial, Helvetica, sans-serif;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      /* ── Fiche : une page par ASV, toujours ── */
      .sheet {
        width: 210mm; min-height: 297mm;
        padding: 14mm 18mm 12mm;
        page-break-after: always; break-after: page;
      }
      /* ── En-tête ── */
      .hdr {
        display: flex; align-items: flex-start; justify-content: space-between;
        padding-bottom: 9px; margin-bottom: 12px;
        border-bottom: 3px solid #111;
      }
      .hdr-left { display: flex; align-items: center; gap: 12px; }
      .hdr-logo { height: 38px; width: auto; display: block; }
      .hdr-clinic { font-size: 8.5px; color: #555; text-transform: uppercase;
                    letter-spacing: .07em; line-height: 1.5; }
      .hdr-clinic strong { display: block; font-size: 11px; color: #111;
                           letter-spacing: .02em; font-weight: 700; }
      .hdr-right { text-align: right; }
      .hdr-asv { font-size: 16px; font-weight: 700; color: #111; line-height: 1.1; }
      .hdr-period { font-size: 10px; color: #555; margin-top: 2px; }
      /* ── Tableau ── */
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px;
              border: 1.5px solid #111; }
      thead tr { background: #111; }
      th {
        padding: 6px 8px; color: #fff; font-size: 8px;
        text-transform: uppercase; letter-spacing: .07em;
        font-weight: 700; text-align: left; border-right: 1px solid #333;
      }
      th:last-child { border-right: none; }
      td {
        padding: 4px 8px; font-size: 9.5px; line-height: 1.35;
        border-bottom: 1px solid #E0E0E0; border-right: 1px solid #E0E0E0;
        vertical-align: middle;
      }
      td:last-child { border-right: none; }
      tbody tr:nth-child(even) td { background: #F6F6F6; }
      tbody tr:nth-child(odd)  td { background: #fff; }
      tr.sat td  { background: #EBEBEB !important; font-style: italic; }
      tr.hol td  { background: #F2F2F2 !important; font-style: italic; color: #444; }
      tr.abs td  { color: #555; }
      .day-col   { font-weight: 700; white-space: nowrap; width: 40px; }
      .slot-col  { font-size: 8.5px; color: #555; width: 32px; white-space: nowrap; }
      .num       { text-align: center; font-variant-numeric: tabular-nums;
                   width: 52px; white-space: nowrap; }
      .ot-val    { font-weight: 700; }
      .def-val   { font-weight: 700; }
      .dash      { color: #BBB; }
      /* Ligne total ── fond sombre comme l'entête */
      tr.tot td  {
        background: #111 !important; color: #fff;
        font-weight: 700; font-size: 9.5px;
        border-bottom: none; border-right: 1px solid #333;
        padding: 6px 8px;
      }
      tr.tot td:last-child { border-right: none; }
      /* Note de bas de tableau */
      .footnote  { font-size: 7.5px; color: #666; margin: -8px 0 8px; }
      /* ── Bloc signature ── */
      .sig {
        border: 1px solid #999; border-radius: 3px;
        padding: 10px 14px; margin-bottom: 10px;
      }
      .sig-ttl {
        font-size: 8px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .07em; color: #333; margin-bottom: 10px;
      }
      .sig-cols { display: flex; gap: 32px; }
      .sig-col  { flex: 1; }
      .sig-lbl  { font-size: 8px; color: #666; margin-bottom: 3px; }
      .sig-line { border-bottom: 1px solid #888; height: 30px; }
      .sig-date { font-size: 8px; color: #666; margin-top: 10px; }
      /* ── Pied ── */
      .footer {
        font-size: 8px; color: #AAA; text-align: right;
        border-top: 1px solid #DDD; padding-top: 5px;
      }
    </style>`;

  // Lot 9 : label de créneau pour la fiche imprimée
  const SLOT_PRINT_LBL = { M: 'Mat.', AM: 'A-m.' };
  const SHIFT_LABEL = { O: 'Ouverture', F: 'Fermeture', D: 'Demi-j.' };

  let allSheets = '';
  pids.forEach((pid) => {
    const p = personOf(pid);
    let rows = '';
    let mTotalH = 0,
      mTotalOt = 0,
      mTotalDef = 0;
    for (let day = 1; day <= nb; day++) {
      const dt = new Date(year, month, day);
      if (dt.getDay() === 0) continue;
      const iso = fmtISO(dt);
      const hName = holidayName(iso) || '';
      const dow = dt.getDay();
      const isSat = dow === 6;
      const mS = getSlotState(iso, pid, 'M'),
        amS = getSlotState(iso, pid, 'AM');
      const present = mS === 'present' || amS === 'present';
      const absent = mS === 'absent' && amS === 'absent';
      const otH = present ? getDayAllOtH(iso, pid) : 0;
      const defH = present ? getDayDeficitH(iso, pid) : 0;

      let rowCls = isSat ? 'sat' : '';
      if (hName) {
        // Jour férié : ligne unique sur 6 colonnes
        rows += `<tr class="${rowCls || 'hol'}">
          <td class="day-col">${DOW_FR[dow]}&nbsp;${day}</td>
          <td class="slot-col dash">—</td>
          <td><em>${escapeHTML(hName)}</em></td>
          <td class="num dash">—</td>
          <td class="num dash">—</td>
          <td class="num dash">—</td>
        </tr>`;
      } else if (absent) {
        const lbl = (getSlotLabel(iso, pid, 'M') || getSlotLabel(iso, pid, 'AM') || '').toLowerCase();
        const stateCell =
          lbl.includes('congé') || lbl.includes('conge')
            ? '<em>Congé</em>'
            : lbl.includes('maladie')
              ? '<em>Maladie</em>'
              : lbl.includes('accident')
                ? '<em>Accident du travail</em>'
                : '<em>Absence</em>';
        rows += `<tr class="${rowCls || 'abs'}">
          <td class="day-col">${DOW_FR[dow]}&nbsp;${day}</td>
          <td class="slot-col dash">—</td>
          <td>${stateCell}</td>
          <td class="num dash">—</td>
          <td class="num dash">—</td>
          <td class="num dash">—</td>
        </tr>`;
      } else if (present) {
        // Lot 9 : détail par demi-journée
        const activeSlots = ['M', 'AM'].filter((s) => getSlotState(iso, pid, s) === 'present');
        const nom = getDayNominal(iso, pid);
        const total = Math.round((nom + otH - defH) * 100) / 100;
        mTotalH += total;
        mTotalOt += otH;
        mTotalDef += defH;
        activeSlots.forEach((slot, si) => {
          const sType = getSlotShiftType(iso, pid, slot);
          const sH = getSlotNominalH(iso, pid, slot);
          const isFirst = si === 0;
          const rowspan = activeSlots.length > 1 && isFirst ? ` rowspan="${activeSlots.length}"` : '';
          const dayCell = isFirst ? `<td class="day-col"${rowspan}>${DOW_FR[dow]}&nbsp;${day}</td>` : '';
          const otCell = isFirst
            ? `<td class="num"${rowspan}>${otH > 0 ? `<span class="ot-val">+${formatHHMM(otH)}</span>` : '<span class="dash">—</span>'}</td>`
            : '';
          const dfCell = isFirst
            ? `<td class="num"${rowspan}>${defH > 0 ? `<span class="def-val">−${formatHHMM(defH)}</span>` : '<span class="dash">—</span>'}</td>`
            : '';
          rows += `<tr class="${rowCls}">
            ${dayCell}
            <td class="slot-col">${SLOT_PRINT_LBL[slot]}</td>
            <td>Poste ${SHIFT_LABEL[sType] || sType}</td>
            <td class="num">${formatHHMM(sH)}</td>
            ${otCell}
            ${dfCell}
          </tr>`;
        });
      } else {
        rows += `<tr class="${rowCls}">
          <td class="day-col">${DOW_FR[dow]}&nbsp;${day}</td>
          <td class="slot-col dash">—</td>
          <td><span class="dash">—</span></td>
          <td class="num dash">—</td>
          <td class="num dash">—</td>
          <td class="num dash">—</td>
        </tr>`;
      }
    }
    const fTH = Math.round(mTotalH * 100) / 100;
    const fTOt = Math.round(mTotalOt * 100) / 100;
    const fTDef = Math.round(mTotalDef * 100) / 100;
    const logoHtml = logoSrc ? `<img class="hdr-logo" src="${logoSrc}" alt="Amivet">` : '';
    allSheets += `<div class="sheet">
      <div class="hdr">
        <div class="hdr-left">
          ${logoHtml}
          <div class="hdr-clinic"><strong>Clinique Amivet</strong>Planning mensuel · ASV</div>
        </div>
        <div class="hdr-right">
          <div class="hdr-asv">${escapeHTML(p?.name || p?.short || pid)}</div>
          <div class="hdr-period">${monthLabel}</div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th style="width:40px;">Jour</th>
          <th style="width:32px;">Cr&eacute;neau</th>
          <th>Statut / Poste</th>
          <th style="text-align:center;width:58px;">Heures totales*</th>
          <th style="text-align:center;width:52px;">H.supp.</th>
          <th style="text-align:center;width:52px;">H.d&eacute;f.</th>
        </tr></thead>
        <tbody>
          ${rows}
          <tr class="tot">
            <td colspan="3">Total mensuel</td>
            <td class="num">${formatHHMM(fTH)}</td>
            <td class="num">${fTOt > 0 ? '+' + formatHHMM(fTOt) : '—'}</td>
            <td class="num">${fTDef > 0 ? '−' + formatHHMM(fTDef) : '—'}</td>
          </tr>
        </tbody>
      </table>
      <p class="footnote">* dont heures suppl&eacute;mentaires et heures d&eacute;ficitaires</p>
      <div class="sig">
        <div class="sig-ttl">Lu et approuv&eacute;</div>
        <div class="sig-cols">
          <div class="sig-col">
            <div class="sig-lbl">Signature de l&rsquo;ASV</div>
            <div class="sig-line"></div>
          </div>
          <div class="sig-col">
            <div class="sig-lbl">Signature du v&eacute;t&eacute;rinaire</div>
            <div class="sig-line"></div>
          </div>
        </div>
      </div>
    </div>`;
  });

  // Supprimer un éventuel printDiv orphelin (double-clic, afterprint non déclenché)
  document.getElementById('wk-print-tmp')?.remove();
  const printDiv = document.createElement('div');
  printDiv.id = 'wk-print-tmp';
  // eslint-disable-next-line no-unsanitized/property
  printDiv.innerHTML = printStyle + allSheets;
  document.body.appendChild(printDiv);
  document.body.classList.add('is-printing');
  // Laisser un cycle de rendu avant d'ouvrir la boîte de dialogue d'impression,
  // sinon Safari/Chrome peuvent capturer l'ancienne vue dans l'aperçu.
  requestAnimationFrame(() => {
    window.print();
    const cleanup = () => {
      document.body.classList.remove('is-printing');
      if (printDiv.parentNode) printDiv.parentNode.removeChild(printDiv);
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 12000);
  });
}

function openMonthPrintPopup(viewKey) {
  const cfg = store.CAL_VIEWS[viewKey];
  const year = cfg.year,
    month = cfg.navState.month;
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const people = ASV_PEOPLE.filter((p) => !p.archived);
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <div class="popover-title">🖨️ Imprimer — ${escapeHTML(monthLabel)}</div>
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:10px;font-weight:600;">Sélectionner les fiches à imprimer :</div>
      <label style="display:flex;align-items:center;gap:8px;padding:7px 0;font-size:13px;cursor:pointer;border-bottom:1px solid var(--color-border);margin-bottom:6px;">
        <input type="checkbox" id="print-all-asv" style="width:15px;height:15px;cursor:pointer;">
        <strong>Toutes les ASV</strong>
      </label>
      ${people
        .map(
          (p) => `
        <label style="display:flex;align-items:center;gap:8px;padding:5px 0 5px 8px;font-size:13px;cursor:pointer;">
          <input type="checkbox" class="print-asv-cb" data-pid="${p.id}" style="width:14px;height:14px;cursor:pointer;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};flex-shrink:0;"></span>
          ${escapeHTML(p.short)}
        </label>`
        )
        .join('')}
    </div>
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="print-launch-btn">🖨️ Imprimer</button>
    </div>`;
  backdrop.classList.add('open');
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
  const allCb = box.querySelector('#print-all-asv');
  const indivCbs = [...box.querySelectorAll('.print-asv-cb')];
  allCb.onchange = () => {
    indivCbs.forEach((cb) => (cb.checked = allCb.checked));
  };
  indivCbs.forEach((cb) => {
    cb.onchange = () => {
      allCb.checked = indivCbs.every((c) => c.checked);
      allCb.indeterminate = !allCb.checked && indivCbs.some((c) => c.checked);
    };
  });
  box.querySelector('#print-launch-btn').onclick = () => {
    const selected = indivCbs.filter((cb) => cb.checked).map((cb) => cb.dataset.pid);
    if (!selected.length) {
      showToast('Sélectionnez au moins une ASV', '⚠️');
      return;
    }
    close();
    openMonthPrintWindow(selected, year, month);
  };
}

function renderWeekViewASV() {
  const container = document.getElementById('asv-sub-week');
  if (!container) return;
  if (!store.weekNavState.mondayISO) store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(today));
  const monday = new Date(store.weekNavState.mondayISO + 'T00:00:00');
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const pid = weekPersonId();
  const p = personOf(pid);
  const isVetUser = _effectiveRole() !== 'asv';
  const baseCanEdit = isVetUser || _canEditSlot(pid);
  function canEditDay(d) {
    return baseCanEdit && !isMonthSigned(pid, d.getFullYear(), d.getMonth());
  }
  const canEditWeek = days.some((d) => canEditDay(d));
  const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  function _isDayOff(d) {
    const iso2 = fmtISO(d);
    return getSlotState(iso2, pid, 'M') === 'absent' && getSlotState(iso2, pid, 'AM') === 'absent';
  }
  function isDayPresent(d) {
    const iso2 = fmtISO(d);
    return getSlotState(iso2, pid, 'M') === 'present' || getSlotState(iso2, pid, 'AM') === 'present';
  }

  // ── En-tête colonnes ──────────────────────────────────────
  const headerRow = `<tr><th class="week-time-label" style="width:52px;font-size:9px;text-align:center;"></th>${days
    .map((d, i) => {
      const iso = fmtISO(d),
        hN = holidayName(iso);
      const cls = `week-th${iso === fmtISO(today) ? ' is-today' : hN ? ' is-holiday' : ''}`;
      const dd = String(d.getDate()).padStart(2, '0'),
        mm = String(d.getMonth() + 1).padStart(2, '0');
      return `<th class="${cls}" data-week-col-iso="${iso}">${DAY_SHORT[i]}<br><strong>${dd}/${mm}</strong>${hN ? `<br><span style="font-size:9px;">${escapeHTML(hN)}</span>` : ''}`;
    })
    .join('</th>')}</tr>`;

  // ── Helper : grisage jours non travaillés ─────────────────
  function isNonWorkingDay(d) {
    return isSunday(d) || (isASVPerson(pid) && !isPersonWorkingDay(pid, d));
  }
  function cellGrey(d) {
    return !isNonWorkingDay(d) && !holidayName(fmtISO(d)) && !isDayPresent(d) ? 'background:#F1F5F9;' : '';
  }

  // ── 1. Ligne Poste (O/F toggle) ───────────────────────────
  const shiftRow = `<tr><td class="week-footer-label" style="font-size:10px;color:var(--color-text-muted);">Poste</td>${days
    .map((d) => {
      if (isNonWorkingDay(d)) return `<td class="week-footer-cell" style="background:#f8fafc;"></td>`;
      const iso = fmtISO(d);
      const cg = cellGrey(d);
      if (d.getDay() === 6 || !isDayPresent(d))
        return `<td class="week-footer-cell" style="${cg}"><span style="color:var(--color-text-muted);font-size:9px;">—</span></td>`;
      const ce = canEditDay(d);
      const shType = getShiftType(iso, pid);
      const isF = shType === 'F';
      if (!ce)
        return `<td class="week-footer-cell"><span style="font-size:10px;color:var(--color-text-muted);">${shType}</span></td>`;
      return `<td class="week-footer-cell" style="padding:2px;"><button class="week-shift-btn" data-shift-iso="${iso}" data-shift-pid="${pid}" title="${isF ? 'Fermeture (9h→19h15)' : 'Ouverture (8h30→19h)'}" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;border:1px solid ${isF ? '#6366F1' : '#16A34A'};background:${isF ? '#EEF2FF' : '#F0FDF4'};color:${isF ? '#4F46E5' : '#15803D'};cursor:pointer;">${shType}</button></td>`;
    })
    .join('')}</tr>`;

  // Helper format minutes → "+Xh YY" ou "−Xh YY"
  function fmtCounter(mins, sign) {
    if (!mins) return sign === '+' ? '—' : '—';
    const h = Math.floor(mins / 60),
      m = mins % 60;
    return `${sign}${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
  }

  // Génère les <option> pour un sélecteur à pas de 15 min (0 → 8h)
  function buildTimeOpts(currentMins) {
    let o = `<option value="0"${currentMins === 0 ? ' selected' : ''}>—</option>`;
    for (let m = 15; m <= 480; m += 15) {
      const h = Math.floor(m / 60), mn = m % 60;
      const lbl = h > 0 ? `${h}h${mn > 0 ? String(mn).padStart(2, '0') : ''}` : `${mn}min`;
      o += `<option value="${m}"${currentMins === m ? ' selected' : ''}>${lbl}</option>`;
    }
    return o;
  }

  // ── 2. Ligne H.supp. (sélecteur 15 min) ──────────────────────
  function buildPlusCell(d) {
    const iso = fmtISO(d);
    if (isNonWorkingDay(d)) return `<td class="week-footer-cell" style="background:#f8fafc;"></td>`;
    if (!isDayPresent(d)) return `<td class="week-footer-cell" style="${cellGrey(d)}"></td>`;
    const mins = getPlusMins(iso, pid);
    const ce = canEditDay(d);
    const lbl = fmtCounter(mins, '+');
    if (!ce)
      return `<td class="week-footer-cell"><span style="font-size:11px;color:#16A34A;font-weight:700;">${lbl}</span></td>`;
    return `<td class="week-footer-cell" style="padding:3px 4px;">
      <select class="week-counter-sel" data-ciso="${iso}" data-cpid="${pid}" data-ctype="plus"
        style="font-size:11px;font-weight:700;color:#16A34A;border:1px solid var(--color-border);border-radius:5px;background:var(--color-surface);padding:2px;width:100%;cursor:pointer;">
        ${buildTimeOpts(mins)}
      </select>
    </td>`;
  }
  const plusRow = `<tr><td class="week-footer-label" style="font-size:9px;color:#16A34A;font-weight:700;">H.supp.</td>${days.map(buildPlusCell).join('')}</tr>`;

  // ── 3. Ligne H.manq. (sélecteur 15 min) ──────────────────────
  function buildMinusCell(d) {
    const iso = fmtISO(d);
    if (isNonWorkingDay(d)) return `<td class="week-footer-cell" style="background:#f8fafc;"></td>`;
    if (!isDayPresent(d)) return `<td class="week-footer-cell" style="${cellGrey(d)}"></td>`;
    const mins = getMinusMins(iso, pid);
    const ce = canEditDay(d);
    const lbl = fmtCounter(mins, '−');
    if (!ce)
      return `<td class="week-footer-cell"><span style="font-size:11px;color:#DC2626;font-weight:700;">${lbl}</span></td>`;
    return `<td class="week-footer-cell" style="padding:3px 4px;">
      <select class="week-counter-sel" data-ciso="${iso}" data-cpid="${pid}" data-ctype="minus"
        style="font-size:11px;font-weight:700;color:#DC2626;border:1px solid var(--color-border);border-radius:5px;background:var(--color-surface);padding:2px;width:100%;cursor:pointer;">
        ${buildTimeOpts(mins)}
      </select>
    </td>`;
  }
  const minusRow = `<tr><td class="week-footer-label" style="font-size:9px;color:#DC2626;font-weight:700;">H.manq.</td>${days.map(buildMinusCell).join('')}</tr>`;

  // ── 5. Ligne heures totales ───────────────────────────────
  const totRow = `<tr><td class="week-footer-label">Heures</td>${days
    .map((d) => {
      const iso = fmtISO(d);
      if (isNonWorkingDay(d)) return `<td class="week-footer-cell" style="background:#f8fafc;"></td>`;
      if (!isDayPresent(d))
        return `<td class="week-footer-cell" style="${cellGrey(d)}"><span style="color:var(--color-text-muted);">—</span></td>`;
      const nom = getDayNominal(iso, pid);
      const otH2 = getDayAllOtH(iso, pid);
      const defH = getDayDeficitH(iso, pid);
      const total = Math.round((nom + otH2 - defH) * 100) / 100;
      const delta = Math.round((otH2 - defH) * 100) / 100;
      const deltaHtml =
        delta !== 0
          ? ` <span style="font-size:9px;color:${delta > 0 ? '#16A34A' : '#DC2626'};">${delta > 0 ? '+' : ''}${formatHHMM(Math.abs(delta))}</span>`
          : '';
      return `<td class="week-footer-cell"><span class="week-total-h">${formatHHMM(total)}</span>${deltaHtml}</td>`;
    })
    .join('')}</tr>`;

  // ── Rendu ─────────────────────────────────────────────────
  const asvPicker = isVetUser
    ? `<select class="week-asv-pick" id="week-asv-pick">${ASV_PEOPLE.map((a) => `<option value="${a.id}" ${a.id === pid ? 'selected' : ''}>${escapeHTML(a.short)}</option>`).join('')}</select>`
    : `<span style="font-weight:700;color:${p?.color || 'inherit'}">${escapeHTML(p?.short || '')}</span>`;
  const endDay = days[5];
  const wLabel = `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()].toLowerCase()} – ${endDay.getDate()} ${MONTH_NAMES[endDay.getMonth()].toLowerCase()} ${endDay.getFullYear()}`;
  const weekTotalH = days.reduce((s, d) => {
    if (isNonWorkingDay(d) || !isDayPresent(d)) return s;
    const iso = fmtISO(d);
    return s + getDayNominal(iso, pid) + getDayAllOtH(iso, pid) - getDayDeficitH(iso, pid);
  }, 0);
  const weekTotalFmt = weekTotalH > 0 ? formatHHMM(weekTotalH) : '—';
  const weekTotalStr =
    weekTotalH > 0
      ? ` <span style="font-size:14px;font-weight:400;color:var(--color-primary);">(${weekTotalFmt})</span>`
      : '';

  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    <h2 class="section-title">⏱️ Vue hebdomadaire — ${escapeHTML(p?.short || '')}${weekTotalStr}</h2>
    <div class="week-nav">
      <button class="btn-icon" id="week-prev">←</button>
      <span class="week-nav-label">${wLabel}</span>
      <button class="btn-icon" id="week-next">→</button>
      <button class="btn btn-sm" id="week-today-btn">Aujourd'hui</button>
      ${canEditWeek ? `<button class="btn btn-sm btn-danger" id="week-clear-btn">🗑️ Vider</button>` : ''}
      ${asvPicker}
    </div>
    <div class="week-view-wrap card" style="padding:0;">
      <table class="week-table"><thead>${headerRow}</thead><tbody>${shiftRow}${plusRow}${minusRow}${totRow}</tbody></table>
    </div>
    <div class="week-total-banner">
      <span>Total semaine</span>
      <strong style="font-size:22px;color:var(--color-primary);">${weekTotalFmt}</strong>
      <span style="font-size:11px;color:var(--color-text-muted);">${wLabel}</span>
    </div>
    </div>`;

  container.querySelector('#week-prev').onclick = () => {
    const d = new Date(store.weekNavState.mondayISO + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    store.weekNavState.mondayISO = fmtISO(d);
    renderWeekViewASV();
  };
  container.querySelector('#week-next').onclick = () => {
    const d = new Date(store.weekNavState.mondayISO + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    store.weekNavState.mondayISO = fmtISO(d);
    renderWeekViewASV();
  };
  container.querySelector('#week-today-btn').onclick = () => {
    store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(today));
    renderWeekViewASV();
  };
  if (canEditWeek) {
    container.querySelector('#week-clear-btn').onclick = () => {
      const label = `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()].toLowerCase()} – ${days[5].getDate()} ${MONTH_NAMES[days[5].getMonth()].toLowerCase()}`;
      openConfirmModal({
        title: `Vider la semaine du ${label} ?`,
        message: `Tous les compteurs de ${p?.short || ''} (H.supp., H.manq.) seront remis à zéro.`,
        confirmLabel: 'Vider',
        onConfirm: () => {
          _snapshotBeforeChange();
          days.forEach((d) => {
            if (isSunday(d) || !canEditDay(d)) return;
            const iso = fmtISO(d);
            setPlusMins(iso, pid, 0);
            setMinusMins(iso, pid, 0);
          });
          _saveData();
          showToast(`Semaine vidée (${p?.short || ''})`, '🗑️');
          renderWeekViewASV();
        },
      });
    };
  }
  if (isVetUser)
    container.querySelector('#week-asv-pick').onchange = (e) => {
      store.weekNavState.personId = e.target.value;
      renderWeekViewASV();
    };
  container.querySelectorAll('.week-shift-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const iso2 = btn.dataset.shiftIso,
        pid2 = btn.dataset.shiftPid;
      store.DATA.slots[shiftTypeKey(iso2, pid2)] = getShiftType(iso2, pid2) === 'O' ? 'F' : 'O';
      _saveData(false);
      renderWeekViewASV();
    });
  });

  container.querySelectorAll('.week-counter-sel').forEach((sel) => {
    sel.addEventListener('change', () => {
      const { ciso, cpid, ctype } = sel.dataset;
      if (_effectiveRole() === 'asv') {
        const [yr, mo] = ciso.split('-').map(Number);
        if (isMonthClosed(yr, mo - 1)) {
          showToast('Ce mois est clôturé — modifications ASV bloquées', '🔒');
          sel.value = String(ctype === 'plus' ? getPlusMins(ciso, cpid) : getMinusMins(ciso, cpid));
          return;
        }
      }
      const val = parseInt(sel.value, 10);
      _snapshotBeforeChange();
      if (ctype === 'plus') setPlusMins(ciso, cpid, val);
      else setMinusMins(ciso, cpid, val);
      _saveData(false);
      renderWeekViewASV();
    });
  });
}

function computeWeekTotalHours(pid, mondayDate) {
  let h = 0;
  for (let d = 0; d < 6; d++) {
    const dt = new Date(mondayDate);
    dt.setDate(dt.getDate() + d);
    if (isSunday(dt)) continue;
    const iso = fmtISO(dt);
    const isPresent = getSlotState(iso, pid, 'M') === 'present' || getSlotState(iso, pid, 'AM') === 'present';
    if (!isPresent) continue;
    h += getDayNominal(iso, pid) + getDayAllOtH(iso, pid) - getDayDeficitH(iso, pid) + getOvertimeHours(iso, pid);
  }
  return Math.round(h * 100) / 100;
}

function blockIfOver42h(pid, isoDate) {
  if (personOf(pid)?.saturdayOnly) return false;
  const mon = getWeekMondayDate(new Date(isoDate + 'T00:00:00'));
  const weekH = computeWeekTotalHours(pid, mon);
  if (weekH > WEEKLY_MAX_HOURS) {
    if (store.UNDO_STACK.length > 0) {
      store.DATA.slots = JSON.parse(store.UNDO_STACK.pop());
      _updateUndoButtons();
    }
    _saveData(false);
    showToast(`Plafond 42h dépassé (${formatHHMM(weekH)}) — saisie annulée`, '🚫');
    return true;
  }
  return false;
}

function getWeekAlerts(personId, sundayISO) {
  if (!isASVPerson(personId)) return [];
  const p = personOf(personId);
  if (!p) return [];
  const sun = new Date(sundayISO + 'T00:00:00');
  const mon = getWeekMondayDate(sun);
  const alerts = [];

  // Alerte dépassement 42h
  const weekH = computeWeekTotalHours(personId, mon);
  if (!p.saturdayOnly && weekH >= WEEKLY_MAX_HOURS)
    alerts.push(`Durée de la semaine : ${formatHHMM(weekH)} — dépasse le maximum de 42h`);

  // Alerte couverture O/F : même poste en double OU ouverture/fermeture non couverte (lundi–vendredi)
  const poolNC = ASV_PEOPLE.filter((q) => !q.archived && !q.saturdayOnly);
  const DAY_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  for (let d = 0; d < 5; d++) {
    const dt = new Date(mon);
    dt.setDate(dt.getDate() + d);
    const iso2 = fmtISO(dt);
    if (holidayName(iso2)) continue;
    const present = poolNC.filter(
      (q) => getSlotState(iso2, q.id, 'M') === 'present' || getSlotState(iso2, q.id, 'AM') === 'present'
    );
    if (!present.length) continue;
    const iAmPresent = present.some((q) => q.id === personId);
    if (!iAmPresent) continue;
    // Ouverture = au moins une ASV présente le matin (M) en poste O
    const hasOMatin = present.some(
      (q) => getSlotState(iso2, q.id, 'M') === 'present' && getSlotShiftType(iso2, q.id, 'M') === 'O'
    );
    // Fermeture = au moins une ASV présente l'après-midi (AM) en poste F
    const hasFApresMidi = present.some(
      (q) => getSlotState(iso2, q.id, 'AM') === 'present' && getSlotShiftType(iso2, q.id, 'AM') === 'F'
    );
    if (!hasOMatin) alerts.push(`${DAY_FULL[d]} : pas d'ASV en Ouverture le matin`);
    if (!hasFApresMidi) alerts.push(`${DAY_FULL[d]} : pas d'ASV en Fermeture l'après-midi`);
  }
  return alerts;
}

export {
  setupWeekView,
  weekPersonId,
  renderWeekViewASV,
  computeWeekTotalHours,
  blockIfOver42h,
  getWeekAlerts,
  openMonthPrintWindow,
  openMonthPrintPopup,
};
