import {
  PEOPLE,
  ASV_PEOPLE,
  SLOTS,
  SLOT_LABELS,
  MONTH_NAMES,
  WEEKLY_MAX_HOURS,
  SUPABASE_FUNCTIONS_URL,
  personOf,
} from './config.js';
import {
  escapeHTML,
  hexToRgba,
  fmtISO,
  daysInMonth,
  isoWeekday,
  isSunday,
  holidayName,
  formatHHMM,
  signedHHMM,
  roundTo15min,
  formatFR,
  getWeekMondayDate,
} from './utils.js';
import { store } from './store.js';
import { showToast } from './ui.js';
import { supabaseHeaders } from './auth.js';
import { triggerPushNotification } from './pwa.js';
import { isMonthSigned, getSignatureDetail, openSigningLinkModal } from './signatures.js';
import {
  isASVPerson,
  isWithinNextTwoWeeks,
  isPersonWorkingDay,
  getSlotState,
  setSlotState,
  getSlotLabel,
  setSlotLabel,
  getDayComment,
  setDayComment,
  cycleState,
  getLeaveDecision,
  setLeaveDecision,
  getLeaveDecisionComment,
  getChangeDecision,
  setChangeDecision,
  getOvertimeHours,
  setOvertimeHours,
  shiftTypeKey,
  getShiftType,
  getDayAllOtH,
  getDayDeficitH,
  setEarlyDep,
  setWeekOtMins,
  setLunchOtMins,
  setDayNote,
  isClinicClosed,
  setClinicClosed,
} from './slots.js';
import { computeLeaveBlocks } from './leave-blocks.js';
import {
  getWeekAlerts,
  computeWeekTotalHours,
  renderWeekViewASV,
  openEarlyDepPicker,
  openMonthPrintPopup,
} from './week-view.js';

// État "aujourd'hui" local au module (équivalent au const today d'app.js — même jour au chargement).
const today = new Date();

// ── Callbacks injectés (fonctions/état restés dans app.js) ──────
let _snapshotBeforeChange, _saveData, _switchSubPage, _canEditSlot, _undoLastAction, _getCurrentView;

function setupCalendar({ snapshotBeforeChange, saveData, switchSubPage, canEditSlot, undoLastAction, getCurrentView }) {
  _snapshotBeforeChange = snapshotBeforeChange;
  _saveData = saveData;
  _switchSubPage = switchSubPage;
  _canEditSlot = canEditSlot;
  _undoLastAction = undoLastAction;
  _getCurrentView = getCurrentView;
}

function changeMonth(viewKey, delta) {
  const cfg = store.CAL_VIEWS[viewKey];
  const m = cfg.navState.month + delta;
  cfg.navState.month = ((m % 12) + 12) % 12;
  renderCalendarView(viewKey);
}

function goToToday(viewKey) {
  const cfg = store.CAL_VIEWS[viewKey];
  cfg.navState.month = today.getFullYear() === cfg.year ? today.getMonth() : 0;
  renderCalendarView(viewKey);
}

function cellRenderInfo(iso, personId, slot) {
  const person = personOf(personId);
  const state = getSlotState(iso, personId, slot);
  const label = state === 'absent' ? getSlotLabel(iso, personId, slot) : '';
  const decision =
    state === 'absent' && isASVPerson(personId) ? getLeaveDecision(iso, personId, slot) || 'pending' : null;
  const changeDecision = isASVPerson(personId) ? getChangeDecision(iso, personId, slot) : null;
  let style = '';
  let html = '';
  let title = label;
  let stateClass = state;
  if (state === 'present') {
    if (isASVPerson(personId)) {
      const shType = getShiftType(iso, personId);
      if (shType === 'F') {
        stateClass = 'closing';
        html = `<span style="font-size:7.5px;font-weight:800;">F</span>`;
        title = 'Fermeture (9h→19h15)';
      } else {
        stateClass = 'opening';
        html = `<span style="font-size:7.5px;font-weight:800;">O</span>`;
        title = 'Ouverture (8h30→19h)';
      }
    } else {
      style = `background:${person.present.bg};border-color:${person.present.border};color:${person.present.text};`;
      html = `<span class="cell-mark">✓</span>`;
    }
  } else if (state === 'absent') {
    const lc = label.toLowerCase().trim();
    if (lc === 'maladie' || lc === 'arrêt maladie' || lc === 'arrêt') {
      stateClass = 'sick';
      html = `<span class="cell-mark">🤒</span>${label ? ' ' + escapeHTML(label) : ''}`;
      title = `Arrêt maladie${label ? ' — ' + label : ''}`;
    } else if (lc === 'repos' || lc === 'repos planifié' || lc === 'non travaillé') {
      stateClass = 'off';
      html = label ? escapeHTML(label) : '<span class="cell-mark">—</span>';
      title = 'Repos planifié (hors congé)';
    } else if (decision === 'pending') {
      stateClass = 'leave-pending';
      html = `${label ? escapeHTML(label) + ' ' : ''}<span class="cell-mark">⏳</span>`;
      title = `${label ? label + ' — ' : ''}En attente de validation`;
    } else if (decision === 'rejected') {
      stateClass = 'leave-rejected';
      html = `<span class="cell-mark">⚠️</span> Voir vétérinaire`;
      const comment = getLeaveDecisionComment(iso, personId, slot);
      title = `Congé refusé — merci de vous rapprocher d'un vétérinaire${comment ? ' — ' + comment : ''}`;
    } else {
      if (decision === 'approved') stateClass = 'leave-approved';
      html = label ? escapeHTML(label) : `<span class="cell-mark">✈</span>`;
      if (decision === 'approved') {
        html = `<span class="cell-mark">✓</span> ${html}`;
        title = `${label ? label + ' — ' : ''}Congé approuvé`;
      }
    }
  } else if (state === 'medical') {
    stateClass = 'medical';
    html = `<span class="cell-mark">🏥</span>`;
    title = "Visite médicale d'entreprise";
  } else {
    style = `border-left:3px solid ${hexToRgba(person.color, 0.4)};`;
  }
  // Surcharge violet : modification urgente en attente de validation vétérinaire
  if (changeDecision === 'pending') {
    stateClass = 'change-pending';
    html =
      html ||
      (state === 'present'
        ? `<span style="font-size:7.5px;font-weight:800;">${getShiftType(iso, personId) === 'F' ? 'F' : 'O'}</span>`
        : '<span class="cell-mark">●</span>');
    title = (title ? title + ' — ' : '') + "Modification en attente d'approbation";
  } else if (changeDecision === 'rejected') {
    stateClass = 'change-rejected';
    html = (html || '') + '<span class="cell-mark" style="font-size:8px;">⚠️</span>';
    title = (title ? title + ' — ' : '') + 'Modification refusée — contacter un vétérinaire';
  }
  return { state, label, decision, changeDecision, style, html, title, stateClass };
}

function cellAriaLabel(iso, personId, slot) {
  const person = personOf(personId);
  const { state, label, decision, stateClass } = cellRenderInfo(iso, personId, slot);
  let stateTxt;
  if (state === 'present') stateTxt = 'présent';
  else if (state === 'absent') {
    if (stateClass === 'sick') stateTxt = `arrêt maladie${label ? ' — ' + label : ''}`;
    else if (stateClass === 'off') stateTxt = 'repos planifié';
    else if (decision === 'pending') stateTxt = `demande de congé en attente${label ? ' — ' + label : ''}`;
    else if (decision === 'rejected') stateTxt = 'demande de congé refusée — voir un vétérinaire';
    else if (decision === 'approved') stateTxt = `congé approuvé${label ? ' — ' + label : ''}`;
    else stateTxt = `absent${label ? ' — ' + label : ''}`;
  } else if (state === 'medical') stateTxt = "visite médicale d'entreprise";
  else stateTxt = 'non renseigné';
  return `${person.short}, ${SLOT_LABELS[slot]}, ${stateTxt}. Cliquer pour changer.`;
}

function updateCellDOM(cellEl) {
  const { date: iso, person: personId, slot } = cellEl.dataset;
  const info = cellRenderInfo(iso, personId, slot);
  cellEl.className = `cal-cell state-${info.stateClass}`;
  cellEl.style.cssText = info.style;
  // eslint-disable-next-line no-unsanitized/property
  cellEl.innerHTML = info.html;
  cellEl.setAttribute('aria-label', cellAriaLabel(iso, personId, slot));
  cellEl.title = info.title || '';
}

function updateHalfDOM(halfEl) {
  const { date: iso, person: personId, slot } = halfEl.dataset;
  const info = cellRenderInfo(iso, personId, slot);
  const [y, m] = iso.split('-').map(Number);
  const locked = isMonthSigned(personId, y, m - 1);
  const noEdit = !_canEditSlot(personId);
  const lockCls = locked ? ' cal-wg-half-locked' : noEdit ? ' cal-wg-half-readonly' : '';
  const stateCls = info.stateClass ? ` cal-wg-half-${info.stateClass}` : '';
  halfEl.className = `cal-wg-half${stateCls}${lockCls}`;
  halfEl.style.cssText = info.style || '';
  // eslint-disable-next-line no-unsanitized/property
  halfEl.innerHTML = info.html || (slot === 'M' ? 'M' : 'A');
  halfEl.title = info.title || '';
  halfEl.setAttribute('aria-label', cellAriaLabel(iso, personId, slot));
}

function buildCalendarToolbar(viewKey) {
  const cfg = store.CAL_VIEWS[viewKey];
  const monthLabel = `${MONTH_NAMES[cfg.navState.month]} ${cfg.year}`;
  const todayBtn = cfg.todayNav
    ? `<button class="btn btn-sm" id="cal-today-${viewKey}" aria-label="Revenir au mois actuel">📍 Aujourd'hui</button>`
    : '';
  const hasASV = cfg.people && cfg.people.some((p) => isASVPerson(p.id));
  const paintBar = hasASV
    ? `
    <div class="cal-paint-bar" id="cal-paint-bar-${viewKey}">
      <span style="font-size:11px;font-weight:600;color:var(--color-text-muted);">Outil :</span>
      <button class="paint-tool${store.calMonthPaintMode === 'opening' ? ' active' : ''}" data-paint="opening" title="Ouverture — 8h30→19h00">🟢 Ouverture</button>
      <button class="paint-tool${store.calMonthPaintMode === 'closing' ? ' active' : ''}" data-paint="closing" title="Fermeture — 9h00→19h15">🌿 Fermeture</button>
      <button class="paint-tool${store.calMonthPaintMode === 'repos' ? ' active' : ''}" data-paint="repos" title="Repos planifié (sans validation)">🟠 Repos</button>
      <button class="paint-tool${store.calMonthPaintMode === 'conge' ? ' active' : ''}" data-paint="conge" title="Demande de congé (validation vétérinaires)">🔵 Congé</button>
      <button class="paint-tool${store.calMonthPaintMode === 'maladie' ? ' active' : ''}" data-paint="maladie" title="Arrêt maladie (direct, hors règle 15j)">🤒 Maladie</button>
      <button class="paint-tool paint-tool-erase${store.calMonthPaintMode === 'erase' ? ' active' : ''}" data-paint="erase" title="Gomme — efface la case">🧹 Gomme</button>
    </div>`
    : '';
  return `
    <div class="cal-toolbar">
      <div class="cal-month-nav">
        <button class="btn-icon" id="cal-prev-${viewKey}" aria-label="Mois précédent">←</button>
        <div class="cal-month-label">${monthLabel}</div>
        <button class="btn-icon" id="cal-next-${viewKey}" aria-label="Mois suivant">→</button>
        ${todayBtn}
      </div>
      <div class="cal-toolbar-actions">
        <button class="btn-icon undo-btn" id="cal-undo-${viewKey}" aria-label="Annuler la dernière action" title="Annuler la dernière action (Cmd/Ctrl+Z)" ${store.UNDO_STACK.length === 0 ? 'disabled' : ''}>↩️</button>
        <button class="btn btn-sm btn-danger" id="cal-clear-month-${viewKey}" aria-label="Vider le mois affiché">🗑️ Vider le mois</button>
        ${cfg.printable ? `<button class="btn btn-sm" id="cal-print-${viewKey}" title="Imprimer les fiches mensuelles ASV">🖨️ Imprimer</button>` : ''}
      </div>
    </div>
    ${paintBar}
  `;
}

