/**
 * Écriture idempotente dans la table `feedback` (lot 4 du chantier
 * « correction automatique des signalements »).
 *
 * La routine de triage ne touche la base que par ce module, et ce module
 * ne sait faire qu'une chose : avancer le statut d'un signalement le long
 * du chemin de la routine, sans jamais écraser ce qu'il ne connaît pas.
 *
 * Propriétés, toutes testées par tests/unit/feedback-mark.test.js :
 *   - IDEMPOTENCE : rejouer une transition déjà faite est un skip, pas une
 *     erreur, pas une réécriture.
 *   - COMPARE-AND-SET : le PATCH est gardé par le statut de départ
 *     (`status=eq.<from>` dans l'URL). Si la ligne a changé sous la routine,
 *     zéro ligne est affectée — verdict « perdu », on relit, on ne force pas.
 *   - TERMINAL : corrige, rejete et decision_humaine ne se rouvrent que par
 *     un humain. La routine refuse.
 *   - PROPRIÉTÉ DES PRISES EN CHARGE : la routine marque ses `en_cours` d'un
 *     marqueur horodaté dans admin_note. Un `en_cours` sans marqueur
 *     appartient à un humain : la routine n'y touche pas.
 *   - ANTI-BOUCLE (risque §8.4 de la note) : une prise en charge routine de
 *     plus de STALE_CLAIM_HOURS s'escalade en decision_humaine au lieu
 *     d'être reprise indéfiniment.
 *   - ARRÊT D'URGENCE : la présence du fichier ARRET-CORRECTIONS.md à la
 *     racine du dépôt arrête la routine avant toute écriture. Créable et
 *     supprimable depuis l'interface web GitHub (téléphone compris).
 *
 * Aucun appel réseau ici : le module CONSTRUIT les requêtes et INTERPRÈTE
 * leurs résultats. L'exécution appartient à la routine (lot 5).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATUSES } from '../src/lib/feedback-payload.js';

// Statuts que la routine ne modifie jamais : seule une décision humaine
// (vue admin, SQL de Jérémie) peut en sortir.
export const TERMINAL_STATUSES = ['corrige', 'rejete', 'decision_humaine'];

// Chemin de la routine, et rien d'autre. Pas de nouveau → corrige direct :
// corriger sans prise en charge préalable rendrait la course entre deux runs
// invisible.
const ROUTINE_TRANSITIONS = {
  nouveau: ['en_cours', 'decision_humaine'],
  en_cours: ['corrige', 'rejete', 'decision_humaine'],
};

// Une prise en charge routine plus vieille que ça est un run mort : on
// escalade en decision_humaine, on ne reprend pas en boucle.
export const STALE_CLAIM_HOURS = 24;

export const EMERGENCY_STOP_FILE = 'ARRET-CORRECTIONS.md';

const ROUTINE_MARKER = /^\[routine (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\]/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Note d'admin marquée comme appartenant à la routine, horodatée. */
export function claimNote(at, text) {
  return `[routine ${at.toISOString()}] ${text}`;
}

/** true si ce signalement est une prise en charge DE LA ROUTINE. */
export function ownsClaim(row) {
  return (
    !!row &&
    row.status === 'en_cours' &&
    typeof row.admin_note === 'string' &&
    ROUTINE_MARKER.test(row.admin_note)
  );
}

/** true si la prise en charge routine est périmée (run mort à escalader). */
export function isStaleClaim(row, now, staleHours = STALE_CLAIM_HOURS) {
  if (!ownsClaim(row)) return false;
  const claimedAt = new Date(row.admin_note.match(ROUTINE_MARKER)[1]);
  return now.getTime() - claimedAt.getTime() > staleHours * 3_600_000;
}

/**
 * Décide ce que la routine a le droit de faire.
 * @returns {{ action: 'apply' | 'skip' | 'refuse', reason: string | null }}
 */
export function planTransition(current, target) {
  if (!STATUSES.includes(current) || !STATUSES.includes(target)) {
    return { action: 'refuse', reason: 'statut inconnu' };
  }
  if (current === target) {
    return { action: 'skip', reason: 'déjà dans cet état' };
  }
  if (TERMINAL_STATUSES.includes(current)) {
    return { action: 'refuse', reason: 'statut terminal : seule une décision humaine le rouvre' };
  }
  if ((ROUTINE_TRANSITIONS[current] ?? []).includes(target)) {
    return { action: 'apply', reason: null };
  }
  return { action: 'refuse', reason: 'transition hors du chemin de la routine' };
}

/**
 * Construit le PATCH PostgREST gardé par le statut de départ. Ne l'exécute
 * pas. Jette si la transition n'est pas un « apply » ou si l'id n'est pas un
 * UUID : ce sont des erreurs de programmation de l'appelant, pas des cas
 * métier.
 */
export function buildStatusPatch({ id, from, to, note = null, at }) {
  const plan = planTransition(from, to);
  if (plan.action !== 'apply') {
    throw new Error(`transition ${from} → ${to} non applicable (${plan.action} : ${plan.reason})`);
  }
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new Error('id de signalement invalide : UUID attendu');
  }
  const resolved = to === 'corrige' || to === 'rejete' ? at.toISOString() : null;
  return {
    method: 'PATCH',
    path: `/rest/v1/feedback?id=eq.${id}&status=eq.${from}`,
    headers: { Prefer: 'return=representation' },
    body: { status: to, admin_note: note, resolved_at: resolved },
  };
}

/**
 * Verdict d'un PATCH gardé : « applique » si au moins une ligne est revenue,
 * « perdu » sinon — la ligne a changé sous la routine, qui relit au prochain
 * run au lieu de forcer.
 */
export function interpretPatchOutcome(rows) {
  return Array.isArray(rows) && rows.length > 0 ? 'applique' : 'perdu';
}

/**
 * Arrêt d'urgence : à appeler AVANT toute écriture. Retourne null si la voie
 * est libre, sinon { reason } avec le contenu du fichier.
 */
export function readEmergencyStop(rootDir) {
  const path = join(rootDir, EMERGENCY_STOP_FILE);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf8').trim();
  return { reason: content === '' ? 'sans motif' : content };
}
