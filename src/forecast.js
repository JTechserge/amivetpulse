/* ================================================================
   AMIVET PLANNING — Page Prévisionnel ASV v2
   Module ES autonome. Branchement : app.js → renderForecastPage().
   ================================================================ */

import { ASV_PEOPLE, MONTH_NAMES, MONTH_SHORT, ANNUAL_FULLTIME_HOURS } from './config.js';
import { escapeHTML, asvFullName } from './utils.js';
import { store } from './store.js';
import { getForecastWeek, setForecastWeek, getForecastSig, setForecastSig } from './slots.js';
import { showToast } from './ui.js';

const MAX_CP_WEEKS = 5;

/* ================================================================
   Fonctions pures exportées (testables par Vitest)
   ================================================================ */

/**
 * Formate une Date UTC en "YYYY-MM-DD".
 * @param {Date} d
 * @returns {string}
 */
export function fmtUTCDate(d) {
  return (
    d.getUTCFullYear() +
    '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

/**
 * Génère les semaines ISO de l'année selon la norme ISO 8601 :
 * chaque semaine est rattachée à l'année de son jeudi.
 * @param {number} year
 * @returns {Array<{w:number, mon:Date, sun:Date, ds:Date, de:Date, month:number, mondayISO:string}>}
 */
export function buildYearWeeks(year) {
  const JAN1 = Date.UTC(year, 0, 1);
  const DEC31 = Date.UTC(year, 11, 31);
  const weeks = [];
  let mon = new Date(JAN1);
  const dow = mon.getUTCDay() || 7; // 1=lun…7=dim
  mon = new Date(Date.UTC(year, 0, 1 - (dow - 1)));
  let wNum = 1;
  for (;;) {
    const sun = new Date(mon);
    sun.setUTCDate(mon.getUTCDate() + 6);
    const thu = new Date(mon);
    thu.setUTCDate(mon.getUTCDate() + 3);
    if (thu.getUTCFullYear() > year) break;
    if (thu.getUTCFullYear() === year) {
      const ds = new Date(Math.max(mon.getTime(), JAN1));
      const de = new Date(Math.min(sun.getTime(), DEC31));
      const mondayISO = fmtUTCDate(mon);
      weeks.push({ w: wNum++, mon: new Date(mon), sun: new Date(sun), ds, de, month: thu.getUTCMonth(), mondayISO });
    }
    mon = new Date(mon);
    mon.setUTCDate(mon.getUTCDate() + 7);
  }
  return weeks;
}

/**
 * Total horaire d'un mois (heures uniquement, CP ignoré).
 * @param {string} pid
 * @param {Array} weeks  — semaines du mois (buildYearWeeks filtrées)
 * @returns {number}
 */
export function computeMonthTotal(pid, weeks) {
  return weeks.reduce((sum, wk) => {
    const v = getForecastWeek(pid, wk.mondayISO);
    if (!v || v === 'CP') return sum;
    const n = parseFloat(v);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
}

/**
 * Total annuel (heures uniquement, CP ignoré).
 * @param {string} pid
 * @param {Array} weeks  — toutes les semaines de l'année
 * @returns {number}
 */
export function computeAnnualTotal(pid, weeks) {
  return weeks.reduce((sum, wk) => {
    const v = getForecastWeek(pid, wk.mondayISO);
    if (!v || v === 'CP') return sum;
    const n = parseFloat(v);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
}

/**
 * Nombre de semaines CP pour un ASV et une liste de semaines.
 * @param {string} pid
 * @param {Array} weeks
 * @returns {number}
 */
export function computeCPCount(pid, weeks) {
  return weeks.filter((wk) => getForecastWeek(pid, wk.mondayISO) === 'CP').length;
}

/**
 * Décompose les semaines par volume horaire décroissant + CP.
 * @param {string} pid
 * @param {Array} weeks
 * @returns {Array<{label:string, count:number, isCP:boolean}>}
 */
export function computeBreakdown(pid, weeks) {
  const counts = {};
  let cpCount = 0;
  for (const wk of weeks) {
    const v = getForecastWeek(pid, wk.mondayISO);
    if (!v) continue;
    if (v === 'CP') {
      cpCount++;
      continue;
    }
    counts[v] = (counts[v] || 0) + 1;
  }
  const rows = Object.entries(counts)
    .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
    .map(([h, count]) => ({ label: `${h}h`, count, isCP: false }));
  if (cpCount > 0) rows.push({ label: 'CP', count: cpCount, isCP: true });
  return rows;
}

/* ================================================================
   Callbacks injectés depuis app.js
   ================================================================ */

let _saveData, _snapshotBeforeChange;

export function setupForecast({ saveData, snapshotBeforeChange }) {
  _saveData = saveData;
  _snapshotBeforeChange = snapshotBeforeChange;
}

/* ================================================================
   Rendu principal
   ================================================================ */

/**
 * Initialise l'état de navigation si absent, en s'assurant
 * de retomber sur une ASV non-archivée si nécessaire.
 */
function _initPageState(year) {
  if (!store.forecastPageState) {
    const firstActive = ASV_PEOPLE.find((p) => !p.archived);
    store.forecastPageState = {
      year,
      mode: 'asv',
      currentPid: firstActive?.id || ASV_PEOPLE[0]?.id,
      quickValue: null,
    };
  } else {
    // S'assurer que l'année est toujours à jour
    store.forecastPageState.year = year;
    // S'assurer que la personne sélectionnée existe toujours
    const pid = store.forecastPageState.currentPid;
    if (!ASV_PEOPLE.find((p) => p.id === pid && !p.archived)) {
      store.forecastPageState.currentPid = ASV_PEOPLE.find((p) => !p.archived)?.id || ASV_PEOPLE[0]?.id;
    }
  }
}

/**
 * Point d'entrée : rend la page Prévisionnel dans le conteneur donné.
 * @param {HTMLElement} container
 * @param {number} year  — année à afficher (N+1 en général)
 */
export function renderForecastPage(container, year) {
  if (!container) return;
  _initPageState(year);
  const st = store.forecastPageState;
  const canPrintAll = store.currentUser?.role === 'vet' || store.currentUser?.role === 'admin';
  const printAllBtnHtml = canPrintAll
    ? `<button class="forecast-print-all-btn" id="forecast-print-all-btn" title="Imprimer tous les pr\xe9visionnels">Imprimer tout</button>`
    : '';

  // eslint-disable-next-line no-unsanitized/property
  container.innerHTML = `
    <div class="forecast-page">
      <div class="forecast-page-head">
        <h1 class="forecast-page-title">Pr\xe9visionnel annuel</h1>
        <div class="forecast-mode-toggle" id="forecast-mode-toggle">
          <button data-fmode="asv" class="${st.mode === 'asv' ? 'active' : ''}">Par ASV</button>
          <button data-fmode="cons" class="${st.mode === 'cons' ? 'active' : ''}">Vue consolid\xe9e</button>
        </div>
        <div class="forecast-year-pill">
          <button class="forecast-year-btn" id="forecast-year-prev" aria-label="Ann\xe9e pr\xe9c\xe9dente">‹</button>
          <span id="forecast-year-display">${st.year}</span>
          <button class="forecast-year-btn" id="forecast-year-next" aria-label="Ann\xe9e suivante">›</button>
        </div>
        ${printAllBtnHtml}
      </div>
      <div id="forecast-view-asv" class="${st.mode !== 'asv' ? 'hidden' : ''}"></div>
      <div id="forecast-view-cons" class="${st.mode !== 'cons' ? 'hidden' : ''}"></div>
    </div>
  `;

  // S\xe9lecteur de mode
  container.querySelector('#forecast-mode-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-fmode]');
    if (!btn) return;
    st.mode = btn.dataset.fmode;
    renderForecastPage(container, st.year);
  });

  // S\xe9lecteur d'ann\xe9e
  container.querySelector('#forecast-year-prev').addEventListener('click', () => {
    st.year--;
    renderForecastPage(container, st.year);
  });
  container.querySelector('#forecast-year-next').addEventListener('click', () => {
    st.year++;
    renderForecastPage(container, st.year);
  });

  // Impression par lot (v\xe9t/admin)
  container.querySelector('#forecast-print-all-btn')?.addEventListener('click', () => {
    openForecastPrintWindowAll(st.year);
  });

  if (st.mode === 'asv') {
    _renderASVMode(container.querySelector('#forecast-view-asv'), st.year);
  } else {
    _renderConsMode(container.querySelector('#forecast-view-cons'), st.year);
  }
}

/* ================================================================
   MODE "Par ASV"
   ================================================================ */

function _renderASVMode(view, year) {
  const st = store.forecastPageState;
  const activeASV = ASV_PEOPLE.filter((p) => !p.archived);

  const tabsHtml = activeASV
    .map(
      (p) => `
    <button class="forecast-asv-tab${p.id === st.currentPid ? ' active' : ''}"
      data-fasv-pid="${escapeHTML(p.id)}"
      style="--asv-tab-color:${escapeHTML(p.color)};">
      <span class="forecast-asv-dot" style="background:${escapeHTML(p.color)};"></span>
      ${escapeHTML(p.name || p.short)}
    </button>
  `
    )
    .join('');

  // eslint-disable-next-line no-unsanitized/property
  view.innerHTML = `
    <div class="forecast-asv-tabs" id="forecast-asv-tabs">${tabsHtml}</div>
    <div class="forecast-asv-layout" id="forecast-asv-layout"></div>
  `;

  view.querySelector('#forecast-asv-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fasv-pid]');
    if (!btn) return;
    st.currentPid = btn.dataset.fasvPid;
    st.quickValue = null;
    _renderASVMode(view, year);
  });

  _renderASVContent(view.querySelector('#forecast-asv-layout'), year);
}

function _renderASVContent(layout, year) {
  const st = store.forecastPageState;
  const pid = st.currentPid;
  const sig = getForecastSig(pid, year);
  const weeks = buildYearWeeks(year);
  const isReadOnly = !!sig;
  const canUnsign = store.currentUser?.role === 'vet' || store.currentUser?.role === 'admin';

  // Grouper les semaines par mois (mois du jeudi = .month)
  const byMonth = Array.from({ length: 12 }, () => []);
  weeks.forEach((wk) => byMonth[wk.month].push(wk));

  // Chips valeurs rapides
  const quickValues = ['42', '39', '35', '28'];
  const quickChipsHtml = `
    <div class="forecast-quickbar">
      <span class="forecast-quickbar-lbl">Saisie rapide :</span>
      ${quickValues
        .map(
          (v) => `
        <button class="forecast-chip${st.quickValue === v ? ' active' : ''}"
          data-qv="${v}" ${isReadOnly ? 'disabled' : ''}>
          ${v}h
        </button>
      `
        )
        .join('')}
      <button class="forecast-chip forecast-chip-cp${st.quickValue === 'CP' ? ' active' : ''}"
        data-qv="CP" ${isReadOnly ? 'disabled' : ''}>
        CP
      </button>
      ${st.quickValue ? `<button class="forecast-chip forecast-chip-clear" data-qv-clear="1">✕ Effacer</button>` : ''}
    </div>
  `;

  // Cartes mois
  const monthCardsHtml = byMonth
    .map((mWeeks, mo) => {
      if (!mWeeks.length) return '';
      const monthTotal = computeMonthTotal(pid, mWeeks);
      const weeksHtml = mWeeks.map((wk) => _renderWeekRow(wk, pid, isReadOnly, year)).join('');
      return `
      <div class="forecast-mcard">
        <div class="forecast-month-head">
          <span>${MONTH_NAMES[mo]} ${year}</span>
          <span class="forecast-month-total">${monthTotal > 0 ? monthTotal.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + 'h' : '—'}</span>
        </div>
        ${weeksHtml}
      </div>
    `;
    })
    .join('');

  // eslint-disable-next-line no-unsanitized/property
  layout.innerHTML = `
    <div class="forecast-main">
      ${quickChipsHtml}
      <div class="forecast-months-grid">${monthCardsHtml}</div>
    </div>
    <aside class="forecast-summary" id="forecast-summary-panel"></aside>
  `;

  _renderSummaryPanel(layout.querySelector('#forecast-summary-panel'), pid, year, weeks, sig, canUnsign, isReadOnly);

  // Chips → mise à jour quickValue
  layout.querySelectorAll('[data-qv]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.qv;
      st.quickValue = st.quickValue === v ? null : v;
      _renderASVContent(layout, year);
    });
  });
  layout.querySelector('[data-qv-clear]')?.addEventListener('click', () => {
    st.quickValue = null;
    _renderASVContent(layout, year);
  });

  // Clic sur une ligne-semaine : applique quickValue
  layout.querySelectorAll('.forecast-wk[data-wk-monday]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (!st.quickValue) return;
      if (e.target.closest('input, button')) return;
      const mon = row.dataset.wkMonday;
      _snapshotBeforeChange();
      setForecastWeek(pid, mon, st.quickValue);
      _saveData(false);
      _renderASVContent(layout, year);
    });
  });

  // Inputs numériques
  layout.querySelectorAll('.forecast-h-input').forEach((inp) => {
    inp.addEventListener('change', () => {
      const { fmonday } = inp.dataset;
      const val = inp.value.trim() === '' ? null : parseFloat(inp.value);
      _snapshotBeforeChange();
      setForecastWeek(pid, fmonday, isNaN(val) ? null : val);
      _saveData(false);
      _renderASVContent(layout, year);
    });
  });

  // Boutons CP par semaine
  layout.querySelectorAll('.forecast-wk-cp-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { fmonday } = btn.dataset;
      const isCP = getForecastWeek(pid, fmonday) === 'CP';
      _snapshotBeforeChange();
      setForecastWeek(pid, fmonday, isCP ? null : 'CP');
      _saveData(false);
      _renderASVContent(layout, year);
    });
  });

  // Bouton Signer — ouvre le document A4 puis enregistre la signature
  layout.querySelector('#forecast-sign-btn')?.addEventListener('click', () => {
    openForecastPrintWindow(pid, year);
    const userName =
      store.currentUser?.display_name || store.currentUser?.email || store.currentUser?.person_id || 'Inconnu';
    _snapshotBeforeChange();
    setForecastSig(pid, year, { signedAt: new Date().toISOString(), signedBy: userName });
    _saveData();
    _renderASVContent(layout, year);
    showToast('Document généré — prévisionnel signé', '✍️');
  });

  // Bouton Imprimer (sans signer)
  layout.querySelector('#forecast-print-btn')?.addEventListener('click', () => {
    openForecastPrintWindow(pid, year);
  });

  // Bouton R\xe9initialiser (vet/admin uniquement)
  layout.querySelector('#forecast-unsign-btn')?.addEventListener('click', () => {
    _snapshotBeforeChange();
    setForecastSig(pid, year, null);
    _saveData(false);
    _renderASVContent(layout, year);
  });
}

