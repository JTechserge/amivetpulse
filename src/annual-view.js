import { PEOPLE, WEEKDAY_NAMES, MONTH_SHORT } from './config.js';
import { escapeHTML, formatNum, daysInMonth, isSunday, fmtISO, isoWeekday, holidayName, formatFR } from './utils.js';
import { store } from './store.js';
import { isASVPerson, getSlotState, getSlotLabel, getLeaveDecision, getOvertimeHours, getDayComment } from './slots.js';

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
  const dayHeaderCells = Array.from({length:31}, (_,i)=>`<th>${i+1}</th>`).join('');
  let rows = '';
  for(let month=0; month<12; month++){
    const nbDays = daysInMonth(year, month);
    // Ligne fine "jours de la semaine" propre à ce mois — recalculée à chaque bloc car le
    // 1er d'un mois ne tombe pas forcément le même jour de semaine que le mois suivant.
    let weekdayCols = '';
    for(let day=1; day<=31; day++){
      if(day > nbDays){ weekdayCols += `<td class="heatmap-weekday-cell empty-cell"></td>`; continue; }
      const wd = isoWeekday(new Date(year, month, day));
      weekdayCols += `<td class="heatmap-weekday-cell${wd===6?' is-sunday':wd===5?' is-saturday':''}">${WEEKDAY_NAMES[wd][0]}</td>`;
    }
    rows += `<tr class="heatmap-weekday-row"><th class="heatmap-month-label" rowspan="${people.length+1}">${MONTH_SHORT[month]}</th><th class="heatmap-row-label"></th>${weekdayCols}</tr>`;
    people.forEach(person=>{
      let cols = '';
      for(let day=1; day<=31; day++){
        if(day > nbDays){ cols += `<td><div class="heatmap-cell empty-cell"></div></td>`; continue; }
        const date = new Date(year, month, day);
        const iso = fmtISO(date);
        if(isSunday(date)){
          cols += `<td><div class="heatmap-cell" style="background:var(--color-sunday);cursor:default;" title="${formatFR(iso)} — Fermé"></div></td>`;
          continue;
        }
        const mState = getSlotState(iso, person.id, 'M');
        const amState = getSlotState(iso, person.id, 'AM');
        const colorM = heatmapSlotColor(person, iso, 'M'), colorAM = heatmapSlotColor(person, iso, 'AM');
        let style = mState === amState
          ? `background:${colorM};`
          : `background:linear-gradient(to bottom, ${colorM} 50%, ${colorAM} 50%);`;
        const hName = holidayName(iso);
        if(hName) style += 'box-shadow:0 0 0 2px var(--color-holiday) inset;';
        const overtime = getOvertimeHours(iso, person.id);
        const title = `${formatFR(iso)}${hName?' — '+hName:''} — Matin : ${stateLabel(iso,person.id,'M')} · Après-midi : ${stateLabel(iso,person.id,'AM')}${overtime>0?' · +'+formatNum(overtime)+'h sup.':''}`;
        cols += `<td><div class="heatmap-cell" data-date="${iso}" style="${style}" title="${escapeHTML(title)}" tabindex="0" role="button" aria-label="Détail du ${formatFR(iso)}"></div></td>`;
      }
      rows += `<tr><th class="heatmap-row-label" style="color:${person.color}">${person.short}</th>${cols}</tr>`;
    });
  }
  return `
    <div class="heatmap-wrap">
      <table class="heatmap-table">
        <colgroup><col class="col-month"><col class="col-label">${'<col>'.repeat(31)}</colgroup>
        <thead><tr><th></th><th></th>${dayHeaderCells}</tr></thead>
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
