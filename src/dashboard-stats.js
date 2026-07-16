import { PEOPLE, ASV_PEOPLE, allPeople, SLOTS,
  getCurrentYear, personOf,
  ASV_STD_SAT_CARLA,
  ANNUAL_FULLTIME_HOURS, HALFDAY_HOURS, WEEKLY_MAX_HOURS,
  MONTH_NAMES, MONTH_SHORT,
} from './config.js';
import { escapeHTML, formatNum, formatHHMM, signedHHMM, roundTo15min, daysInMonth,
  isSunday, isSaturday, fmtISO,
  getWeekMondayDate,
} from './utils.js';
import { store } from './store.js';
import { getSlotState, getOvertimeHours, isASVPerson, getDayNominal, getDayDeficitH, getDayAllOtH } from './slots.js';
import { getSignatureDetail } from './signatures.js';

const today = new Date();

export function computeYearStats(year){
  const stats = {};
  const all = allPeople();
  all.forEach(p=>{
    stats[p.id] = {
      halfDaysByMonth: new Array(12).fill(0),
      absentHalfDaysByMonth: new Array(12).fill(0),
      saturdaysByMonth: new Array(12).fill(0),
      overtimeHoursByMonth: new Array(12).fill(0),
    };
  });
  for(let month=0; month<12; month++){
    const nbDays = daysInMonth(year, month);
    for(let day=1; day<=nbDays; day++){
      const date = new Date(year, month, day);
      if(isSunday(date)) continue;
      const iso = fmtISO(date);
      const saturday = isSaturday(date);
      all.forEach(p=>{
        let presentAny = false;
        SLOTS.forEach(slot=>{
          const state = getSlotState(iso, p.id, slot);
          if(state === 'present'){ stats[p.id].halfDaysByMonth[month]++; presentAny = true; }
          else if(state === 'absent'){ stats[p.id].absentHalfDaysByMonth[month]++; }
        });
        if(saturday && presentAny) stats[p.id].saturdaysByMonth[month]++;
        if(isASVPerson(p.id)){
          const isPresent3=getSlotState(iso,p.id,'M')==='present'||getSlotState(iso,p.id,'AM')==='present';
          if(isPresent3) stats[p.id].overtimeHoursByMonth[month]+=getDayAllOtH(iso,p.id)-getDayDeficitH(iso,p.id)+getOvertimeHours(iso,p.id);
        } else {
          stats[p.id].overtimeHoursByMonth[month]+=getOvertimeHours(iso,p.id);
        }
      });
    }
  }
  all.forEach(p=>{
    const s = stats[p.id];
    s.totalHalfDays = s.halfDaysByMonth.reduce((a,b)=>a+b,0);
    s.totalAbsentHalfDays = s.absentHalfDaysByMonth.reduce((a,b)=>a+b,0);
    s.totalSaturdays = s.saturdaysByMonth.reduce((a,b)=>a+b,0);
    s.totalOvertimeHours = roundTo15min(s.overtimeHoursByMonth.reduce((a,b)=>a+b,0));
    let busiest = 0;
    s.halfDaysByMonth.forEach((v,i)=>{ if(v > s.halfDaysByMonth[busiest]) busiest = i; });
    s.busiestMonth = busiest;
  });
  return stats;
}

export function buildPersonCard(year, personId){
  const person = personOf(personId);
  const stats = computeYearStats(year)[personId];
  const tf = person?.timeFraction ?? 1.0;
  // Cible annuelle : 230 jours × 2 demi-journées × quotité de temps
  const TARGET_HALF_DAYS = Math.round(230 * 2 * tf);
  const targetDays = TARGET_HALF_DAYS / 2;
  // Heures sup/déficit → demi-journées équivalentes (÷ 3.5h)
  const otEquivHalfDays = stats.totalOvertimeHours / HALFDAY_HOURS;
  const adjustedHalfDays = Math.round((stats.totalHalfDays + otEquivHalfDays) * 10) / 10;
  const adjustedDays = Math.round(adjustedHalfDays / 2 * 10) / 10;
  const pct = Math.min(100, TARGET_HALF_DAYS > 0 ? Math.round(adjustedHalfDays / TARGET_HALF_DAYS * 100) : 0);
  const vacationDays = stats.totalAbsentHalfDays / 2;
  const otColor = stats.totalOvertimeHours > 0 ? 'var(--color-success,#16A34A)' : stats.totalOvertimeHours < 0 ? 'var(--color-danger,#DC2626)' : 'var(--color-text-muted)';
  return `
    <div class="card person-card" data-person="${personId}" style="border-top-color:${person.color}">
      <div class="person-card-head">
        <div class="person-avatar" style="background:${person.color}">${person.initial}</div>
        <div><h3 style="font-size:16px;">${person.name}</h3><p class="text-muted" style="font-size:12px;">Bilan ${year}${tf < 1 ? ` — ${Math.round(tf*100)}%` : ''}</p></div>
      </div>
      <div class="stat-row"><span class="stat-label">Jours travaillés (ajusté)</span><span class="stat-value">${formatNum(adjustedDays)} / ${formatNum(targetDays)}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${person.color}"></div></div>
      <div class="stat-row"><span class="stat-label">Demi-journées de présence</span><span class="stat-value">${stats.totalHalfDays}</span></div>
      ${stats.totalOvertimeHours !== 0 ? `<div class="stat-row"><span class="stat-label">Heures supp. / en déficit</span><span class="stat-value" style="color:${otColor}">${signedHHMM(stats.totalOvertimeHours)}</span></div>` : ''}
      <div class="stat-row"><span class="stat-label">Samedis travaillés</span><span class="stat-value big" style="color:${person.color}">${stats.totalSaturdays}</span></div>
      <div class="stat-row"><span class="stat-label">Jours de congés</span><span class="stat-value">${formatNum(vacationDays)}</span></div>
      <div class="stat-row"><span class="stat-label">Mois le plus chargé</span><span class="stat-value">${MONTH_NAMES[stats.busiestMonth]}</span></div>
    </div>
  `;
}

