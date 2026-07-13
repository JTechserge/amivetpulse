/* ================================================================
   Logique d'autorisation pour les écritures de planning_data.
   Module pur (pas d'I/O, pas de dépendances) — testable en Vitest.
   La même logique est implémentée côté serveur dans
   supabase/functions/_shared/planning-auth.ts (Deno TypeScript).
   ================================================================ */

/**
 * Extrait le person_id d'une clé de planning.
 * Format : "YYYY-MM-DD_personId" ou "YYYY-MM-DD_personId_suffixe"
 * La date (10 chars) + underscore de séparation (1 char) = 11 chars à ignorer.
 * Les dashes dans YYYY-MM-DD ne perturbent pas l'extraction car on slicera après le 11e char.
 * @param {string|null|undefined} key
 * @returns {string|null}
 */
export function extractPersonIdFromKey(key) {
  if (!key || key.length <= 11) return null;
  const afterDate = key.slice(11); // saute "YYYY-MM-DD_"
  if (!afterDate) return null;
  const idx = afterDate.indexOf('_');
  const personId = idx === -1 ? afterDate : afterDate.slice(0, idx);
  return personId || null;
}

/**
 * Renvoie les clés dont la valeur diffère entre deux états de planning.
 * Couvre : clés ajoutées (oldValue=undefined), supprimées (newValue=undefined), modifiées.
 * @param {Record<string,unknown>} oldSlots
 * @param {Record<string,unknown>} newSlots
 * @returns {Array<{key:string, oldValue:unknown, newValue:unknown}>}
 */
export function findChangedKeys(oldSlots, newSlots) {
  const old_ = oldSlots ?? {};
  const new_ = newSlots ?? {};
  const allKeys = new Set([...Object.keys(old_), ...Object.keys(new_)]);
  const changed = [];
  for (const key of allKeys) {
    if (old_[key] !== new_[key]) {
      changed.push({ key, oldValue: old_[key], newValue: new_[key] });
    }
  }
  return changed;
}

/**
 * Renvoie true si le profil a accès complet en écriture (diff inutile).
 * Cas couverts :
 *  - admin : gestion totale du planning et des comptes
 *  - vet   : édite le calendrier vet (et peut éditer aussi l'ASV selon les droits UI)
 *  - can_edit_vet_calendar : ASV autorisé à saisir le planning vet
 *  - can_edit_all_asv      : ASV chef qui gère tout l'effectif ASV
 * @param {{role:string, can_edit_vet_calendar:boolean, can_edit_all_asv:boolean}} profile
 * @returns {boolean}
 */
export function hasFullAccess(profile) {
  if (!profile) return false;
  return (
    profile.role === 'admin' ||
    profile.role === 'vet' ||
    profile.can_edit_vet_calendar === true ||
    profile.can_edit_all_asv === true
  );
}

/**
 * Valide qu'un ASV basique (sans accès complet) est autorisé à appliquer ses changements.
 *
 * Règles :
 *  1. Chaque clé modifiée doit appartenir au person_id du demandeur.
 *  2. Clés _decision : l'ASV peut uniquement passer une décision à 'pending' (soumettre)
 *     ou supprimer une décision 'pending' (annuler sa demande).
 *     → Interdiction de s'auto-approuver / s'auto-rejeter.
 *     → Interdiction de modifier une décision déjà arrêtée (approved/rejected).
 *
 * @param {Array<{key:string, oldValue:unknown, newValue:unknown}>} changedKeys
 * @param {string|null} callerPersonId
 * @returns {string|null} message d'erreur ou null si autorisé
 */
export function validateAsvWrite(changedKeys, callerPersonId) {
  if (!callerPersonId) return 'Profil ASV sans person_id — écriture impossible.';

  for (const { key, oldValue, newValue } of changedKeys) {
    const keyPersonId = extractPersonIdFromKey(key);

    // Règle 1 — seulement ses propres clés
    if (keyPersonId !== callerPersonId) {
      return `Permission refusée : la clé "${key}" appartient à "${keyPersonId ?? '?'}", pas à "${callerPersonId}".`;
    }

    // Règle 2 — clés de décision de congé
    if (key.endsWith('_decision')) {
      // Impossible de modifier une décision déjà prise par l'admin
      if (oldValue === 'approved' || oldValue === 'rejected') {
        return `Seul un admin peut modifier une décision déjà approuvée ou rejetée (clé "${key}").`;
      }
      // Impossible de s'auto-approuver ou s'auto-rejeter
      if (newValue !== undefined && newValue !== 'pending') {
        return `Seul un admin peut définir une décision autre que "pending" (clé "${key}").`;
      }
    }
  }
  return null; // toutes les vérifications passées
}