function clearMonth(viewKey, month, personId) {
  const cfg = store.CAL_VIEWS[viewKey];
  _snapshotBeforeChange();
  const nbDays = daysInMonth(cfg.year, month);
  const targets = personId ? cfg.people.filter((p) => p.id === personId) : cfg.people;
  const asvTargets = targets.filter((p) => isASVPerson(p.id));
  for (let day = 1; day <= nbDays; day++) {
    const iso = fmtISO(new Date(cfg.year, month, day));
    targets.forEach((p) => {
      SLOTS.forEach((slot) => setSlotState(iso, p.id, slot, 'empty'));
      setOvertimeHours(iso, p.id, 0);
    });
    // ASV : efface aussi les ajustements semaine et notes
    asvTargets.forEach((p) => {
      setEarlyDep(iso, p.id, '');
      setWeekOtMins(iso, p.id, 0);
      setDayNote(iso, p.id, '');
    });
    if (!personId) setDayComment(iso, '');
  }
  _saveData();
  renderCalendarView(viewKey);
  // Si la vue hebdomadaire est affichée, la rafraîchir aussi pour refléter la suppression des TE
  if (store.subNavState.asv === 'week') renderWeekViewASV();
  const who = personId ? personOf(personId).short : cfg.people.map((p) => p.short).join(' et ');
  showToast(`${MONTH_NAMES[month]} ${cfg.year} vidé (${who})`, '🗑️');
}

function openClearMonthModal(viewKey, month) {
  const cfg = store.CAL_VIEWS[viewKey];
  const label = `${MONTH_NAMES[month]} ${cfg.year}`;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  const allLabel = cfg.people.map((p) => p.short).join(' + ');
  const hasASV = cfg.people.some((p) => isASVPerson(p.id));
  const asvWarning = hasASV
    ? `<p style="font-size:12px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:8px 10px;color:#92400E;margin:0 0 14px;">⚠️ Les saisies hebdomadaires (heures matin / déjeuner / après-midi) des ASV pour ce mois seront également supprimées.</p>`
    : '';
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3>Vider ${label} ?</h3>
    <p>Choisissez ce qui doit être supprimé définitivement pour ${label}. Cette action est irréversible.</p>
    ${asvWarning}
    <div class="modal-actions" style="flex-direction:column;align-items:stretch;">
      <button class="btn btn-danger" id="clear-all" style="justify-content:center;">🗑️ Tout le mois (${allLabel})</button>
      ${cfg.people.map((p) => `<button class="btn btn-danger" data-clear-person="${p.id}" style="justify-content:center;color:${p.color};border-color:${hexToRgba(p.color, 0.4)};">${p.short} uniquement</button>`).join('')}
      <button class="btn" id="modal-cancel" style="justify-content:center;">Annuler</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  box.querySelector('#clear-all').onclick = () => {
    clearMonth(viewKey, month);
    close();
  };
  box.querySelectorAll('[data-clear-person]').forEach((btn) => {
    btn.onclick = () => {
      clearMonth(viewKey, month, btn.dataset.clearPerson);
      close();
    };
  });
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
}

function _splitMonthIntoHalves(year, month) {
  const nbDays = daysInMonth(year, month);
  const sundays = [];
  for (let day = 1; day < nbDays; day++) {
    if (isSunday(new Date(year, month, day))) sundays.push(day);
  }
  let cut = Math.ceil(nbDays / 2);
  if (sundays.length) {
    cut = sundays.reduce((best, d) => (Math.abs(d - nbDays / 2) < Math.abs(best - nbDays / 2) ? d : best), sundays[0]);
  }
  const half1 = [],
    half2 = [];
  for (let d = 1; d <= nbDays; d++) {
    (d <= cut ? half1 : half2).push(d);
  }
  return [half1, half2].filter((h) => h.length > 0);
}

function propagateLabelAcrossSunday(personId, slots, label) {
  if (!slots.length) return;
  const startDate = new Date(slots[0].iso + 'T00:00:00');
  const dayIsAbsent = (d) => SLOTS.some((s) => getSlotState(fmtISO(d), personId, s) === 'absent');
  // Remonter jour par jour (sauter dimanches) pour trouver le début du run
  let runStart = new Date(startDate);
  for (let d = new Date(startDate.getTime() - 86400000); ; d = new Date(d.getTime() - 86400000)) {
    if (isSunday(d)) continue;
    if (!dayIsAbsent(d)) break;
    runStart = new Date(d);
    if (d.getFullYear() < 2020) break;
  }
  // Avancer jour par jour (sauter dimanches) pour trouver la fin du run
  let runEnd = new Date(startDate);
  for (let d = new Date(startDate.getTime() + 86400000); ; d = new Date(d.getTime() + 86400000)) {
    if (isSunday(d)) continue;
    if (!dayIsAbsent(d)) break;
    runEnd = new Date(d);
    if (d.getFullYear() > 2030) break;
  }
  // Appliquer le label à tous les slots absents du run
  for (let d = new Date(runStart); d <= runEnd; d = new Date(d.getTime() + 86400000)) {
    if (isSunday(d)) continue;
    const iso = fmtISO(d);
    SLOTS.forEach((s) => {
      if (getSlotState(iso, personId, s) === 'absent') setSlotLabel(iso, personId, s, label);
    });
  }
}

// Vide les slots de toutes les personnes pour un jour fermé (présence, congé, label, décision)
function clearDayAllPeople(iso) {
  PEOPLE.forEach((p) => {
    SLOTS.forEach((s) => {
      if (getSlotState(iso, p.id, s) !== 'empty') {
        setSlotState(iso, p.id, s, 'empty');
        setSlotLabel(iso, p.id, s, '');
        setChangeDecision(iso, p.id, s, null);
      }
    });
    delete store.DATA.slots[shiftTypeKey(iso, p.id)];
  });
}

// Efface tous les slots absents du run contigu autour de iso (ignore dimanches)
function eraseFullRun(personId, iso) {
  const startDate = new Date(iso + 'T00:00:00');
  const dayHasAbsent = (d) => SLOTS.some((s) => getSlotState(fmtISO(d), personId, s) === 'absent');
  let runStart = new Date(startDate);
  for (let d = new Date(startDate.getTime() - 86400000); ; d = new Date(d.getTime() - 86400000)) {
    if (isSunday(d)) continue;
    if (!dayHasAbsent(d)) break;
    runStart = new Date(d);
    if (d.getFullYear() < 2020) break;
  }
  let runEnd = new Date(startDate);
  for (let d = new Date(startDate.getTime() + 86400000); ; d = new Date(d.getTime() + 86400000)) {
    if (isSunday(d)) continue;
    if (!dayHasAbsent(d)) break;
    runEnd = new Date(d);
    if (d.getFullYear() > 2030) break;
  }
  for (let d = new Date(runStart); d <= runEnd; d = new Date(d.getTime() + 86400000)) {
    if (isSunday(d)) continue;
    const isoD = fmtISO(d);
    SLOTS.forEach((s) => {
      if (getSlotState(isoD, personId, s) === 'absent') {
        setSlotState(isoD, personId, s, 'empty');
        setSlotLabel(isoD, personId, s, '');
        setChangeDecision(isoD, personId, s, null);
      }
    });
    delete store.DATA.slots[shiftTypeKey(isoD, personId)];
  }
}

// Collecte tous les { iso, slot } absents du run contigu autour de iso
function collectRunSlots(personId, iso) {
  const startDate = new Date(iso + 'T00:00:00');
  const dayHasAbsent = (d) => SLOTS.some((s) => getSlotState(fmtISO(d), personId, s) === 'absent');
  let runStart = new Date(startDate);
  for (let d = new Date(startDate.getTime() - 86400000); ; d = new Date(d.getTime() - 86400000)) {
    if (isSunday(d)) continue;
    if (!dayHasAbsent(d)) break;
    runStart = new Date(d);
    if (d.getFullYear() < 2020) break;
  }
  let runEnd = new Date(startDate);
  for (let d = new Date(startDate.getTime() + 86400000); ; d = new Date(d.getTime() + 86400000)) {
    if (isSunday(d)) continue;
    if (!dayHasAbsent(d)) break;
    runEnd = new Date(d);
    if (d.getFullYear() > 2030) break;
  }
  const result = [];
  for (let d = new Date(runStart); d <= runEnd; d = new Date(d.getTime() + 86400000)) {
    if (isSunday(d)) continue;
    const isoD = fmtISO(d);
    SLOTS.forEach((s) => {
      if (getSlotState(isoD, personId, s) === 'absent') result.push({ iso: isoD, slot: s });
    });
  }
  return result;
}