export function buildBarChartSVG(year){
  const stats = computeYearStats(year);
  const dVals = stats.david.halfDaysByMonth.map(h=>h/2);
  const sVals = stats.stephane.halfDaysByMonth.map(h=>h/2);
  const maxVal = Math.max(1, ...dVals, ...sVals);
  const rowH = 30, barH = 10, leftLabelW = 56, chartW = 330, viewW = 470;
  const height = 12*rowH + 6;
  let rows = '';
  for(let m=0; m<12; m++){
    const y = m*rowH + 6;
    const dW = (dVals[m]/maxVal)*chartW;
    const sW = (sVals[m]/maxVal)*chartW;
    rows += `
      <text x="0" y="${y+barH+1}" font-size="11" font-weight="700" fill="#64748B" font-family="Inter,sans-serif">${MONTH_SHORT[m]}</text>
      <rect x="${leftLabelW}" y="${y}" width="${Math.max(dW,1.5)}" height="${barH}" rx="3" fill="${PEOPLE[0].color}"></rect>
      <text x="${leftLabelW+Math.max(dW,1.5)+6}" y="${y+barH-1}" font-size="10" font-weight="700" fill="${PEOPLE[0].color}" font-family="Inter,sans-serif">${formatNum(dVals[m])}</text>
      <rect x="${leftLabelW}" y="${y+barH+3}" width="${Math.max(sW,1.5)}" height="${barH}" rx="3" fill="${PEOPLE[1].color}"></rect>
      <text x="${leftLabelW+Math.max(sW,1.5)+6}" y="${y+2*barH+2}" font-size="10" font-weight="700" fill="${PEOPLE[1].color}" font-family="Inter,sans-serif">${formatNum(sVals[m])}</text>
    `;
  }
  return `<svg viewBox="0 0 ${viewW} ${height}" width="100%" height="${height}" role="img" aria-label="Comparaison des jours travaillés par mois, ${year}">${rows}</svg>`;
}

export function buildRecapTable(year){
  const stats = computeYearStats(year);
  let totalD=0, totalS=0, totalSatD=0, totalSatS=0, rows='';
  for(let m=0; m<12; m++){
    const dDays = stats.david.halfDaysByMonth[m]/2;
    const sDays = stats.stephane.halfDaysByMonth[m]/2;
    const satD = stats.david.saturdaysByMonth[m];
    const satS = stats.stephane.saturdaysByMonth[m];
    totalD+=dDays; totalS+=sDays; totalSatD+=satD; totalSatS+=satS;
    const diff = dDays - sDays;
    const diffClass = diff>0 ? 'ecart-david' : diff<0 ? 'ecart-stephane' : 'ecart-equilibre';
    const diffTxt = diff===0 ? 'Équilibre' : `+${formatNum(Math.abs(diff))} ${diff>0?'David':'Stéphane'}`;
    rows += `<tr><td>${MONTH_NAMES[m]}</td><td>${formatNum(dDays)}</td><td>${formatNum(sDays)}</td><td>${satD}</td><td>${satS}</td><td class="${diffClass}">${diffTxt}</td></tr>`;
  }
  const totalDiff = totalD - totalS;
  const totalDiffClass = totalDiff>0?'ecart-david':totalDiff<0?'ecart-stephane':'ecart-equilibre';
  const totalDiffTxt = totalDiff===0?'Équilibre':`+${formatNum(Math.abs(totalDiff))} ${totalDiff>0?'David':'Stéphane'}`;
  return `
    <div class="recap-table-scroll">
    <table class="recap-table">
      <thead><tr><th>Mois</th><th>David (j)</th><th>Stéphane (j)</th><th>Samedis David</th><th>Samedis Stéphane</th><th>Écart</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td>${formatNum(totalD)}</td><td>${formatNum(totalS)}</td><td>${totalSatD}</td><td>${totalSatS}</td><td class="${totalDiffClass}">${totalDiffTxt}</td></tr></tfoot>
    </table>
    </div>
  `;
}

