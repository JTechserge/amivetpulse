import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { MONTH_NAMES } from '../config.js';
import { asvFullName, escapeHTML, fmtISO, holidayName, formatHHMM, daysInMonth } from '../utils.js';
import {
  getSlotState, getSlotLabel, getShiftType, getEarlyDep,
  getDayAllOtH, getDayDeficitH, getDayNominal,
} from '../slots.js';

const DOW_FR = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];

const ROW_BG_EVEN  = '#F6F6F6';
const ROW_BG_ODD   = '#ffffff';
const ROW_BG_SAT   = '#EBEBEB';
const ROW_BG_HOL   = '#F2F2F2';

function rowBg(isSat, isHol, idx) {
  if (isSat || isHol) return isSat ? ROW_BG_SAT : ROW_BG_HOL;
  return idx % 2 === 0 ? ROW_BG_ODD : ROW_BG_EVEN;
}

function td(content, extraStyle = '') {
  return `<td style="padding:4px 8px;font-size:12px;line-height:1.35;
    border-bottom:1px solid #E0E0E0;border-right:1px solid #E0E0E0;
    vertical-align:middle;${extraStyle}">${content}</td>`;
}

function getLogoDataUrl() {
  const img = document.querySelector('img.brand-logo') || document.querySelector('img.login-logo');
  if (!img || !img.complete || !img.naturalWidth) return '';
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  } catch { return img.src; }
}