function buildOvertimeRowCells(year, month, days, people) {
  let html = '';
  // Groupe les jours en semaines Mon–Dim. La dernière semaine sans dimanche (fin de mois)
  // n'est pas affichée ici — elle sera montrée dans le mois suivant.
  const weeks = [];
  let currentWeek = [];
  days.forEach((day) => {
    currentWeek.push(day);
    if (isSunday(new Date(year, month, day))) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  // currentWeek non vide → semaine à cheval sur mois suivant, on n'affiche pas ici

  weeks.forEach((weekDays, weekIndex) => {
    const colspan = weekDays.length * 2;

    // Pour la première semaine à cheval sur le mois précédent : inclure les jours manquants
    let extraDates = [];
    if (weekIndex === 0) {
      const firstDate = new Date(year, month, weekDays[0]);
      const firstWD = isoWeekday(firstDate); // 0=Lun … 6=Dim
      for (let i = firstWD; i > 0; i--) {
        const d = new Date(firstDate.getTime() - i * 86400000);
        if (!isSunday(d)) extraDates.push(d);
      }
    }

    // Calcul par personne : écart net (OT − déficit + ajustement manuel) par jour présent.
    const isPresent = (iso, p) =>
      getSlotState(iso, p.id, 'M') === 'present' || getSlotState(iso, p.id, 'AM') === 'present';
    const personOTs = people.map((p) => {
      let ot = 0;
      extraDates.forEach((d) => {
        const iso = fmtISO(d);
        if (!isSunday(d) && isPresent(iso, p))
          ot += getDayAllOtH(iso, p.id) - getDayDeficitH(iso, p.id) + getOvertimeHours(iso, p.id);
      });
      weekDays.forEach((day) => {
        const date = new Date(year, month, day);
        const iso = fmtISO(date);
        if (!isSunday(date) && isPresent(iso, p))
          ot += getDayAllOtH(iso, p.id) - getDayDeficitH(iso, p.id) + getOvertimeHours(iso, p.id);
      });
      return { person: p, ot: roundTo15min(ot) };
    });

    const weekTotal = roundTo15min(personOTs.reduce((s, e) => s + e.ot, 0));
    const nonZero = personOTs.filter((e) => e.ot !== 0);
    const detail = nonZero
      .map(
        (e) =>
          `<span class="${e.ot < 0 ? 'ot-neg' : 'ot-pos'}">${escapeHTML(e.person.short)} ${signedHHMM(e.ot)}</span>`
      )
      .join('<span class="ot-sep">·</span>');

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

function buildWeekGrid(year, month, people) {
  const nbDays = daysInMonth(year, month);
  const firstWD = isoWeekday(new Date(year, month, 1)); // 0=Lun…6=Dim
  const todayISO = fmtISO(today);
  const isASV = people.length > 0 && isASVPerson(people[0].id);

  // Tableau de semaines : chaque semaine = 7 éléments (null = hors mois, ou numéro de jour)
  const weeks = [];
  let week = new Array(firstWD).fill(null);
  for (let d = 1; d <= nbDays; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const DAY_LETTERS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', isASV ? 'Alertes' : 'Dimanche'];
  const isVetAdmin = !isASV && (store.currentUser?.role === 'admin' || store.currentUser?.role === 'vet');
  const head = `<div class="cal-wg-head"><div class="cal-wg-dh cal-wg-dh-label" aria-hidden="true"></div>${DAY_LETTERS.map(
    (l, i) =>
      `<div class="cal-wg-dh${i >= 5 ? ' cal-wg-dh-we' : ''}" style="grid-column:span ${i === 6 ? 1 : 2}" ${i === 6 && isASV ? 'title="Motif d\'alerte réglementaire"' : ''}>${l}</div>`
  ).join('')}</div>`;

  const labelColHtml = `<div class="cal-wg-label-spacer" aria-hidden="true"></div>`;

  const legendHtml = isASV
    ? ''
    : `<div class="cal-wg-person-legend">
    ${people.map((p) => `<span class="cal-wg-person-tag" style="background:${hexToRgba(p.color, 0.13)};color:${p.color};border-color:${hexToRgba(p.color, 0.4)};">${p.short}</span>`).join('')}
    <span class="cal-wg-status-tag cal-wg-status-absent">Absent</span>
  </div>`;

  const leaveRuns = {};
  if (!isASV) {
    const buildRun = (runDays, pid) => {
      // Pas de fusion pour une seule demi-journée isolée
      if (runDays.length === 1 && SLOTS.filter((s) => getSlotState(runDays[0], pid, s) === 'absent').length <= 1)
        return;
      const lbl = getSlotLabel(runDays[0], pid, 'M') || getSlotLabel(runDays[0], pid, 'AM') || '';
      const lc = lbl.toLowerCase();
      const isSick = lc === 'maladie' || lc === 'arrêt maladie' || lc === 'arrêt';
      const isRepos = lc === 'repos' || lc === 'repos planifié' || lc === 'non travaillé';
      const decision =
        !isRepos && !isSick && isASVPerson(pid)
          ? getLeaveDecision(runDays[0], pid, 'M') || getLeaveDecision(runDays[0], pid, 'AM') || 'pending'
          : null;
      const leaveType = isSick ? 'sick' : isRepos ? 'repos' : decision === 'pending' ? 'pending' : 'conge';
      // Label par défaut pour les runs ≥ 2 jours sans label explicite (ex. congés vétérinaires)
      const displayLabel = lbl || (runDays.length >= 2 && leaveType !== 'pending' ? 'Congé' : '');
      runDays.forEach((ri, i) => {
        const d = parseInt(ri.slice(8, 10), 10);
        const dWD = isoWeekday(new Date(year, month, d));
        // isWeekStart : 1er jour du run OU 1er jour ouvré d'une nouvelle semaine calendaire.
        // On compare l'indice de jour de semaine avec celui du jour précédent du run :
        // si inférieur ou égal → on a franchi un weekend, donc nouvelle semaine.
        // Cette logique fonctionne même quand le lundi n'est pas un jour travaillé (ASV).
        const prevD = i > 0 ? parseInt(runDays[i - 1].slice(8, 10), 10) : null;
        const prevWD = prevD !== null ? isoWeekday(new Date(year, month, prevD)) : null;
        const isWeekStart = i === 0 || dWD <= prevWD;
        // Compte les cellules ouvrées du segment jusqu'au franchissement de semaine suivant
        let weekRunLen = 1;
        if (isWeekStart) {
          for (let j = i + 1; j < runDays.length; j++) {
            const jWD = isoWeekday(new Date(year, month, parseInt(runDays[j].slice(8, 10), 10)));
            const prevJWD = isoWeekday(new Date(year, month, parseInt(runDays[j - 1].slice(8, 10), 10)));
            if (jWD <= prevJWD) break; // franchissement de semaine
            weekRunLen++;
          }
        }
        leaveRuns[pid][ri] = {
          pos: runDays.length === 1 ? 'single' : i === 0 ? 'start' : i === runDays.length - 1 ? 'end' : 'mid',
          label: isWeekStart ? displayLabel : '',
          hasLabel: !!displayLabel,
          leaveType,
          weekRunLen,
          isWeekStart,
        };
      });
    };
    // Détermine la "clé de type" d'une journée absente pour détecter les changements de type
    // entre jours consécutifs et éviter de fusionner des types différents (ex. congé + maladie).
    const dayRunType = (iso, pid) => {
      const lbl = (getSlotLabel(iso, pid, 'M') || getSlotLabel(iso, pid, 'AM') || '').toLowerCase().trim();
      if (lbl === 'repos' || lbl === 'repos planifié' || lbl === 'non travaillé') return 'repos';
      if (lbl === 'maladie' || lbl === 'arrêt maladie' || lbl === 'arrêt') return 'sick';
      if (lbl && lbl !== 'congé') return 'lbl:' + lbl;
      if (isASVPerson(pid)) return getLeaveDecision(iso, pid, 'M') || getLeaveDecision(iso, pid, 'AM') || 'pending';
      return 'conge';
    };
    people.forEach((p) => {
      leaveRuns[p.id] = {};
      let runDays = [];
      let runType = null;
      for (let d = 1; d <= nbDays; d++) {
        const dt = new Date(year, month, d);
        if (isoWeekday(dt) === 6) continue;
        const di = fmtISO(dt);
        const isAbs = getSlotState(di, p.id, 'M') === 'absent' || getSlotState(di, p.id, 'AM') === 'absent';
        if (isAbs) {
          const t = dayRunType(di, p.id);
          if (runDays.length > 0 && t !== runType) {
            buildRun(runDays, p.id);
            runDays = [];
          }
          if (!runDays.length) runType = t;
          runDays.push(di);
        } else if (runDays.length) {
          buildRun(runDays, p.id);
          runDays = [];
          runType = null;
        }
      }
      if (runDays.length) buildRun(runDays, p.id);
    });
  }

  // Carte des blocs fusionnés par personne, calculée une fois pour tout le mois (ASV uniquement)
  const personBlockMaps = isASV ? new Map(people.map((p) => [p.id, computeLeaveBlocks(p.id, year, month)])) : null;

  const weekBlocksHtml = weeks
    .map((weekDays, weekIdx) => {
      // Rangée d'en-têtes : jours seulement (sans bandes de personnes)
      const headerCols = weekDays
        .map((day, wd) => {
          if (day === null)
            return `<div class="cal-wg-day cal-wg-day-empty" aria-hidden="true" style="grid-column:span ${wd === 6 ? 1 : 2}"></div>`;
          const date = new Date(year, month, day);
          const iso = fmtISO(date);
          const isSat = wd === 5,
            isSun = wd === 6;
          const hName = holidayName(iso);
          const comment = getDayComment(iso);
          let dayCls = 'cal-wg-day';
          if (isSat || isSun) dayCls += ' cal-wg-day-we';
          if (isSat) dayCls += ' cal-wg-day-sa';
          if (isSun) dayCls += ' cal-wg-day-su';
          if (hName) dayCls += ' cal-wg-day-holiday';
          if (iso === todayISO) dayCls += ' cal-wg-day-today';
          const clinicClosed = !isSun && isClinicClosed(iso);
          if (clinicClosed) dayCls += ' cal-wg-day-clinic-closed';
          const toolsHtml = !isSun
            ? `<div class="cal-wg-tools">
        ${isVetAdmin ? `<button class="cal-wg-tool-btn${clinicClosed ? ' clinic-close-active' : ''}" data-clinic-close="${iso}" title="${clinicClosed ? 'Clinique fermée — cliquer pour rouvrir' : 'Fermer la clinique ce jour'}">${clinicClosed ? '🔒' : '🏥'}</button>` : ''}
        <button class="cal-wg-tool-btn${comment ? ' has-comment' : ''}" data-action="comment" data-date="${iso}" aria-label="Commentaire du ${day}/${month + 1}" title="${comment ? escapeHTML(comment) : 'Ajouter un commentaire'}">💬</button>
        <button class="cal-wg-tool-btn" data-action="edit-day" data-date="${iso}" aria-label="Édition rapide du ${day}/${month + 1}">✏️</button>
      </div>`
            : '<div class="cal-wg-tools"></div>';
          const dayHead = `<div class="cal-wg-day-head">
        <div class="cal-wg-daynum">${day}</div>
        ${hName ? `<div class="cal-wg-holiday-name" title="${escapeHTML(hName)}">${escapeHTML(hName)}</div>` : ''}
        ${toolsHtml}
      </div>`;
          return `<div class="${dayCls}" data-date="${iso}" style="grid-column:span ${isSun ? 1 : 2}">${dayHead}</div>`;
        })
        .join('');

      // Rangées par personne : cellules fusionnées pour les congés (grid-column: span N)
      const sunDay = weekDays[6];
      const sunISO = sunDay !== null ? fmtISO(new Date(year, month, sunDay)) : null;
      let personRowsHtml = '';
      people.forEach((person) => {
        const locked = isMonthSigned(person.id, year, month);
        const noEdit = !_canEditSlot(person.id);
        const blocked = locked || noEdit;
        const blockTitle = locked ? 'Feuille de présence signée — verrouillée' : noEdit ? 'Lecture seule' : '';
        const archived = person.archived === true;
        const plabel = `<div class="cal-wg-plabel${archived ? ' plabel-archived' : ''}" style="background:${hexToRgba(person.color, 0.15)};color:${person.color};border-left:3px solid ${person.color};" title="${escapeHTML(person.short)}">${escapeHTML(person.short)}</div>`;

        let cells = '';
        let wi = 0;
        while (wi < weekDays.length) {
          const day = weekDays[wi];
          const wd = wi;
          if (day === null) {
            cells += `<div class="cal-wg-pstrip-null" aria-hidden="true" style="grid-column:span ${wd === 6 ? 1 : 2}"></div>`;
            wi++;
            continue;
          }
          const date = new Date(year, month, day);
          const iso = fmtISO(date);
          if (wd === 6) {
            // Dimanche
            if (isASV && sunISO) {
              const als = getWeekAlerts(person.id, sunISO);
              cells +=
                als.length > 0
                  ? `<div class="cal-wg-pstrip" data-person="${person.id}" style="grid-column:span 1;min-height:18px;display:flex;align-items:center;justify-content:center;"><button class="week-alert-btn" data-alert-person="${person.id}" data-alerts="${escapeHTML(JSON.stringify(als))}" title="Cliquer pour voir le détail">⚠️ ${als.length}</button></div>`
                  : `<div class="cal-wg-pstrip" data-person="${person.id}" style="grid-column:span 1;min-height:18px;"></div>`;
            } else {
              cells += `<div class="cal-wg-pstrip" data-person="${person.id}" style="grid-column:span 1"></div>`;
            }
            wi++;
            continue;
          }
          if (isASVPerson(person.id) && !isPersonWorkingDay(person.id, date)) {
            cells += `<div class="cal-wg-pstrip${archived ? ' pstrip-archived' : ''}" data-person="${person.id}" style="grid-column:span 2"><div class="cal-wg-half cal-wg-half-nonworking" aria-hidden="true"></div><div class="cal-wg-half cal-wg-half-nonworking" aria-hidden="true"></div></div>`;
            wi++;
            continue;
          }
          // Fusion ASV : blocs contigus calculés par computeLeaveBlocks
          if (isASV) {
            const bi = personBlockMaps?.get(person.id)?.get(iso);
            if (bi?.segmentStart) {
              const lockCls = locked ? ' cal-wg-half-locked' : noEdit ? ' cal-wg-half-readonly' : '';
              const pstripBgCls =
                {
                  repos: ' pstrip-bg-repos',
                  sick: ' pstrip-bg-sick',
                  pending: ' pstrip-bg-pending',
                  approved: ' pstrip-bg-approved',
                  rejected: ' pstrip-bg-absent',
                }[bi.visualType] ?? '';
              const startSlot = bi.startSlot ?? SLOTS[0];
              const endSlot = bi.endSlot ?? SLOTS[SLOTS.length - 1];
              const spanHalves = bi.spanHalves ?? bi.spanDays * 2;

              // Jour partiel en début (M travaillé, AM absent) : rendre M séparément (1 demi-col)
              if (startSlot !== SLOTS[0]) {
                const slot = SLOTS[0];
                const info = cellRenderInfo(iso, person.id, slot);
                const stateCls = info.stateClass ? ` cal-wg-half-${info.stateClass}` : '';
                cells += `<div class="cal-wg-pstrip${archived ? ' pstrip-archived' : ''}" data-person="${person.id}" style="grid-column:span 1;position:relative"><div class="cal-wg-half${stateCls}${lockCls}" data-date="${iso}" data-person="${person.id}" data-slot="${slot}" ${blocked ? 'data-action="locked"' : ''} style="${info.style || ''}" tabindex="${blocked ? '-1' : '0'}" role="button" title="${escapeHTML(blocked ? blockTitle : info.title || '')}" aria-label="${cellAriaLabel(iso, person.id, slot)}">${info.html || 'M'}</div></div>`;
              }

              // Bloc fusionné couvrant exactement spanHalves demi-colonnes
              const lblTypeCls = { repos: ' lbl-repos', sick: ' lbl-sick' }[bi.visualType] ?? '';
              const lbl = bi.label
                ? `<div class="pstrip-leave-label-merged${lblTypeCls}">${escapeHTML(bi.label)}</div>`
                : bi.visualType === 'pending'
                  ? `<div class="pstrip-leave-label-merged"><span class="cell-mark">⏳</span></div>`
                  : '';
              cells += `<div class="cal-wg-pstrip${archived ? ' pstrip-archived' : ''}${pstripBgCls}" data-person="${person.id}" data-erase-date="${iso}" style="grid-column:span ${spanHalves};position:relative">${lbl}</div>`;

              // Jour partiel en fin (M absent, AM travaillé) : rendre AM séparément (1 demi-col)
              if (endSlot !== SLOTS[SLOTS.length - 1]) {
                const endDayNum = weekDays[wi + bi.spanDays - 1];
                if (endDayNum !== null && endDayNum !== undefined) {
                  const endISO = fmtISO(new Date(year, month, endDayNum));
                  const slot = SLOTS[SLOTS.length - 1];
                  const info = cellRenderInfo(endISO, person.id, slot);
                  const stateCls = info.stateClass ? ` cal-wg-half-${info.stateClass}` : '';
                  cells += `<div class="cal-wg-pstrip${archived ? ' pstrip-archived' : ''}" data-person="${person.id}" style="grid-column:span 1;position:relative"><div class="cal-wg-half${stateCls}${lockCls}" data-date="${endISO}" data-person="${person.id}" data-slot="${slot}" ${blocked ? 'data-action="locked"' : ''} style="${info.style || ''}" tabindex="${blocked ? '-1' : '0'}" role="button" title="${escapeHTML(blocked ? blockTitle : info.title || '')}" aria-label="${cellAriaLabel(endISO, person.id, slot)}">${info.html || 'A'}</div></div>`;
                }
              }

              wi += bi.spanDays;
              continue;
            }
            if (bi && !bi.segmentStart) {
              wi++;
              continue;
            }
          }
          const ri = leaveRuns?.[person.id]?.[iso];
          // Cellules non-isWeekStart absorbées dans le span du isWeekStart
          if (ri && !ri.isWeekStart) {
            wi++;
            continue;
          }
          if (ri && ri.isWeekStart) {
            const span = ri.weekRunLen;
            const lockCls = locked ? ' cal-wg-half-locked' : noEdit ? ' cal-wg-half-readonly' : '';
            const pstripBgCls =
              {
                repos: ' pstrip-bg-repos',
                sick: ' pstrip-bg-sick',
                pending: ' pstrip-bg-pending',
                conge: ' pstrip-bg-absent',
              }[ri.leaveType] ?? ' pstrip-bg-absent';

            // Jour partiel en début : M présent → rendre M séparément avant le bloc fusionné
            let spanOffset = 0;
            if (getSlotState(iso, person.id, 'M') !== 'absent') {
              const info = cellRenderInfo(iso, person.id, 'M');
              const stateCls = info.stateClass ? ` cal-wg-half-${info.stateClass}` : '';
              cells += `<div class="cal-wg-pstrip${archived ? ' pstrip-archived' : ''}" data-person="${person.id}" style="grid-column:span 1;position:relative"><div class="cal-wg-half${stateCls}${lockCls}" data-date="${iso}" data-person="${person.id}" data-slot="M" ${blocked ? 'data-action="locked"' : ''} style="${info.style || ''}" tabindex="${blocked ? '-1' : '0'}" role="button" title="${escapeHTML(blocked ? blockTitle : info.title || '')}" aria-label="${cellAriaLabel(iso, person.id, 'M')}">${info.html || 'M'}</div></div>`;
              spanOffset = 1;
            }

            // Jour partiel en fin : AM présent → rendre AM séparément après le bloc fusionné
            let spanTrim = 0;
            let suffixCell = '';
            const lastWI = wi + span - 1;
            const lastDayNum = lastWI < weekDays.length ? weekDays[lastWI] : null;
            const lastIso =
              lastDayNum !== null && lastDayNum !== undefined ? fmtISO(new Date(year, month, lastDayNum)) : null;
            if (lastIso && lastIso !== iso && getSlotState(lastIso, person.id, 'AM') !== 'absent') {
              const info = cellRenderInfo(lastIso, person.id, 'AM');
              const stateCls = info.stateClass ? ` cal-wg-half-${info.stateClass}` : '';
              suffixCell = `<div class="cal-wg-pstrip${archived ? ' pstrip-archived' : ''}" data-person="${person.id}" style="grid-column:span 1;position:relative"><div class="cal-wg-half${stateCls}${lockCls}" data-date="${lastIso}" data-person="${person.id}" data-slot="AM" ${blocked ? 'data-action="locked"' : ''} style="${info.style || ''}" tabindex="${blocked ? '-1' : '0'}" role="button" title="${escapeHTML(blocked ? blockTitle : info.title || '')}" aria-label="${cellAriaLabel(lastIso, person.id, 'AM')}">${info.html || 'A'}</div></div>`;
              spanTrim = 1;
            }

            const lbl = ri.label
              ? `<div class="pstrip-leave-label-merged lbl-${ri.leaveType}">${escapeHTML(ri.label)}</div>`
              : '';
            // Overlay invisible : cible de clic pour la gomme (même chemin que les cases normales)
            const eraseOverlay = blocked
              ? ''
              : `<div class="cal-wg-half" data-date="${iso}" data-person="${person.id}" data-slot="M" data-vet-erase-overlay="1" style="position:absolute;inset:0;background:transparent;color:transparent;z-index:2;" tabindex="-1" aria-hidden="true"></div>`;
            cells += `<div class="cal-wg-pstrip${archived ? ' pstrip-archived' : ''}${pstripBgCls}" data-person="${person.id}" data-erase-date="${iso}" style="grid-column:span ${span * 2 - spanOffset - spanTrim};position:relative">${eraseOverlay}${lbl}</div>`;
            cells += suffixCell;
            wi += span;
            continue;
          }
          // Cellule normale (présent / vide)
          const isClosed = isClinicClosed(iso);
          const halves = SLOTS.map((slot) => {
            const info = cellRenderInfo(iso, person.id, slot);
            const lockCls = isClosed
              ? ' cal-wg-half-clinic-closed'
              : locked
                ? ' cal-wg-half-locked'
                : noEdit
                  ? ' cal-wg-half-readonly'
                  : '';
            const stateCls = isClosed ? '' : info.stateClass ? ` cal-wg-half-${info.stateClass}` : '';
            const isBlocked = blocked || isClosed;
            const title = isClosed ? 'Clinique fermée' : blocked ? blockTitle : info.title || '';
            return `<div class="cal-wg-half${stateCls}${lockCls}" data-date="${iso}" data-person="${person.id}" data-slot="${slot}" ${isBlocked ? 'data-action="locked"' : ''} style="${isClosed ? '' : info.style || ''}" tabindex="${isBlocked ? '-1' : '0'}" role="button" title="${escapeHTML(title)}" aria-label="${cellAriaLabel(iso, person.id, slot)}">${isClosed ? '' : info.html || (slot === 'M' ? 'M' : 'A')}</div>`;
          }).join('');
          cells += `<div class="cal-wg-pstrip${archived ? ' pstrip-archived' : ''}" data-person="${person.id}" style="grid-column:span 2">${halves}</div>`;
          wi++;
        }
        personRowsHtml += plabel + cells;
      });

      // Barre heures supplémentaires ASV : uniquement pour les semaines complètes (dimanche dans ce mois)
      let otBarHtml = '';
      if (isASV && weekDays[6] !== null) {
        const weekDayNums = weekDays.filter((d) => d !== null);
        let extraDates = [];
        if (weekIdx === 0) {
          const firstInWeek = weekDays.find((d) => d !== null);
          const firstDateInWeek = new Date(year, month, firstInWeek);
          for (let i = isoWeekday(firstDateInWeek); i > 0; i--) {
            const d = new Date(firstDateInWeek.getTime() - i * 86400000);
            if (!isSunday(d)) extraDates.push(d);
          }
        }
        const isPresentWG = (iso, p) =>
          getSlotState(iso, p.id, 'M') === 'present' || getSlotState(iso, p.id, 'AM') === 'present';
        const personOTs = people.map((p) => {
          let ot = 0;
          extraDates.forEach((d) => {
            const iso = fmtISO(d);
            if (!isSunday(d) && isPresentWG(iso, p))
              ot += getDayAllOtH(iso, p.id) - getDayDeficitH(iso, p.id) + getOvertimeHours(iso, p.id);
          });
          weekDayNums.forEach((dn) => {
            const d = new Date(year, month, dn);
            const iso = fmtISO(d);
            if (!isSunday(d) && isPresentWG(iso, p))
              ot += getDayAllOtH(iso, p.id) - getDayDeficitH(iso, p.id) + getOvertimeHours(iso, p.id);
          });
          return { person: p, ot: roundTo15min(ot) };
        });
        const nonZero = personOTs.filter((e) => e.ot !== 0);
        // Total heures réelles de la semaine par personne (utilise le lundi réel de la semaine)
        const _firstDay = weekDays.find((d) => d !== null);
        const _mondayOfWeek = getWeekMondayDate(new Date(year, month, _firstDay));
        const personWeekH = people.map((p) => {
          const h = computeWeekTotalHours(p.id, _mondayOfWeek);
          return { person: p, h };
        });
        const weekHLine = personWeekH
          .map((e) => {
            if (!e.h) return null;
            const over = !e.person.saturdayOnly && e.h >= WEEKLY_MAX_HOURS;
            return (
              `<span class="${over ? 'ot-neg' : 'ot-pos'}" title="${escapeHTML(e.person.short)} — ${formatHHMM(e.h)} cette semaine${over ? ' ⚠️ Plafond 42h' : ''}">` +
              `${escapeHTML(e.person.short)} ${formatHHMM(e.h)}${over ? ' ⚠️' : ''}</span>`
            );
          })
          .filter(Boolean);
        const weekHHtml = weekHLine.length
          ? `<div class="cal-wg-week-ot" style="opacity:0.85;font-size:11px;">` +
            `<span style="color:var(--color-text-muted);font-weight:600;margin-right:6px;">Total</span>` +
            `<span class="ot-week-detail">${weekHLine.join('<span class="ot-sep">·</span>')}</span></div>`
          : '';
        if (nonZero.length > 0) {
          const weekTotal = roundTo15min(personOTs.reduce((s, e) => s + e.ot, 0));
          const detail = nonZero
            .map(
              (e) =>
                `<span class="${e.ot < 0 ? 'ot-neg' : 'ot-pos'}">${escapeHTML(e.person.short)} ${signedHHMM(e.ot)}</span>`
            )
            .join('<span class="ot-sep">·</span>');
          otBarHtml =
            weekHHtml +
            `<div class="cal-wg-week-ot"><span class="ot-week-detail">${detail}</span><span class="ot-week-sum${weekTotal < 0 ? ' ot-week-sum-neg' : ''}">${signedHHMM(weekTotal)}</span></div>`;
        } else if (weekHHtml) {
          otBarHtml = weekHHtml;
        }
      }

      return `<div class="cal-wg-week-block"><div class="cal-wg-week">${labelColHtml}${headerCols}${personRowsHtml}</div>${otBarHtml}</div>`;
    })
    .join('');

  let monthTotalHtml = '';
  if (isASV) {
    const monthTotals = people
      .map((p) => {
        let h = 0;
        for (let d = 1; d <= nbDays; d++) {
          const dt = new Date(year, month, d);
          if (isSunday(dt)) continue;
          const iso = fmtISO(dt);
          const isPresent =
            getSlotState(iso, p.id, 'M') === 'present' || getSlotState(iso, p.id, 'AM') === 'present';
          if (!isPresent) continue;
          h += getDayNominal(iso, p.id) + getDayAllOtH(iso, p.id) - getDayDeficitH(iso, p.id) + getOvertimeHours(iso, p.id);
        }
        return { person: p, h: Math.round(h * 100) / 100 };
      })
      .filter((e) => e.h > 0);
    if (monthTotals.length > 0) {
      const parts = monthTotals
        .map(
          (e) =>
            `<span style="color:${e.person.color};font-weight:700;">${escapeHTML(e.person.short)} ${formatHHMM(e.h)}</span>`
        )
        .join('<span class="ot-sep">·</span>');
      monthTotalHtml = `<div class="cal-wg-week-ot cal-month-total-bar"><span class="cal-month-total-lbl">Total du mois</span>${parts}</div>`;
    }
  }

  return `<div class="cal-wg">${head}${legendHtml}${weekBlocksHtml}</div>${monthTotalHtml}`;
}

function buildCalendarGrid(viewKey) {
  const cfg = store.CAL_VIEWS[viewKey];
  const month = cfg.navState.month;
  return buildWeekGrid(cfg.year, month, cfg.people);
}

function buildLegendColors(people = PEOPLE) {
  const hasASV = people.some((p) => isASVPerson(p.id));
  return `
    <div class="legend-row">
      ${
        hasASV
          ? `
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-opening);border:1.5px solid var(--color-opening-border)"></span><strong>O</strong> — Ouverture (8h30→19h)</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-closing);border:1.5px solid var(--color-closing-border)"></span><strong>F</strong> — Fermeture (9h→19h15)</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-off);border:1.5px solid var(--color-off-border)"></span>Repos planifié 🟠</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-sick);border:1.5px solid var(--color-sick-border)"></span>Arrêt maladie 🤒</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-absent);border:1.5px solid var(--color-absent-border)"></span>Congé validé ✅</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-leave-pending);border:1.5px solid var(--color-leave-pending-border)"></span>Congé en attente ⏳</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-leave-rejected);border:1.5px solid var(--color-leave-rejected-border)"></span>Congé refusé ⚠️</div>
      `
          : `
        ${people
          .map(
            (p) => `
          <div class="legend-item"><span class="legend-swatch" style="background:${p.present.bg};border:1.5px solid ${p.present.border}"></span>${p.short} — présent</div>
        `
          )
          .join('')}
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-absent);border:1.5px solid var(--color-absent-border)"></span>Absent</div>
        <div class="legend-item"><span class="legend-swatch" style="background:var(--color-medical);border:1.5px solid var(--color-medical-border)"></span>Visite médicale 🏥</div>
      `
      }
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-holiday);border:1.5px solid var(--color-holiday)"></span>Jour férié</div>
      <div class="legend-item"><span class="legend-swatch" style="background:var(--color-sunday);border:1.5px solid var(--color-border)"></span>${hasASV ? 'Dimanche — Alertes semaine' : 'Dimanche (fermé)'}</div>
    </div>
  `;
}

function buildLegend(people = PEOPLE) {
  const hasASV = people.some((p) => isASVPerson(p.id));
  return `
    <div class="legend">
      ${buildLegendColors(people)}
      <div class="legend-row">
        ${
          hasASV
            ? `
          <span class="legend-help-item">🎨 Choisir un <strong>outil</strong> dans la barre ci-dessus puis <strong>cliquer/glisser</strong> les cases</span>
          <span class="legend-help-item">🧹 <strong>Gomme</strong> : efface une case (retour à l'état vide)</span>
          <span class="legend-help-item">🔵 <strong>Congé</strong> : ouvre une demande soumise aux vétérinaires</span>
          <span class="legend-help-item">👆 <strong>Clic droit</strong> (ou appui long) : saisie directe du motif</span>
        `
            : `
          <span class="legend-help-item">🖱️ <strong>Clic</strong> sur une case : fait défiler Vide → Présent → Absent</span>
          <span class="legend-help-item">↔️ <strong>Glisser</strong> le clic sur plusieurs cases : les remplit toutes d'un coup</span>
          <span class="legend-help-item">👆 <strong>Clic droit</strong> (ou appui long) sur une case : ouvre la saisie d'un motif d'absence</span>
        `
        }
      </div>
    </div>
  `;
}

function buildSignaturePanelHtml(viewKey) {
  const cfg = store.CAL_VIEWS[viewKey];
  if (viewKey !== 'asv-current') return '';
  const month = cfg.navState.month;
  const monthLabel = `${MONTH_NAMES[month]} ${cfg.year}`;
  return `
    <div class="card signature-panel" style="margin-top:16px;">
      <h3 style="font-size:14px;margin-bottom:10px;">✍️ Feuille de présence — ${monthLabel}</h3>
      <div class="signature-panel-rows">
        ${cfg.people
          .map((p) => {
            const detail = getSignatureDetail(p.id, cfg.year, month);
            const signedNote = detail
              ? (() => {
                  const signedDate = new Date(detail.signedAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  });
                  return `<span class="text-muted" style="font-size:12.5px;">✅ Signé par ${escapeHTML(detail.signedName)} le ${signedDate}</span>`;
                })()
              : '';
            const isOwn = store.currentUser?.person_id === p.id && store.currentUser?.role === 'asv';
            const isAdminOrVet = store.currentUser?.role === 'admin' || store.currentUser?.role === 'vet';
            const asvPendingNote =
              isOwn && !detail
                ? `<span class="text-muted" style="font-size:12px;font-style:italic;">La signature s'effectue via le lien envoyé par email par le vétérinaire.</span>`
                : '';
            const adminBtn =
              isAdminOrVet && !detail
                ? `<button type="button" class="btn" data-admin-request-sign="${p.id}" style="font-size:12.5px;padding:6px 12px;">📧 Demander la signature</button>`
                : '';
            return `<div class="signature-row">
            <span style="color:${p.color};font-weight:700;">${escapeHTML(p.short)}</span>
            ${signedNote}
            ${asvPendingNote}${adminBtn}
          </div>`;
          })
          .join('')}
      </div>
      <p class="text-muted" style="font-size:11px;margin-top:10px;">Une fois signé, le mois est verrouillé pour la personne concernée. Un vétérinaire peut annuler une signature depuis le Tableau de bord si une correction est nécessaire.</p>
    </div>
  `;
}

function buildPrintSignatureStatusHtml(viewKey) {
  const cfg = store.CAL_VIEWS[viewKey];
  if (viewKey !== 'asv-current') return '';
  const month = cfg.navState.month;
  const parts = cfg.people.map((p) => {
    const detail = getSignatureDetail(p.id, cfg.year, month);
    if (!detail) return `${escapeHTML(p.short)} : non signé`;
    const signedDate = new Date(detail.signedAt).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `${escapeHTML(p.short)} : signé par ${escapeHTML(detail.signedName)} le ${signedDate}`;
  });
  return `<p class="print-signature-status">✍️ ${parts.join('&nbsp;&nbsp;—&nbsp;&nbsp;')}</p>`;
}

async function adminRequestSignature(viewKey, personId) {
  const cfg = store.CAL_VIEWS[viewKey];
  const month = cfg.navState.month;
  const btn = document.querySelector(`[data-admin-request-sign="${personId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Envoi…';
  }
  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}request-signature`, {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        year: cfg.year,
        month,
        person_id: personId,
        time_fraction: ASV_PEOPLE.find((p) => p.id === personId)?.timeFraction ?? 1.0,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
    const person = personOf(personId);
    if (data.email_sent) {
      showToast(`Email de signature envoyé à ${person.short}`, '📧');
      renderCalendarView(viewKey);
    } else {
      openSigningLinkModal(data.signing_link, person.short, data.email_error);
      renderCalendarView(viewKey);
    }
  } catch (e) {
    showToast(`Échec — ${e.message || 'erreur réseau'}`, '❌');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📧 Demander la signature';
    }
  }
}

async function requestSignatureEmail(viewKey, personId) {
  const cfg = store.CAL_VIEWS[viewKey];
  const month = cfg.navState.month;
  const btn = document.querySelector(`[data-sign-person="${personId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Envoi…';
  }
  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}request-signature`, {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        year: cfg.year,
        month,
        time_fraction: ASV_PEOPLE.find((p) => p.id === personId)?.timeFraction ?? 1.0,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
    if (data.email_sent) {
      showToast(`Email de signature envoyé à ${store.currentUser.email}`, '📧');
      renderCalendarView(viewKey);
    } else {
      // Resend ne peut pas envoyer à cet email (plan gratuit) — afficher le lien à copier
      openSigningLinkModal(data.signing_link, store.currentUser.email);
      renderCalendarView(viewKey);
    }
  } catch (e) {
    showToast(`Échec — ${e.message || 'erreur réseau'}`, '❌');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Signer ma feuille de présence';
    }
  }
}

function renderCalendarView(viewKey) {
  const cfg = store.CAL_VIEWS[viewKey];
  const container = document.getElementById(cfg.containerId);
  if (!container || !cfg) return;
  const banner = cfg.forecast
    ? `
    <div class="forecast-banner">⚠️ Vue prévisionnelle — données indicatives non confirmées</div>
  `
    : '';
  const title = cfg.forecast
    ? `<h2 class="section-title">Prévisionnel ${cfg.year} — ${cfg.label}</h2>`
    : `<h2 class="section-title">Calendrier ${cfg.year} — ${cfg.label}</h2>`;
  // eslint-disable-next-line no-unsanitized/property
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
  container.querySelectorAll('[data-sign-person]').forEach((btn) => {
    btn.onclick = () => requestSignatureEmail(viewKey, btn.dataset.signPerson);
  });
  container.querySelectorAll('[data-admin-request-sign]').forEach((btn) => {
    btn.onclick = () => adminRequestSignature(viewKey, btn.dataset.adminRequestSign);
  });
  if (!viewKey.startsWith('asv') && (store.currentUser?.role === 'admin' || store.currentUser?.role === 'vet')) {
    container.querySelectorAll('[data-clinic-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const iso = btn.dataset.clinicClose;
        const nowClosed = !isClinicClosed(iso);
        setClinicClosed(iso, nowClosed);
        if (nowClosed) clearDayAllPeople(iso);
        _saveData();
        renderCalendarView(viewKey);
      });
    });
    const { year, navState } = cfg;
    const mnth = navState.month;
    const closeAllBtn = container.querySelector('#close-all-sats');
    const openAllBtn = container.querySelector('#open-all-sats');
    if (closeAllBtn)
      closeAllBtn.addEventListener('click', () => {
        const nb = daysInMonth(year, mnth);
        for (let d = 1; d <= nb; d++) {
          const dt = new Date(year, mnth, d);
          if (dt.getDay() === 6) {
            const isoD = fmtISO(dt);
            setClinicClosed(isoD, true);
            clearDayAllPeople(isoD);
          }
        }
        _saveData();
        renderCalendarView(viewKey);
      });
    if (openAllBtn)
      openAllBtn.addEventListener('click', () => {
        const nb = daysInMonth(year, mnth);
        for (let d = 1; d <= nb; d++) {
          const dt = new Date(year, mnth, d);
          if (dt.getDay() === 6) setClinicClosed(fmtISO(dt), false);
        }
        _saveData();
        renderCalendarView(viewKey);
      });
  }
}

function calViewKeyOfEventTarget(target) {
  const section = target.closest('[data-cal-view]');
  return section ? section.dataset.calView : null;
}

function cycleCellAndSave(cell) {
  _snapshotBeforeChange();
  const { date: iso, person: personId, slot } = cell.dataset;
  const next = cycleState(getSlotState(iso, personId, slot));
  setSlotState(iso, personId, slot, next);
  updateHalfDOM(cell);
  _saveData();
}

let dragCtx = null;
let mergedLPCtx = null; // long-press sur blocs fusionnés (VET overlay ou ASV pstrip)

function startDrag(cell) {
  _snapshotBeforeChange();
  const { date: iso, person: personId, slot } = cell.dataset;
  const isASVDrag = _getCurrentView() === 'asv' && isASVPerson(personId);
  let paintValue;
  if (isASVDrag && (store.calMonthPaintMode === 'opening' || store.calMonthPaintMode === 'closing')) {
    paintValue = 'present';
  } else if (
    isASVDrag &&
    (store.calMonthPaintMode === 'repos' ||
      store.calMonthPaintMode === 'conge' ||
      store.calMonthPaintMode === 'maladie')
  ) {
    paintValue = 'absent';
  } else if (isASVDrag && store.calMonthPaintMode === 'erase') {
    paintValue = 'empty';
  } else {
    paintValue = cycleState(getSlotState(iso, personId, slot));
  }
  dragCtx = {
    startCell: cell,
    paintValue,
    personId,
    moved: false,
    cancelled: false,
    touched: new Set(),
    viewKey: calViewKeyOfEventTarget(cell),
    paintMode: isASVDrag || store.calMonthPaintMode === 'erase' ? store.calMonthPaintMode : null,
    longPressTimer: setTimeout(() => {
      if (dragCtx && !dragCtx.moved) {
        dragCtx.cancelled = true;
        openAbsenceLabelPopover(cell, true);
        dragCtx = null;
      }
    }, 480),
  };
}

function applyPaint(cell, value) {
  const { date: iso, person: personId, slot } = cell.dataset;
  // Outil congé : ne jamais écraser un arrêt maladie ou repos planifié déjà posé
  if (dragCtx.paintMode === 'conge') {
    const lc = getSlotLabel(iso, personId, slot).toLowerCase().trim();
    if (
      lc === 'maladie' ||
      lc === 'arrêt maladie' ||
      lc === 'arrêt' ||
      lc === 'repos' ||
      lc === 'repos planifié' ||
      lc === 'non travaillé'
    )
      return;
  }
  dragCtx.touched.add(`${iso}|${personId}|${slot}`);
  if (dragCtx.paintMode === 'opening') {
    setSlotState(iso, personId, slot, 'present');
    store.DATA.slots[shiftTypeKey(iso, personId)] = 'O';
  } else if (dragCtx.paintMode === 'closing') {
    setSlotState(iso, personId, slot, 'present');
    store.DATA.slots[shiftTypeKey(iso, personId)] = 'F';
  } else if (dragCtx.paintMode === 'repos') {
    setSlotState(iso, personId, slot, 'absent');
    setSlotLabel(iso, personId, slot, 'Repos planifié');
    setLeaveDecision(iso, personId, slot, null); // repos ne requiert pas d'approbation
  } else if (dragCtx.paintMode === 'maladie') {
    setSlotState(iso, personId, slot, 'absent');
    setSlotLabel(iso, personId, slot, 'Arrêt maladie');
  } else if (dragCtx.paintMode === 'erase') {
    eraseFullRun(personId, iso);
    dragCtx.touched.add(`${iso}|${personId}|erase`);
  } else {
    setSlotState(iso, personId, slot, value);
  }
  // Vue mensuelle ASV : toute modification dans les 14 prochains jours → approbation vétérinaire
  if (dragCtx.paintMode && dragCtx.paintMode !== 'erase' && isASVPerson(personId) && isWithinNextTwoWeeks(iso)) {
    setChangeDecision(iso, personId, slot, 'pending');
  }
  updateHalfDOM(cell);
}

function enterDragCell(cell) {
  if (!dragCtx || dragCtx.cancelled) return;
  dragCtx.moved = true;
  clearTimeout(dragCtx.longPressTimer);
  // On ignore les cases de l'autre collaborateur : seul celui sélectionné au clic initial
  // peut être peint/fusionné pendant ce glisser.
  if (cell.dataset.person !== dragCtx.personId) return;
  applyPaint(cell, dragCtx.paintValue);
}

function endDrag() {
  if (!dragCtx) return;
  clearTimeout(dragCtx.longPressTimer);
  if (!dragCtx.cancelled) {
    if (!dragCtx.moved) applyPaint(dragCtx.startCell, dragCtx.paintValue);
    if (dragCtx.touched.size > 0) {
      _saveData();
      if (dragCtx.viewKey) renderCalendarView(dragCtx.viewKey);
      // Congé uniquement : soumettre aux vétérinaires pour validation
      if (dragCtx.paintMode === 'conge') {
        const slotsArr = Array.from(dragCtx.touched).map((k) => {
          const [iso2, _pid2, slot2] = k.split('|');
          return { iso: iso2, slot: slot2 };
        });
        const pid2 = dragCtx.personId;
        const vk = dragCtx.viewKey;
        setTimeout(() => openAbsenceRangePopover(slotsArr, pid2, vk), 50);
      }
      // Maladie : notification info aux vétérinaires (sans approbation)
      if (dragCtx.paintMode === 'maladie') {
        const person = personOf(dragCtx.personId);
        showToast(
          `Arrêt maladie de ${person?.short || dragCtx.personId} enregistré — les vétérinaires seront notifiés`,
          '🤒'
        );
      }
    }
  }
  dragCtx = null;
}

function openAbsenceLabelPopover(cell, forceAbsent) {
  const { date: iso, person: personId, slot } = cell.dataset;
  const viewKey = calViewKeyOfEventTarget(cell);
  const person = personOf(personId);
  _snapshotBeforeChange();
  if (forceAbsent && getSlotState(iso, personId, slot) !== 'absent') {
    setSlotState(iso, personId, slot, 'absent');
    updateHalfDOM(cell);
    _saveData(false);
  }
  const currentLabel = getSlotLabel(iso, personId, slot);
  const isASV = isASVPerson(personId);
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const quickTags = ['Vacances', 'Formation', 'Congrès', 'Maladie', 'RTT', 'Rendez-vous médical'];
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h4>${isASV ? 'Demande de congé' : "Motif d'absence"} — ${person.short}, ${SLOT_LABELS[slot]}<br><span class="text-muted" style="font-weight:500;font-size:12px;">${formatFR(iso)}</span></h4>
    ${isASV ? `<p class="text-muted" style="font-size:12px;margin:-4px 0 12px;">Sera soumise aux vétérinaires pour validation.</p>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
      <button type="button" id="popover-sick" style="padding:7px 4px;border:2px solid var(--color-sick-border);background:var(--color-sick);color:var(--color-sick-text);border-radius:var(--radius-btn);font-size:12px;font-weight:700;cursor:pointer;">🤒 Arrêt maladie</button>
      <button type="button" id="popover-off" style="padding:7px 4px;border:2px solid var(--color-off-border);background:var(--color-off);color:var(--color-off-text);border-radius:var(--radius-btn);font-size:12px;font-weight:700;cursor:pointer;">🗓️ Repos planifié</button>
    </div>
    <div class="popover-quicktags">
      ${quickTags.map((t) => `<button type="button" class="quicktag" data-tag="${escapeHTML(t)}">${t}</button>`).join('')}
    </div>
    <input type="text" id="absence-label-input" placeholder="Motif (ex. SKI TIGNES, GRÈCE...)" value="${escapeHTML(currentLabel)}" maxlength="40">
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">${isASV ? 'Soumettre la demande' : 'Enregistrer'}</button>
    </div>
  `;
  backdrop.classList.add('open');
  const input = box.querySelector('#absence-label-input');
  input.focus();
  input.select();
  box.querySelectorAll('.quicktag').forEach((tag) => {
    tag.addEventListener('click', () => {
      input.value = tag.dataset.tag;
      input.focus();
    });
  });
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#popover-sick').onclick = () => {
    setSlotLabel(iso, personId, slot, 'Maladie');
    propagateLabelAcrossSunday(personId, [{ iso, slot }], 'Maladie');
    _saveData();
    if (viewKey) renderCalendarView(viewKey);
    close();
  };
  box.querySelector('#popover-off').onclick = () => {
    setSlotLabel(iso, personId, slot, 'Repos planifié');
    propagateLabelAcrossSunday(personId, [{ iso, slot }], 'Repos planifié');
    _saveData();
    if (viewKey) renderCalendarView(viewKey);
    close();
  };
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-save').onclick = () => {
    const label = input.value.trim();
    // Alerte si modification de planning à moins de 15 jours (congé soumis tardivement)
    const daysBeforeDate = Math.ceil((new Date(iso + 'T00:00:00') - today) / 86400000);
    const isLateRequest = isASV && daysBeforeDate >= 0 && daysBeforeDate < 15;
    if (isLateRequest) showToast(`Modification à ${daysBeforeDate}j — délai réglementaire 15j non respecté`, '⚠️');
    setSlotLabel(iso, personId, slot, label);
    propagateLabelAcrossSunday(personId, [{ iso, slot }], label);
    _saveData();
    if (isASV && typeof triggerPushNotification === 'function') {
      triggerPushNotification({
        type: 'leave_request',
        title: isLateRequest ? '⚠️ Demande de congé hors délai' : 'Nouvelle demande de congé',
        body: `${person.short} — ${formatFR(iso)} (${SLOT_LABELS[slot]})${label ? ' · ' + label : ''}${isLateRequest ? ' — hors délai 15j' : ''}`,
        targetUsers: ['david', 'stephane'],
        data: { type: 'leave_request' },
      });
    }
    if (viewKey) renderCalendarView(viewKey);
    close();
  };
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
}

function openAbsenceRangePopover(slots, personId, viewKey) {
  const person = personOf(personId);
  const isASV = isASVPerson(personId);
  const currentLabel = getSlotLabel(slots[0].iso, personId, slots[0].slot);
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const quickTags = ['Vacances', 'Formation', 'Congrès', 'Maladie', 'RTT', 'Rendez-vous médical'];
  const fromTxt = formatFR(slots[0].iso);
  const toTxt = formatFR(slots[slots.length - 1].iso);
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h4>${isASV ? 'Demande de congé' : "Motif d'absence"} — ${person.short}<br><span class="text-muted" style="font-weight:500;font-size:12px;">${fromTxt}${slots.length > 1 ? ' → ' + toTxt : ''}</span></h4>
    ${isASV ? `<p class="text-muted" style="font-size:12px;margin:-4px 0 12px;">Sera soumise aux vétérinaires pour validation.</p>` : ''}
    <div class="popover-quicktags">
      ${quickTags.map((t) => `<button type="button" class="quicktag" data-tag="${escapeHTML(t)}">${t}</button>`).join('')}
    </div>
    <input type="text" id="absence-label-input" placeholder="Motif (ex. SKI TIGNES, GRÈCE...)" value="${escapeHTML(currentLabel)}" maxlength="40">
    ${slots.length > 1 ? `<button type="button" class="btn btn-sm popover-split-btn" id="popover-split">🔓 Défusionner et vider ces ${slots.length} demi-journées</button>` : ''}
    <div class="popover-actions">
      <button class="btn btn-danger" id="popover-clear">Effacer</button>
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">${isASV ? 'Soumettre la demande' : 'Enregistrer'}</button>
    </div>
  `;
  backdrop.classList.add('open');
  const input = box.querySelector('#absence-label-input');
  input.focus();
  input.select();
  box.querySelectorAll('.quicktag').forEach((tag) => {
    tag.addEventListener('click', () => {
      input.value = tag.dataset.tag;
      input.focus();
    });
  });
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-clear').onclick = () => {
    _snapshotBeforeChange();
    slots.forEach(({ iso, slot }) => setSlotState(iso, personId, slot, 'empty'));
    _saveData();
    if (viewKey) renderCalendarView(viewKey);
    close();
  };
  box.querySelector('#popover-save').onclick = () => {
    _snapshotBeforeChange();
    const label = input.value.trim();
    slots.forEach(({ iso, slot }) => setSlotLabel(iso, personId, slot, label));
    propagateLabelAcrossSunday(personId, slots, label);
    _saveData();
    if (isASV && typeof triggerPushNotification === 'function') {
      triggerPushNotification({
        type: 'leave_request',
        title: 'Nouvelle demande de congé',
        body: `${person.short} — ${fromTxt}${slots.length > 1 ? ' → ' + toTxt : ''}${label ? ' · ' + label : ''}`,
        targetUsers: ['david', 'stephane'],
        data: { type: 'leave_request' },
      });
    }
    if (viewKey) renderCalendarView(viewKey);
    close();
  };
  const splitBtn = box.querySelector('#popover-split');
  if (splitBtn) {
    splitBtn.onclick = () => {
      _snapshotBeforeChange();
      // La défusion purge entièrement chaque demi-journée (état + motif) plutôt que de
      // les laisser absentes avec le même texte répété sur chaque case éclatée.
      slots.forEach(({ iso, slot }) => setSlotState(iso, personId, slot, 'empty'));
      _saveData();
      if (viewKey) renderCalendarView(viewKey);
      close();
    };
  }
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
}

