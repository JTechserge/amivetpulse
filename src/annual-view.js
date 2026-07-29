import { PEOPLE, WEEKDAY_NAMES, MONTH_SHORT, MONTH_NAMES, ASV_PEOPLE } from './config.js';
import { computeLeaveBlocks } from './leave-blocks.js';
import { escapeHTML, daysInMonth, fmtISO, isoWeekday, holidayName, formatFR, formatHHMM, getWeekMondayDate } from './utils.js';
import { store } from './store.js';
import {
  isASVPerson,
  getSlotState,
  getSlotLabel,
  getLeaveDecision,
  getDayComment,
  isClinicClosed,
  getForecastWeek,
  setForecastWeek,
  getForecastSig,
  setForecastSig,
} from './slots.js';
import { showToast } from './ui.js';

const ANNUAL_FULLTIME_HOURS = 1607;
const MAX_CP_WEEKS = 5;

let _switchSubPage, _switchView, _openDaySidebar, _saveViewState, _buildLegendColors, _GROUP_VIEWS;
let _saveData, _snapshotBeforeChange;
export function setupAnnualView({
  switchSubPage,
  switchView,
  openDaySidebar,
  saveViewState,
  buildLegendColors,
  GROUP_VIEWS,
  saveData,
  snapshotBeforeChange,
}) {
  _switchSubPage = switchSubPage;
  _switchView = switchView;
  _openDaySidebar = openDaySidebar;
  _saveViewState = saveViewState;
  _buildLegendColors = buildLegendColors;
  _GROUP_VIEWS = GROUP_VIEWS;
  _saveData = saveData;
  _snapshotBeforeChange = snapshotBeforeChange;
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
      const isPersonASV = isASVPerson(person.id);

      // Retourne vrai si le jour dd est un jour ouvré absent (sam/dim brisent les runs — vétérinaires)
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
        if (isPersonASV && (lc === 'maladie' || lc === 'arrêt maladie' || lc === 'arrêt')) return 'sick';
        if (isPersonASV) {
          const dec = getLeaveDecision(iso, person.id, 'M') || getLeaveDecision(iso, person.id, 'AM') || 'pending';
          if (dec === 'rejected') return 'rejected';
          if (dec === 'pending') return 'pending';
        }
        return '';
      };

      // runColspans : dd → { runLen, label, type }   absorbedDays : Set<dd>
      const runColspans = new Map();
      const absorbedDays = new Set();

      if (isPersonASV) {
        // ASV : blocs calculés par computeLeaveBlocks — même logique que la vue mensuelle
        const vtypeToHm1 = { repos: 'off', sick: 'sick', pending: 'pending', rejected: 'rejected' };
        computeLeaveBlocks(person.id, year, month).forEach((bi, iso) => {
          const d = parseInt(iso.slice(8, 10), 10);
          if (bi.segmentStart) {
            runColspans.set(d, { runLen: bi.spanDays, label: bi.label || '', type: vtypeToHm1[bi.visualType] ?? '' });
          } else {
            absorbedDays.add(d);
          }
        });
      } else {
        // Vétérinaires : propagation du label via super-run (samedis inclus, dimanches traversés)
        const isAbsDayOrSat = (dd) => {
          if (dd < 1 || dd > nbDays) return false;
          if (isoWeekday(new Date(year, month, dd)) === 6) return false;
          const iso = fmtISO(new Date(year, month, dd));
          return getSlotState(iso, person.id, 'M') === 'absent' || getSlotState(iso, person.id, 'AM') === 'absent';
        };

        const superRunLabel = new Map();
        {
          let sp = 1;
          while (sp <= nbDays) {
            if (isoWeekday(new Date(year, month, sp)) === 6) {
              sp++;
              continue;
            }
            if (!isAbsDayOrSat(sp)) {
              sp++;
              continue;
            }
            let prevD = sp - 1;
            while (prevD >= 1 && isoWeekday(new Date(year, month, prevD)) === 6) prevD--;
            if (prevD >= 1 && isAbsDayOrSat(prevD)) {
              sp++;
              continue;
            }
            const isoSp = fmtISO(new Date(year, month, sp));
            const lbl = getSlotLabel(isoSp, person.id, 'M') || getSlotLabel(isoSp, person.id, 'AM') || '';
            if (lbl) {
              const typeSp = absType(isoSp);
              let end = sp,
                ptr = sp + 1;
              while (ptr <= nbDays) {
                if (isoWeekday(new Date(year, month, ptr)) === 6) {
                  ptr++;
                  continue;
                }
                if (!isAbsDayOrSat(ptr)) break;
                end = ptr;
                ptr++;
              }
              for (let d2 = sp; d2 <= end; d2++) {
                if (!isAbsDay(d2)) continue;
                if (isAbsDay(d2 - 1)) continue;
                superRunLabel.set(d2, { label: lbl, type: typeSp });
              }
              sp = end + 1;
            } else {
              sp++;
            }
          }
        }

        for (let dd = 1; dd <= nbDays; dd++) {
          if (!isAbsDay(dd)) continue;
          if (isAbsDay(dd - 1)) continue;
          const iso0 = fmtISO(new Date(year, month, dd));
          const srEntry = superRunLabel.get(dd);
          const lbl0 =
            getSlotLabel(iso0, person.id, 'M') || getSlotLabel(iso0, person.id, 'AM') || (srEntry?.label ?? '');
          if (!lbl0) continue;
          const type0 = srEntry ? srEntry.type : absType(iso0);
          let runLen = 1,
            nd = dd + 1;
          while (nd <= nbDays && isAbsDay(nd)) {
            runLen++;
            nd++;
          }
          if (runLen > 1) {
            runColspans.set(dd, { runLen, label: lbl0, type: type0 });
            for (let i = dd + 1; i < dd + runLen; i++) absorbedDays.add(i);
          }
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
          // Samedi : coloré selon l'état réel (vert=présent, rouge=congé, gris=vide/fermé)
          const mState = getSlotState(iso, person.id, 'M');
          const amState = getSlotState(iso, person.id, 'AM');
          if (mState === 'absent' || amState === 'absent') {
            const label = getSlotLabel(iso, person.id, 'M') || getSlotLabel(iso, person.id, 'AM') || '';
            const tc = absType(iso);
            const typeCls = tc ? ` hm1-type-${tc}` : '';
            cls += ' hm1-abs' + typeCls;
            titleSuffix = label ? ` — Samedi, Congé (${label})` : ' — Samedi, Congé';
          } else if (mState === 'present' || amState === 'present') {
            cls += ' hm1-pre';
            titleSuffix = ' — Samedi, Présent';
          } else {
            cls += ' hm1-we';
            titleSuffix = ' — Samedi';
          }
          if (isClinicClosed(iso)) cls += ' hm1-cc';
          if (isToday) cls += ' hm1-today';
        } else {
          const mState = getSlotState(iso, person.id, 'M');
          const amState = getSlotState(iso, person.id, 'AM');
          if (mState === 'absent' || amState === 'absent') {
            const label = getSlotLabel(iso, person.id, 'M') || getSlotLabel(iso, person.id, 'AM') || '';
            const tc = absType(iso);
            const typeCls = tc ? ` hm1-type-${tc}` : '';
            if (runColspans.has(d)) {
              const { runLen, label: lbl, type } = runColspans.get(d);
              const tcs = type ? ` hm1-type-${type}` : '';
              cls += ` hm1-abs run-labeled${tcs}`;
              if (lbl) {
                extraAttr = ` colspan="${runLen}" data-lbl="${escapeHTML(lbl)}"`;
                titleSuffix = ` — Absent (${lbl})`;
              } else {
                extraAttr = ` colspan="${runLen}"`;
                titleSuffix = ' — Absent';
              }
            } else {
              const prevAbs = !isPersonASV && isAbsDay(d - 1);
              const nextAbs = !isPersonASV && isAbsDay(d + 1);
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

// ── Lot 7 : Prévisionnel ASV ─────────────────────────────────────

// Retourne la liste des lundis ISO de l'année (toutes les semaines qui croisent l'année civile).
function _getYearWeekMondays(year) {
  const result = [];
  // Commencer au lundi de la semaine contenant le 1er janvier
  let d = getWeekMondayDate(new Date(year, 0, 1));
  const limit = new Date(year, 11, 31);
  while (d <= limit) {
    result.push(fmtISO(d));
    d = new Date(d);
    d.setDate(d.getDate() + 7);
  }
  return result;
}

// Construit la grille prévisionnel pour une ASV.
function buildASVForecastSection(pid, year) {
  const p = ASV_PEOPLE.find((a) => a.id === pid);
  const sig = getForecastSig(pid, year);
  const mondays = _getYearWeekMondays(year);

  // Calcul des CP et du total prévu
  let cpUsed = 0,
    totalPlannedH = 0;
  mondays.forEach((m) => {
    const v = getForecastWeek(pid, m);
    if (v === 'CP') cpUsed++;
    else if (v && !isNaN(parseFloat(v))) totalPlannedH += parseFloat(v);
  });
  const cpLeft = MAX_CP_WEEKS - cpUsed;
  const diff = totalPlannedH - ANNUAL_FULLTIME_HOURS;
  const diffSign = diff >= 0 ? '+' : '';
  const diffColor = Math.abs(diff) <= 10 ? '#16A34A' : diff < 0 ? '#DC2626' : '#D97706';

  // Regroupement par mois
  const byMonth = Array.from({ length: 12 }, () => []);
  mondays.forEach((m) => {
    const dt = new Date(m + 'T00:00:00');
    // Associer la semaine au mois où tombe son vendredi (fin de semaine de travail)
    const friday = new Date(dt);
    friday.setDate(friday.getDate() + 4);
    const mo = friday.getFullYear() === year ? friday.getMonth() : (dt.getFullYear() === year ? dt.getMonth() : -1);
    if (mo >= 0 && mo <= 11) byMonth[mo].push(m);
  });

  let monthSections = '';
  byMonth.forEach((weeks, mo) => {
    if (!weeks.length) return;
    let monthTotal = 0;
    let weekRows = '';
    weeks.forEach((m) => {
      const v = getForecastWeek(pid, m) || '';
      const isCP = v === 'CP';
      if (isCP) monthTotal += 0;
      else if (v) monthTotal += parseFloat(v) || 0;
      const endDt = new Date(m + 'T00:00:00');
      endDt.setDate(endDt.getDate() + 4); // vendredi
      const range = `${new Date(m + 'T00:00:00').getDate()} – ${endDt.getDate()} ${MONTH_SHORT[endDt.getMonth()]}`;
      weekRows += `<tr>
        <td style="font-size:11px;color:#666;white-space:nowrap;padding:3px 6px;">${range}</td>
        <td style="padding:3px 6px;">
          <input class="forecast-h-input" type="number" min="0" max="60" step="0.5"
            data-fpid="${pid}" data-fmonday="${m}"
            value="${isCP ? '' : escapeHTML(v)}"
            placeholder="h"
            style="width:56px;text-align:center;font-size:13px;border:1px solid var(--color-border);border-radius:4px;padding:2px 4px;background:${isCP ? '#FEF3C7' : 'var(--color-input-bg, #fff)'};"
            ${isCP ? 'disabled' : ''}>
        </td>
        <td style="padding:3px 8px;">
          <button class="forecast-cp-btn" data-fpid="${pid}" data-fmonday="${m}"
            title="${isCP ? 'Retirer le marqueur CP' : 'Marquer cette semaine comme CP'}"
            style="font-size:11px;padding:2px 8px;border:1px solid ${isCP ? '#F59E0B' : 'var(--color-border)'};border-radius:4px;background:${isCP ? '#FEF3C7' : 'transparent'};cursor:pointer;font-weight:${isCP ? '700' : '400'};">
            ${isCP ? '✓ CP' : 'CP'}
          </button>
        </td>
      </tr>`;
    });
    monthSections += `
      <div style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
          <strong style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;">${MONTH_NAMES[mo]}</strong>
          <span style="font-size:11px;color:#666;">Total : <strong>${formatHHMM(monthTotal)}</strong></span>
        </div>
        <table style="border-collapse:collapse;width:100%;max-width:320px;">
          <tbody>${weekRows}</tbody>
        </table>
      </div>`;
  });

  const sigHtml = sig
    ? `<div style="font-size:11px;color:#16A34A;padding:8px 12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;">
        ✅ Prévisionnel signé par <strong>${escapeHTML(sig.signedBy)}</strong> le ${new Date(sig.signedAt).toLocaleDateString('fr-FR')}.
        <button class="forecast-unsign-btn" data-fpid="${pid}" data-fyear="${year}" style="font-size:11px;margin-left:8px;padding:2px 6px;border:1px solid #BBF7D0;border-radius:4px;background:transparent;cursor:pointer;color:#15803D;">Réinitialiser</button>
      </div>`
    : `<button class="forecast-sign-btn" data-fpid="${pid}" data-fyear="${year}"
        style="padding:7px 16px;background:var(--color-primary);color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">
        ✍️ Valider le prévisionnel ${year}
      </button>`;

  return `
    <div class="card forecast-asv-section" data-forecast-pid="${pid}" style="padding:16px 20px;margin-bottom:20px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <h3 style="font-size:15px;font-weight:700;color:${p?.color || 'inherit'};margin:0;">${escapeHTML(p?.name || p?.short || pid)}</h3>
        <div style="display:flex;gap:16px;align-items:center;font-size:12px;">
          <span>CP : <strong>${cpUsed}/${MAX_CP_WEEKS}</strong> <span style="color:${cpLeft < 0 ? '#DC2626' : cpLeft === 0 ? '#D97706' : '#666'};">(${cpLeft >= 0 ? cpLeft + ' restantes' : Math.abs(cpLeft) + ' en trop'})</span></span>
          <span>Total prévu : <strong>${formatHHMM(totalPlannedH)}</strong> / ${ANNUAL_FULLTIME_HOURS}h</span>
          <span style="color:${diffColor};font-weight:700;">${diffSign}${formatHHMM(Math.abs(diff))}${diff >= 0 ? ' ✓' : ' ▼'}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px 20px;">
        ${monthSections}
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--color-border);">
        ${sigHtml}
      </div>
    </div>`;
}

// Construit la page complète du prévisionnel ASV pour l'année N+1.
function buildASVForecastPage(year, container) {
  const sections = ASV_PEOPLE.map((p) => buildASVForecastSection(p.id, year)).join('');
  // eslint-disable-next-line no-unsanitized/property
  container.querySelector('#asv-forecast-sections').innerHTML = sections;

  // Liens événements
  container.querySelectorAll('.forecast-h-input').forEach((inp) => {
    inp.addEventListener('change', () => {
      const { fpid, fmonday } = inp.dataset;
      const val = parseFloat(inp.value);
      _snapshotBeforeChange();
      setForecastWeek(fpid, fmonday, isNaN(val) ? null : val);
      _saveData(false);
      buildASVForecastPage(year, container);
    });
  });
  container.querySelectorAll('.forecast-cp-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { fpid, fmonday } = btn.dataset;
      const isCP = getForecastWeek(fpid, fmonday) === 'CP';
      _snapshotBeforeChange();
      setForecastWeek(fpid, fmonday, isCP ? null : 'CP');
      _saveData(false);
      buildASVForecastPage(year, container);
    });
  });
  container.querySelectorAll('.forecast-sign-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { fpid, fyear } = btn.dataset;
      const userName = store.currentUser?.email || store.currentUser?.person_id || 'Inconnu';
      _snapshotBeforeChange();
      setForecastSig(fpid, parseInt(fyear, 10), { signedAt: new Date().toISOString(), signedBy: userName });
      _saveData();
      buildASVForecastPage(year, container);
      showToast('Prévisionnel signé ✓', '✍️');
    });
  });
  container.querySelectorAll('.forecast-unsign-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { fpid, fyear } = btn.dataset;
      _snapshotBeforeChange();
      setForecastSig(fpid, parseInt(fyear, 10), null);
      _saveData(false);
      buildASVForecastPage(year, container);
    });
  });
}

