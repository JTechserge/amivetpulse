/* ================================================================
   TEMPS DE TRAVAIL CONTRACTUEL — règle pure, sans DOM
   ----------------------------------------------------------------
   ENJEU DE PAIE. `timeFraction` proratise les CP acquis
   (leave-requests.js getCPAcquired) et la cible annuelle du tableau
   de bord. Une valeur canonisée par erreur ne se voit pas : elle est
   indistinguable d'une valeur juste.

   Le défaut que ce module existe pour empêcher :
   l'interface affiche le pourcentage arrondi d'une fraction dérivée
   (Carla : (7 + 25/60) / 35 = 0,2119047… → « 21 »), puis relit ce
   champ à l'enregistrement. Enregistrer sans toucher au temps de
   travail écrivait alors 0,21 — soit 0,9 % de CP en moins, gravés
   sans trace. Même mode d'échec que le bug corrigé par 5475ef0 :
   une valeur recopiée qui remplace une valeur dérivée.

   La règle : si l'affichage arrondi n'a pas bougé, l'utilisateur n'a
   rien changé, et la valeur courante est rendue INTACTE.
   ================================================================ */

import { ASV_STD_SAT_SECOND, ASV_STD_WEEKDAY_AVG } from '../config.js';

/** Durée hebdomadaire d'un temps plein, dénominateur de toute fraction. */
export const FULLTIME_WEEKLY_HOURS = 35;

/** Libellés des jours travaillables, index 0 = lundi … index 5 = samedi. */
export const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/**
 * Classe CSS des cases « jours travaillés », par modale.
 *
 * Deux modales rendent ce bloc — l'invitation d'un nouveau compte et l'édition
 * d'une fiche existante — et elles peuvent coexister dans le même document. Les
 * classes doivent donc différer, sinon une modale lirait les cases de l'autre.
 *
 * DÉFAUT DE PAIE CORRIGÉ AU LOT C1 : la modale d'invitation rendait
 * `invite-day-cb` mais ses trois chemins de lecture interrogeaient
 * `edit-day-cb`, une classe absente de son DOM. Aucune case n'était jamais
 * trouvée, donc inviter une ASV sur « Certains jours » enregistrait
 * timeFraction = 0 — CP acquis et cible annuelle à zéro, sans aucun signe.
 *
 * D'où la forme retenue : le nom de classe n'existe qu'ICI. Le producteur
 * (dayCheckboxesHtml) et le consommateur (checkedDaySelector) en dérivent tous
 * les deux, et le `scope` est obligatoire des deux côtés — un scope oublié jette
 * au lieu de lire silencieusement la mauvaise modale.
 */
const DAY_CHECKBOX_CLASS = { invite: 'invite-day-cb', edit: 'edit-day-cb' };

function dayCheckboxClass(scope) {
  const cls = DAY_CHECKBOX_CLASS[scope];
  if (!cls) throw new Error(`Scope de cases « jours travaillés » inconnu : ${scope}`);
  return cls;
}

/** Le sélecteur des cases COCHÉES d'une modale donnée. */
export function checkedDaySelector(scope) {
  return `.${dayCheckboxClass(scope)}:checked`;
}

/** Le sélecteur de TOUTES les cases d'une modale donnée (câblage des écouteurs). */
export function daySelector(scope) {
  return `.${dayCheckboxClass(scope)}`;
}

/**
 * Le balisage des six cases « jours travaillés » d'une modale.
 * Unique producteur de ces cases : la classe rendue ici et celle interrogée par
 * checkedDaySelector viennent de la même entrée de DAY_CHECKBOX_CLASS.
 */
export function dayCheckboxesHtml(scope, checkedDays = null) {
  const cls = dayCheckboxClass(scope);
  return DAY_LABELS.map((label, i) => {
    const day = i + 1;
    const checked = Array.isArray(checkedDays) && checkedDays.includes(day) ? ' checked' : '';
    return `<label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" class="${cls}" data-day="${day}"${checked}> ${label}</label>`;
  }).join('');
}

