/* ================================================================
   AMIVET PLANNING — Gestion d'état localStorage (sans DOM)
   Caches des effectifs ASV et vétérinaire : aucun appel DOM/réseau.
   Les deux effectifs font foi en base (asv_roster, vet_roster) ; ce module
   n'en tient que le cache d'amorçage / hors connexion.
   Importé par app.js et settings.js.
   ================================================================ */
import { ASV_PEOPLE, PEOPLE, PRESENT_SHADES, ASV_ROSTER_KEY, ASV_ROSTER_CACHE_KEY, VET_ROSTER_KEY } from './config.js';
import { rowToASVPerson } from './lib/asv-roster.js';

// ----------------------------------------------------------------
// Roster ASV (cache de la table asv_roster)
// ----------------------------------------------------------------

// Réattribue les nuances de vert "présent" par position (à appeler après tout ajout/retrait).
export function reindexPresentShades() {
  ASV_PEOPLE.forEach((p, i) => (p.present = PRESENT_SHADES[i % PRESENT_SHADES.length]));
}

function asvToCacheEntry(p) {
  return {
    id: p.id,
    name: p.name,
    short: p.short,
    initial: p.initial,
    color: p.color,
    timeFraction: p.timeFraction ?? 1.0,
    archived: p.archived ?? false,
    saturdayOnly: p.saturdayOnly ?? false,
    workingDays: p.workingDays ?? null,
    sortOrder: p.sortOrder ?? 0,
    // null = jamais lue en base sur ce poste : toute écriture est refusée
    // tant qu'un rechargement n'a pas fourni la version courante.
    updatedAt: p.updatedAt ?? null,
    ...(p.lastName ? { lastName: p.lastName } : {}),
  };
}

/**
 * Écrit le cache local. N'écrit JAMAIS la clé historique `amivet_asv_roster` :
 * elle reste telle que la v22 l'a laissée, pour un retour arrière.
 */
export function saveASVRosterCache() {
  localStorage.setItem(ASV_ROSTER_CACHE_KEY, JSON.stringify(ASV_PEOPLE.map(asvToCacheEntry)));
}

function replaceASVPeople(entries) {
  ASV_PEOPLE.length = 0;
  entries.forEach((p) => ASV_PEOPLE.push({ ...asvToCacheEntry(p), present: null }));
  ASV_PEOPLE.sort((a, b) => a.sortOrder - b.sortOrder);
  reindexPresentShades();
}

/**
 * Amorce l'effectif avant la réponse réseau : cache, à défaut la clé
 * historique (lue, jamais réécrite), à défaut l'effectif par défaut de
 * config.js. Aucune de ces sources n'est jamais poussée vers la base.
 */
export function loadASVRoster() {
  try {
    const raw = localStorage.getItem(ASV_ROSTER_CACHE_KEY) ?? localStorage.getItem(ASV_ROSTER_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (Array.isArray(saved) && saved.length) {
      // Pas de ré-ajout d'une ASV absente de l'effectif enregistré : une
      // migration de juillet 2026 réinjectait ici Carla à chaque démarrage, ce
      // qui annulait sa suppression définitive au premier rafraîchissement.
      // Une entrée issue de la clé historique n'a pas d'updatedAt : elle reste
      // en lecture seule jusqu'au premier chargement depuis la base.
      replaceASVPeople(saved);
    }
    saveASVRosterCache();
  } catch (e) {
    console.warn('Effectif ASV en cache illisible, valeurs par défaut conservées.', e);
  }
  reindexPresentShades();
}

/**
 * Applique les lignes de la table `asv_roster` sur ASV_PEOPLE, puis rafraîchit
 * le cache. Ignore un jeu de lignes vide, comme pour vet_roster : mieux vaut
 * garder l'effectif courant que vider le planning ASV sur une réponse incomplète.
 */
export function applyASVRosterRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  replaceASVPeople(rows.map(rowToASVPerson));
  saveASVRosterCache();
  return true;
}

/** Remplace en place la personne correspondant à une ligne renvoyée par la base. */
export function applyASVRosterRow(row) {
  const next = rowToASVPerson(row);
  const p = ASV_PEOPLE.find((x) => x.id === next.id);
  if (p) {
    for (const k of Object.keys(p)) if (k !== 'present') delete p[k];
    Object.assign(p, { ...next, present: p.present });
  } else {
    ASV_PEOPLE.push(next);
    ASV_PEOPLE.sort((a, b) => a.sortOrder - b.sortOrder);
    reindexPresentShades();
  }
  saveASVRosterCache();
  return ASV_PEOPLE.find((x) => x.id === next.id);
}

// ----------------------------------------------------------------
// Roster vétérinaire dynamique
// ----------------------------------------------------------------
// La source de vérité est la table partagée `vet_roster` : un vétérinaire
// salarié ajouté depuis un poste doit être visible de tous, à commencer par
// lui-même. localStorage ne sert que de cache d'amorçage / mode hors connexion.

export function reindexVetPresentShades() {
  PEOPLE.forEach((p, i) => (p.present = PRESENT_SHADES[i % PRESENT_SHADES.length]));
}

/** Forme sérialisable d'une personne du roster vétérinaire. */
function vetToCacheEntry(p) {
  return {
    id: p.id,
    name: p.name,
    short: p.short,
    initial: p.initial,
    color: p.color,
    partner: p.partner !== false,
    archived: p.archived ?? false,
    sortOrder: p.sortOrder ?? 0,
  };
}

export function saveVetRosterCache() {
  localStorage.setItem(VET_ROSTER_KEY, JSON.stringify(PEOPLE.map(vetToCacheEntry)));
}

/** Remplace PEOPLE en place à partir d'entrées déjà normalisées. */
function replaceVetPeople(entries) {
  PEOPLE.length = 0;
  entries.forEach((p) =>
    PEOPLE.push({
      id: p.id,
      name: p.name,
      short: p.short,
      initial: p.initial,
      color: p.color,
      present: null,
      // Défaut sûr : une entrée sans `partner` explicite est traitée comme
      // associée, donc sans workflow de validation (comportement historique).
      partner: p.partner !== false,
      archived: p.archived ?? false,
      sortOrder: p.sortOrder ?? 0,
    })
  );
  PEOPLE.sort((a, b) => a.sortOrder - b.sortOrder);
  reindexVetPresentShades();
}

/** Charge le cache local. Sans cache, l'effectif par défaut de config.js est conservé. */
export function loadVetRosterCache() {
  try {
    const raw = localStorage.getItem(VET_ROSTER_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && saved.length) replaceVetPeople(saved);
    } else {
      saveVetRosterCache();
    }
  } catch (e) {
    console.warn('Effectif vétérinaire en cache illisible, valeurs par défaut conservées.', e);
  }
  reindexVetPresentShades();
}

/**
 * Applique les lignes de la table `vet_roster` (snake_case) sur PEOPLE, puis
 * rafraîchit le cache. Ignore un jeu de lignes vide : mieux vaut garder
 * l'effectif courant que vider le calendrier sur une réponse incomplète.
 */
export function applyVetRosterRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  replaceVetPeople(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      short: r.short,
      initial: r.initial,
      color: r.color,
      partner: r.partner !== false,
      archived: r.archived ?? false,
      sortOrder: r.sort_order ?? 0,
    }))
  );
  saveVetRosterCache();
  return true;
}