function openDayCommentPopover(iso, viewKey) {
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const current = getDayComment(iso);
  // eslint-disable-next-line no-unsanitized/property
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
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-save').onclick = () => {
    _snapshotBeforeChange();
    setDayComment(iso, box.querySelector('#day-comment-input').value.trim());
    _saveData();
    renderCalendarView(viewKey);
    close();
  };
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
}

function openOvertimeDayPopover(iso, people, viewKey) {
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const [y, m] = iso.split('-').map(Number);
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h4>⏱️ Ajustement d'heures<br><span class="text-muted" style="font-weight:500;font-size:12px;">${formatFR(iso)} — positif = heures sup, négatif = départ anticipé</span></h4>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
      ${people
        .map((p) => {
          const signed = isMonthSigned(p.id, y, m - 1);
          const noRight = !_canEditSlot(p.id);
          const readonly = signed || noRight;
          const readonlyTitle = signed ? 'Feuille de présence signée — verrouillée' : 'Lecture seule';
          return `
        <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:700;color:var(--color-text);">
          <span><span class="legend-swatch" style="background:${p.color};width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:middle;"></span>${p.short}${signed ? ' 🔒' : ''}</span>
          <input type="number" step="0.5" data-overtime-popover-input data-person="${p.id}" ${readonly ? `disabled title="${readonlyTitle}"` : ''}
            value="${getOvertimeHours(iso, p.id) || ''}" placeholder="0" style="width:80px;padding:7px 9px;border:1px solid var(--color-border);border-radius:6px;font-family:inherit;font-size:13px;${readonly ? 'opacity:0.55;' : ''}">
        </label>
      `;
        })
        .join('')}
    </div>
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Annuler</button>
      <button class="btn btn-primary" id="popover-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-save').onclick = () => {
    _snapshotBeforeChange();
    box.querySelectorAll('[data-overtime-popover-input]').forEach((input) => {
      if (input.disabled) return;
      setOvertimeHours(iso, input.dataset.person, input.value);
    });
    _saveData();
    renderCalendarView(viewKey);
    close();
  };
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
}