/** Fractions des presets à valeur fixe. `days` et `custom` se calculent. */
export const PRESET_FRACTIONS = { full: 1.0, three_quarter: 0.75, half: 0.5 };

/** Le pourcentage entier affiché à l'écran pour une fraction donnée. */
export function percentForDisplay(fraction) {
  return Math.round((fraction ?? 1.0) * 100);
}

/**
 * Le preset sous lequel une fraction existante doit s'afficher.
 * L'ordre reproduit celui de l'interface : une fraction qui tombe sur un
 * preset fixe l'emporte sur `days`, même si des jours sont cochés.
 */
export function presetForFraction(fraction, workingDays) {
  const cur = fraction ?? 1.0;
  if (Math.abs(cur - PRESET_FRACTIONS.full) < 0.01) return 'full';
  if (Math.abs(cur - PRESET_FRACTIONS.three_quarter) < 0.01) return 'three_quarter';
  if (Math.abs(cur - PRESET_FRACTIONS.half) < 0.01) return 'half';
  if (workingDays && workingDays.length) return 'days';
  return 'custom';
}

/**
 * Fraction déduite d'une liste de jours travaillés (1 = lundi … 6 = samedi).
 * Les durées viennent de config.js : les écrire en dur ici les ferait diverger
 * du calcul des heures au premier ajustement d'horaires.
 */
export function fractionFromDays(checkedDays) {
  const days = Array.isArray(checkedDays) ? checkedDays : [];
  const weekly = days.reduce((sum, d) => sum + (d === 6 ? ASV_STD_SAT_SECOND : ASV_STD_WEEKDAY_AVG), 0);
  return {
    fraction: Math.round((weekly / FULLTIME_WEEKLY_HOURS) * 1000) / 1000,
    weekly,
    days,
  };
}

/**
 * Fraction saisie au pourcentage. Un champ vide, non entier ou hors [1, 100]
 * est ILLISIBLE : on conserve la valeur courante au lieu de retomber sur 100 %.
 * L'ancien `(parseInt(v) || 100) / 100` transformait une ASV à 75 % en temps
 * plein sur une saisie effacée, silencieusement.
 */
export function fractionFromPercent(rawValue, currentFraction) {
  const fallback = currentFraction ?? 1.0;
  const parsed = parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return fallback;
  return parsed / 100;
}

function sameDays(a, b) {
  const x = Array.isArray(a) ? [...a].sort() : null;
  const y = Array.isArray(b) ? [...b].sort() : null;
  if (x === null || y === null) return x === y;
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * Point d'entrée unique de l'enregistrement du temps de travail.
 *
 * Rend `{ fraction, workingDays }`. Si le résultat s'affiche sur le MÊME
 * pourcentage entier que la valeur courante et que les jours n'ont pas bougé,
 * rend la fraction courante telle quelle — sans repasser par l'arrondi.
 *
 * Conséquence assumée : on ne peut pas forcer 21 % sur quelqu'un déjà à
 * 21,19 %. C'est le bon sens du compromis — la valeur contractuelle précise
 * l'emporte sur une saisie qui ne la distingue pas.
 */
export function resolveTimeFraction({ preset, percentValue, checkedDays, currentFraction, currentWorkingDays = null }) {
  let candidate;
  let workingDays;

  if (preset === 'days') {
    const r = fractionFromDays(checkedDays);
    candidate = r.fraction;
    workingDays = r.days;
  } else if (preset === 'custom') {
    candidate = fractionFromPercent(percentValue, currentFraction);
    workingDays = null;
  } else {
    candidate = PRESET_FRACTIONS[preset] ?? 1.0;
    workingDays = null;
  }

  const unchanged =
    currentFraction != null &&
    percentForDisplay(candidate) === percentForDisplay(currentFraction) &&
    sameDays(workingDays, currentWorkingDays ?? null);

  return unchanged
    ? { fraction: currentFraction, workingDays: currentWorkingDays ?? null }
    : { fraction: candidate, workingDays };
}