// Sous-page "Vue annuelle" d'un onglet groupé — factorisée pour vétérinaires et ASV.
export function renderAnnualViewForGroup(group) {
  const g = _GROUP_VIEWS[group];
  const container = document.getElementById(g.annualContainer);
  const mode = store.annualYearState[group];
  const viewKey = mode === 'current' ? g.calendarViewKey : g.forecastViewKey;
  const cfg = store.CAL_VIEWS[viewKey];

  // Lot 7 : page Prévisionnel ASV spécialisée
  if (group === 'asv' && mode === 'forecast') {
    // eslint-disable-next-line no-unsanitized/property
    container.innerHTML = `
      <h2 class="section-title">Prévisionnel ${cfg.year} — ASV</h2>
      <p class="section-desc" style="margin-bottom:12px;">Planifiez vos heures et congés payés semaine par semaine. Cible annuelle : ${ANNUAL_FULLTIME_HOURS}h.</p>
      <div class="year-toggle" id="${group}-annual-year-toggle" style="margin-bottom:16px;">
        <button data-mode="current" class="${mode === 'current' ? 'active' : ''}">${store.CAL_VIEWS[g.calendarViewKey].year} — Réalisé</button>
        <button data-mode="forecast" class="${mode === 'forecast' ? 'active' : ''}">${cfg.year} — Prévisionnel</button>
      </div>
      <div id="asv-forecast-sections"></div>
    `;
    buildASVForecastPage(cfg.year, container);
    container.querySelector(`#${group}-annual-year-toggle`).addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      store.annualYearState[group] = btn.dataset.mode;
      renderAnnualViewForGroup(group);
      _saveViewState();
    });
    return;
  }

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