function buildSheetHtml({ personId, year, month, signedAt, signedName, logoSrc }) {
  const fullName = asvFullName(personId);
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const nb = daysInMonth(year, month);

  const signedDateTimeStr = new Date(signedAt).toLocaleString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
  });

  let rows = '';
  let mTotalH = 0, mTotalOt = 0, mTotalDef = 0;
  let rowIdx = 0;

  for (let day = 1; day <= nb; day++) {
    const dt = new Date(year, month, day);
    if (dt.getDay() === 0) continue;
    const iso = fmtISO(dt);
    const hName = holidayName(iso) || '';
    const dow = dt.getDay();
    const isSat = dow === 6;
    const mS = getSlotState(iso, personId, 'M');
    const amS = getSlotState(iso, personId, 'AM');
    const present = mS === 'present' || amS === 'present';
    const absent  = mS === 'absent'  && amS === 'absent';
    const shType  = getShiftType(iso, personId);
    const early   = getEarlyDep(iso, personId);
    const otH     = present ? getDayAllOtH(iso, personId)  : 0;
    const defH    = present ? getDayDeficitH(iso, personId) : 0;
    const nom     = present ? getDayNominal(iso, personId)  : 0;
    const total   = present ? Math.round((nom + otH - defH) * 100) / 100 : 0;
    if (present) { mTotalH += total; mTotalOt += otH; mTotalDef += defH; }

    let stateCell;
    if (hName) {
      stateCell = `<em>${escapeHTML(hName)}</em>`;
    } else if (absent) {
      const lbl = (getSlotLabel(iso, personId, 'M') || getSlotLabel(iso, personId, 'AM') || '').toLowerCase();
      stateCell = lbl.includes('congé') || lbl.includes('conge')
        ? '<em>Congé</em>'
        : lbl.includes('maladie') ? '<em>Maladie</em>' : '<em>Repos / Congé</em>';
    } else if (present) {
      stateCell = `Poste ${shType === 'F' ? 'Fermeture' : 'Ouverture'}${early ? ` — départ ${early}` : ''}`;
    } else {
      stateCell = '<span style="color:#BBB;">—</span>';
    }

    const bg = rowBg(isSat, !!hName, rowIdx);
    const textColor = (hName || absent) ? '#555' : '#111';
    const fontStyle = (isSat || hName) ? 'font-style:italic;' : '';
    const trStyle = `background:${bg};color:${textColor};${fontStyle}`;

    const hCell  = present ? formatHHMM(total) : '<span style="color:#BBB;">—</span>';
    const otCell = otH  > 0 ? `<strong>+${formatHHMM(otH)}</strong>`  : '<span style="color:#BBB;">—</span>';
    const dfCell = defH > 0 ? `<strong>−${formatHHMM(defH)}</strong>` : '<span style="color:#BBB;">—</span>';

    rows += `<tr style="${trStyle}">
      ${td(`${DOW_FR[dow]}&nbsp;${day}`, 'font-weight:700;white-space:nowrap;width:58px;')}
      ${td(stateCell)}
      ${td(hCell, 'text-align:center;width:72px;')}
      ${td(otCell, 'text-align:center;width:72px;')}
      ${td(dfCell, 'text-align:center;width:72px;border-right:none;')}
    </tr>`;
    rowIdx++;
  }

  const fTH  = Math.round(mTotalH  * 100) / 100;
  const fTOt = Math.round(mTotalOt * 100) / 100;
  const fTDef= Math.round(mTotalDef* 100) / 100;
  const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const logoHtml = logoSrc ? `<img style="height:38px;width:auto;display:block;" src="${logoSrc}" alt="Amivet">` : '';

  const totTd = (content) =>
    `<td style="padding:6px 8px;background:#111;color:#fff;font-weight:700;font-size:12px;border-right:1px solid #333;">${content}</td>`;
  const totTdLast = (content) =>
    `<td style="padding:6px 8px;background:#111;color:#fff;font-weight:700;font-size:12px;">${content}</td>`;

  return `<div style="
      width:793px;background:#fff;padding:53px 68px 45px;
      font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;
        padding-bottom:9px;margin-bottom:12px;border-bottom:3px solid #111;">
      <div style="display:flex;align-items:center;gap:12px;">
        ${logoHtml}
        <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.07em;line-height:1.5;">
          <strong style="display:block;font-size:14px;color:#111;letter-spacing:.02em;font-weight:700;">Clinique Amivet</strong>
          Planning mensuel · ASV
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:20px;font-weight:700;color:#111;line-height:1.1;">${escapeHTML(fullName)}</div>
        <div style="font-size:13px;color:#555;margin-top:2px;">${escapeHTML(monthLabel)}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1.5px solid #111;">
      <thead>
        <tr style="background:#111;">
          <th style="padding:6px 8px;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;text-align:left;border-right:1px solid #333;width:58px;">Jour</th>
          <th style="padding:6px 8px;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;text-align:left;border-right:1px solid #333;">Statut / Poste</th>
          <th style="padding:6px 8px;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;text-align:center;border-right:1px solid #333;width:72px;">Heures</th>
          <th style="padding:6px 8px;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;text-align:center;border-right:1px solid #333;width:72px;">H.supp.</th>
          <th style="padding:6px 8px;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;text-align:center;width:72px;">H.d&eacute;f.</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr>
          ${totTd(`<span style="padding:0;display:inline;">Total mensuel</span>`)}
          ${totTd('')}
          ${totTd(`<span style="display:block;text-align:center;">${formatHHMM(fTH)}</span>`)}
          ${totTd(`<span style="display:block;text-align:center;">${fTOt > 0 ? '+' + formatHHMM(fTOt) : '—'}</span>`)}
          ${totTdLast(`<span style="display:block;text-align:center;">${fTDef > 0 ? '−' + formatHHMM(fTDef) : '—'}</span>`)}
        </tr>
      </tbody>
    </table>
    <div style="border:1px solid #999;border-radius:3px;padding:10px 14px;margin-bottom:10px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#333;margin-bottom:10px;">
        Lu et approuv&eacute;
      </div>
      <div style="display:flex;gap:32px;">
        <div style="flex:1;">
          <div style="font-size:10px;color:#666;margin-bottom:3px;">Signature de l&rsquo;ASV</div>
          <div style="font-family:'Caveat',cursive;font-size:26px;color:#111;
              border-bottom:1px solid #888;min-height:40px;padding-bottom:4px;line-height:1.2;">
            ${escapeHTML(fullName)}
          </div>
        </div>
        <div style="flex:1;">
          <div style="font-size:10px;color:#666;margin-bottom:3px;">Signature du v&eacute;t&eacute;rinaire</div>
          <div style="border-bottom:1px solid #888;min-height:40px;"></div>
        </div>
      </div>
      <div style="font-size:10px;color:#444;margin-top:8px;line-height:1.5;">
        Sign&eacute; &eacute;lectroniquement par <strong>${escapeHTML(signedName)}</strong>
        le ${escapeHTML(signedDateTimeStr)} (heure de Paris) &middot; Amivet PULSE (SES eIDAS)
      </div>
    </div>
    <div style="font-size:10px;color:#AAA;text-align:right;border-top:1px solid #DDD;padding-top:5px;">
      G&eacute;n&eacute;r&eacute; le ${escapeHTML(printDate)} &mdash; Amivet PULSE
    </div>
  </div>`;
}

export async function generateSignaturePdf({ personId, year, month, signedAt, signedName }) {
  const logoSrc = getLogoDataUrl();

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;z-index:-1;';
  // eslint-disable-next-line no-unsanitized/property
  wrapper.innerHTML = buildSheetHtml({ personId, year, month, signedAt, signedName, logoSrc });
  document.body.appendChild(wrapper);

  try {
    await document.fonts.load('400 1em Caveat');
    await document.fonts.ready;

    const sheetEl = wrapper.firstElementChild;
    const canvas = await html2canvas(sheetEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.88);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth = 210;
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

    return pdf.output('datauristring').split(',')[1];
  } finally {
    document.body.removeChild(wrapper);
  }
}
