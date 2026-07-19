import { PEOPLE, WEEKDAY_NAMES, MONTH_SHORT } from './config.js';
import { escapeHTML, formatNum, daysInMonth, isSunday, fmtISO, isoWeekday, holidayName, formatFR } from './utils.js';
import { store } from './store.js';
import {
  isASVPerson,
  getSlotState,
  getSlotLabel,
  getLeaveDecision,
  getOvertimeHours,
  getDayComment,
  isClinicClosed,
} from './slots.js';

let _switchSubPage, _switchView, _openDaySidebar, _saveViewState, _buildLegendColors, _GROUP_VIEWS;
export function setupAnnualView({
  switchSubPage,
  switchView,
  openDaySidebar,
  saveViewState,
  buildLegendColors,
  GROUP_VIEWS,
}) {
  _switchSubPage = switchSubPage;
  _switchView = switchView;
  _openDaySidebar = openDaySidebar;
  _saveViewState = saveViewState;
  _buildLegendColors = buildLegendColors;
  _GROUP_VIEWS = GROUP_VIEWS;
}

export function stateLabel(iso, personId, slot) {
  const state = getSlotState(iso, personId, slot);
  if (state === 'present') return 'Présent';
  if (state === 'absent') {
    const l = getSlotLabel(iso, personId, slot);
    if (isASVPerson(personId)) {
      const decision = getLeaveDecision(iso, personId, slot) || 'pending';
      if (decision === 'pending') return `Demande de congé en attente${l ? ' (' + escapeHTML(l) + ')' : ''}`;
      if (decision === 'rejected') return 'Congé refusé — voir un vétérinaire';
      return `Congé approuvé${l ? ' (' + escapeHTML(l) + ')' : ''}`;
    }
    return l ? `Absent (${escapeHTML(l)})` : 'Absent';
  }
  return '—';
}

// Couleur d'une demi-journée pour la heatmap : présent = couleur de la personne, absent =
// rouge (congé vétérinaire ou ASV approuvé), demande ASV en attente = cyan, refusée =
// gris, vide = blanc.
// Reprend exactement les mêmes couleurs que le calendrier mensuel (cellRenderInfo).
export function heatmapSlotColor(person, iso, slot) {
  const state = getSlotState(iso, person.id, slot);
  if (state === 'present') return '#6EE7A0';
  if (state === 'absent') {
    if (isASVPerson(person.id)) {
      const decision = getLeaveDecision(iso, person.id, slot) || 'pending';
      if (decision === 'pending') return 'var(--color-leave-pending)';
      if (decision === 'rejected') return 'var(--color-leave-rejected)';
    }
    return 'var(--color-absent)';
  }
  return '#ffffff';
}