// --- Variantes ASV (3 personnes) du graphique et du récapitulatif mensuel ---
export function buildBarChartSVGASV(year){
  const stats = computeYearStats(year);
  const series = ASV_PEOPLE.map(p=> stats[p.id].halfDaysByMonth.map(h=>h/2));
  const maxVal = Math.max(1, ...series.flat());
  const barH = 9, gap = 2, rowH = 3*(barH+gap) + 5, leftLabelW = 56, chartW = 300, viewW = 470;
  const height = 12*rowH + 6;
  let rows = '';
  for(let m=0; m<12; m++){
    const yBase = m*rowH + 6;
    rows += `<text x="0" y="${yBase+barH+1}" font-size="11" font-weight="700" fill="#64748B" font-family="Inter,sans-serif">${MONTH_SHORT[m]}</text>`;
    ASV_PEOPLE.forEach((p,i)=>{
      const val = series[i][m];
      const w = (val/maxVal)*chartW;
      const y = yBase + i*(barH+gap);
      rows += `
        <rect x="${leftLabelW}" y="${y}" width="${Math.max(w,1.5)}" height="${barH}" rx="3" fill="${p.color}"></rect>
        <text x="${leftLabelW+Math.max(w,1.5)+6}" y="${y+barH-1}" font-size="9.5" font-weight="700" fill="${p.color}" font-family="Inter,sans-serif">${formatNum(val)}</text>
      `;
    });
  }
  return `<svg viewBox="0 0 ${viewW} ${height}" width="100%" height="${height}" role="img" aria-label="Comparaison des jours travaillés par mois pour les ASV, ${year}">${rows}</svg>`;
}

export function buildRecapTableASV(year){
  const stats = computeYearStats(year);
  const totals = ASV_PEOPLE.map(()=>0);
  let grandTotal = 0, rows = '';
  for(let m=0; m<12; m++){
    const vals = ASV_PEOPLE.map((p,i)=>{
      const d = stats[p.id].halfDaysByMonth[m]/2;
      totals[i] += d;
      return d;
    });
    const monthTotal = vals.reduce((a,b)=>a+b,0);
    grandTotal += monthTotal;
    rows += `<tr><td>${MONTH_NAMES[m]}</td>${vals.map(v=>`<td>${formatNum(v)}</td>`).join('')}<td>${formatNum(monthTotal)}</td></tr>`;
  }
  return `
    <div class="recap-table-scroll">
    <table class="recap-table">
      <thead><tr><th>Mois</th>${ASV_PEOPLE.map(p=>`<th>${p.short} (j)</th>`).join('')}<th>Total ASV (j)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td>${totals.map(t=>`<td>${formatNum(t)}</td>`).join('')}<td>${formatNum(grandTotal)}</td></tr></tfoot>
    </table>
    </div>
  `;
}

// Heures supplémentaires ASV par mois — même structure que le récapitulatif de présence.
export function computeOvertimeStats(year){
  const stats = {};
  ASV_PEOPLE.forEach(p=> stats[p.id] = new Array(12).fill(0));
  for(let month=0; month<12; month++){
    const nbDays = daysInMonth(year, month);
    for(let day=1; day<=nbDays; day++){
      const iso = fmtISO(new Date(year, month, day));
      ASV_PEOPLE.forEach(p=>{ stats[p.id][month] += getOvertimeHours(iso, p.id); });
    }
  }
  return stats;
}

export function getASVTimeFraction(personId){ return personOf(personId)?.timeFraction ?? 1.0; }

export function getASVQuota(personId){
  const p = personOf(personId);
  const f = getASVTimeFraction(personId);
  if(p?.saturdayOnly){
    return {
      annual:  null,
      weekly:  ASV_STD_SAT_CARLA,
      monthly: Math.round(ASV_STD_SAT_CARLA * 52 / 12 * 10) / 10,
    };
  }
  return {
    annual:  Math.round(ANNUAL_FULLTIME_HOURS * f * 10) / 10,
    weekly:  Math.round(35 * f * 100) / 100,
    monthly: Math.round(ANNUAL_FULLTIME_HOURS * f / 12 * 10) / 10,
  };
}

export function computeASVWorkedHours(personId, year, month = null){
  const months = month !== null ? [month] : Array.from({length:12}, (_, i) => i);
  let total = 0;
  for(const m of months){
    const nb = daysInMonth(year, m);
    for(let day = 1; day <= nb; day++){
      const iso = fmtISO(new Date(year, m, day));
      const isPresent = getSlotState(iso, personId, 'M')==='present' || getSlotState(iso, personId, 'AM')==='present';
      if(isPresent) total += getDayNominal(iso, personId) + getDayAllOtH(iso, personId) - getDayDeficitH(iso, personId);
      total += getOvertimeHours(iso, personId);
    }
  }
  return Math.round(total * 10) / 10;
}

// 1 jour de repos planifié ne compte PAS comme jour travaillé
export function computeASVWorkedHoursNew(personId, year, month = null){
  const months = month !== null ? [month] : Array.from({length:12}, (_, i) => i);
  let total = 0;
  for(const m of months){
    const nb = daysInMonth(year, m);
    for(let day = 1; day <= nb; day++){
      const dt = new Date(year, m, day);
      if(dt.getDay() === 0) continue; // dimanche
      const iso = fmtISO(dt);
      const isPresent = getSlotState(iso, personId, 'M')==='present' || getSlotState(iso, personId, 'AM')==='present';
      if(isPresent) total += getDayNominal(iso, personId) + getDayAllOtH(iso, personId) - getDayDeficitH(iso, personId);
      total += getOvertimeHours(iso, personId);
    }
  }
  return Math.round(total * 10) / 10;
}