function sidebarPersonBlock(iso, person) {
  const isASV = isASVPerson(person.id);
  const [sy, sm] = iso.split('-').map(Number);
  if (isASV && isMonthSigned(person.id, sy, sm - 1)) {
    return `
      <div class="sidebar-person-block">
        <div class="sidebar-person-title"><span class="legend-swatch" style="background:${person.color};width:11px;height:11px;border-radius:50%;display:inline-block;"></span>${person.name}</div>
        <p class="text-muted" style="font-size:12px;margin:8px 0 0;">🔒 Feuille de présence signée pour ce mois — verrouillée. Un vétérinaire peut annuler la signature depuis le Tableau de bord si besoin.</p>
      </div>
    `;
  }
  if (!_canEditSlot(person.id)) {
    // Lecture seule : afficher l'état sans permettre de le modifier
    const stateLabel = (s) => ({ empty: 'Vide', present: 'Présent', absent: isASV ? 'Congé' : 'Absent' })[s] || s;
    return `
      <div class="sidebar-person-block">
        <div class="sidebar-person-title"><span class="legend-swatch" style="background:${person.color};width:11px;height:11px;border-radius:50%;display:inline-block;"></span>${person.name}</div>
        <p class="text-muted" style="font-size:11px;margin:6px 0 8px;">Lecture seule</p>
        ${SLOTS.map((slot) => {
          const state = getSlotState(iso, person.id, slot);
          const label = getSlotLabel(iso, person.id, slot);
          return `<p style="font-size:12.5px;margin:4px 0;"><strong>${SLOT_LABELS[slot]} :</strong> ${stateLabel(state)}${label ? ` — ${escapeHTML(label)}` : ''}</p>`;
        }).join('')}
        ${(() => {
          const h = getOvertimeHours(iso, person.id);
          return h !== 0
            ? `<p class="text-muted" style="font-size:12px;margin:6px 0 0;">Ajustement : ${signedHHMM(h)}</p>`
            : '';
        })()}
      </div>
    `;
  }
  return `
    <div class="sidebar-person-block">
      <div class="sidebar-person-title"><span class="legend-swatch" style="background:${person.color};width:11px;height:11px;border-radius:50%;display:inline-block;"></span>${person.name}</div>
      ${SLOTS.map((slot) => {
        const state = getSlotState(iso, person.id, slot);
        const label = getSlotLabel(iso, person.id, slot);
        const decision = state === 'absent' && isASV ? getLeaveDecision(iso, person.id, slot) || 'pending' : null;
        const btnStyle = (s) => {
          if (state !== s) return '';
          if (s === 'present')
            return `background:${person.present.bg};border-color:${person.present.border};color:${person.present.text};`;
          if (s === 'absent')
            return `background:var(--color-absent);border-color:var(--color-absent-border);color:var(--color-absent-text);`;
          return `background:var(--color-secondary);border-color:var(--color-text-muted);color:var(--color-text);`;
        };
        const decisionNote =
          decision === 'pending'
            ? `<p class="text-muted" style="font-size:11.5px;margin:6px 0 0;">⏳ En attente de validation</p>`
            : decision === 'rejected'
              ? `<p style="font-size:11.5px;margin:6px 0 0;color:var(--color-leave-rejected-text);">⚠️ Refusée${getLeaveDecisionComment(iso, person.id, slot) ? ' — ' + escapeHTML(getLeaveDecisionComment(iso, person.id, slot)) : ''}</p>`
              : decision === 'approved'
                ? `<p class="text-muted" style="font-size:11.5px;margin:6px 0 0;">✓ Approuvée</p>`
                : '';
        return `
          <p class="text-muted" style="font-size:11.5px;margin:10px 0 5px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">${SLOT_LABELS[slot]}</p>
          <div class="sidebar-state-row">
            ${['empty', 'present', 'absent']
              .map(
                (s) => `
              <button type="button" class="sidebar-state-btn ${state === s ? 'active' : ''}" style="${btnStyle(s)}"
                data-state-btn data-person="${person.id}" data-slot="${slot}" data-state="${s}">
                ${s === 'empty' ? 'Vide' : s === 'present' ? 'Présent' : isASV ? 'Congé' : 'Absent'}
              </button>
            `
              )
              .join('')}
          </div>
          ${state === 'absent' ? `<input type="text" data-label-input data-person="${person.id}" data-slot="${slot}" value="${escapeHTML(label)}" placeholder="Motif">` : ''}
          ${decisionNote}
        `;
      }).join('')}
      ${
        isASV && _canEditSlot(person.id)
          ? `
        <p class="text-muted" style="font-size:11.5px;margin:14px 0 5px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Ajustement d'heures (ce jour)</p>
        <p class="text-muted" style="font-size:11px;margin:0 0 6px;">+ heures supplémentaires &nbsp;/&nbsp; − départ anticipé</p>
        <input type="number" step="0.5" data-overtime-input data-person="${person.id}"
          value="${getOvertimeHours(iso, person.id) || ''}" placeholder="Ex. 1.5 ou -1">
      `
          : isASV
            ? `
        ${(() => {
          const h = getOvertimeHours(iso, person.id);
          return h !== 0
            ? `<p class="text-muted" style="font-size:12px;margin:10px 0 0;">Ajustement : ${signedHHMM(h)} (lecture seule)</p>`
            : '';
        })()}
      `
            : ''
      }
    </div>
  `;
}