export function buildHeatmap(year, people = PEOPLE) {
  const todayISO = fmtISO(new Date());

  let rows = '';
  for (let month = 0; month < 12; month++) {
    const nbDays = daysInMonth(year, month);

    // Row 1 : numéros de jours — mlbl couvre les 2 lignes d'en-tête
    let dnCells = '';
    for (let d = 1; d <= 31; d++) {
      dnCells += d <= nbDays ? `<td class="hm1-dn">${d}</td>` : '<td></td>';
    }
    rows += `<tr><td class="hm1-mlbl" rowspan="2">${MONTH_SHORT[month]}</td>${dnCells}</tr>`;

    // Row 2 : lettres jour de semaine (col 1 occupée par rowspan)
    let wdCells = '';
    for (let d = 1; d <= 31; d++) {
      if (d > nbDays) {
        wdCells += '<td></td>';
        continue;
      }
      const wd = isoWeekday(new Date(year, month, d));
      const cls = wd === 6 ? ' hm1-wd-sun' : wd === 5 ? ' hm1-wd-sat' : '';
      wdCells += `<td class="hm1-wd${cls}">${WEEKDAY_NAMES[wd].slice(0, 2)}</td>`;
    }
    rows += `<tr>${wdCells}</tr>`;

    // Lignes par personne
    people.forEach((person) => {
      // Retourne vrai si le jour dd est un jour ouvré absent (weekends brisent les runs)
      const isAbsDay = (dd) => {
        if (dd < 1 || dd > nbDays) return false;
        const dt = new Date(year, month, dd);
        const w = isoWeekday(dt);
        if (w === 5 || w === 6) return false;
        const i = fmtISO(dt);
        return getSlotState(i, person.id, 'M') === 'absent' || getSlotState(i, person.id, 'AM') === 'absent';
      };

      // Type d'absence → code couleur identique à la vue mensuelle
      const absType = (iso) => {
        const lbl = getSlotLabel(iso, person.id, 'M') || getSlotLabel(iso, person.id, 'AM') || '';
        const lc = lbl.toLowerCase().trim();
        if (lc === 'repos' || lc === 'repos planifié' || lc === 'non travaillé') return 'off';
        if (isASVPerson(person.id)) {
          const dec = getLeaveDecision(iso, person.id, 'M') || getLeaveDecision(iso, person.id, 'AM') || 'pending';
          if (dec === 'rejected') return 'rejected';
          if (dec === 'pending') return 'pending';
        }
        return '';
      };

      // Pré-calcul : runs d'absence avec label → colspan pour centrer le motif
      const runColspans = new Map(); // dd → { runLen, label, type }
      const absorbedDays = new Set();
      for (let dd = 1; dd <= nbDays; dd++) {
        if (!isAbsDay(dd)) continue;
        if (isAbsDay(dd - 1)) continue; // pas un début de run
        const iso0 = fmtISO(new Date(year, month, dd));
        let lbl0 = getSlotLabel(iso0, person.id, 'M') || getSlotLabel(iso0, person.id, 'AM') || '';
        // Si lundi sans label : le label est souvent sur le samedi précédent (1er jour absent du run).
        // buildRun inclut les samedis alors que isAbsDay les exclut → chercher en arrière.
        if (!lbl0 && isoWeekday(new Date(year, month, dd)) === 0) {
          const satD = dd - 2;
          if (satD >= 1 && isoWeekday(new Date(year, month, satD)) === 5) {
            const isoSat = fmtISO(new Date(year, month, satD));
            const satAbs =
              getSlotState(isoSat, person.id, 'M') === 'absent' ||
              getSlotState(isoSat, person.id, 'AM') === 'absent';
            if (satAbs) lbl0 = getSlotLabel(isoSat, person.id, 'M') || getSlotLabel(isoSat, person.id, 'AM') || '';
          }
        }
        if (!lbl0) continue;
        const type0 = absType(iso0);
        let runLen = 1;
        let nd = dd + 1;
        while (nd <= nbDays && isAbsDay(nd)) { runLen++; nd++; }
        if (runLen > 1) {
          runColspans.set(dd, { runLen, label: lbl0, type: type0 });
          for (let i = dd + 1; i < dd + runLen; i++) absorbedDays.add(i);
        }
      }

      let cells = '';
      for (let d = 1; d <= 31; d++) {
        if (absorbedDays.has(d)) continue;
        if (d > nbDays) {
          cells += '<td class="hm1-c hm1-em"></td>';
          continue;
        }
        const date = new Date(year, month, d);
        const iso = fmtISO(date);
        const wd = isoWeekday(date);
        const isToday = iso === todayISO;

        let cls = 'hm1-c';
        let titleSuffix = '';
        let extraAttr = '';
        if (wd === 6) {
          cls += ' hm1-su';
          titleSuffix = ' — Dimanche';
        } else if (wd === 5) {
          cls += ' hm1-we';
          titleSuffix = ' — Samedi';
        } else {
          const mState = getSlotState(iso, person.id, 'M');
          const amState = getSlotState(iso, person.id, 'AM');
          if (mState === 'absent' || amState === 'absent') {
            const label = getSlotLabel(iso, person.id, 'M') || getSlotLabel(iso, person.id, 'AM') || '';
            const prevAbs = isAbsDay(d - 1);
            const nextAbs = isAbsDay(d + 1);
            const tc = absType(iso);
            const typeCls = tc ? ` hm1-type-${tc}` : '';
            if (runColspans.has(d)) {
              const { runLen, label: lbl, type } = runColspans.get(d);
              const tcs = type ? ` hm1-type-${type}` : '';
              cls += ` hm1-abs run-labeled${tcs}`;
              extraAttr = ` colspan="${runLen}" data-lbl="${escapeHTML(lbl)}"`;
              titleSuffix = ` — Absent (${lbl})`;
            } else {
              const runCls =
                prevAbs && nextAbs ? ' run-mid' : !prevAbs && nextAbs ? ' run-start' : prevAbs ? ' run-end' : '';
              cls += ' hm1-abs' + runCls + typeCls;
              titleSuffix = label ? ` — Absent (${label})` : ' — Absent';
              if (label && !prevAbs) extraAttr = ` data-lbl="${escapeHTML(label)}"`;
            }
          } else if (mState === 'present' || amState === 'present') {
            cls += ' hm1-pre';
            titleSuffix = ' — Présent';
          } else {
            cls += ' hm1-em';
          }
          if (isClinicClosed(iso)) cls += ' hm1-cc';
          if (isToday) cls += ' hm1-today';
        }

        cells += `<td class="${cls}" data-date="${iso}"${extraAttr} title="${escapeHTML(formatFR(iso) + titleSuffix)}" tabindex="0" role="button" aria-label="Détail du ${formatFR(iso)}"></td>`;
      }
      rows += `<tr><td class="hm1-plbl" style="color:${person.color}">${person.short}</td>${cells}</tr>`;
    });

    if (month < 11) rows += `<tr class="hm1-sep"><td colspan="32"></td></tr>`;
  }

  return `
    <div class="heatmap-wrap">
      <table class="hm1-table">
        <colgroup>
          <col class="hm1-col-lbl">
          ${'<col class="hm1-col-day">'.repeat(31)}
        </colgroup>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// Popover de détail jour — partagé par vétérinaires et ASV.
// Le bouton « Éditer ce jour » saute dans le calendrier mensuel via les callbacks injectés.
export function openAnnualDayDetail(iso, people, viewKey) {
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const hName = holidayName(iso);
  const comment = getDayComment(iso);
  const personRows = people
    .map(
      (p) => `
    <p style="font-size:13px;margin:5px 0;"><strong style="color:${p.color}">${p.short}</strong> — Matin : ${stateLabel(iso, p.id, 'M')} · Après-midi : ${stateLabel(iso, p.id, 'AM')}</p>
  `
    )
    .join('');
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h4>${formatFR(iso)}${hName ? ` <span class="cal-holiday-badge">Férié</span>` : ''}</h4>
    ${comment ? `<p class="text-muted" style="font-size:12.5px;margin:8px 0;">💬 ${escapeHTML(comment)}</p>` : ''}
    <div style="margin:10px 0;">${personRows}</div>
    <div class="popover-actions">
      <button class="btn" id="popover-cancel">Fermer</button>
      <button class="btn btn-primary" id="popover-edit">Éditer ce jour</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = () => backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-edit').onclick = () => {
    close();
    const month = parseInt(iso.split('-')[1], 10) - 1;
    store.CAL_VIEWS[viewKey].navState.month = month;
    const group = viewKey.startsWith('asv') ? 'asv' : 'vets';
    _switchSubPage(group, viewKey.endsWith('forecast') ? 'forecast' : 'calendar');
    _switchView(group);
    setTimeout(() => _openDaySidebar(iso, viewKey), 50);
  };
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
}

// Sous-page "Vue annuelle" d'un onglet groupé — factorisée pour vétérinaires et ASV.
export function renderAnnualViewForGroup(group) {
  const g = _GROUP_VIEWS[group];
  const container = document.getElementById(g.annualContainer);
  const mode = store.annualYearState[group];
  const viewKey = mode === 'current' ? g.calendarViewKey : g.forecastViewKey;
  const cfg = store.CAL_VIEWS[viewKey];
  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    <h2 class="section-title">Vue Annuelle ${cfg.year} — ${g.label}</h2>
    <p class="section-desc" style="margin-bottom:12px;">Heatmap de présence — cliquez une cellule pour voir le détail du jour.</p>
    <div class="year-toggle" id="${group}-annual-year-toggle" style="margin-bottom:12px;">
      <button data-mode="current" class="${mode === 'current' ? 'active' : ''}">${store.CAL_VIEWS[g.calendarViewKey].year}</button>
      <button data-mode="forecast" class="${mode === 'forecast' ? 'active' : ''}">${store.CAL_VIEWS[g.forecastViewKey].year}</button>
    </div>
    <div class="card" style="padding:14px;">${buildHeatmap(cfg.year, cfg.people)}</div>
    <div class="legend" style="margin-top:12px;padding:10px 16px;">${_buildLegendColors(cfg.people)}</div>
  `;
  container.querySelector(`#${group}-annual-year-toggle`).addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    store.annualYearState[group] = btn.dataset.mode;
    renderAnnualViewForGroup(group);
    _saveViewState();
  });
  container.querySelectorAll('td.hm1-c[data-date]').forEach((cell) => {
    cell.addEventListener('click', () => openAnnualDayDetail(cell.dataset.date, cfg.people, viewKey));
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAnnualDayDetail(cell.dataset.date, cfg.people, viewKey);
      }
    });
  });
}