export function getWeekStart(date){
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function computeASVWorkedHoursWeek(personId, weekStartDate){
  let total = 0;
  for(let d = 0; d < 7; d++){
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + d);
    if(date.getDay() === 0) continue; // dimanche
    const iso = fmtISO(date);
    const isPresent = getSlotState(iso, personId, 'M')==='present' || getSlotState(iso, personId, 'AM')==='present';
    if(isPresent) total += getDayNominal(iso, personId) + getDayAllOtH(iso, personId) - getDayDeficitH(iso, personId);
    total += getOvertimeHours(iso, personId);
  }
  return Math.round(total * 10) / 10;
}

export function buildOvertimeTableASV(year){
  const stats = computeOvertimeStats(year);
  const totals = ASV_PEOPLE.map(()=>0);
  let grandTotal = 0, rows = '';
  for(let m=0; m<12; m++){
    const vals = ASV_PEOPLE.map((p,i)=>{
      const h = stats[p.id][m];
      totals[i] += h;
      return h;
    });
    const monthTotal = vals.reduce((a,b)=>a+b,0);
    grandTotal += monthTotal;
    rows += `<tr><td>${MONTH_NAMES[m]}</td>${vals.map(v=>`<td>${v>0?formatNum(v):'—'}</td>`).join('')}<td>${monthTotal>0?formatNum(monthTotal):'—'}</td></tr>`;
  }
  return `
    <table class="recap-table">
      <thead><tr><th>Mois</th>${ASV_PEOPLE.map(p=>`<th>${p.short} (h)</th>`).join('')}<th>Total ASV (h)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total annuel</td>${totals.map(t=>`<td>${formatNum(t)}</td>`).join('')}<td>${formatNum(grandTotal)}</td></tr></tfoot>
    </table>
  `;
}

// Vue d'ensemble des feuilles de présence signées par mois/ASV, avec annulation possible.
export function buildHoursControlCard(year){
  const cy = today.getFullYear();
  const cm = today.getMonth();
  const weekStart = getWeekStart(today);
  function alertClass(worked, quota){
    if(quota <= 0) return 'ok';
    const r = worked / quota;
    return r > 1 ? 'over' : r >= 0.9 ? 'warn' : 'ok';
  }
  function barPct(worked, quota){ return Math.min(100, quota > 0 ? Math.round(worked / quota * 100) : 0); }
  function alertIcon(cls){ return cls === 'over' ? '🔴' : cls === 'warn' ? '🟡' : '🟢'; }
  function hoursItem(label, worked, quota, cls){
    return `
      <div class="hours-control-item ${cls}">
        <span class="hours-control-label">${label}</span>
        <span class="hours-control-value">${formatNum(worked)}h / ${formatNum(quota)}h ${alertIcon(cls)}</span>
        <div class="hours-progress-bar"><div class="hours-progress-fill" style="width:${barPct(worked,quota)}%;"></div></div>
      </div>`;
  }
  const rows = ASV_PEOPLE.map(p => {
    const q = getASVQuota(p.id);
    const annual  = computeASVWorkedHoursNew(p.id, year, null);
    const monthly = computeASVWorkedHoursNew(p.id, year === cy ? cy : year, year === cy ? cm : cm);
    const weekly  = computeASVWorkedHoursWeek(p.id, weekStart);
    return `
      <div class="hours-control-row">
        <div class="hours-control-name" style="color:${p.color};">${escapeHTML(p.short)}</div>
        <div class="hours-control-fraction">${Math.round(getASVTimeFraction(p.id)*100)}%</div>
        ${hoursItem('Semaine', weekly, q.weekly, alertClass(weekly, q.weekly))}
        ${hoursItem('Mois en cours', monthly, q.monthly, alertClass(monthly, q.monthly))}
        ${hoursItem(`Annuel ${year}`, annual, q.annual, alertClass(annual, q.annual))}
      </div>`;
  }).join('');
  return `
    <div class="card" style="margin-bottom:24px;" id="dash-hours-control-card">
      <h3 style="font-size:16px;margin-bottom:4px;">Contrôle du temps de travail ${year}</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:14px;">Base légale : ${formatNum(ANNUAL_FULLTIME_HOURS)}h/an temps plein (35h/semaine). Heures calculées par poste (O = 8h30, F = 8h15, samedi = 7h00) + H.supp. − départs anticipés.</p>
      <div class="hours-control-grid">${rows}</div>
    </div>
  `;
}

