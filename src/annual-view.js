import { PEOPLE, WEEKDAY_NAMES, MONTH_SHORT } from './config.js';
import { escapeHTML, formatNum, daysInMonth, isSunday, fmtISO, isoWeekday, holidayName, formatFR } from './utils.js';
import { store } from './store.js';
import { isASVPerson, getSlotState, getSlotLabel, getLeaveDecision, getOvertimeHours, getDayComment, isClinicClosed } from './slots.js';

let _switchSubPage, _switchView, _openDaySidebar, _saveViewState, _buildLegendColors, _GROUP_VIEWS;
export function setupAnnualView({ switchSubPage, switchView, openDaySidebar, saveViewState, buildLegendColors, GROUP_VIEWS }) {
  _switchSubPage    = switchSubPage;
  _switchView       = switchView;
  _openDaySidebar   = openDaySidebar;
  _saveViewState    = saveViewState;
  _buildLegendColors = buildLegendColors;
  _GROUP_VIEWS      = GROUP_VIEWS;
}

export function stateLabel(iso, personId, slot){
  const state = getSlotState(iso, personId, slot);
  if(state === 'present') return 'Présent';
  if(state === 'absent'){
    const l = getSlotLabel(iso, personId, slot);
    if(isASVPerson(personId)){
      const decision = getLeaveDecision(iso, personId, slot) || 'pending';
      if(decision === 'pending') return `Demande de congé en attente${l?' ('+escapeHTML(l)+')':''}`;
      if(decision === 'rejected') return 'Congé refusé — voir un vétérinaire';
      return `Congé approuvé${l?' ('+escapeHTML(l)+')':''}`;
    }
    return l ? `Absent (${escapeHTML(l)})` : 'Absent';
  }
  return '—';
}

// Couleur d'une demi-journée pour la heatmap : présent = couleur de la personne, absent =
// rouge (congé vétérinaire ou ASV approuvé), demande ASV en attente = cyan, refusée =
// gris, vide = blanc.
// Reprend exactement les mêmes couleurs que le calendrier mensuel (cellRenderInfo).
export function heatmapSlotColor(person, iso, slot){
  const state = getSlotState(iso, person.id, slot);
  if(state === 'present') return person.present.bg;
  if(state === 'absent'){
    if(isASVPerson(person.id)){
      const decision = getLeaveDecision(iso, person.id, slot) || 'pending';
      if(decision === 'pending') return 'var(--color-leave-pending)';
      if(decision === 'rejected') return 'var(--color-leave-rejected)';
    }
    return 'var(--color-absent)';
  }
  return '#ffffff';
}

