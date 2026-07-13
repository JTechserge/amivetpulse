import { PEOPLE, ASV_PEOPLE, allPeople, SLOTS, SLOT_LABELS,
  getCurrentYear, personOf,
  ASV_STD_SAT_CARLA, ASV_STD_WEEKDAY_AVG,
  ANNUAL_FULLTIME_HOURS, HALFDAY_HOURS, WEEKLY_MAX_HOURS,
  SUPABASE_URL, SUPABASE_FUNCTIONS_URL,
  MONTH_NAMES, MONTH_SHORT,
} from './config.js';
import { escapeHTML, formatNum, formatHHMM, signedHHMM, roundTo15min, daysInMonth,
  isSunday, isSaturday, fmtISO, holidayName, formatFR,
  isoWeekday, getWeekMondayDate,
} from './utils.js';
import { supabaseHeaders } from './auth.js';
import { store } from './store.js';
import { showToast, openConfirmModal } from './ui.js';
import { isMonthSigned, getSignatureDetail,
  signMonth, revokeSignature, openSigningLinkModal,
} from './signatures.js';
import { triggerPushNotification } from './pwa.js';
import {
  getSlotState, getSlotLabel, getLeaveDecision, getLeaveDecisionComment,
  setLeaveDecision, setLeaveDecisionComment,
  getChangeDecision, setChangeDecision,
  getOvertimeHours, setOvertimeHours,
  isASVPerson, isWithinNextTwoWeeks,
  getDayNominal, getDayDeficitH, getDayAllOtH,
  getShiftType, shiftTypeKey, setEarlyDep, getEarlyDep,
  getWeekOtMins, setWeekOtMins, getLunchOtMins, setLunchOtMins,
  getDayNote, setDayNote,
} from './slots.js';

/* ---------- Callbacks injectés depuis app.js (évitent les deps circulaires) ---------- */
let _openResetYearModal, _saveViewState, _canEditSlot, _effectiveRole;
let _snapshotBeforeChange, _saveData, _renderCurrentView, _openDaySidebar;
let _loadInterviews;
export function setupDashboard({
  openResetYearModal, saveViewState, canEditSlot, effectiveRole,
  snapshotBeforeChange, saveData, renderCurrentView, openDaySidebar,
  loadInterviews,
}) {
  _openResetYearModal  = openResetYearModal;
  _saveViewState       = saveViewState;
  _canEditSlot         = canEditSlot;
  _effectiveRole       = effectiveRole;
  _snapshotBeforeChange = snapshotBeforeChange;
  _saveData            = saveData;
  _renderCurrentView   = renderCurrentView;
  _openDaySidebar      = openDaySidebar;
  _loadInterviews      = loadInterviews;
}

/* ================================================================
   14. TABLEAU DE BORD (statistiques, graphique, table récapitulative,
       demandes de congé ASV)
   ================================================================ */
// Formate des heures décimales en "Xh MM" (ex: 1.25 → "1h15", 0.5 → "0h30")

// Regroupe les demi-journées d'absence ASV contiguës (même personne, même motif, même
// statut de décision, même commentaire) en "demandes" pour l'affichage côté tableau de
// bord — sur les deux années éditables (courante + prévisionnelle). Une demande qui
// chevauche un dimanche apparaît comme deux groupes distincts (limitation acceptée : ça
// n'affecte que l'affichage, l'approbation/rejet reste correcte groupe par groupe).
// Repos planifié ne nécessite pas d'approbation vétérinaire → exclu des demandes de congé
export function isReposLabel(label){ const lc=(label||'').toLowerCase().trim(); return lc==='repos'||lc==='repos planifié'||lc==='non travaillé'; }
export function collectAllLeaveGroups(){
  const groups = [];
  const years = [getCurrentYear(), getCurrentYear()+1];
  ASV_PEOPLE.forEach(person=>{
    let current = null;
    years.forEach(year=>{
      for(let month=0; month<12; month++){
        const nbDays = daysInMonth(year, month);
        for(let day=1; day<=nbDays; day++){
          const iso = fmtISO(new Date(year, month, day));
          SLOTS.forEach(slot=>{
            if(getSlotState(iso, person.id, slot) !== 'absent'){ current = null; return; }
            const label = getSlotLabel(iso, person.id, slot);
            if(isReposLabel(label)){ current = null; return; } // repos sans approbation
            const status = getLeaveDecision(iso, person.id, slot) || 'pending';
            const comment = getLeaveDecisionComment(iso, person.id, slot);
            if(current && current.label === label && current.status === status && current.comment === comment){
              current.slots.push({ iso, slot });
            } else {
              current = { personId: person.id, label, status, comment, slots: [{ iso, slot }] };
              groups.push(current);
            }
          });
        }
      }
    });
  });
  return groups;
}
export function collectAllChangeRequests(){
  const results = [];
  const years = [getCurrentYear(), getCurrentYear()+1];
  ASV_PEOPLE.forEach(person=>{
    years.forEach(year=>{
      for(let month=0; month<12; month++){
        const nbDays = daysInMonth(year, month);
        for(let day=1; day<=nbDays; day++){
          const iso = fmtISO(new Date(year, month, day));
          SLOTS.forEach(slot=>{
            const dec = getChangeDecision(iso, person.id, slot);
            if(!dec) return;
            const state = getSlotState(iso, person.id, slot);
            const label = getSlotLabel(iso, person.id, slot);
            results.push({ personId: person.id, iso, slot, state, label, status: dec });
          });
        }
      }
    });
  });
  return results.sort((a,b)=>a.iso.localeCompare(b.iso));
}
export function sortLeaveGroups(groups){
  const order = { pending:0, approved:1, rejected:2 };
  return groups.slice().sort((a,b)=> (order[a.status]-order[b.status]) || a.slots[0].iso.localeCompare(b.slots[0].iso));
}
export function countPendingLeaveRequests(){
  const leavePending = collectAllLeaveGroups().filter(g=> g.status==='pending').length;
  const changePending = collectAllChangeRequests().filter(r=> r.status==='pending').length;
  return leavePending + changePending;
}
export function decideLeaveGroup(group, decision, comment){
  _snapshotBeforeChange();
  group.slots.forEach(({iso,slot})=>{
    setLeaveDecision(iso, group.personId, slot, decision);
    setLeaveDecisionComment(iso, group.personId, slot, comment || '');
  });
  _saveData();
}

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
  const otSign = stats.totalOvertimeHours >= 0 ? '+' : '';
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

// Heures supplémentaires ASV par mois — même structure que le récapitulatif de présence,
// mais en sommant getOvertimeHours() (un nombre d'heures par jour, pas par demi-journée).
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
// ----------------------------------------------------------------
// Contrôle du temps de travail ASV — quotas légaux et heures réelles

// Outil de peinture mensuelle ASV : 'opening' | 'closing' | 'repos' | 'conge' | 'maladie'

const today = new Date();