export function buildSignaturesTableASV(year){
  let rows = '';
  for(let m=0; m<12; m++){
    const cells = ASV_PEOPLE.map(p=>{
      const detail = getSignatureDetail(p.id, year, m);
      if(!detail) return '<td class="text-muted">—</td>';
      const signedDate = new Date(detail.signedAt).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
      return `<td>
        <span class="signed-pill">
          ✅ ${escapeHTML(detail.signedName)} <span class="signed-pill-date">(${signedDate})</span>
          <button type="button" class="asv-remove-btn" data-revoke-signature="${p.id}|${year}|${m}" title="Annuler cette signature" aria-label="Annuler cette signature">✕</button>
        </span>
      </td>`;
    });
    rows += `<tr><td>${MONTH_NAMES[m]}</td>${cells.join('')}</tr>`;
  }
  return `
    <table class="recap-table">
      <thead><tr><th>Mois</th>${ASV_PEOPLE.map(p=>`<th>${p.short}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Archive PDF : grille mois × ASV avec statut (signed/rejected) et lien PDF.
// archiveRows : tableau brut de monthly_signatures (toutes statuts confondus).
export function buildPdfArchiveSection(year, archiveRows){
  if(!archiveRows?.length){
    return `<p class="text-muted" style="font-size:13px;">Aucune feuille archivée pour ${year}.</p>`;
  }

  // Index (personId|month) → row
  const idx = new Map();
  archiveRows.forEach(r => idx.set(`${r.person_id}|${r.month}`, r));

  let rows = '';
  for(let m = 0; m < 12; m++){
    const cells = ASV_PEOPLE.map(p => {
      const r = idx.get(`${p.id}|${m}`);
      if(!r) return '<td class="text-muted" style="text-align:center;">—</td>';

      const signedDate = r.signed_at
        ? new Date(r.signed_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Paris' }).replace(',', ' -')
        : '';
      const rejDate = r.rejected_at
        ? new Date(r.rejected_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Paris' }).replace(',', ' -')
        : '';

      if(r.status === 'signed'){
        const pdfBtn = r.pdf_path
          ? `<button class="btn btn-sm pdf-open-btn" data-pdf-path="${escapeHTML(r.pdf_path)}"
               style="font-size:11px;padding:2px 7px;white-space:nowrap;">📄 PDF confirmé — ${signedDate}</button>`
          : '';
        return `<td style="text-align:center;">
          <span style="display:inline-flex;align-items:center;gap:4px;flex-wrap:nowrap;">
            <button type="button" class="asv-remove-btn" data-revoke-signature="${p.id}|${year}|${m}"
              title="Annuler cette signature" aria-label="Annuler cette signature">✕</button>
            ${pdfBtn}
          </span>
        </td>`;
      }
      // rejected
      const pdfBtnRej = r.pdf_path
        ? `<button class="btn btn-sm pdf-open-btn" data-pdf-path="${escapeHTML(r.pdf_path)}"
             style="font-size:11px;padding:2px 7px;white-space:nowrap;color:#B91C1C;border-color:#FECACA;">📄 PDF rejeté${rejDate?` — ${rejDate}`:''}</button>`
        : `<span style="font-size:12px;white-space:nowrap;color:#B91C1C;">PDF rejeté${rejDate?` — ${rejDate}`:''}</span>`;
      return `<td style="text-align:center;">${pdfBtnRej}</td>`;
    });
    rows += `<tr><td>${MONTH_NAMES[m]}</td>${cells.join('')}</tr>`;
  }

  return `
    <div style="overflow-x:auto;">
      <table class="recap-table" style="table-layout:fixed;width:100%;">
        <thead><tr>
          <th style="width:110px;">Mois</th>
          ${ASV_PEOPLE.map(p=>`<th style="text-align:center;">${escapeHTML(p.short)}</th>`).join('')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// --- Sous-page "Heures ASV" : suivi mensuel/annuel du temps de travail vs quota 1607h ---
export function buildDashWeeklyMonthCard(year, month){
  if(!ASV_PEOPLE.length) return '';
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month+1, 0);
  // Toutes les semaines qui touchent ce mois
  const weeks = [];
  let cur = getWeekMondayDate(firstDay);
  while(cur <= lastDay){ weeks.push(new Date(cur)); cur=new Date(cur); cur.setDate(cur.getDate()+7); }

  function weekData(mon, pid){
    let h=0, ot=0;
    for(let d=0;d<6;d++){
      const dt=new Date(mon); dt.setDate(dt.getDate()+d);
      if(dt.getDay() === 0) continue;
      const iso=fmtISO(dt);
      const isPresent=getSlotState(iso,pid,'M')==='present'||getSlotState(iso,pid,'AM')==='present';
      if(!isPresent) continue;
      const nom=getDayNominal(iso,pid);
      const delta=getDayAllOtH(iso,pid)-getDayDeficitH(iso,pid)+getOvertimeHours(iso,pid);
      h+=nom+delta;
      ot+=delta;
    }
    return {h, ot};
  }

  const headers=ASV_PEOPLE.map(p=>{
    const q=getASVQuota(p.id);
    const qLabel = p.saturdayOnly ? `${formatHHMM(ASV_STD_SAT_CARLA)}/sam` : `quota ${formatHHMM(q.weekly)}/sem`;
    return `<th style="text-align:right;padding:6px 10px;">${escapeHTML(p.short)}<br><span class="text-muted" style="font-size:10px;font-weight:400;">${qLabel}</span></th>`;
  }).join('');

  let rows='', monthOT=ASV_PEOPLE.map(()=>0);
  for(const mon of weeks){
    const endW=new Date(mon); endW.setDate(endW.getDate()+5);
    const wLabel=`${mon.getDate()}/${mon.getMonth()+1}–${endW.getDate()}/${endW.getMonth()+1}`;
    const isCurrentWeek = store.weekNavState.mondayISO && fmtISO(mon)===store.weekNavState.mondayISO;
    let weekOver42 = false;
    const cols=ASV_PEOPLE.map((p,i)=>{
      const {h, ot}=weekData(mon,p.id);
      const delta=h>0?roundTo15min(ot):null;
      if(delta!==null) monthOT[i]=roundTo15min(monthOT[i]+delta);
      const dColor=delta===null?'':delta>0?'#16a34a':delta<0?'#ea580c':'var(--color-text-muted)';
      const over42 = !p.saturdayOnly && h >= WEEKLY_MAX_HOURS;
      if(over42) weekOver42 = true;
      return `<td style="text-align:right;padding:5px 10px;">
        ${h>0?`<strong style="${over42?'color:#DC2626;':''}">${over42?'⚠️ ':''}${formatHHMM(h)}</strong>`:'<span class="text-muted">—</span>'}
        ${delta!==null?`<span style="font-size:11px;color:${dColor};margin-left:4px;">${signedHHMM(delta)}</span>`:''}
      </td>`;
    }).join('');
    rows+=`<tr style="${isCurrentWeek?'background:#f0fdf4;':weekOver42?'background:#FEF2F2;':''}"><td style="padding:5px 10px;font-size:12px;white-space:nowrap;color:${isCurrentWeek?'var(--color-primary)':weekOver42?'#DC2626':'inherit'};font-weight:${isCurrentWeek||weekOver42?'700':'400'};">S ${wLabel}${weekOver42?' ⚠️':''}</td>${cols}</tr>`;
  }

  // Ligne total mois avec écart et équivalent jours
  const totalCols=ASV_PEOPLE.map((p,i)=>{
    const ot=monthOT[i];
    const tf=getASVTimeFraction(p.id);
    const dayEq=ot!==0?Math.round(ot/(7*tf)*10)/10:null;
    const color=ot>0?'#16a34a':ot<0?'#ea580c':'var(--color-text-muted)';
    return `<td style="text-align:right;padding:7px 10px;font-weight:700;">
      ${ot!==0?`<span style="color:${color}">${signedHHMM(ot)}</span>
      <span class="text-muted" style="font-size:11px;"> (${dayEq>=0?'+':''}${formatNum(dayEq)}j)</span>`:'<span class="text-muted">Équilibre</span>'}
    </td>`;
  }).join('');

  return `<div class="card" style="margin-bottom:20px;overflow-x:auto;">
    <h3 style="font-size:16px;margin-bottom:10px;">Heures par semaine — ${MONTH_NAMES[month]} ${year}</h3>
    <table class="recap-table" style="min-width:400px;">
      <thead><tr><th style="text-align:left;">Semaine</th>${headers}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td style="font-weight:800;padding:7px 10px;">Écart mensuel</td>
        ${totalCols}
      </tr></tfoot>
    </table>
    <p class="text-muted" style="font-size:11px;margin-top:8px;">Écart = heures travaillées − quota hebdomadaire. Équivalent en jours = écart ÷ ${formatNum(7)} h/jour (temps plein).</p>
  </div>`;
}

// ── Carte 1 : Modulation annuelle ──────────────────────────────
export function buildASVModulationCard(year){
  const cy = getCurrentYear();
  const cm = today.getMonth();
  const modulated = ASV_PEOPLE.filter(p => !p.archived && !p.saturdayOnly);
  const carlaList  = ASV_PEOPLE.filter(p => !p.archived && p.saturdayOnly);

  const rows = modulated.map(p => {
    const q      = getASVQuota(p.id);
    const worked = computeASVWorkedHoursNew(p.id, year, null);
    const target = q.annual;
    const pct    = target ? Math.min(100, Math.round(worked / target * 100)) : 0;
    const barC   = pct > 100 ? '#DC2626' : pct >= 90 ? '#F59E0B' : p.color;
    const icon   = pct > 100 ? '🔴' : pct >= 90 ? '🟡' : '🟢';
    const tfLabel = p.timeFraction >= 1 ? 'plein temps' : `${Math.round(p.timeFraction * 100)}% temps partiel`;
    let estim = '';
    if(year === cy && cm > 0 && worked > 0 && target){
      const proj = Math.round(worked / cm * 12);
      const diff = proj - target;
      const dc   = Math.abs(diff) < 20 ? '#16A34A' : diff > 0 ? '#F59E0B' : '#EA580C';
      estim = `<div style="display:flex;justify-content:flex-end;margin-top:3px;"><span style="font-size:11px;color:${dc};">proj. fin d'année : ${formatNum(proj)}h (${diff >= 0 ? '+' : ''}${formatNum(diff)}h vs cible)</span></div>`;
    }
    const overNotif = (worked > target && target > 0)
      ? `<div style="margin-top:5px;padding:5px 8px;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;font-size:11px;color:#DC2626;display:flex;align-items:center;gap:6px;">
          <span style="flex-shrink:0;">⚠️</span><span>Heures dépassant la modulation — à régulariser sur le bulletin de <strong>décembre / janvier</strong></span>
        </div>`
      : '';
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block;flex-shrink:0;"></span>
        <span style="font-weight:700;font-size:14px;">${escapeHTML(p.short)}</span>
        <span style="font-size:11px;color:var(--color-text-muted);">${tfLabel}</span>
        <span style="margin-left:auto;font-size:13px;">${icon} <strong>${formatNum(worked)}h</strong><span style="color:var(--color-text-muted);"> / ${formatNum(target)}h</span></span>
        <span style="font-size:14px;font-weight:700;color:${barC};min-width:38px;text-align:right;">${pct}%</span>
      </div>
      <div style="background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${pct}%;background:${barC};height:100%;border-radius:99px;"></div>
      </div>
      ${estim}${overNotif}
    </div>`;
  }).join('');

  const carlaRows = carlaList.map(p => {
    const worked = computeASVWorkedHoursNew(p.id, year, null);
    let satCount = 0;
    for(let m = 0; m < 12; m++){
      const nbM = daysInMonth(year, m);
      for(let d = 1; d <= nbM; d++){
        const dt = new Date(year, m, d); if(dt.getDay() !== 6) continue;
        const iso = fmtISO(dt);
        if(getSlotState(iso, p.id, 'M') === 'present' || getSlotState(iso, p.id, 'AM') === 'present') satCount++;
      }
    }
    return `<div style="display:flex;align-items:center;gap:10px;padding-top:14px;margin-top:4px;border-top:1px solid var(--color-border);">
      <span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block;flex-shrink:0;"></span>
      <span style="font-weight:700;font-size:14px;">${escapeHTML(p.short)}</span>
      <span style="font-size:11px;color:var(--color-text-muted);">— samedi uniquement</span>
      <span style="margin-left:auto;font-size:13px;"><strong>${satCount} samedis</strong><span style="color:var(--color-text-muted);"> · ${formatNum(worked)}h</span></span>
      <span style="font-size:11px;background:#EFF6FF;color:#1D4ED8;border-radius:4px;padding:2px 8px;white-space:nowrap;flex-shrink:0;">Hors modulation</span>
    </div>`;
  }).join('');

  return `<div class="card" style="margin-bottom:18px;">
    <div style="margin-bottom:16px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">📅 Modulation annuelle — ${year}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Cible : <strong>1 607h</strong> (plein temps) · 5 semaines CP comprises · Plafond : <strong>42h / semaine</strong></p>
    </div>
    ${rows}${carlaRows}
  </div>`;
}

// ── Carte 2 : Semaine en cours — plafond 42h ───────────────────
export function buildASVWeeklyCapCard(){
  const mon  = store.weekNavState.mondayISO ? new Date(store.weekNavState.mondayISO+'T00:00:00') : getWeekMondayDate(today);
  const endW = new Date(mon); endW.setDate(endW.getDate() + 5);
  const fmt  = d => `${d.getDate()}/${d.getMonth()+1}`;
  const asv  = ASV_PEOPLE.filter(p => !p.archived);
  let anyAlert = false;

  const rows = asv.map(p => {
    let h = 0;
    for(let d = 0; d < 6; d++){
      const dt = new Date(mon); dt.setDate(dt.getDate() + d);
      if(dt.getDay() === 0) continue;
      const iso = fmtISO(dt);
      const isDayPresent2=getSlotState(iso,p.id,'M')==='present'||getSlotState(iso,p.id,'AM')==='present';
      if(isDayPresent2) h+=getDayNominal(iso,p.id)+getDayAllOtH(iso,p.id)-getDayDeficitH(iso,p.id)+getOvertimeHours(iso,p.id);
    }
    h = Math.round(h * 100) / 100;
    const cap  = WEEKLY_MAX_HOURS;
    const over = !p.saturdayOnly && h >= cap;
    const near = !p.saturdayOnly && h >= cap * 0.85 && !over;
    if(over) anyAlert = true;
    const barC = over ? '#DC2626' : near ? '#F59E0B' : p.color;
    const pct  = p.saturdayOnly
      ? Math.min(100, Math.round(h / ASV_STD_SAT_CARLA * 100))
      : Math.min(100, Math.round(h / cap * 100));
    const hStr = h > 0 ? formatHHMM(h) : '—';
    const suffix = p.saturdayOnly
      ? `<span style="font-size:11px;color:var(--color-text-muted);"> (samedi)</span>`
      : `<span style="font-size:11px;color:var(--color-text-muted);"> / ${cap}h</span>${over ? ' ⚠️' : ''}`;
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;">
      <span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block;flex-shrink:0;margin-top:1px;"></span>
      <span style="font-size:13px;font-weight:600;min-width:75px;">${escapeHTML(p.short)}</span>
      <div style="flex:1;background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${pct}%;background:${barC};height:100%;border-radius:99px;"></div>
      </div>
      <span style="font-size:13px;font-weight:${over?'700':'400'};color:${over?'#DC2626':near?'#F59E0B':'inherit'};min-width:100px;text-align:right;">${hStr}${suffix}</span>
    </div>`;
  }).join('');

  return `<div class="card" style="margin-bottom:18px;${anyAlert?'border-left:3px solid #DC2626;':''}">
    <div style="margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">⏱ Semaine du ${fmt(mon)} au ${fmt(endW)}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Plafond légal : <strong>42h</strong> / semaine (art. L3122-4 CT)</p>
    </div>
    ${anyAlert ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:8px 12px;margin-bottom:14px;color:#DC2626;font-size:13px;font-weight:600;">⚠️ Plafond de 42h atteint cette semaine</div>` : ''}
    ${rows}
  </div>`;
}

// ── Carte 3 : Équité des samedis ───────────────────────────────
export function buildASVSaturdayEquityCard(year){
  const asv = ASV_PEOPLE.filter(p => !p.archived && !p.saturdayOnly);
  if(!asv.length) return '';
  const counts = Object.fromEntries(asv.map(p => [p.id, 0]));
  for(let m = 0; m < 12; m++){
    const nbM = daysInMonth(year, m);
    for(let d = 1; d <= nbM; d++){
      const dt = new Date(year, m, d); if(dt.getDay() !== 6) continue;
      const iso = fmtISO(dt);
      asv.forEach(p => {
        if(getSlotState(iso, p.id, 'M') === 'present' || getSlotState(iso, p.id, 'AM') === 'present') counts[p.id]++;
      });
    }
  }
  const vals = asv.map(p => counts[p.id]);
  const avg  = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
  const maxV = Math.max(...vals, 1);
  const rows = asv.map(p => {
    const v      = counts[p.id];
    const diff   = Math.round((v - avg) * 10) / 10;
    const diffStr = Math.abs(diff) < 0.6 ? 'équilibre ✅' : `${diff > 0 ? '+' : ''}${diff} vs moy.${Math.abs(diff) > 2 ? ' ⚠️' : ''}`;
    const diffC  = Math.abs(diff) <= 1 ? '#16A34A' : '#EA580C';
    const barW   = Math.round(v / maxV * 100);
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;">
      <span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block;flex-shrink:0;"></span>
      <span style="font-size:13px;font-weight:600;min-width:75px;">${escapeHTML(p.short)}</span>
      <div style="flex:1;background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${barW}%;background:${p.color};height:100%;border-radius:99px;"></div>
      </div>
      <span style="font-size:14px;font-weight:700;min-width:30px;text-align:right;">${v}</span>
      <span style="font-size:12px;color:${diffC};min-width:120px;">${diffStr}</span>
    </div>`;
  }).join('');
  return `<div class="card" style="margin-bottom:18px;">
    <div style="margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">🗓 Équité des samedis — ${year}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Répartition des samedis entre Marie, Johanna et Julie · Moy. : <strong>${avg} samedis</strong></p>
    </div>
    ${rows}
  </div>`;
}