export function buildHeatmap(year, people = PEOPLE){
  const todayISO = fmtISO(new Date());
  const dayNums = Array.from({length:31}, (_,i)=>`<th class="hm-daynum">${i+1}</th>`).join('');

  let rows = '';
  for(let month=0; month<12; month++){
    const nbDays = daysInMonth(year, month);

    // Sous-ligne jours de la semaine pour ce mois
    let wdCols = '';
    for(let day=1; day<=31; day++){
      if(day > nbDays){ wdCols += `<td class="hm-wd-cell hm-empty"></td>`; continue; }
      const date = new Date(year, month, day);
      const iso = fmtISO(date);
      const wd = isoWeekday(date);
      const isSat = wd === 5, isSun = wd === 6;
      const isToday = iso === todayISO;
      wdCols += `<td class="hm-wd-cell${isSun?' hm-sun':isSat?' hm-sat':''}${isToday?' hm-today':''}">` +
        `${WEEKDAY_NAMES[wd].slice(0,2)}</td>`;
    }

    rows += `<tr class="hm-wd-row">` +
      `<th class="hm-month-lbl" rowspan="${people.length+1}">${MONTH_SHORT[month]}</th>` +
      `<th class="hm-person-lbl hm-wd-lbl"></th>` +
      wdCols + `</tr>`;

    people.forEach(person=>{
      let cells = '';
      for(let day=1; day<=31; day++){
        if(day > nbDays){
          cells += `<td class="hm-day-td"><div class="heatmap-cell hm-empty"></div></td>`;
          continue;
        }
        const date = new Date(year, month, day);
        const iso = fmtISO(date);
        const wd = isoWeekday(date);
        const isSun = wd === 6;
        const isToday = iso === todayISO;

        if(isSun){
          cells += `<td class="hm-day-td${isToday?' hm-today':''}">` +
            `<div class="heatmap-cell hm-sun" title="${formatFR(iso)} — Dimanche"></div></td>`;
          continue;
        }

        const clinicClosed = isClinicClosed(iso);
        const mState = getSlotState(iso, person.id, 'M');
        const amState = getSlotState(iso, person.id, 'AM');
        const colorM = heatmapSlotColor(person, iso, 'M');
        const colorAM = heatmapSlotColor(person, iso, 'AM');
        const bgStyle = mState === amState
          ? `background:${colorM};`
          : `background:linear-gradient(to bottom,${colorM} 50%,${colorAM} 50%);`;
        const hName = holidayName(iso);
        const extraStyle = hName ? 'outline:2px solid var(--color-holiday);outline-offset:-2px;' : '';
        const overtime = getOvertimeHours(iso, person.id);
        const isAbsent = mState === 'absent' || amState === 'absent';
        const label = isAbsent ? (getSlotLabel(iso, person.id, 'M') || getSlotLabel(iso, person.id, 'AM') || '') : '';

        // Fusion visuelle des congés : vérification voisins dans le même mois (en sautant dim)
        let mergeClass = '';
        if(isAbsent){
          let pd = day - 1;
          while(pd >= 1 && isoWeekday(new Date(year,month,pd)) === 6) pd--;
          let nd = day + 1;
          while(nd <= nbDays && isoWeekday(new Date(year,month,nd)) === 6) nd++;
          const prevAbs = pd >= 1 && (()=>{
            const pi = fmtISO(new Date(year,month,pd));
            return getSlotState(pi,person.id,'M')==='absent' || getSlotState(pi,person.id,'AM')==='absent';
          })();
          const nextAbs = nd <= nbDays && (()=>{
            const ni = fmtISO(new Date(year,month,nd));
            return getSlotState(ni,person.id,'M')==='absent' || getSlotState(ni,person.id,'AM')==='absent';
          })();
          if(prevAbs && nextAbs) mergeClass = ' hm-leave-mid';
          else if(prevAbs) mergeClass = ' hm-leave-end';
          else if(nextAbs) mergeClass = ' hm-leave-start';
        }

        const title = `${formatFR(iso)}${hName?' — '+hName:''} — Matin : ${stateLabel(iso,person.id,'M')} · Après-midi : ${stateLabel(iso,person.id,'AM')}${label?' ('+label+')':''}${overtime>0?' · +'+formatNum(overtime)+'h sup.':''}${clinicClosed?' · 🔒 Clinique fermée':''}`;
        const cellCls = `heatmap-cell${mergeClass}${clinicClosed?' hm-clinic-closed':''}${isToday?' hm-today':''}`;

        cells += `<td class="hm-day-td${isToday?' hm-today':''}">` +
          `<div class="${cellCls}" data-date="${iso}" style="${bgStyle}${extraStyle}" ` +
          `title="${escapeHTML(title)}" tabindex="0" role="button" aria-label="Détail du ${formatFR(iso)}"></div></td>`;
      }

      rows += `<tr class="hm-person-row">` +
        `<th class="hm-person-lbl" style="color:${person.color}">${person.short}</th>` +
        cells + `</tr>`;
    });

    if(month < 11) rows += `<tr class="hm-sep"><td colspan="33"></td></tr>`;
  }

  return `
    <div class="heatmap-wrap">
      <table class="heatmap-table">
        <colgroup>
          <col class="col-month">
          <col class="col-label">
          ${'<col class="col-day">'.repeat(31)}
        </colgroup>
        <thead>
          <tr class="hm-header-row">
            <th class="hm-corner"></th>
            <th class="hm-corner hm-corner-2"></th>
            ${dayNums}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// Popover de détail jour — partagé par vétérinaires et ASV.
// Le bouton « Éditer ce jour » saute dans le calendrier mensuel via les callbacks injectés.
export function openAnnualDayDetail(iso, people, viewKey){
  const backdrop = document.getElementById('popover-backdrop');
  const box = document.getElementById('popover-box');
  const hName = holidayName(iso);
  const comment = getDayComment(iso);
  const personRows = people.map(p=>`
    <p style="font-size:13px;margin:5px 0;"><strong style="color:${p.color}">${p.short}</strong> — Matin : ${stateLabel(iso,p.id,'M')} · Après-midi : ${stateLabel(iso,p.id,'AM')}</p>
  `).join('');
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
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#popover-cancel').onclick = close;
  box.querySelector('#popover-edit').onclick = ()=>{
    close();
    const month = parseInt(iso.split('-')[1], 10) - 1;
    store.CAL_VIEWS[viewKey].navState.month = month;
    const group = viewKey.startsWith('asv') ? 'asv' : 'vets';
    _switchSubPage(group, viewKey.endsWith('forecast') ? 'forecast' : 'calendar');
    _switchView(group);
    setTimeout(()=> _openDaySidebar(iso, viewKey), 50);
  };
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };
}

// Sous-page "Vue annuelle" d'un onglet groupé — factorisée pour vétérinaires et ASV.
export function renderAnnualViewForGroup(group){
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
      <button data-mode="current" class="${mode==='current'?'active':''}">${store.CAL_VIEWS[g.calendarViewKey].year}</button>
      <button data-mode="forecast" class="${mode==='forecast'?'active':''}">${store.CAL_VIEWS[g.forecastViewKey].year}</button>
    </div>
    <div class="card" style="padding:14px;">${buildHeatmap(cfg.year, cfg.people)}</div>
    <div class="legend" style="margin-top:12px;padding:10px 16px;">${_buildLegendColors(cfg.people)}</div>
  `;
  container.querySelector(`#${group}-annual-year-toggle`).addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    store.annualYearState[group] = btn.dataset.mode;
    renderAnnualViewForGroup(group);
    _saveViewState();
  });
  container.querySelectorAll('.heatmap-cell[data-date]').forEach(cell=>{
    cell.addEventListener('click', ()=> openAnnualDayDetail(cell.dataset.date, cfg.people, viewKey));
    cell.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openAnnualDayDetail(cell.dataset.date, cfg.people, viewKey); }
    });
  });
}