function openDaySidebar(iso, viewKey) {
  const people = store.CAL_VIEWS[viewKey].people;
  const overlay = document.getElementById('sidebar-overlay');
  const sidebar = document.getElementById('day-sidebar');
  const closeSidebar = () => {
    overlay.classList.remove('open');
    sidebar.classList.remove('open');
  };
  const renderBody = () => {
    // eslint-disable-next-line no-unsanitized/property
    sidebar.innerHTML = `
      <div class="day-sidebar-head">
        <h3>✏️ ${formatFR(iso)}</h3>
        <button class="btn-icon" id="sidebar-close" aria-label="Fermer le panneau">✕</button>
      </div>
      <div class="day-sidebar-body">
        ${people.map((p) => sidebarPersonBlock(iso, p)).join('')}
        <div class="sidebar-person-block">
          <div class="sidebar-person-title">💬 Commentaire de la journée</div>
          <textarea id="sidebar-comment" rows="3" placeholder="Commentaire...">${escapeHTML(getDayComment(iso))}</textarea>
        </div>
      </div>
    `;
    sidebar.querySelector('#sidebar-close').onclick = closeSidebar;
    sidebar.querySelectorAll('[data-state-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        _snapshotBeforeChange();
        const { person: personId, slot, state } = btn.dataset;
        setSlotState(iso, personId, slot, state);
        if (state !== 'absent') setSlotLabel(iso, personId, slot, '');
        _saveData();
        renderBody();
        renderCalendarView(viewKey);
      });
    });
    sidebar.querySelectorAll('[data-label-input]').forEach((input) => {
      input.addEventListener('change', () => {
        _snapshotBeforeChange();
        setSlotLabel(iso, input.dataset.person, input.dataset.slot, input.value.trim());
        _saveData();
        renderCalendarView(viewKey);
      });
    });
    sidebar.querySelectorAll('[data-overtime-input]').forEach((input) => {
      input.addEventListener('change', () => {
        _snapshotBeforeChange();
        setOvertimeHours(iso, input.dataset.person, input.value);
        _saveData();
        renderCalendarView(viewKey);
      });
    });
    sidebar.querySelector('#sidebar-comment').addEventListener('change', (e) => {
      _snapshotBeforeChange();
      setDayComment(iso, e.target.value.trim());
      _saveData();
      renderCalendarView(viewKey);
    });
  };
  overlay.onclick = closeSidebar;
  renderBody();
  overlay.classList.add('open');
  sidebar.classList.add('open');
}

