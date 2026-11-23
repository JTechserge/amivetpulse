/* Écart réalisé − prévisionnel ASV.
   Le prévisionnel est saisi par semaine (clé = lundi ISO) dans la vue
   Prévisionnel : un nombre d'heures ("35", "35.5"), le marqueur "CP", ou rien. */

/**
 * Heures prévues d'une valeur de prévisionnel hebdomadaire.
 * @param {string|number|null|undefined} v
 * @returns {number|null} null si non renseigné, CP ou illisible.
 */
export function parseForecastHours(v) {
  if (v === null || v === undefined || v === '' || v === 'CP') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Écart réalisé − prévu, arrondi à la minute.
 * @param {number} actualH
 * @param {number|null} forecastH
 * @returns {number|null} null quand il n'y a pas de prévisionnel à comparer.
 */
export function forecastDelta(actualH, forecastH) {
  if (forecastH === null || forecastH === undefined || !(forecastH > 0)) return null;
  return Math.round((actualH - forecastH) * 60) / 60;
}

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Total prévu d'un mois. Une semaine est rattachée au mois de son vendredi
 * (même règle que le tableau « Heures mensuelles » du Suivi ASV).
 * @param {(mondayISO: string) => (string|null)} getWeek  lecture du prévisionnel d'une personne
 * @param {number} year
 * @param {number} month  0-11
 * @returns {number}
 */
export function forecastMonthTotal(getWeek, year, month) {
  let total = 0;
  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay();
  let d = new Date(year, 0, 1 + (dow === 0 ? -6 : 1 - dow));
  const limit = new Date(year, 11, 31);
  while (d <= limit) {
    const h = parseForecastHours(getWeek(isoLocal(d)));
    if (h !== null) {
      const friday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 4);
      const mo = friday.getFullYear() === year ? friday.getMonth() : d.getFullYear() === year ? d.getMonth() : -1;
      if (mo === month) total += h;
    }
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  }
  return total;
}
