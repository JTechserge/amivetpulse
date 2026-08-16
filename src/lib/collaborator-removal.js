/* ================================================================
   Règle de suppression définitive d'un collaborateur.
   Module pur (pas d'I/O, pas de DOM) — testable en Vitest.

   Il répond à deux questions, et à elles seules :
     1. que va-t-on détruire, et en quelle quantité ?
     2. cette destruction exige-t-elle un second palier de confirmation ?

   Il ne dit PAS quelles tables purger : la liste fait autorité côté
   serveur (supabase/functions/manage-users, action `purge`), pour qu'il
   n'existe qu'un seul endroit à tenir à jour.
   ================================================================ */

import { extractPersonIdFromKey } from './planning-auth.js';

/**
 * Auteur de remplacement des annonces d'une personne supprimée.
 *
 * Les annonces ne sont pas détruites avec leur auteur : une consigne de service
 * reste utile à la clinique après un départ. Seul l'auteur est réécrit, par la
 * Edge Function (action `purge`).
 *
 * Ce littéral est dupliqué dans supabase/functions/manage-users/index.ts — Deno
 * ne peut pas importer un module du front. tests/unit/collaborator-purge-contract.test.js
 * compare les deux fichiers pour que la divergence soit impossible en silence.
 */
export const REMOVED_AUTHOR_ID = 'ancien-collaborateur';

/** Ce que l'interface affiche à la place du nom d'un auteur supprimé. */
export const REMOVED_AUTHOR_LABEL = 'Ancien collaborateur';

// Une demi-journée réellement saisie : "YYYY-MM-DD_<pid>_M" ou "…_AM".
// Les clés dérivées (libellés, prévisionnel, signatures) sont comptées
// dans planningKeys mais pas ici — sinon un libellé gonflerait le total
// affiché et le récapitulatif mentirait sur ce qui est détruit.
const HALF_DAY_KEY = /^\d{4}-\d{2}-\d{2}_[^_]+_(?:M|AM)$/;

/**
 * Compte ce qu'une suppression définitive va détruire pour une personne.
 *
 * @param {object} args
 * @param {Record<string, unknown>} [args.slots] - store.DATA.slots
 * @param {Iterable<string>} [args.signatureKeys] - clés "pid|year|month" (store.SIGNATURES)
 * @param {Array<{person_id?: string}>} [args.interviews] - store.INTERVIEWS
 * @param {string} args.personId
 * @returns {{planningKeys: string[], halfDays: number, signedMonths: number, interviews: number}}
 */
export function countCollaboratorFootprint({ slots, signatureKeys, interviews, personId } = {}) {
  if (!personId || typeof personId !== 'string') {
    return { planningKeys: [], halfDays: 0, signedMonths: 0, interviews: 0 };
  }

  const planningKeys = Object.keys(slots ?? {}).filter((k) => extractPersonIdFromKey(k) === personId);

  let signedMonths = 0;
  for (const key of signatureKeys ?? []) {
    // Format signatureKey() : `${personId}|${year}|${month}`.
    // `sep > 0` exigé : sans séparateur, une clé malformée « juli » serait
    // attribuée à la personne « juli » par troncature accidentelle.
    const sep = typeof key === 'string' ? key.indexOf('|') : -1;
    if (sep > 0 && key.slice(0, sep) === personId) signedMonths++;
  }

  return {
    planningKeys,
    halfDays: planningKeys.filter((k) => HALF_DAY_KEY.test(k)).length,
    signedMonths,
    interviews: (interviews ?? []).filter((i) => i?.person_id === personId).length,
  };
}

/**
 * Un passé signé est une preuve du temps de travail déclaré et validé :
 * le détruire ne se fait pas d'un seul clic. Tout le reste, oui.
 *
 * @param {{signedMonths?: number}} footprint
 * @returns {boolean}
 */
export function requiresSecondConfirmation(footprint) {
  return (footprint?.signedMonths ?? 0) > 0;
}

/** Accord en nombre, avec le singulier français (0 reste au singulier). */
function plural(n, singular, pluralForm) {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/**
 * Récapitulatif chiffré de ce qui va être détruit, une ligne par nature.
 * Ne liste que ce qui existe : une ligne à zéro n'apporte rien et noie
 * celles qui comptent.
 *
 * @param {{halfDays?: number, signedMonths?: number, interviews?: number}} footprint
 * @returns {string[]}
 */
export function removalSummaryLines(footprint) {
  const { halfDays = 0, signedMonths = 0, interviews = 0 } = footprint ?? {};
  const lines = [];
  if (halfDays > 0) lines.push(plural(halfDays, 'demi-journée saisie', 'demi-journées saisies'));
  if (signedMonths > 0) lines.push(plural(signedMonths, 'mois signé', 'mois signés'));
  if (interviews > 0) lines.push(plural(interviews, 'entretien annuel', 'entretiens annuels'));
  if (!lines.length) lines.push('Aucune donnée enregistrée');
  return lines;
}