function initCalendarInteractions() {
  // Les cases interactives sont désormais des .cal-wg-half (grille-semaine).
  // data-action="locked" bloque tous les handlers pour les mois signés / lecture seule.
  document.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('.cal-wg-half');
    if (cell && !cell.dataset.action) {
      // Overlay VET : clic court = gomme, appui long = popup intitulé
      if (cell.dataset.vetEraseOverlay) {
        if (!_canEditSlot(cell.dataset.person)) return;
        e.preventDefault();
        const personId = cell.dataset.person;
        const iso = cell.dataset.date;
        const vk = calViewKeyOfEventTarget(cell);
        mergedLPCtx = {
          personId,
          iso,
          vk,
          erase: true,
          timer: setTimeout(() => {
            mergedLPCtx = null;
            const runSlots = collectRunSlots(personId, iso);
            if (runSlots.length > 0) openAbsenceRangePopover(runSlots, personId, vk);
          }, 480),
        };
        return;
      }
      if (!_canEditSlot(cell.dataset.person)) return;
      e.preventDefault();
      startDrag(cell);
      return;
    }
    // Bloc fusionné ASV : clic court en mode gomme = effacer, appui long = popup intitulé
    {
      const pstrip = e.target.closest('.cal-wg-pstrip[data-erase-date]');
      if (pstrip && _canEditSlot(pstrip.dataset.person)) {
        e.preventDefault();
        const personId = pstrip.dataset.person;
        const iso = pstrip.dataset.eraseDate;
        const vk = calViewKeyOfEventTarget(pstrip);
        const eraseMode = store.calMonthPaintMode === 'erase';
        mergedLPCtx = {
          personId,
          iso,
          vk,
          erase: eraseMode,
          timer: setTimeout(() => {
            mergedLPCtx = null;
            const runSlots = collectRunSlots(personId, iso);
            if (runSlots.length > 0) openAbsenceRangePopover(runSlots, personId, vk);
          }, 480),
        };
      }
    }
  });
  document.addEventListener('mouseover', (e) => {
    if (!dragCtx) return;
    const cell = e.target.closest('.cal-wg-half');
    if (cell && !cell.dataset.action && _canEditSlot(cell.dataset.person)) enterDragCell(cell);
  });
  document.addEventListener('mouseup', () => {
    if (mergedLPCtx) {
      clearTimeout(mergedLPCtx.timer);
      const { personId, iso, vk, erase } = mergedLPCtx;
      mergedLPCtx = null;
      if (erase) {
        _snapshotBeforeChange();
        eraseFullRun(personId, iso);
        _saveData();
        if (vk) renderCalendarView(vk);
      }
    }
    endDrag();
  });
  document.addEventListener(
    'touchstart',
    (e) => {
      const cell = e.target.closest('.cal-wg-half');
      if (cell && !cell.dataset.action) {
        // Overlay VET : appui court = gomme, appui long = popup intitulé
        if (cell.dataset.vetEraseOverlay) {
          if (!_canEditSlot(cell.dataset.person)) return;
          const personId = cell.dataset.person;
          const iso = cell.dataset.date;
          const vk = calViewKeyOfEventTarget(cell);
          mergedLPCtx = {
            personId,
            iso,
            vk,
            erase: true,
            timer: setTimeout(() => {
              mergedLPCtx = null;
              const runSlots = collectRunSlots(personId, iso);
              if (runSlots.length > 0) openAbsenceRangePopover(runSlots, personId, vk);
            }, 480),
          };
          return;
        }
        if (!_canEditSlot(cell.dataset.person)) return;
        startDrag(cell);
        return;
      }
      // Bloc fusionné ASV : appui court en mode gomme = effacer, appui long = popup intitulé
      {
        const pstrip = e.target.closest('.cal-wg-pstrip[data-erase-date]');
        if (pstrip && _canEditSlot(pstrip.dataset.person)) {
          const personId = pstrip.dataset.person;
          const iso = pstrip.dataset.eraseDate;
          const vk = calViewKeyOfEventTarget(pstrip);
          const eraseMode = store.calMonthPaintMode === 'erase';
          mergedLPCtx = {
            personId,
            iso,
            vk,
            erase: eraseMode,
            timer: setTimeout(() => {
              mergedLPCtx = null;
              const runSlots = collectRunSlots(personId, iso);
              if (runSlots.length > 0) openAbsenceRangePopover(runSlots, personId, vk);
            }, 480),
          };
        }
      }
    },
    { passive: true }
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (mergedLPCtx) {
        clearTimeout(mergedLPCtx.timer);
        mergedLPCtx = null;
        return;
      }
      if (!dragCtx) return;
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el && el.closest('.cal-wg-half');
      if (cell && !cell.dataset.action) enterDragCell(cell);
    },
    { passive: true }
  );
  document.addEventListener('touchend', () => {
    if (mergedLPCtx) {
      clearTimeout(mergedLPCtx.timer);
      const { personId, iso, vk, erase } = mergedLPCtx;
      mergedLPCtx = null;
      if (erase) {
        _snapshotBeforeChange();
        eraseFullRun(personId, iso);
        _saveData();
        if (vk) renderCalendarView(vk);
      }
      return;
    }
    endDrag();
  });

  // Double-clic sur une colonne-jour (vue hebdomadaire) ou une cellule mensuelle ASV → vue semaine
  document.addEventListener('dblclick', (e) => {
    // Vue hebdomadaire : colonne-jour entière
    const dayCol = e.target.closest('.cal-wg-day[data-date]');
    if (dayCol && _getCurrentView() === 'asv' && store.subNavState.asv !== 'week') {
      if (!dayCol.classList.contains('cal-wg-day-we')) {
        const iso = dayCol.dataset.date;
        if (iso) {
          store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(new Date(iso + 'T00:00:00')));
          _switchSubPage('asv', 'week');
        }
      }
      return;
    }
    // Vue mensuelle : cellule individuelle avec data-date
    const monthCell = e.target.closest('.cal-cell[data-date]');
    if (
      monthCell &&
      _getCurrentView() === 'asv' &&
      (store.subNavState.asv === 'calendar' || store.subNavState.asv === 'forecast')
    ) {
      if (monthCell.classList.contains('sunday-cell')) return;
      const iso = monthCell.dataset.date;
      if (!iso) return;
      const d = new Date(iso + 'T00:00:00');
      if (d.getDay() === 0) return; // dimanche
      const personId = monthCell.dataset.person;
      if (personId) store.weekNavState.personId = personId;
      store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(d));
      _switchSubPage('asv', 'week');
    }
  });

  document.addEventListener('contextmenu', (e) => {
    // Bloc fusionné VET (overlay) ou ASV (pstrip)
    const overlay = e.target.closest('.cal-wg-half[data-vet-erase-overlay]');
    if (overlay && _canEditSlot(overlay.dataset.person)) {
      e.preventDefault();
      const runSlots = collectRunSlots(overlay.dataset.person, overlay.dataset.date);
      const vk = calViewKeyOfEventTarget(overlay);
      if (runSlots.length > 0) openAbsenceRangePopover(runSlots, overlay.dataset.person, vk);
      return;
    }
    const pstrip = e.target.closest('.cal-wg-pstrip[data-erase-date]');
    if (pstrip && _canEditSlot(pstrip.dataset.person)) {
      e.preventDefault();
      const runSlots = collectRunSlots(pstrip.dataset.person, pstrip.dataset.eraseDate);
      const vk = calViewKeyOfEventTarget(pstrip);
      if (runSlots.length > 0) openAbsenceRangePopover(runSlots, pstrip.dataset.person, vk);
      return;
    }
    const cell = e.target.closest('.cal-wg-half');
    if (!cell || cell.dataset.action) return;
    if (!_canEditSlot(cell.dataset.person)) return;
    e.preventDefault();
    if (dragCtx) {
      clearTimeout(dragCtx.longPressTimer);
      dragCtx = null;
    }
    openAbsenceLabelPopover(cell, true);
  });

  document.addEventListener('keydown', (e) => {
    const cell = e.target.closest && e.target.closest('.cal-wg-half');
    if (!cell) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (cell.dataset.action) {
        // Case verrouillée : ne rien faire
      } else if (!_canEditSlot(cell.dataset.person)) {
        // Lecture seule
      } else {
        cycleCellAndSave(cell);
      }
    }
  });

  // Boutons paint-tool (sélection de l'outil de peinture mensuelle)
  document.addEventListener('click', (e) => {
    const paintBtn = e.target.closest('.paint-tool');
    if (paintBtn && paintBtn.dataset.paint) {
      store.calMonthPaintMode = paintBtn.dataset.paint;
      document
        .querySelectorAll('.paint-tool')
        .forEach((b) => b.classList.toggle('active', b.dataset.paint === store.calMonthPaintMode));
      return;
    }
  });

  // Badge d'alertes semaine → popup détail
  document.addEventListener('click', (e) => {
    const alertBtn = e.target.closest('.week-alert-btn');
    if (!alertBtn) return;
    const pid = alertBtn.dataset.alertPerson;
    const als = JSON.parse(alertBtn.dataset.alerts || '[]');
    const person = personOf(pid);
    const backdrop = document.getElementById('popover-backdrop');
    const box = document.getElementById('popover-box');
    // eslint-disable-next-line no-unsanitized/property
    box.innerHTML = `
      <div class="popover-title">⚠️ Alertes semaine — ${escapeHTML(person?.short || pid)}</div>
      <ul style="margin:8px 0 16px;padding-left:20px;font-size:13px;line-height:1.9;">
        ${als.map((a) => `<li style="color:#DC2626;font-weight:600;">${escapeHTML(a)}</li>`).join('')}
      </ul>
      <div class="popover-actions"><button class="btn" id="popover-cancel">Fermer</button></div>
    `;
    backdrop.classList.add('open');
    box.querySelector('#popover-cancel').onclick = () => backdrop.classList.remove('open');
  });

  // Sélection outil semaine (Départ anticipé / H.supp.)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.week-tool-btn');
    if (!btn || !btn.dataset.weekTool) return;
    store.weekNavState.weekTool = btn.dataset.weekTool;
    renderWeekViewASV();
  });

  // Clic sur cellule après-midi → départ anticipé
  document.addEventListener('click', (e) => {
    const cell = e.target.closest('.week-am-cell[data-am-iso]');
    if (!cell) return;
    openEarlyDepPicker(cell.dataset.amIso, cell.dataset.amPid);
  });

  // Drag sur les slots H.supp.
  const otDragCtx = { active: false, iso: null, pid: null, zone: 'evening', startSlot: 0, curSlot: 0, _preview: 0 };
  function otApplyDrag(slot) {
    if (!otDragCtx.active) return;
    otDragCtx.curSlot = slot;
    const maxSlot = Math.max(otDragCtx.startSlot, slot);
    document
      .querySelectorAll(`.week-ot-slot[data-ot-iso="${otDragCtx.iso}"][data-ot-zone="${otDragCtx.zone}"]`)
      .forEach((el) => {
        el.classList.toggle('drag-preview', parseInt(el.dataset.otSlot, 10) <= maxSlot);
      });
    otDragCtx._preview = maxSlot + 1;
  }
  document.addEventListener('mousedown', (e) => {
    const slot = e.target.closest('.week-ot-slot.interactive');
    if (!slot) return;
    e.preventDefault();
    otDragCtx.active = true;
    otDragCtx.iso = slot.dataset.otIso;
    otDragCtx.pid = slot.dataset.otPid;
    otDragCtx.zone = slot.dataset.otZone || 'evening';
    otDragCtx.startSlot = parseInt(slot.dataset.otSlot, 10);
    otDragCtx.curSlot = otDragCtx.startSlot;
    otDragCtx._preview = otDragCtx.startSlot + 1;
    otApplyDrag(otDragCtx.startSlot);
  });
  document.addEventListener('mousemove', (e) => {
    if (!otDragCtx.active) return;
    const slot = e.target.closest('.week-ot-slot.interactive');
    if (slot && slot.dataset.otIso === otDragCtx.iso && slot.dataset.otZone === otDragCtx.zone)
      otApplyDrag(parseInt(slot.dataset.otSlot, 10));
  });
  document.addEventListener('mouseup', () => {
    if (!otDragCtx.active) return;
    otDragCtx.active = false;
    const newMins = (otDragCtx._preview || 0) * 15;
    _snapshotBeforeChange();
    if (otDragCtx.zone === 'lunch') setLunchOtMins(otDragCtx.iso, otDragCtx.pid, newMins);
    else setWeekOtMins(otDragCtx.iso, otDragCtx.pid, newMins);
    _saveData();
    renderWeekViewASV();
  });

  document.addEventListener('click', (e) => {
    const viewKey = calViewKeyOfEventTarget(e.target);
    if (!viewKey) return;

    if (e.target.id === `cal-prev-${viewKey}`) return changeMonth(viewKey, -1);
    if (e.target.id === `cal-next-${viewKey}`) return changeMonth(viewKey, 1);
    if (e.target.id === `cal-today-${viewKey}`) return goToToday(viewKey);
    if (e.target.id === `cal-clear-month-${viewKey}`) {
      openClearMonthModal(viewKey, store.CAL_VIEWS[viewKey].navState.month);
      return;
    }
    if (e.target.id === `cal-undo-${viewKey}`) return _undoLastAction();
    if (e.target.id === `cal-print-${viewKey}`) return openMonthPrintPopup(viewKey);

    const commentBtn = e.target.closest('[data-action="comment"]');
    if (commentBtn) {
      openDayCommentPopover(commentBtn.dataset.date, viewKey);
      return;
    }

    const editBtn = e.target.closest('[data-action="edit-day"]');
    if (editBtn) {
      openDaySidebar(editBtn.dataset.date, viewKey);
      return;
    }

    const overtimeBtn = e.target.closest('[data-action="overtime-day"]');
    if (overtimeBtn) {
      openOvertimeDayPopover(overtimeBtn.dataset.date, store.CAL_VIEWS[viewKey].people, viewKey);
      return;
    }
  });
}

export {
  setupCalendar,
  cellRenderInfo,
  cellAriaLabel,
  updateCellDOM,
  updateHalfDOM,
  buildCalendarGrid,
  buildWeekGrid,
  buildOvertimeRowCells,
  buildLegendColors,
  buildLegend,
  renderCalendarView,
  changeMonth,
  goToToday,
  openDaySidebar,
  openAbsenceLabelPopover,
  openAbsenceRangePopover,
  initCalendarInteractions,
  cycleCellAndSave,
  buildCalendarToolbar,
  buildSignaturePanelHtml,
  buildPrintSignatureStatusHtml,
  adminRequestSignature,
  requestSignatureEmail,
  calViewKeyOfEventTarget,
  clearMonth,
  openClearMonthModal,
};
