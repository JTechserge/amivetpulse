/**
 * Fonctions pures de classification des libellés de congé/repos.
 * Extraites de leave-requests.js pour être testables sans dépendances DOM/réseau.
 */

export function isReposLabel(label) {
  const lc = (label || '').toLowerCase().trim();
  return lc === 'repos' || lc === 'repos planifié' || lc === 'non travaillé';
}

export function isSickOrAccidentLabel(label) {
  const lc = (label || '').toLowerCase().trim();
  return lc.includes('maladie') || lc.includes('arrêt') || lc.includes('accident');
}