/**
 * Lit les variables CSS de la charte en forçant le thème clair.
 * Restaure le thème précédent immédiatement après.
 */
function _getLightThemeColors() {
  const root = document.documentElement;
  const savedTheme = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  const cs = getComputedStyle(root);
  const g = (v) => cs.getPropertyValue(v).trim();
  const colors = {
    primary: g('--color-primary') || '#EA580C',
    cpBg: g('--color-cp') || '#D1FAE5',
    cpText: g('--color-cp-text') || '#065F46',
    text: g('--color-text') || '#1E293B',
    textMuted: g('--color-text-muted') || '#8A8577',
    border: g('--color-border') || '#ECE7DE',
    surface: g('--color-surface') || '#FFFFFF',
  };
  if (savedTheme) root.setAttribute('data-theme', savedTheme);
  else root.removeAttribute('data-theme');
  return colors;
}

/** Logo depuis le DOM en dataURL (même technique que openMonthPrintWindow). */
function _getLogoDataUrl() {
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

/**
 * Construit le HTML d'une page imprimable pour un ASV et une année.
 * Partagé entre impression individuelle et par lot.
 */
function _buildForecastPrintPage(pid, year, colors, logoSrc) {
  const fullName = asvFullName(pid) || pid;
  const weeks = buildYearWeeks(year);
  const byMonth = Array.from({ length: 12 }, () => []);
  weeks.forEach((wk) => byMonth[wk.month].push(wk));

  const annualTotal = computeAnnualTotal(pid, weeks);
  const cpCount = computeCPCount(pid, weeks);
  const breakdown = computeBreakdown(pid, weeks);
  const diff = Math.round((annualTotal - ANNUAL_FULLTIME_HOURS) * 10) / 10;
  const diffStr = (diff >= 0 ? '+' : '') + diff + ' h';

  const { primary, cpBg, cpText, text, textMuted, border } = colors;

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" alt="Amivet" style="height:36px;width:auto;display:block;border-radius:7px;">`
    : `<div style="width:36px;height:36px;border-radius:9px;background:${primary};display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;">\u{1F43E}</div>`;

  function fmtRange(wk) {
    const sd = wk.ds.getUTCDate(),
      ed = wk.de.getUTCDate();
    const sm = wk.ds.getUTCMonth(),
      em = wk.de.getUTCMonth();
    const M3p = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    if (sm === em) return `${sd}–${ed}`;
    return `${sd} ${M3p[sm]}–${ed} ${M3p[em]}`;
  }

  const QTITLES = ['1er trimestre', '2e trimestre', '3e trimestre', '4e trimestre'];
  const MNAMES = [
    'Janvier',
    'F\xe9vrier',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Ao\xfbt',
    'Septembre',
    'Octobre',
    'Novembre',
    'D\xe9cembre',
  ];

  const quartersHtml = [0, 1, 2, 3]
    .map((q) => {
      const monthsHtml = [q * 3, q * 3 + 1, q * 3 + 2]
        .map((mo) => {
          const mWeeks = byMonth[mo];
          if (!mWeeks.length) return '<div class="mo"></div>';
          const moTotal = computeMonthTotal(pid, mWeeks);
          const wkRows = mWeeks
            .map((wk) => {
              const v = getForecastWeek(pid, wk.mondayISO);
              const isCP = v === 'CP';
              const h = isCP ? 0 : parseFloat(v) || 0;
              return (
                `<div class="wk${isCP ? ' cp' : ''}">` +
                `<span class="s">S${String(wk.w).padStart(2, '0')}</span>` +
                `<span class="dt">${fmtRange(wk)}</span>` +
                `<span class="h">${isCP ? 'CP' : h ? h + '&thinsp;h' : '—'}</span>` +
                `</div>`
              );
            })
            .join('');
          return (
            `<div class="mo">` +
            `<div class="mo-h"><span class="nm">${MNAMES[mo]}</span>` +
            `<span class="tot">${moTotal > 0 ? Math.round(moTotal) + '&thinsp;h' : '—'}</span></div>` +
            wkRows +
            `</div>`
          );
        })
        .join('');
      return (
        `<div class="qtr"><div class="qtr-label">${QTITLES[q]}</div>` + `<div class="months">${monthsHtml}</div></div>`
      );
    })
    .join('');

  const diffClass = diff >= 0 ? 'kpi pos' : 'kpi neg';
  const kpisHtml =
    `<div class="kpi"><div class="k">Total pr&eacute;visionnel</div>` +
    `<div class="v">${Math.round(annualTotal)}&thinsp;<small>h</small></div></div>` +
    `<div class="kpi"><div class="k">Objectif l&eacute;gal</div>` +
    `<div class="v">${ANNUAL_FULLTIME_HOURS}&thinsp;<small>h</small></div></div>` +
    `<div class="${diffClass}"><div class="k">Diff&eacute;rence</div>` +
    `<div class="v">${escapeHTML(diffStr)}</div></div>` +
    `<div class="kpi"><div class="k">Cong&eacute;s pay&eacute;s</div>` +
    `<div class="v">${cpCount}&thinsp;<small>/ 5 sem.</small></div></div>`;

  const brkRows = breakdown
    .map(
      (r) =>
        `<div class="brk-row${r.isCP ? ' cp' : ''}">` +
        `<span class="lab">${r.isCP ? 'Cong&eacute;s pay&eacute;s (CP)' : escapeHTML(r.label) + '&thinsp;/ sem.'}</span>` +
        `<span class="n">${r.count}&thinsp;sem.</span></div>`
    )
    .join('');

  return (
    `<div class="sheet">` +
    `<div class="hdr"><div class="hdr-l">${logoHtml}` +
    `<div class="clinic">Clinique Amivet<small>Planning pr&eacute;visionnel &middot; ASV</small></div></div>` +
    `<div class="hdr-r"><div class="who">${escapeHTML(fullName)}</div>` +
    `<div class="per">Pr&eacute;visionnel ${year}</div></div></div>` +
    `<div class="subline">P&eacute;riode du 1er janvier au 31 d&eacute;cembre ${year} &middot; heures pr&eacute;vues par semaine</div>` +
    quartersHtml +
    `<div class="foot"><div class="kpis">${kpisHtml}</div>` +
    `<div class="brk"><div class="brk-h">Nombre de semaines par volume</div>` +
    `<div class="brk-body">${brkRows}</div></div></div>` +
    `<div class="sig-title">Signatures &mdash; lu et approuv&eacute;</div>` +
    `<div class="sigs">` +
    `<div class="sig"><div class="role">L&rsquo;employ&eacute;(e) &mdash; ASV</div>` +
    `<div class="lu">Bon pour accord sur le pr&eacute;visionnel annuel</div>` +
    `<div class="line"></div><div class="who2">${escapeHTML(fullName)}</div></div>` +
    `<div class="sig"><div class="role">L&rsquo;employeur &mdash; V&eacute;t&eacute;rinaire(s)</div>` +
    `<div class="lu">Bon pour accord sur le pr&eacute;visionnel annuel</div>` +
    `<div class="line"></div><div class="who2">Dr David Pelois &amp; Dr St&eacute;phane Maquinay</div></div>` +
    `</div><div class="genline">Amivet PULSE &mdash; pr&eacute;visionnel ${year}</div></div>`
  );
}

function _buildPrintWindowCss(colors) {
  const { primary, cpBg, cpText, text, textMuted, border } = colors;
  const pos = '#15803D',
    neg = '#B91C1C';
  return (
    `@page{size:A4 portrait;margin:12mm;}` +
    `*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact;}` +
    `body{background:#fff;color:${text};}` +
    `.sheet{background:#fff;page-break-after:always;}` +
    `.sheet:last-child{page-break-after:auto;}` +
    `.hdr{display:flex;justify-content:space-between;align-items:flex-start;` +
    `border-bottom:2.5px solid ${text};padding-bottom:9px;margin-bottom:4px;}` +
    `.hdr-l{display:flex;align-items:center;gap:12px;}` +
    `.clinic{font-size:14px;font-weight:800;letter-spacing:.01em;line-height:1.15;color:${text};}` +
    `.clinic small{display:block;font-size:9.5px;font-weight:600;color:${textMuted};` +
    `letter-spacing:.06em;margin-top:2px;}` +
    `.hdr-r{text-align:right;}` +
    `.hdr-r .who{font-size:19px;font-weight:800;color:${text};}` +
    `.hdr-r .per{font-size:11px;color:${primary};font-weight:600;margin-top:1px;}` +
    `.subline{font-size:10px;color:${textMuted};margin:6px 0 10px;}` +
    `.qtr{margin-bottom:9px;break-inside:avoid;}` +
    `.qtr-label{font-size:10px;font-weight:700;color:${primary};letter-spacing:.08em;` +
    `text-transform:uppercase;margin:0 0 4px 1px;}` +
    `.months{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;}` +
    `.mo{border:1px solid ${border};border-radius:7px;overflow:hidden;break-inside:avoid;}` +
    `.mo-h{display:flex;justify-content:space-between;align-items:baseline;` +
    `background:#F8FAFC;padding:4px 8px;border-bottom:1px solid ${border};}` +
    `.mo-h .nm{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${text};}` +
    `.mo-h .tot{font-size:10.5px;font-weight:800;color:${text};}` +
    `.wk{display:flex;align-items:center;gap:6px;padding:3px 8px;font-size:9.5px;` +
    `border-top:1px solid #EEF2F6;}` +
    `.wk:first-of-type{border-top:none;}` +
    `.wk .s{width:22px;color:${textMuted};font-size:8px;font-weight:600;}` +
    `.wk .dt{flex:1;color:${textMuted};font-size:9px;white-space:nowrap;}` +
    `.wk .h{font-weight:700;font-size:10px;color:${text};}` +
    `.wk.cp{background:${cpBg};}` +
    `.wk.cp .h{color:${cpText};}` +
    `.wk.cp .s{color:${cpText};}` +
    `.foot{margin-top:7px;border-top:2px solid ${text};padding-top:10px;` +
    `display:grid;grid-template-columns:1.55fr 1fr;gap:14px;break-inside:avoid;}` +
    `.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;align-content:start;}` +
    `.kpi{border:1px solid ${border};border-radius:7px;padding:7px 9px;}` +
    `.kpi .k{font-size:8.5px;color:${textMuted};font-weight:600;text-transform:uppercase;letter-spacing:.04em;}` +
    `.kpi .v{font-size:16px;font-weight:800;margin-top:3px;line-height:1;color:${text};}` +
    `.kpi .v small{font-size:9.5px;font-weight:600;color:${textMuted};}` +
    `.kpi.pos .v{color:${pos};}` +
    `.kpi.neg .v{color:${neg};}` +
    `.brk{border:1px solid ${border};border-radius:7px;overflow:hidden;}` +
    `.brk-h{background:#F8FAFC;padding:4px 9px;font-size:8.5px;font-weight:700;` +
    `color:${textMuted};text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid ${border};}` +
    `.brk-row{display:flex;justify-content:space-between;align-items:center;` +
    `padding:3px 9px;font-size:9.5px;border-top:1px solid #EEF2F6;}` +
    `.brk-row:first-of-type{border-top:none;}` +
    `.brk-row .n{font-weight:700;color:${text};}` +
    `.brk-row .lab{color:${textMuted};}` +
    `.brk-row.cp .lab,.brk-row.cp .n{color:${cpText};}` +
    `.sig-title{font-size:9px;font-weight:700;color:${textMuted};text-transform:uppercase;` +
    `letter-spacing:.06em;margin:13px 0 7px;}` +
    `.sigs{display:grid;grid-template-columns:1fr 1fr;gap:18px;}` +
    `.sig{border:1px solid ${border};border-radius:7px;padding:9px 11px 11px;}` +
    `.sig .role{font-size:10.5px;font-weight:700;color:${text};}` +
    `.sig .lu{font-size:9px;color:${textMuted};font-style:italic;margin-top:1px;}` +
    `.sig .line{border-bottom:1px solid ${text};height:33px;margin:8px 0 4px;}` +
    `.sig .who2{font-size:9.5px;color:${textMuted};}` +
    `.genline{margin-top:12px;text-align:right;font-size:8px;color:${textMuted};}`
  );
}

/**
 * Affiche un aperçu imprimable en overlay plein écran sur la page courante.
 * "Imprimer" → window.print() ; "Fermer" / Échap → démonte l'overlay.
 */
function _openForecastOverlay(pagesHtml, css, title) {
  const styleEl = document.createElement('style');
  styleEl.id = 'fp-print-style';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const screenStyleEl = document.createElement('style');
  screenStyleEl.id = 'fp-screen-style';
  screenStyleEl.textContent =
    '.forecast-print-sheet-wrap .sheet{' +
    'width:210mm;background:#fff;margin:0 auto 16px;' +
    'box-shadow:0 2px 14px rgba(0,0,0,.12);padding:14mm 14mm 12mm;}';
  document.head.appendChild(screenStyleEl);

  const overlay = document.createElement('div');
  overlay.className = 'forecast-print-overlay';
  overlay.id = 'forecast-print-overlay';
  // eslint-disable-next-line no-unsanitized/property
  overlay.innerHTML =
    `<div class="forecast-print-toolbar">` +
    `<span class="fpt-title">${escapeHTML(title)}</span>` +
    `<div class="fpt-btns">` +
    `<button class="fpt-btn-print">🖨️ Imprimer</button>` +
    `<button class="fpt-btn-close">✕ Fermer</button>` +
    `</div></div>` +
    `<div class="forecast-print-sheet-wrap">${pagesHtml}</div>`;
  document.body.appendChild(overlay);

  function _close() {
    overlay.remove();
    styleEl.remove();
    screenStyleEl.remove();
    document.removeEventListener('keydown', _onKey);
  }
  function _onKey(e) { if (e.key === 'Escape') _close(); }

  overlay.querySelector('.fpt-btn-close').addEventListener('click', _close);
  overlay.querySelector('.fpt-btn-print').addEventListener('click', () => window.print());
  document.addEventListener('keydown', _onKey);
}

/**
 * Aperçu imprimable inline pour le prévisionnel d'un ASV.
 * Conforme à la maquette apercu-previsionnel-impression.html.
 */
function openForecastPrintWindow(pid, year) {
  const colors = _getLightThemeColors();
  const logoSrc = _getLogoDataUrl();
  const pageHtml = _buildForecastPrintPage(pid, year, colors, logoSrc);
  const css = _buildPrintWindowCss(colors);
  const fullName = asvFullName(pid) || pid;
  _openForecastOverlay(pageHtml, css, `Pr\xe9visionnel ${year} — ${fullName}`);
}

/**
 * Aperçu imprimable par lot : une feuille A4 par ASV active (vét/admin uniquement).
 */
export function openForecastPrintWindowAll(year) {
  const colors = _getLightThemeColors();
  const logoSrc = _getLogoDataUrl();
  const activeASV = ASV_PEOPLE.filter((p) => !p.archived);
  if (!activeASV.length) { showToast('Aucune ASV active \xe0 imprimer', '⚠️'); return; }
  const pagesHtml = activeASV.map((p) => _buildForecastPrintPage(p.id, year, colors, logoSrc)).join('\n');
  const css = _buildPrintWindowCss(colors);
  _openForecastOverlay(pagesHtml, css, `Pr\xe9visionnel ${year} — toutes les ASV`);
}

/**
 * Formate la plage de dates d'une semaine : "1–7" ou "29 déc – 4 janv" si cheval sur 2 mois.
 */
function _formatWeekRange(wk, year) {
  const startD = wk.ds.getUTCDate();
  const endD = wk.de.getUTCDate();
  const startM = wk.ds.getUTCMonth();
  const endM = wk.de.getUTCMonth();
  const startY = wk.ds.getUTCFullYear();
  const endY = wk.de.getUTCFullYear();
  if (startM === endM && startY === endY) {
    return `${startD}–${endD}`;
  }
  const sLabel = `${startD} ${MONTH_SHORT[startM]}${startY !== year ? ' ' + startY : ''}`;
  const eLabel = `${endD} ${MONTH_SHORT[endM]}${endY !== year ? ' ' + endY : ''}`;
  return `${sLabel} – ${eLabel}`;
}

function _renderWeekRow(wk, pid, isReadOnly, year) {
  const v = getForecastWeek(pid, wk.mondayISO);
  const isCP = v === 'CP';
  const numVal = isCP || !v ? '' : v;
  const range = _formatWeekRange(wk, year);
  const wkNumLabel = `S${String(wk.w).padStart(2, '0')}`;
  const rowCls = isCP ? ' forecast-wk-cp' : '';
  const cursor = 'style="cursor:pointer;"'; // quickValue click

  if (isCP) {
    return `
      <div class="forecast-wk${rowCls}" data-wk-monday="${escapeHTML(wk.mondayISO)}" ${cursor}>
        <span class="forecast-wk-num">${wkNumLabel}</span>
        <span class="forecast-wk-date">${range}</span>
        <button class="forecast-wk-cp-btn forecast-wk-cp-btn-on"
          data-fmonday="${escapeHTML(wk.mondayISO)}"
          ${isReadOnly ? 'disabled' : ''}
          title="Retirer le CP">CP</button>
      </div>`;
  }

  return `
    <div class="forecast-wk${rowCls}" data-wk-monday="${escapeHTML(wk.mondayISO)}" ${cursor}>
      <span class="forecast-wk-num">${wkNumLabel}</span>
      <span class="forecast-wk-date">${range}</span>
      <input class="forecast-h-input"
        type="number" min="0" max="60" step="0.5"
        data-fmonday="${escapeHTML(wk.mondayISO)}"
        value="${escapeHTML(numVal)}"
        placeholder="h"
        ${isReadOnly ? 'disabled' : ''}>
      <span class="forecast-wk-unit">h</span>
      <button class="forecast-wk-cp-btn"
        data-fmonday="${escapeHTML(wk.mondayISO)}"
        ${isReadOnly ? 'disabled' : ''}
        title="Marquer CP">CP</button>
    </div>`;
}

function _renderSummaryPanel(panel, pid, year, weeks, sig, canUnsign, isReadOnly) {
  const totalH = computeAnnualTotal(pid, weeks);
  const cpCount = computeCPCount(pid, weeks);
  const cpLeft = MAX_CP_WEEKS - cpCount;
  const reliquat = parseFloat(store.DATA.slots[`asv_reliquat_${pid}_${year - 1}`]) || 0;
  const diff = totalH + reliquat - ANNUAL_FULLTIME_HOURS;
  const diffSign = diff >= 0 ? '+' : '';
  const diffCls = Math.abs(diff) <= 10 ? 'forecast-diff-ok' : 'forecast-diff-warn';
  const breakdown = computeBreakdown(pid, weeks);
  const maxCount = Math.max(...breakdown.map((r) => r.count), 1);

  const sigBannerHtml = sig
    ? `<div class="forecast-signed-banner">
        Prévisionnel signé par <strong>${escapeHTML(sig.signedBy)}</strong>
        le ${new Date(sig.signedAt).toLocaleDateString('fr-FR')}.
        ${canUnsign ? `<button class="forecast-unsign-link" id="forecast-unsign-btn">Réinitialiser</button>` : ''}
      </div>`
    : '';

  const signBtnHtml = !isReadOnly
    ? `<button class="forecast-sign-btn" id="forecast-sign-btn">Signer le pr\xe9visionnel</button>`
    : '';
  const printBtnHtml = `<button class="forecast-print-btn" id="forecast-print-btn">Imprimer le pr\xe9visionnel</button>`;

  const breakdownRows = breakdown
    .map((r) => {
      const pct = Math.round((r.count / maxCount) * 100);
      return `
      <tr class="${r.isCP ? 'forecast-brk-cp-row' : ''}">
        <td>${escapeHTML(r.label)}</td>
        <td>${r.count} sem.</td>
      </tr>
      <tr class="forecast-brk-bar-row">
        <td colspan="2">
          <div class="forecast-brk-bar-track">
            <div class="forecast-brk-bar${r.isCP ? ' forecast-brk-bar-cp' : ''}" style="width:${pct}%;"></div>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  // eslint-disable-next-line no-unsanitized/property
  panel.innerHTML = `
    <div class="forecast-summary">
      ${sigBannerHtml}
      <div class="forecast-sum-lbl">Total prévisionnel</div>
      <div class="forecast-sum-big">${totalH.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}h</div>
      <div class="forecast-sum-divider"></div>
      <div class="forecast-sum-row">
        <span>Objectif légal</span>
        <span>${ANNUAL_FULLTIME_HOURS}h</span>
      </div>
      ${
        reliquat !== 0
          ? `<div class="forecast-sum-row">
        <span>Reliquat N-1</span>
        <span>${reliquat >= 0 ? '+' : ''}${reliquat.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}h</span>
      </div>`
          : ''
      }
      <div class="forecast-sum-row">
        <span>Différence</span>
        <span class="${diffCls}">${diffSign}${Math.abs(diff).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}h</span>
      </div>
      <div class="forecast-sum-row">
        <span>CP</span>
        <span class="${cpCount > MAX_CP_WEEKS ? 'forecast-diff-warn' : ''}">
          ${cpCount}/${MAX_CP_WEEKS} sem.
          ${cpLeft < 0 ? `<span class="forecast-diff-warn">(${Math.abs(cpLeft)} en trop)</span>` : ''}
        </span>
      </div>
      <div class="forecast-sum-divider"></div>
      <div class="forecast-brk-title">Répartition hebdomadaire</div>
      <table class="forecast-brk">
        <tbody>${breakdownRows}</tbody>
      </table>
      <div class="forecast-sum-divider"></div>
      ${printBtnHtml}
      ${signBtnHtml}
      <p class="forecast-sum-hint">CP : mai–oct. min 2 sem. cons\xe9cutives, nov.–avr. max 3 sem.</p>
    </div>
  `;
}

/* ================================================================
   MODE "Vue consolidée"
   ================================================================ */

function _renderConsMode(view, year) {
  const activeASV = ASV_PEOPLE.filter((p) => !p.archived);
  const weeks = buildYearWeeks(year);

  // Totaux annuels par ASV (pour tfoot)
  const totals = {};
  activeASV.forEach((p) => {
    totals[p.id] = computeAnnualTotal(p.id, weeks);
  });

  // En-têtes ASV
  const thASV = activeASV
    .map(
      (p) => `
    <th class="forecast-cons-asv-th" data-cons-pid="${escapeHTML(p.id)}"
      style="cursor:pointer;" title="Voir le prévisionnel de ${escapeHTML(p.name || p.short)}">
      <span class="forecast-asv-dot-sm" style="background:${escapeHTML(p.color)};"></span>
      ${escapeHTML(p.short)}
    </th>
  `
    )
    .join('');

  // Corps du tableau
  const tbodyRows = weeks
    .map((wk) => {
      // Détection chevauchement CP : >= 2 ASV en CP cette semaine
      const cpCount = activeASV.filter((p) => getForecastWeek(p.id, wk.mondayISO) === 'CP').length;
      const rowCoverWarn = cpCount >= 2;

      const dayLabel = `${wk.ds.getUTCDate()} ${MONTH_SHORT[wk.ds.getUTCMonth()]}`;
      const cells = activeASV
        .map((p) => {
          const v = getForecastWeek(p.id, wk.mondayISO);
          const isCP = v === 'CP';
          let cellCls = 'forecast-cons-cell';
          if (isCP && rowCoverWarn) cellCls += ' forecast-cons-cell-cp-warn';
          else if (isCP) cellCls += ' forecast-cons-cell-cp';
          return `<td class="${cellCls}">${v ? escapeHTML(v) : '—'}</td>`;
        })
        .join('');

      return `<tr class="${rowCoverWarn ? 'forecast-cons-row-warn' : ''}">
      <td class="forecast-cons-wkcol">S${String(wk.w).padStart(2, '0')} · ${dayLabel}</td>
      ${cells}
    </tr>`;
    })
    .join('');

  // Ligne totaux
  const tfootCells = activeASV
    .map(
      (p) =>
        `<td class="forecast-cons-total">${totals[p.id].toLocaleString('fr-FR', { maximumFractionDigits: 1 })}h</td>`
    )
    .join('');

  // eslint-disable-next-line no-unsanitized/property
  view.innerHTML = `
    <div class="forecast-cons-legend">
      <span class="forecast-cons-swatch forecast-cons-swatch-cp"></span> CP
      <span class="forecast-cons-swatch forecast-cons-swatch-warn" style="margin-left:12px;"></span> ≥ 2 ASV en CP simultanément
    </div>
    <div class="forecast-cons-wrap">
      <table class="forecast-cons-table">
        <thead>
          <tr>
            <th class="forecast-cons-wkcol">Semaine</th>
            ${thASV}
          </tr>
        </thead>
        <tbody>${tbodyRows}</tbody>
        <tfoot>
          <tr class="forecast-cons-tfoot">
            <td class="forecast-cons-wkcol">Total année</td>
            ${tfootCells}
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  // Clic sur une cellule ou un en-tête ASV → bascule en mode "Par ASV"
  view.querySelectorAll('[data-cons-pid]').forEach((el) => {
    el.addEventListener('click', () => {
      store.forecastPageState.mode = 'asv';
      store.forecastPageState.currentPid = el.dataset.consPid;
      store.forecastPageState.quickValue = null;
      // Remonter au conteneur forecast-page pour re-render complet
      const root = document.getElementById('asv-sub-forecast');
      if (root) renderForecastPage(root, year);
    });
  });
}

/* ================================================================
   CSS ajouté dans src/style.css (déclarations ici pour référence)
   ================================================================ */
