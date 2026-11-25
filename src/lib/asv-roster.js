/* ================================================================
   Effectif ASV partagé (table asv_roster) — logique pure, sans DOM ni réseau.

   La table fait foi depuis le 25/11/2026. Le poste n'écrit jamais l'effectif
   entier : une modification = une ligne, et seulement les colonnes changées,
   sous contrôle de concurrence optimiste (updated_at lu). La fraction de temps
   proratise les CP acquis et la cible annuelle : ENJEU DE PAIE.
   ================================================================ */

/** Ligne de la table (snake_case) → personne du roster en mémoire. */
export function rowToASVPerson(row) {
  return {
    id: row.id,
    name: row.name,
    short: row.short,
    initial: row.initial,
    color: row.color,
    present: null,
    // numeric arrive en nombre via PostgREST ; Number() couvre une chaîne.
    // Pas de défaut à 1 : la base refuse null et 0, une valeur absente ici
    // serait une réponse corrompue qu'il ne faut pas maquiller en temps plein.
    timeFraction: Number(row.time_fraction),
    archived: row.archived === true,
    saturdayOnly: row.saturday_only === true,
    workingDays: Array.isArray(row.working_days) ? [...row.working_days] : null,
    sortOrder: row.sort_order ?? 0,
    updatedAt: row.updated_at ?? null,
    ...(row.last_name ? { lastName: row.last_name } : {}),
  };
}

/** Ligne complète à insérer pour une nouvelle personne. */
export function asvPersonToInsertRow(person) {
  return {
    id: person.id,
    name: person.name,
    short: person.short,
    initial: person.initial,
    last_name: person.lastName || null,
    color: person.color,
    time_fraction: person.timeFraction ?? 1,
    working_days: person.workingDays ?? null,
    saturday_only: person.saturdayOnly ?? false,
    archived: person.archived ?? false,
    sort_order: person.sortOrder ?? 0,
  };
}

// Champ en mémoire → colonne, et normalisation pour comparer.
const COLUMNS = {
  name: ['name', (v) => v],
  short: ['short', (v) => v],
  initial: ['initial', (v) => v],
  lastName: ['last_name', (v) => (v ? String(v) : null)],
  color: ['color', (v) => v],
  timeFraction: ['time_fraction', (v) => v],
  workingDays: ['working_days', (v) => (Array.isArray(v) ? [...v] : null)],
  saturdayOnly: ['saturday_only', (v) => v === true],
  archived: ['archived', (v) => v === true],
  sortOrder: ['sort_order', (v) => v ?? 0],
};

/**
 * Colonnes à envoyer pour appliquer `changes` (champs en mémoire) à `person`.
 * Seules les valeurs réellement différentes sortent : un PATCH ne touche
 * jamais une colonne que l'utilisateur n'a pas modifiée, ce qui évite
 * d'écraser la modification concurrente d'un autre poste sur un autre champ.
 * Un champ inconnu lève : mieux vaut une erreur qu'une modification perdue.
 */
export function asvChangedColumns(person, changes) {
  const out = {};
  for (const [field, value] of Object.entries(changes)) {
    const spec = COLUMNS[field];
    if (!spec) throw new Error(`Champ d'effectif ASV inconnu : ${field}`);
    const [column, norm] = spec;
    const next = norm(value);
    if (JSON.stringify(norm(person[field])) !== JSON.stringify(next)) out[column] = next;
  }
  return out;
}

function sortedDays(days) {
  return Array.isArray(days) ? [...days].sort((a, b) => a - b) : null;
}

/**
 * Compare l'effectif historique du poste (clé `amivet_asv_roster`, camelCase)
 * aux lignes de la base. Renvoie un message par écart, vide si identiques.
 * Sert à AVERTIR au premier démarrage du nouveau code : jamais à pousser.
 */
export function compareLegacyRoster(legacy, rows) {
  const diffs = [];
  const local = new Map((Array.isArray(legacy) ? legacy : []).map((p) => [p.id, p]));
  const remote = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.id, r]));
  for (const [id, p] of local) {
    if (!remote.has(id)) diffs.push(`${p.short || p.name || id} : présente sur ce poste, absente de la base`);
  }
  for (const [id, r] of remote) {
    const p = local.get(id);
    const label = r.short || r.name || id;
    if (!p) {
      diffs.push(`${label} : présente en base, absente de ce poste`);
      continue;
    }
    const tfLocal = p.timeFraction ?? 1;
    const tfRemote = Number(r.time_fraction);
    if (Math.abs(tfLocal - tfRemote) > 1e-9) {
      diffs.push(`${label} : temps de travail ${tfLocal} sur ce poste, ${tfRemote} en base`);
    }
    const dLocal = sortedDays(p.workingDays);
    const dRemote = sortedDays(r.working_days);
    if (JSON.stringify(dLocal) !== JSON.stringify(dRemote)) {
      diffs.push(
        `${label} : jours travaillés ${JSON.stringify(dLocal)} sur ce poste, ${JSON.stringify(dRemote)} en base`
      );
    }
    if ((p.archived === true) !== (r.archived === true)) {
      diffs.push(
        `${label} : ${p.archived ? 'archivée' : 'active'} sur ce poste, ${r.archived ? 'archivée' : 'active'} en base`
      );
    }
  }
  return diffs;
}