// ── Carte 4 : Heures mensuelles — tableau compact ──────────────
export function buildASVMonthlyTable(year){
  const cy = getCurrentYear();
  const cm = today.getMonth();
  const modulated = ASV_PEOPLE.filter(p => !p.archived && !p.saturdayOnly);
  if(!modulated.length) return '';
  const headers = modulated.map(p =>
    `<th style="text-align:right;padding:6px 10px;">${escapeHTML(p.short)}<br><span style="font-weight:400;font-size:10px;color:var(--color-text-muted);">quota ${formatNum(getASVQuota(p.id).monthly)}h/m</span></th>`
  ).join('');
  let rows = '';
  for(let m = 0; m < 12; m++){
    const isFuture = year === cy && m > cm;
    const isCur    = year === cy && m === cm;
    const cols = modulated.map(p => {
      if(isFuture) return `<td style="padding:5px 10px;text-align:right;color:var(--color-text-muted);">—</td>`;
      const q   = getASVQuota(p.id);
      const w   = computeASVWorkedHoursNew(p.id, year, m);
      const pct = q.monthly > 0 ? w / q.monthly : 0;
      const icon = pct > 1.05 ? '🔴' : pct >= 0.9 ? '🟢' : w > 0 ? '🟡' : '';
      return `<td style="padding:5px 10px;text-align:right;font-size:13px;">${icon} <strong>${formatNum(w)}</strong><span style="color:var(--color-text-muted);font-size:11px;">h</span></td>`;
    }).join('');
    rows += `<tr style="${isCur ? 'background:#f0fdf4;font-weight:700;' : ''}">
      <td style="padding:5px 10px;font-size:13px;color:${isCur ? 'var(--color-primary)' : 'inherit'};">${MONTH_NAMES[m]}${isCur ? ' ←' : ''}</td>
      ${cols}
    </tr>`;
  }
  const totalCols = modulated.map(p => {
    const q   = getASVQuota(p.id);
    const w   = computeASVWorkedHoursNew(p.id, year, null);
    const pct = q.annual > 0 ? Math.round(w / q.annual * 100) : 0;
    const c   = pct > 100 ? '#DC2626' : pct >= 90 ? '#F59E0B' : '#16A34A';
    return `<td style="padding:8px 10px;text-align:right;font-weight:700;border-top:2px solid var(--color-border);"><span style="color:${c};">${formatNum(w)}h</span><span style="font-size:11px;color:var(--color-text-muted);"> / ${formatNum(q.annual)}h (${pct}%)</span></td>`;
  }).join('');
  return `<div class="card" style="margin-bottom:18px;">
    <div style="margin-bottom:10px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:2px;">📊 Heures mensuelles — ${year}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">🟢 Quota atteint · 🟡 &lt; 90% du quota · 🔴 Dépassement</p>
    </div>
    <div style="overflow-x:auto;">
      <table class="recap-table" style="min-width:320px;width:100%;">
        <thead><tr><th style="text-align:left;">Mois</th>${headers}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td style="font-weight:800;padding:8px 10px;">Total ${year}</td>${totalCols}</tr></tfoot>
      </table>
    </div>
  </div>`;
}