export function getASVTimeFraction(personId){ return personOf(personId)?.timeFraction ?? 1.0; }
export function getASVQuota(personId){
  const p = personOf(personId);
  const f = getASVTimeFraction(personId);
  if(p?.saturdayOnly){
    // Pas de modulation : quota basé sur les samedis uniquement
    return {
      annual:  null, // hors modulation
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
// Sprint 3 : 1 jour de repos planifié ne compte PAS comme jour travaillé
// 1 jour travaillé = 8h30 base + OT - déficit (via TE exact si disponible)
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

// Vue d'ensemble des feuilles de présence signées par mois/ASV, avec annulation possible
// (rouvre le mois correspondant à la modification dans le calendrier).
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

/* store.dashSubState → store.dashSubState */
export function renderDashboard(){
  const container = document.getElementById('view-dashboard');
  const pendingCount = countPendingLeaveRequests();
  container.innerHTML = `
    <h2 class="section-title">Tableau de bord</h2>
    <p class="section-desc">Statistiques de présence et demandes de congé ASV.</p>
    <div class="sub-nav-row">
      <div class="sub-nav" id="dash-sub-nav">
        <button class="sub-tab ${store.dashSubState.tab==='stats'?'active':''}" data-sub="stats">🩺 Suivi vétérinaires</button>
        <button class="sub-tab ${store.dashSubState.tab==='hours'?'active':''}" data-sub="hours">🐾 Suivi ASV</button>
        <button class="sub-tab ${store.dashSubState.tab==='requests'?'active':''}" data-sub="requests">📋 Demandes de congé et de modification${pendingCount>0?` <span class="nav-badge">${pendingCount}</span>`:''}</button>
        <button class="sub-tab ${store.dashSubState.tab==='signatures'?'active':''}" data-sub="signatures">✍️ Feuilles signées</button>
        <button class="sub-tab ${store.dashSubState.tab==='interviews'?'active':''}" data-sub="interviews">📝 Entretiens annuels</button>
      </div>
    </div>
    <div id="dash-sub-stats" class="sub-page ${store.dashSubState.tab!=='stats'?'hidden':''}"></div>
    <div id="dash-sub-hours" class="sub-page ${store.dashSubState.tab!=='hours'?'hidden':''}"></div>
    <div id="dash-sub-requests" class="sub-page ${store.dashSubState.tab!=='requests'?'hidden':''}"></div>
    <div id="dash-sub-signatures" class="sub-page ${store.dashSubState.tab!=='signatures'?'hidden':''}"></div>
    <div id="dash-sub-interviews" class="sub-page ${store.dashSubState.tab!=='interviews'?'hidden':''}"></div>
  `;
  container.querySelector('#dash-sub-nav').addEventListener('click', (e)=>{
    const btn = e.target.closest('.sub-tab');
    if(!btn) return;
    store.dashSubState.tab = btn.dataset.sub;
    renderDashboard();
    _saveViewState();
  });
  if(store.dashSubState.tab === 'medical') store.dashSubState.tab = 'stats'; // onglet supprimé
  if(store.dashSubState.tab === 'stats') renderDashboardStats();
  else if(store.dashSubState.tab === 'hours') renderDashboardHours();
  else if(store.dashSubState.tab === 'signatures') renderDashboardSignatures();
  else if(store.dashSubState.tab === 'interviews') renderDashboardInterviews();
  else renderLeaveRequestsPage();
}

export function renderDashboardStats(){
  const container = document.getElementById('dash-sub-stats');
  const year = store.dashState.year;
  const cy = getCurrentYear();
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:0;">
      <div class="year-toggle" id="dash-year-toggle">
        <button data-year="${cy}" class="${year===cy?'active':''}">${cy}</button>
        <button data-year="${cy+1}" class="${year===cy+1?'active':''}">${cy+1}</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-sm btn-danger" id="dash-reset-current" title="Supprimer toutes les données ${cy}">🗑️ Réinitialiser ${cy}</button>
        <button class="btn btn-sm btn-danger" id="dash-reset-forecast" title="Supprimer toutes les données ${cy+1}">🗑️ Réinitialiser ${cy+1}</button>
      </div>
    </div>
    <div class="dash-grid" style="margin-top:18px;">
      ${PEOPLE.map(p=> buildPersonCard(year, p.id)).join('')}
    </div>
    <div class="card" style="margin-bottom:24px;">
      <h3 style="font-size:16px;margin-bottom:4px;">Comparaison mensuelle — David vs Stéphane</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Jours travaillés par mois, ${year}</p>
      <div class="chart-legend">
        ${PEOPLE.map(p=>`<span><span class="legend-swatch" style="background:${p.color};width:11px;height:11px;display:inline-block;border-radius:3px;"></span>${p.short}</span>`).join('')}
      </div>
      <div class="chart-wrap">${buildBarChartSVG(year)}</div>
    </div>
    <div class="card" style="margin-bottom:24px;">
      <h3 style="font-size:16px;margin-bottom:2px;">Récapitulatif mensuel ${year}</h3>
      <p class="text-muted" style="font-size:11.5px;margin-bottom:10px;">Écart = nombre de jours travaillés en plus, pour le vétérinaire concerné</p>
      ${buildRecapTable(year)}
    </div>
    <div id="dash-vets-cp"></div>
  `;
  container.querySelector('#dash-year-toggle').addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    store.dashState.year = parseInt(btn.dataset.year, 10);
    renderDashboardStats();
  });
  container.querySelector('#dash-reset-current').onclick = ()=> _openResetYearModal(cy, false);
  container.querySelector('#dash-reset-forecast').onclick = ()=> _openResetYearModal(cy + 1, true);
  renderGroupConges('vets', 'dash-vets-cp');
}

// --- Sous-page "Feuilles signées" : récapitulatif annuel des signatures ASV, avec
// annulation possible (rouvre le mois correspondant pour la personne concernée). ---
export function renderDashboardSignatures(){
  const container = document.getElementById('dash-sub-signatures');
  const year = store.dashState.year;
  const cy = getCurrentYear();
  container.innerHTML = `
    <div class="year-toggle" id="dash-sig-year-toggle">
      <button data-year="${cy}" class="${year===cy?'active':''}">${cy}</button>
      <button data-year="${cy+1}" class="${year===cy+1?'active':''}">${cy+1}</button>
    </div>
    <div class="card" style="margin-top:18px;">
      <h3 style="font-size:16px;margin-bottom:4px;">Feuilles de présence signées ${year}</h3>
      <p class="text-muted" style="font-size:12.5px;margin-bottom:10px;">Suivi des signatures électroniques mensuelles des ASV.</p>
      ${buildSignaturesTableASV(year)}
    </div>
  `;
  container.querySelectorAll('[data-revoke-signature]').forEach(btn=>{
    btn.onclick = async ()=>{
      const [personId, y, m] = btn.dataset.revokeSignature.split('|');
      openConfirmModal({
        title: 'Annuler cette signature ?',
        message: `Le mois redeviendra modifiable pour ${personOf(personId).short}.`,
        confirmLabel: 'Annuler la signature',
        onConfirm: async ()=>{
          await revokeSignature(personId, parseInt(y,10), parseInt(m,10));
          renderDashboardSignatures();
          showToast('Signature annulée', '🔓');
        },
      });
    };
  });
  container.querySelector('#dash-sig-year-toggle').addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    store.dashState.year = parseInt(btn.dataset.year, 10);
    renderDashboardSignatures();
  });
}

// --- Sous-page "Entretiens annuels" : suivi des entretiens annuels des ASV ---
export function renderDashboardInterviews(){
  const container = document.getElementById('dash-sub-interviews');
  const year = store.dashState.year;
  const cy = getCurrentYear();

  function getInterview(personId){ return store.INTERVIEWS.find(i=>i.person_id===personId && i.year===year); }
  function isoToFR(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
  function statusBadge(itv){
    if(!itv || itv.status==='pending')
      return `<span style="color:#DC2626;font-weight:700;font-size:12px;">🔴 À planifier</span>`;
    if(itv.status==='scheduled')
      return `<span style="color:#D97706;font-weight:700;font-size:12px;">🟡 Planifié${itv.scheduled_date ? ` — ${isoToFR(itv.scheduled_date)}` : ''}</span>`;
    return `<span style="color:#16A34A;font-weight:700;font-size:12px;">🟢 Réalisé${itv.done_date ? ` — ${isoToFR(itv.done_date)}` : ''}</span>`;
  }
  function ratingDisplay(rating){
    if(!rating) return '';
    return `<span style="color:#F59E0B;font-size:14px;">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</span>`;
  }

  const cards = ASV_PEOPLE.length ? ASV_PEOPLE.map(p=>{
    const itv = getInterview(p.id);
    const isPending = !itv || itv.status==='pending';
    const interviewer = itv?.interviewer_id ? (personOf(itv.interviewer_id)?.short || itv.interviewer_id) : null;
    return `
      <div class="card" style="border-top:4px solid ${p.color};padding:18px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${p.color};display:inline-block;flex-shrink:0;"></span>
          <span style="font-weight:700;font-size:15px;">${escapeHTML(p.short)}</span>
        </div>
        <div style="margin-bottom:8px;">${statusBadge(itv)}</div>
        ${interviewer ? `<p class="text-muted" style="font-size:12px;margin-bottom:4px;">Responsable : ${escapeHTML(interviewer)}</p>` : ''}
        ${itv?.rating ? `<div style="margin-bottom:8px;">${ratingDisplay(itv.rating)}</div>` : ''}
        <button class="btn btn-sm ${isPending?'btn-primary':''}" data-itv-open="${p.id}"
          style="${isPending?'':'border:1px solid var(--color-border);'}margin-top:10px;width:100%;justify-content:center;">
          ${isPending ? '➕ Planifier' : '✏️ Voir / Modifier'}
        </button>
      </div>`;
  }).join('') : `<p class="text-muted">Aucune ASV dans le planning.</p>`;

  container.innerHTML = `
    <div class="year-toggle" id="dash-itv-year-toggle" style="margin-bottom:20px;">
      <button data-year="${cy}" class="${year===cy?'active':''}">${cy}</button>
      <button data-year="${cy+1}" class="${year===cy+1?'active':''}">${cy+1}</button>
    </div>
    <div class="dash-grid" style="--dash-cols:${Math.max(ASV_PEOPLE.length,1)};">${cards}</div>
  `;
  container.querySelector('#dash-itv-year-toggle').addEventListener('click', (e)=>{
    const btn=e.target.closest('button'); if(!btn) return;
    store.dashState.year=parseInt(btn.dataset.year,10); renderDashboardInterviews();
  });
  container.querySelectorAll('[data-itv-open]').forEach(btn=>{
    btn.onclick=()=> openInterviewModal(btn.dataset.itvOpen, year);
  });
}

export function openInterviewModal(personId, year){
  const p = personOf(personId);
  const existing = store.INTERVIEWS.find(i=>i.person_id===personId && i.year===year) || {};
  const itvId = existing.id || null;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box modal-box-wide';

  const statuses = [
    {v:'pending',   l:'🔴 À planifier'},
    {v:'scheduled', l:'🟡 Planifié'},
    {v:'done',      l:'🟢 Réalisé'},
  ];
  const curStatus = existing.status || 'pending';
  const curRating = existing.rating || 0;

  function starRow(rating){
    return [1,2,3,4,5].map(n=>`<span data-star="${n}" style="font-size:26px;cursor:pointer;color:${rating>=n?'#F59E0B':'#CBD5E1'};">★</span>`).join('');
  }

  box.innerHTML = `
    <h3 style="margin-bottom:14px;">Entretien annuel ${year} — ${escapeHTML(p?.short||personId)}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
      <div>
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Statut</label>
        <select id="itv-status" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;">
          ${statuses.map(s=>`<option value="${s.v}" ${curStatus===s.v?'selected':''}>${s.l}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Vétérinaire responsable</label>
        <select id="itv-interviewer" style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;">
          <option value="">—</option>
          ${PEOPLE.map(vp=>`<option value="${vp.id}" ${existing.interviewer_id===vp.id?'selected':''}>${escapeHTML(vp.short)}</option>`).join('')}
        </select>
      </div>
      <div id="itv-scheduled-wrap" style="display:${curStatus==='pending'?'none':'block'};">
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Date prévue</label>
        <input type="date" id="itv-scheduled-date" value="${existing.scheduled_date||''}"
          style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;box-sizing:border-box;">
      </div>
      <div id="itv-done-wrap" style="display:${curStatus==='done'?'block':'none'};">
        <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Date de réalisation</label>
        <input type="date" id="itv-done-date" value="${existing.done_date||''}"
          style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;box-sizing:border-box;">
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:6px;">Note globale</label>
      <div id="itv-rating-wrap" style="display:flex;gap:4px;">${starRow(curRating)}</div>
      <input type="hidden" id="itv-rating-val" value="${curRating}">
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Bilan objectifs N-1</label>
      <textarea id="itv-obj-prev" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHTML(existing.objectives_prev||'')}</textarea>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Objectifs N+1</label>
      <textarea id="itv-obj-next" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHTML(existing.objectives_next||'')}</textarea>
    </div>
    <div style="margin-bottom:18px;">
      <label style="font-size:12px;color:var(--color-text-muted);display:block;margin-bottom:4px;">Commentaires libres</label>
      <textarea id="itv-comments" rows="3"
        style="width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-btn);font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHTML(existing.comments||'')}</textarea>
    </div>
    <p id="itv-error" style="color:#B91C1C;font-size:12px;display:none;margin:0 0 8px;"></p>
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Fermer</button>
      <button class="btn btn-primary" id="itv-save-btn">Enregistrer</button>
    </div>
  `;

  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  backdrop.onclick = (e)=>{ if(e.target===backdrop) close(); };

  const statusSel = box.querySelector('#itv-status');
  function updateDateFields(){
    const s = statusSel.value;
    box.querySelector('#itv-scheduled-wrap').style.display = s !== 'pending' ? 'block' : 'none';
    box.querySelector('#itv-done-wrap').style.display = s === 'done' ? 'block' : 'none';
  }
  statusSel.addEventListener('change', updateDateFields);

  let currentRating = curRating;
  box.querySelector('#itv-rating-wrap').addEventListener('click', (e)=>{
    const star = e.target.closest('[data-star]');
    if(!star) return;
    currentRating = parseInt(star.dataset.star);
    // Toggle off if clicking the same star
    if(currentRating === parseInt(box.querySelector('#itv-rating-val').value)) currentRating = 0;
    box.querySelector('#itv-rating-val').value = currentRating;
    box.querySelectorAll('[data-star]').forEach((s,i)=>{
      s.style.color = currentRating >= i+1 ? '#F59E0B' : '#CBD5E1';
    });
  });

  box.querySelector('#itv-save-btn').onclick = async ()=>{
    const statusVal = box.querySelector('#itv-status').value;
    const payload = {
      person_id: personId,
      year,
      status: statusVal,
      scheduled_date: box.querySelector('#itv-scheduled-date').value || null,
      done_date: box.querySelector('#itv-done-date').value || null,
      interviewer_id: box.querySelector('#itv-interviewer').value || null,
      objectives_prev: box.querySelector('#itv-obj-prev').value.trim() || null,
      objectives_next: box.querySelector('#itv-obj-next').value.trim() || null,
      comments: box.querySelector('#itv-comments').value.trim() || null,
      rating: parseInt(box.querySelector('#itv-rating-val').value) || null,
      updated_at: new Date().toISOString(),
    };
    const errEl = box.querySelector('#itv-error');
    errEl.style.display = 'none';
    box.querySelector('#itv-save-btn').disabled = true;
    try{
      let res;
      if(itvId){
        res = await fetch(`${SUPABASE_URL}annual_interviews?id=eq.${itvId}`, {
          method:'PATCH',
          headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${SUPABASE_URL}annual_interviews`, {
          method:'POST',
          headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
          body: JSON.stringify(payload),
        });
      }
      if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.message||`HTTP ${res.status}`); }
      await _loadInterviews();
      close();
      renderDashboardInterviews();
      showToast('Entretien enregistré', '✅');
      if(payload.scheduled_date && typeof triggerPushNotification === 'function'){
        triggerPushNotification({
          type: 'interview',
          title: 'Entretien annuel planifié',
          body: `Votre entretien annuel ${year} est prévu le ${formatFR(payload.scheduled_date)}.`,
          targetUsers: [personId],
          data: { type:'interview' },
        });
      }
    }catch(e){
      errEl.textContent = 'Erreur : ' + e.message;
      errEl.style.display = 'block';
      box.querySelector('#itv-save-btn').disabled = false;
    }
  };
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

  // Heures travaillées + écart net par semaine
  function weekData(mon, pid){
    let h=0, ot=0;
    for(let d=0;d<6;d++){
      const dt=new Date(mon); dt.setDate(dt.getDate()+d);
      if(isSunday(dt)) continue;
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
      if(isSunday(dt)) continue;
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

export function renderDashboardHours(){
  const container = document.getElementById('dash-sub-hours');
  const year = store.dashState.year;
  const cy   = getCurrentYear();
  if(!store.weekNavState.mondayISO) store.weekNavState.mondayISO = fmtISO(getWeekMondayDate(today));
  container.innerHTML = `
    <div class="year-toggle" id="dash-hours-year-toggle" style="margin-bottom:16px;">
      <button data-year="${cy}" class="${year===cy?'active':''}">${cy}</button>
      <button data-year="${cy+1}" class="${year===cy+1?'active':''}">${cy+1}</button>
    </div>
    ${buildASVModulationCard(year)}
    ${year === cy ? buildASVWeeklyCapCard() : ''}
    ${buildASVSaturdayEquityCard(year)}
    ${buildASVMonthlyTable(year)}
    <div id="dash-asv-cp"></div>
  `;
  container.querySelector('#dash-hours-year-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button'); if(!btn) return;
    store.dashState.year = parseInt(btn.dataset.year, 10); renderDashboardHours();
  });
  renderGroupConges('asv', 'dash-asv-cp');
}

// --- Sous-page "Demandes de congé" : liste groupée, triée en attente -> approuvées ->
// refusées, avec actions d'approbation/refus (refus avec commentaire obligatoire). ---
export function renderLeaveRequestsPage(){
  const container = document.getElementById('dash-sub-requests');
  const groups = sortLeaveGroups(collectAllLeaveGroups());
  const changeReqs = collectAllChangeRequests();
  const statusLabel = { pending:'En attente', approved:'Approuvée', rejected:'Refusée' };
  const statusClass = { pending:'leave-pending', approved:'leave-approved', rejected:'leave-rejected' };

  // ── Section : modifications urgentes (2 semaines) ──
  const stateLabel = (r)=>{
    if(r.state==='present'){
      const sh = getShiftType(r.iso, r.personId);
      return sh==='F' ? 'Poste Fermeture' : 'Poste Ouverture';
    }
    if(r.state==='absent') return r.label || 'Absence';
    return r.state;
  };
  const chgStatusClass = { pending:'change-pending', rejected:'change-rejected' };
  const chgStatusLabel = { pending:'En attente', rejected:'Refusée' };
  const changeRows = changeReqs.map((r, ci)=>{
    const person = personOf(r.personId);
    const dateStr = `${formatFR(r.iso)} (${SLOT_LABELS[r.slot]})`;
    const actions = r.status === 'pending' ? `
      <div class="flex gap-2" style="margin-top:8px;">
        <button class="btn btn-sm btn-primary" data-chg-approve="${ci}">✓ Approuver</button>
        <button class="btn btn-sm btn-danger" data-chg-reject="${ci}">✕ Refuser</button>
      </div>` : '';
    return `
      <div class="card" data-chg-group="${ci}" style="margin-bottom:10px;border-left:4px solid var(--color-change-pending);">
        <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <strong style="color:var(--color-change-pending);">🔔 ${person.short}</strong> — ${dateStr}
            <p class="text-muted" style="font-size:12px;margin-top:2px;">${escapeHTML(stateLabel(r))}</p>
          </div>
          <span class="leave-status-badge ${chgStatusClass[r.status]||'leave-pending'}">${chgStatusLabel[r.status]||r.status}</span>
        </div>
        ${actions}
      </div>`;
  }).join('');

  // ── Section : demandes de congé classiques ──
  const leaveRows = groups.map((g, idx)=>{
    const person = personOf(g.personId);
    const first = g.slots[0], last = g.slots[g.slots.length-1];
    const range = first.iso === last.iso
      ? `${formatFR(first.iso)} (${SLOT_LABELS[first.slot]})`
      : `du ${formatFR(first.iso)} au ${formatFR(last.iso)}`;
    const actions = g.status === 'pending' ? `
      <div class="flex gap-2" style="margin-top:8px;">
        <button class="btn btn-sm btn-primary" data-approve="${idx}">✓ Approuver</button>
        <button class="btn btn-sm btn-danger" data-reject="${idx}">✕ Refuser</button>
      </div>
      <div class="hidden" data-reject-form="${idx}" style="margin-top:8px;">
        <textarea data-reject-comment="${idx}" rows="2" placeholder="Motif du refus (obligatoire, visible par l'équipe)"></textarea>
        <div class="flex gap-2" style="margin-top:6px;">
          <button class="btn btn-sm btn-danger" data-reject-confirm="${idx}">Confirmer le refus</button>
          <button class="btn btn-sm" data-reject-cancel="${idx}">Annuler</button>
        </div>
      </div>
    ` : g.comment ? `<p class="text-muted" style="font-size:12.5px;margin-top:6px;">💬 ${escapeHTML(g.comment)}</p>` : '';
    return `
      <div class="card" data-leave-group="${idx}" style="margin-bottom:12px;border-left:4px solid ${person.color};">
        <div class="flex" style="justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <strong style="color:${person.color};">${person.short}</strong> — ${range}
            ${g.label ? `<span class="text-muted"> · ${escapeHTML(g.label)}</span>` : ''}
            <p class="text-muted" style="font-size:12px;margin-top:2px;">${g.slots.length} demi-journée${g.slots.length>1?'s':''}</p>
          </div>
          <span class="leave-status-badge ${statusClass[g.status]}">${statusLabel[g.status]}</span>
        </div>
        ${actions}
      </div>`;
  }).join('');

  container.innerHTML = `
    ${changeReqs.length ? `
      <p class="section-desc" style="margin-bottom:10px;font-weight:600;color:var(--color-change-pending);">🔔 Modifications urgentes (dans les 2 semaines)</p>
      ${changeRows}
      <hr style="margin:16px 0;border:none;border-top:1px solid var(--color-border);">
    ` : ''}
    <p class="section-desc" style="margin-bottom:14px;">Demandes de congé ASV — ${getCurrentYear()} et ${getCurrentYear()+1}.</p>
    ${groups.length ? leaveRows : `<p class="text-muted">Aucune demande de congé pour le moment.</p>`}
  `;

  // Handlers : modifications urgentes
  container.querySelectorAll('[data-chg-approve]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = changeReqs[parseInt(btn.dataset.chgApprove,10)];
      _snapshotBeforeChange();
      setChangeDecision(r.iso, r.personId, r.slot, null); // approuvé = flag retiré
      _saveData();
      renderDashboard();
      showToast('Modification approuvée', '✓');
    });
  });
  container.querySelectorAll('[data-chg-reject]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = changeReqs[parseInt(btn.dataset.chgReject,10)];
      _snapshotBeforeChange();
      setChangeDecision(r.iso, r.personId, r.slot, 'rejected');
      _saveData();
      renderDashboard();
      showToast('Modification refusée', '✕');
    });
  });

  // Handlers : demandes de congé classiques
  container.querySelectorAll('[data-approve]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const g = groups[parseInt(btn.dataset.approve,10)];
      decideLeaveGroup(g, 'approved', '');
      if(typeof triggerPushNotification === 'function'){
        triggerPushNotification({ type:'leave_approved', title:'Demande de congé approuvée', body:`Votre demande du ${formatFR(g.slots[0].iso)} a été approuvée.`, targetUsers:[g.personId], data:{type:'leave_approved'} });
      }
      renderDashboard();
      showToast('Demande approuvée', '✓');
    });
  });
  container.querySelectorAll('[data-reject]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      container.querySelector(`[data-reject-form="${btn.dataset.reject}"]`).classList.remove('hidden');
    });
  });
  container.querySelectorAll('[data-reject-cancel]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      container.querySelector(`[data-reject-form="${btn.dataset.rejectCancel}"]`).classList.add('hidden');
    });
  });
  container.querySelectorAll('[data-reject-confirm]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = btn.dataset.rejectConfirm;
      const comment = container.querySelector(`[data-reject-comment="${idx}"]`).value.trim();
      if(!comment){ showToast('Un commentaire est nécessaire pour refuser', '⚠️'); return; }
      const g = groups[parseInt(idx,10)];
      decideLeaveGroup(g, 'rejected', comment);
      if(typeof triggerPushNotification === 'function'){
        triggerPushNotification({ type:'leave_rejected', title:'Demande de congé refusée', body:`Votre demande du ${formatFR(g.slots[0].iso)} a été refusée — ${comment}`, targetUsers:[g.personId], data:{type:'leave_rejected'} });
      }
      renderDashboard();
      showToast('Demande refusée', '✕');
    });
  });
}

/* ================================================================
   MODULE CP — Compteur Congés Payés
   ================================================================ */
export function easterDate(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day);
}
export function getJoursFeries(year){
  const easter=easterDate(year);
  function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function isoOf(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  const feries = new Set([
    `${year}-01-01`, `${year}-05-01`, `${year}-05-08`,
    `${year}-07-14`, `${year}-08-15`, `${year}-11-01`, `${year}-11-11`, `${year}-12-25`,
    isoOf(addDays(easter,1)),   // Lundi de Pâques
    isoOf(addDays(easter,39)),  // Ascension
    isoOf(addDays(easter,50)),  // Lundi de Pentecôte
  ]);
  return feries;
}

export function getCPTakenDays(personId, startISO, endISO){
  let halfDays = 0;
  const isASV = isASVPerson(personId);
  const labelRe = /cp|cong[eé]/i;
  for(const key of Object.keys(store.DATA.slots)){
    const m = key.match(/^(\d{4}-\d{2}-\d{2})_(.+)_(M|AM)$/);
    if(!m) continue;
    const [,iso,pid] = m;
    if(pid !== personId) continue;
    if(iso < startISO || iso > endISO) continue;
    if(store.DATA.slots[key] !== 'absent') continue;
    if(isASV){
      // ASV : seules les absences avec motif CP/Congé comptent (les autres motifs
      // comme Maladie ou Formation ne consomment pas de CP)
      const label = store.DATA.slots[key.replace(/_(M|AM)$/, '_$1_label')] || '';
      if(!labelRe.test(label)) continue;
    }
    // Vétérinaires : toute absence = CP (pas de workflow de demande de congé)
    halfDays++;
  }
  return Math.round(halfDays / 2 * 100) / 100;
}

export function cpPeriodISO(referenceYear){
  const y = referenceYear;
  const start = `${y}-01-01`;
  const end   = `${y}-12-31`;
  return { start, end, label:`1 janv. ${y} → 31 déc. ${y}` };
}

export function getCPAcquired(person, referenceYear){
  const { start, end } = cpPeriodISO(referenceYear);
  const todayISO = fmtISO(today);
  const effectiveEnd = todayISO < end ? todayISO : end;
  const startDate = new Date(start + 'T00:00:00');
  const endDate   = new Date(effectiveEnd + 'T00:00:00');
  if(endDate < startDate) return 0;
  // Count full months elapsed (partial month = 0, full month = 1 credit)
  let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  // Include the start month itself if today has passed day 1 of that month
  if(endDate.getDate() >= 1) months++;
  months = Math.max(0, Math.min(months, 12));
  return Math.round(months * CP_DAYS_PER_MONTH * (person.timeFraction ?? 1.0) * 100) / 100;
}

export function renderGroupConges(group, containerId){
  const container = document.getElementById(containerId || `${group}-sub-conges`);
  if(!container) return;
  const isAdmin = store.currentUser?.role === 'admin';
  const cy = getCurrentYear();
  if(!renderGroupConges._year) renderGroupConges._year = {};
  let cpYear = (typeof renderGroupConges._year[group] === 'number') ? renderGroupConges._year[group] : cy;

  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-muted);">Chargement…</div>';

  (async ()=>{
    let adjustments = [];
    try{
      const res = await fetch(`${SUPABASE_URL}cp_adjustments?year=eq.${cpYear}&select=*`, { headers: supabaseHeaders() });
      if(res.ok) adjustments = await res.json();
    }catch(e){ console.warn('cp_adjustments inaccessibles', e); }

    const adjByPerson = {};
    adjustments.forEach(a => { adjByPerson[a.person_id] = a; });

    const people = (group === 'vets' ? PEOPLE : ASV_PEOPLE).filter(p => !p.archived);
    const { label: periodLabel, start: startISO, end: endISO } = cpPeriodISO(cpYear);

    function soldeColor(b){ return b >= 10 ? '#16A34A' : b >= 5 ? '#CA8A04' : '#DC2626'; }
    function swatch(c){ return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:4px;vertical-align:middle;"></span>`; }

    const rows = people.map(p=>{
      const adj = adjByPerson[p.id] || { carried_over:0, extra_days:0, extra_note:'' };
      const acquired  = getCPAcquired(p, cpYear);
      const taken     = getCPTakenDays(p.id, startISO, endISO);
      const carriedOver = parseFloat(adj.carried_over) || 0;
      const extra     = parseFloat(adj.extra_days) || 0;
      const balance   = Math.round((acquired + carriedOver + extra - taken) * 100) / 100;
      const total     = acquired + carriedOver + extra;
      const pct       = total > 0 ? Math.min(100, Math.round(taken/total*100)) : 0;
      const balC      = soldeColor(balance);
      return `<tr>
        <td style="padding:10px 12px;font-weight:600;">${swatch(p.color)}${escapeHTML(p.short||p.name)}</td>
        <td style="padding:10px 12px;text-align:center;">${acquired}j</td>
        <td style="padding:10px 12px;text-align:center;">${taken}j</td>
        <td style="padding:10px 12px;text-align:center;">${carriedOver > 0 ? carriedOver+'j' : '—'}</td>
        <td style="padding:10px 12px;text-align:center;">${extra !== 0 ? (extra>0?'+':'')+extra+'j' : '—'}</td>
        ${group !== 'vets' ? `<td style="padding:10px 12px;text-align:center;font-weight:700;color:${balC};">${balance}j</td>` : ''}
        <td style="padding:10px 12px;min-width:120px;">
          <div style="background:var(--color-border);border-radius:99px;height:6px;overflow:hidden;">
            <div style="width:${pct}%;background:${pct>100?'#DC2626':'var(--color-primary)'};height:100%;border-radius:99px;"></div>
          </div>
          <div style="font-size:11px;color:var(--color-muted);margin-top:2px;">${pct}% posés</div>
        </td>
        ${isAdmin?`<td style="padding:10px 12px;"><button class="btn btn-sm cp-adjust-btn" data-pid="${p.id}" data-carried="${carriedOver}" data-extra="${extra}" data-note="${escapeHTML(adj.extra_note||'')}">✎ Ajuster</button></td>`:''}
      </tr>`;
    }).join('');

    const yearBtns = [cpYear-1, cpYear, cpYear+1].map(y =>
      `<button class="cp-year-btn" data-year="${y}" style="border:1.5px solid ${y===cpYear?'var(--color-primary)':'var(--color-border)'};background:${y===cpYear?'var(--color-secondary)':'var(--color-card)'};color:${y===cpYear?'var(--color-primary)':'var(--color-text)'};padding:5px 14px;border-radius:20px;font-size:13px;cursor:pointer;font-weight:${y===cpYear?'700':'400'};">${y}</button>`
    ).join('');

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <div>
          <div style="font-size:13.5px;font-weight:700;color:var(--color-text);">Période de référence : ${periodLabel}</div>
          <div style="font-size:12px;color:var(--color-muted);">${CP_DAYS_PER_MONTH}j acquis/mois (proratisé selon le taux d'activité)</div>
        </div>
        <div style="display:flex;gap:6px;">${yearBtns}</div>
      </div>
      <div class="card" style="overflow-x:auto;">
        <table class="recap-table" style="min-width:600px;">
          <thead><tr>
            <th style="text-align:left;">Personne</th>
            <th style="text-align:center;">Acquis</th>
            <th style="text-align:center;">Posés</th>
            <th style="text-align:center;">Report N-1</th>
            <th style="text-align:center;">Ajust.</th>
            ${group !== 'vets' ? `<th style="text-align:center;">Solde</th>` : ''}
            <th>Progression</th>
            ${isAdmin?'<th></th>':''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="font-size:11.5px;color:var(--color-muted);margin-top:8px;">
        🟢 ≥ 10j &nbsp;🟡 5–9j &nbsp;🔴 &lt; 5j · Jours "posés" = absences marquées CP/Congé dans le calendrier.
      </div>
    `;

    container.querySelectorAll('.cp-year-btn').forEach(btn=>{
      btn.onclick = ()=>{ renderGroupConges._year[group] = parseInt(btn.dataset.year,10); renderGroupConges(group, containerId); };
    });

    if(isAdmin){
      container.querySelectorAll('.cp-adjust-btn').forEach(btn=>{
        btn.onclick = ()=> openCPAdjustModal(btn.dataset.pid, cpYear, parseFloat(btn.dataset.carried)||0, parseFloat(btn.dataset.extra)||0, btn.dataset.note||'', group, containerId);
      });
    }
  })();
}
renderGroupConges._year = {};

export function openCPAdjustModal(personId, year, carriedOver, extra, note, group, containerId){
  const person = allPeople().find(p=>p.id===personId);
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  box.innerHTML = `
    <h3>✎ Ajuster les CP — ${escapeHTML(person?.short||personId)} (${year})</h3>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Report N-1 (jours)</label>
        <input id="cp-carried" type="number" step="0.5" min="0" value="${carriedOver}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13.5px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Ajustement manuel (jours, + ou −)</label>
        <input id="cp-extra" type="number" step="0.5" value="${extra}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13.5px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Motif</label>
        <textarea id="cp-note" rows="2" placeholder="Ancienneté, récupération…" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${escapeHTML(note)}</textarea>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="cp-cancel">Annuler</button>
      <button class="btn btn-primary" id="cp-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#cp-cancel').onclick = close;
  backdrop.onclick = e=>{ if(e.target===backdrop) close(); };
  box.querySelector('#cp-save').onclick = async ()=>{
    const carried_over = parseFloat(box.querySelector('#cp-carried').value)||0;
    const extra_days   = parseFloat(box.querySelector('#cp-extra').value)||0;
    const extra_note   = box.querySelector('#cp-note').value.trim();
    try{
      const res = await fetch(`${SUPABASE_URL}cp_adjustments`, {
        method:'POST',
        headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal,resolution=merge-duplicates' }),
        body: JSON.stringify({ person_id:personId, year, carried_over, extra_days, extra_note, updated_at:new Date().toISOString() }),
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      close();
      renderGroupConges(group, containerId);
      showToast(`CP ${escapeHTML(person?.short||personId)} mis à jour`, '✅');
    }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
  };
}

export function getAbsenteeismRate(personId, year, month){ // module absentéisme supprimé de l'UI
  const feries = getJoursFeries(year);
  const daysInMonth = new Date(year, month+1, 0).getDate();
  let workingDays = 0;
  for(let d=1; d<=daysInMonth; d++){
    const date = new Date(year, month, d);
    const dow = date.getDay();
    if(dow===0||dow===6) continue;
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(feries.has(iso)) continue;
    workingDays++;
  }
  let absentHalves = 0;
  for(const slot of ['M','AM']){
    for(let d=1; d<=daysInMonth; d++){
      const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const key = `${iso}_${personId}_${slot}`;
      if(store.DATA.slots[key] === 'absent'){
        // For ASV: only count if decision is not 'rejected' (rejected means not absent)
        if(isASVPerson(personId)){
          const dec = getLeaveDecision(iso, personId, slot);
          if(dec === 'rejected') continue;
        }
        absentHalves++;
      }
    }
  }
  const absentDays = absentHalves / 2;
  const rate = workingDays > 0 ? Math.round(absentDays/workingDays*1000)/10 : 0;
  return { rate, absentDays, workingDays };
}

export function renderDashboardAbsences(){ // stub — module supprimé
  const container = document.getElementById('dash-sub-absences');
  if(container) container.innerHTML = '';
}

/* ================================================================
   MODULE VISITES MÉDICALES
   ================================================================ */
export function addMonthsToDate(dateISO, months){
  const d = new Date(dateISO + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return fmtISO(d);
}

export function getMedicalAlert(visit){
  if(!visit){
    return { level:'red', label:'À planifier', effectiveNextDate:null, daysUntil:null };
  }
  const effectiveNextDate = visit.next_visit_date || addMonthsToDate(visit.visit_date, visit.frequency_months||60);
  const todayMs = today.getTime();
  const nextMs  = new Date(effectiveNextDate + 'T00:00:00').getTime();
  const daysUntil = Math.floor((nextMs - todayMs) / 86400000);
  let level, label;
  if(daysUntil < 0){ level='red'; label=`⛔ Dépassée (${Math.abs(daysUntil)}j)`; }
  else if(daysUntil < 90){ level='amber'; label=`⚠️ Dans ${daysUntil}j`; }
  else { level='green'; label='✅ À jour'; }
  return { level, label, effectiveNextDate, daysUntil };
}

export function renderDashboardMedical(){
  const container = document.getElementById('dash-sub-medical');
  const isAdmin = store.currentUser?.role === 'admin';
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-muted);">Chargement…</div>';

  (async ()=>{
    let visits = [];
    try{
      const res = await fetch(`${SUPABASE_URL}medical_visits?select=*&order=visit_date.desc`, { headers: supabaseHeaders() });
      if(res.ok) visits = await res.json();
    }catch(e){ console.warn('medical_visits inaccessibles', e); }

    // Keep only latest visit per person
    const latestByPerson = {};
    visits.forEach(v => {
      if(!latestByPerson[v.person_id] || v.visit_date > latestByPerson[v.person_id].visit_date)
        latestByPerson[v.person_id] = v;
    });

    const people = allPeople().filter(p => !p.archived);
    const VISIT_TYPE_LABELS = { embauche:'Embauche', periodique:'Périodique', reprise:'Reprise', spontanee:'Spontanée' };
    const STATUS_LABELS = { apte:'Apte', apte_reserves:'Apte avec réserves', inapte:'Inapte', en_attente:'En attente' };
    const levelIcon = { red:'⛔', amber:'⚠️', green:'✅' };
    const levelColor = { red:'#DC2626', amber:'#CA8A04', green:'#16A34A' };

    const rows = people.map(p => {
      const v = latestByPerson[p.id] || null;
      const alert = getMedicalAlert(v);
      const nextDisplay = v ? (alert.effectiveNextDate ? new Date(alert.effectiveNextDate+'T00:00:00').toLocaleDateString('fr-FR') : '—') : '—';
      const statusLabel = v ? (STATUS_LABELS[v.status] || v.status) : '—';
      const reservesBtn = (v?.status === 'apte_reserves' && v?.reserves_note)
        ? `<button class="med-reserves-btn btn btn-sm" title="${escapeHTML(v.reserves_note)}" style="font-size:11px;padding:2px 6px;margin-left:4px;">ℹ️</button>` : '';
      return `<tr>
        <td data-label="Statut" style="padding:8px 12px;text-align:center;font-size:16px;color:${levelColor[alert.level]};">${levelIcon[alert.level]}</td>
        <td data-label="Personne" style="padding:8px 12px;font-weight:600;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px;"></span>${escapeHTML(p.short||p.name)}</td>
        <td data-label="Dernière visite" style="padding:8px 12px;">${v ? new Date(v.visit_date+'T00:00:00').toLocaleDateString('fr-FR') : '—'}</td>
        <td data-label="Type" style="padding:8px 12px;">${v ? (VISIT_TYPE_LABELS[v.visit_type]||v.visit_type) : '—'}</td>
        <td data-label="Aptitude" style="padding:8px 12px;">${statusLabel}${reservesBtn}</td>
        <td data-label="Prochaine visite" style="padding:8px 12px;color:${levelColor[alert.level]};font-weight:${alert.level!=='green'?'600':'400'};">${nextDisplay}</td>
        <td data-label="Actions" style="padding:8px 12px;">
          ${v && isAdmin ? `<button class="btn btn-sm med-edit-btn" data-visit-id="${v.id}" style="font-size:11.5px;padding:3px 8px;">✎</button>` : ''}
          ${!v && isAdmin ? `<button class="btn btn-sm btn-primary med-add-btn" data-pid="${p.id}" style="font-size:11.5px;padding:3px 8px;">+ Ajouter</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <div></div>
        ${isAdmin ? `<button class="btn btn-sm btn-primary" id="med-add-global">+ Ajouter une visite</button>` : ''}
      </div>
      <div class="card" style="overflow-x:auto;margin-bottom:16px;">
        <table class="recap-table" style="min-width:600px;">
          <thead><tr>
            <th style="text-align:center;">Statut</th>
            <th>Personne</th>
            <th>Dernière visite</th>
            <th>Type</th>
            <th>Aptitude</th>
            <th>Prochaine visite</th>
            ${isAdmin ? '<th></th>' : ''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${(()=>{
        // Visites médicales marquées directement dans le calendrier (état 'medical' dans store.DATA.slots)
        const seen = {};
        const calEntries = [];
        Object.keys(store.DATA.slots).forEach(key=>{
          if(store.DATA.slots[key] !== 'medical') return;
          const m = key.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_(M|AM)$/);
          if(!m) return;
          const [,iso,pid] = m;
          const k = `${pid}_${iso}`;
          if(!seen[k]){ seen[k]=true; calEntries.push({iso,pid}); }
        });
        calEntries.sort((a,b)=>a.iso.localeCompare(b.iso));
        if(!calEntries.length) return '';
        const rows2 = calEntries.map(e=>{
          const p2 = people.find(x=>x.id===e.pid);
          const dStr = new Date(e.iso+'T00:00:00').toLocaleDateString('fr-FR');
          return `<tr>
            <td style="padding:7px 12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p2?.color||'#999'};margin-right:5px;"></span><strong>${escapeHTML(p2?.short||e.pid)}</strong></td>
            <td style="padding:7px 12px;">${dStr}</td>
            <td style="padding:7px 12px;font-size:11px;color:var(--color-text-muted);">Marqué dans le calendrier</td>
          </tr>`;
        }).join('');
        return `<div class="card" style="margin-bottom:16px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--color-medical-text);">📅 Rendez-vous planifiés dans le calendrier</div>
          <div style="overflow-x:auto;"><table class="recap-table" style="min-width:360px;">
            <thead><tr><th>Personne</th><th>Date</th><th>Source</th></tr></thead>
            <tbody>${rows2}</tbody>
          </table></div>
        </div>`;
      })()}
      <div style="background:var(--color-secondary);border:1px solid var(--color-border);border-radius:10px;padding:14px 16px;font-size:12.5px;color:var(--color-muted);">
        📋 <strong>Référence légale — Article R4624-10 du Code du travail</strong><br>
        Visite d'aptitude à l'embauche obligatoire. Renouvellement périodique tous les 5 ans
        (surveillance simple) ou tous les 2 ans (surveillance renforcée : exposition aux risques).
      </div>
    `;

    // Reserves popover
    container.querySelectorAll('.med-reserves-btn').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const note = btn.getAttribute('title');
        const box2 = document.getElementById('modal-box');
        const backdrop2 = document.getElementById('modal-backdrop');
        box2.className = 'modal-box';
        box2.innerHTML = `<h3>ℹ️ Réserves d'aptitude</h3><p style="font-size:13.5px;line-height:1.6;">${escapeHTML(note)}</p><div class="modal-actions"><button class="btn btn-primary" id="med-res-ok">Fermer</button></div>`;
        backdrop2.classList.add('open');
        box2.querySelector('#med-res-ok').onclick = ()=> backdrop2.classList.remove('open');
        backdrop2.onclick = ev=>{ if(ev.target===backdrop2) backdrop2.classList.remove('open'); };
      };
    });

    if(isAdmin){
      const openAdd = (personId) => openMedicalModal(null, visits, personId);
      const openEdit = (visitId) => openMedicalModal(visits.find(v=>v.id===visitId), visits, null, ()=>{ renderDashboardMedical(); });
      if(container.querySelector('#med-add-global'))
        container.querySelector('#med-add-global').onclick = ()=> openAdd(null);
      container.querySelectorAll('.med-add-btn').forEach(btn => btn.onclick = ()=> openAdd(btn.dataset.pid));
      container.querySelectorAll('.med-edit-btn').forEach(btn => btn.onclick = ()=> openEdit(btn.dataset.visitId));
    }
  })();
}

export function openMedicalModal(existingVisit, allVisits, preselectedPid, onSaved){
  const isAdmin = store.currentUser?.role === 'admin';
  if(!isAdmin) return;
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  const people = allPeople().filter(p=>!p.archived);
  const FREQ_OPTIONS = [[12,'12 mois (1 an)'],[24,'24 mois (2 ans)'],[36,'36 mois (3 ans)'],[60,'60 mois (5 ans)']];
  const curFreq = existingVisit?.frequency_months || 60;

  function calcNextISO(visitDateISO, freqMonths){ return visitDateISO ? addMonthsToDate(visitDateISO, freqMonths) : ''; }

  box.innerHTML = `
    <h3>${existingVisit ? '✎ Modifier la visite' : '🏥 Ajouter une visite médicale'}</h3>
    <div style="display:flex;flex-direction:column;gap:11px;max-height:70vh;overflow-y:auto;">
      <div>
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Personne</label>
        ${existingVisit
          ? `<div style="font-weight:700;padding:6px 0;">${escapeHTML(people.find(p=>p.id===existingVisit.person_id)?.short||existingVisit.person_id)}</div><input type="hidden" id="med-person" value="${existingVisit.person_id}">`
          : `<select id="med-person" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">${people.map(p=>`<option value="${p.id}"${p.id===preselectedPid?' selected':''}>${escapeHTML(p.short||p.name)}</option>`)}</select>`
        }
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Date de la visite</label>
        <input id="med-date" type="date" max="${fmtISO(today)}" value="${existingVisit?.visit_date||''}" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Type de visite</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${[['embauche','Embauche'],['periodique','Périodique'],['reprise','Reprise'],['spontanee','Spontanée']].map(([v,l])=>
            `<label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;border:1px solid var(--color-border);padding:5px 10px;border-radius:20px;"><input type="radio" name="med-type" value="${v}" ${(existingVisit?.visit_type||'periodique')===v?'checked':''}> ${l}</label>`
          ).join('')}
        </div>
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:6px;">Aptitude</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${[['apte','Apte'],['apte_reserves','Apte avec réserves'],['inapte','Inapte'],['en_attente','En attente']].map(([v,l])=>
            `<label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;border:1px solid var(--color-border);padding:5px 10px;border-radius:20px;"><input type="radio" name="med-status" value="${v}" ${(existingVisit?.status||'apte')===v?'checked':''}> ${l}</label>`
          ).join('')}
        </div>
      </div>
      <div id="med-reserves-wrap" style="${(existingVisit?.status||'apte')==='apte_reserves'?'':'display:none;'}">
        <label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Réserves</label>
        <textarea id="med-reserves" rows="2" placeholder="Détail des réserves…" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${escapeHTML(existingVisit?.reserves_note||'')}</textarea>
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Fréquence de renouvellement</label>
        <select id="med-freq" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
          ${FREQ_OPTIONS.map(([v,l])=>`<option value="${v}"${v===curFreq?' selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Prochaine visite (calculée auto, modifiable)</label>
        <input id="med-next" type="date" value="${existingVisit?.next_visit_date || calcNextISO(existingVisit?.visit_date, curFreq)}" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Médecin du travail</label>
        <input id="med-doctor" type="text" value="${escapeHTML(existingVisit?.doctor_name||'')}" placeholder="Nom du médecin" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;background:var(--color-card);color:var(--color-text);">
      </div>
      <div><label style="font-size:12.5px;font-weight:600;display:block;margin-bottom:4px;">Notes</label>
        <textarea id="med-notes" rows="2" placeholder="Observations, suivi…" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--color-border);border-radius:6px;font-size:13px;resize:vertical;background:var(--color-card);color:var(--color-text);">${escapeHTML(existingVisit?.notes||'')}</textarea>
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
      ${existingVisit?`<button class="btn btn-danger" id="med-delete-btn" style="margin-right:auto;">🗑️ Supprimer</button>`:''}
      <button class="btn" id="med-cancel">Annuler</button>
      <button class="btn btn-primary" id="med-save">Enregistrer</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#med-cancel').onclick = close;
  backdrop.onclick = e=>{ if(e.target===backdrop) close(); };

  // Toggle reserves textarea
  box.querySelectorAll('input[name="med-status"]').forEach(r=>{
    r.onchange = ()=>{
      box.querySelector('#med-reserves-wrap').style.display = r.value==='apte_reserves'?'':'none';
    };
  });

  // Auto-calc next date when visit date or frequency changes
  const autoNext = ()=>{
    const dateVal = box.querySelector('#med-date').value;
    const freqVal = parseInt(box.querySelector('#med-freq').value)||60;
    if(dateVal) box.querySelector('#med-next').value = calcNextISO(dateVal, freqVal);
  };
  box.querySelector('#med-date').onchange = autoNext;
  box.querySelector('#med-freq').onchange = autoNext;

  if(existingVisit){
    box.querySelector('#med-delete-btn').onclick = async ()=>{
      if(!confirm('Supprimer cette visite ?')) return;
      try{
        await fetch(`${SUPABASE_URL}medical_visits?id=eq.${existingVisit.id}`, {
          method:'DELETE', headers: supabaseHeaders({ Prefer:'return=minimal' }),
        });
        close(); renderDashboardMedical(); showToast('Visite supprimée', '🗑️');
      }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
    };
  }

  box.querySelector('#med-save').onclick = async ()=>{
    const person_id     = box.querySelector('#med-person').value;
    const visit_date    = box.querySelector('#med-date').value;
    const visit_type    = box.querySelector('input[name="med-type"]:checked')?.value || 'periodique';
    const status        = box.querySelector('input[name="med-status"]:checked')?.value || 'apte';
    const reserves_note = status==='apte_reserves' ? box.querySelector('#med-reserves').value.trim() : '';
    const frequency_months = parseInt(box.querySelector('#med-freq').value)||60;
    const next_visit_date = box.querySelector('#med-next').value || null;
    const doctor_name   = box.querySelector('#med-doctor').value.trim();
    const notes         = box.querySelector('#med-notes').value.trim();
    if(!visit_date){ showToast('Date de visite requise', '⚠️'); return; }
    const payload = { person_id, visit_date, visit_type, status, reserves_note, frequency_months, next_visit_date, doctor_name, notes };
    try{
      if(existingVisit){
        await fetch(`${SUPABASE_URL}medical_visits?id=eq.${existingVisit.id}`, {
          method:'PATCH', headers: supabaseHeaders({ 'Content-Type':'application/json', Prefer:'return=minimal' }),
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${SUPABASE_URL}medical_visits`, {
          method:'POST', headers: supabaseHeaders({ 'Content-Type':'application/json', Prefer:'return=minimal' }),
          body: JSON.stringify(payload),
        });
      }
      close(); renderDashboardMedical(); showToast(existingVisit?'Visite mise à jour':'Visite enregistrée', '✅');
      if(typeof triggerPushNotification === 'function'){
        const alert = getMedicalAlert(payload);
        if(alert.level === 'red' || alert.level === 'amber'){
          const p = personOf(person_id);
          triggerPushNotification({
            type: 'medical_visit',
            title: 'Visite médicale à renouveler',
            body: `${p ? p.short : person_id} — prochaine visite : ${alert.label}`,
            targetUsers: [person_id, 'david', 'stephane'],
            data: { type:'medical_visit' },
          });
        }
      }
    }catch(e){ showToast('Erreur : '+e.message, '⚠️'); }
  };
}


/* Export explicite pour app.js (navigation par notification) */
export function setDashSubTab(tab){ store.dashSubState.tab = tab; }
