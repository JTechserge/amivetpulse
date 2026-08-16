import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Verrou entre le schéma et les sauvegardes.
//
// POURQUOI CE TEST EXISTE : trois listes de tables coexistaient sans rien pour
// les tenir d'accord — la sauvegarde, la restauration, les migrations. Elles
// avaient divergé sur trois points, en silence, pendant des semaines :
// `forecast_signatures` et `vet_roster` n'étaient dans aucun des deux scripts,
// et `feedback` était sauvegardée sans être restaurable. Le job de sauvegarde
// passait au vert tous les jours en exportant un schéma incomplet : créer une
// table n'obligeait à rien.
//
// CE QUE CE TEST PROUVE :
//   1. qu'aucune table du schéma n'échappe à la sauvegarde ni à la
//      restauration sans exemption écrite ;
//   2. que les deux scripts couvrent exactement le même ensemble — une
//      sauvegarde qu'on ne sait pas réinjecter ne sauvegarde rien ;
//   3. qu'aucun des deux scripts ne nomme une table qui n'existe pas ;
//   4. que tout ce que la purge d'un collaborateur détruit est sauvegardé —
//      sans quoi la suppression devient une perte définitive et silencieuse,
//      alors qu'il n'existe ni corbeille, ni undo, ni journal d'audit.
//
// CE QU'IL NE PROUVE PAS : que Supabase rende effectivement ces lignes, ni que
// la restauration aboutisse. Il n'existe pas de compte de test sur ce projet
// (cf. CLAUDE.md) ; la preuve d'effet reste l'exécution manuelle du workflow.
//
// Si ce test casse, la question n'est jamais « comment le faire passer » mais
// « cette table doit-elle être sauvegardée, ou exemptée, et pourquoi ». Une
// exemption sans raison écrite est une perte de données au prochain incident.
// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '../../supabase/migrations');
const BACKUP_SRC = readFileSync(join(HERE, '../../scripts/backup-supabase.mjs'), 'utf8');
const RESTORE_SRC = readFileSync(join(HERE, '../../scripts/restore-supabase.mjs'), 'utf8');
const FN_SRC = readFileSync(join(HERE, '../../supabase/functions/manage-users/index.ts'), 'utf8');

/** Retire les commentaires de ligne, pour ne jamais lire un nom mis en commentaire. */
const stripComments = (src, marker) =>
  src
    .split('\n')
    .filter((line) => !line.trimStart().startsWith(marker))
    .join('\n');

/** Le corps du `const TABLES = [ … ];` d'un script, commentaires retirés. */
function tablesBlock(src, label) {
  const block = src.match(/const TABLES\s*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error(`Liste TABLES introuvable dans ${label}.`);
  return stripComments(block[1], '//');
}

/** Les tables créées par les migrations. */
function migrationTables(dir) {
  const names = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = stripComments(readFileSync(join(dir, file), 'utf8'), '--');
    for (const [, name] of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)/gi
    )) {
      names.push(name.toLowerCase());
    }
  }
  // Une même table peut être créée par plusieurs migrations (IF NOT EXISTS).
  return [...new Set(names)];
}

/** `[{ name: 'x', requiredMinRows: 1 }, …]` → `['x', …]` */
const backupTables = () =>
  [...tablesBlock(BACKUP_SRC, 'backup-supabase.mjs').matchAll(/\{\s*name:\s*'([a-z_]+)'/g)].map(
    ([, t]) => t
  );

/** `['x', …]` */
const restoreTables = () =>
  [...tablesBlock(RESTORE_SRC, 'restore-supabase.mjs').matchAll(/'([a-z_]+)'/g)].map(([, t]) => t);

/** Les tables que la suppression définitive d'un collaborateur détruit. */
function purgedTables() {
  const block = FN_SRC.match(/const PURGE_TARGETS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error('PURGE_TARGETS introuvable dans la Edge Function.');
  const targets = [...block[1].matchAll(/\{\s*table:\s*'([a-z_]+)'/g)].map(([, t]) => t);
  // Les deux lignes que la purge retire hors de PURGE_TARGETS, en fin de course.
  return [...new Set([...targets, 'vet_roster', 'user_profiles'])];
}

// Tables du schéma volontairement hors sauvegarde. Toute entrée ici est une
// décision, pas un oubli — et se justifie par ce qu'on perd à ne pas l'avoir.
const EXEMPTIONS = {
  rate_limit_log:
    "journal éphémère de limitation de débit : il ne décrit aucun état métier et se reconstitue seul. Le restaurer réinstallerait des compteurs périmés (décision du 16/08/2026).",
};

const MIGRATION_TABLES = migrationTables(MIGRATIONS_DIR);
const BACKUP = backupTables();
const RESTORE = restoreTables();

describe('sauvegarde / restauration — lecture des sources', () => {
  // Garde-fou du garde-fou : si un parseur casse, il ne doit pas rendre le
  // test vert en ne trouvant plus rien à comparer.
  it('a bien lu les migrations', () => {
    expect(MIGRATION_TABLES.length).toBeGreaterThanOrEqual(15);
    expect(MIGRATION_TABLES).toContain('forecast_signatures');
    expect(MIGRATION_TABLES).toContain('vet_roster');
  });

  it('a bien lu les deux scripts', () => {
    expect(BACKUP.length).toBeGreaterThanOrEqual(15);
    expect(RESTORE.length).toBeGreaterThanOrEqual(15);
    expect(BACKUP).toContain('planning_data');
    expect(RESTORE).toContain('planning_data');
  });

  it('ne nomme jamais deux fois la même table', () => {
    expect(new Set(BACKUP).size).toBe(BACKUP.length);
    expect(new Set(RESTORE).size).toBe(RESTORE.length);
  });
});

describe('sauvegarde / restauration — couverture du schéma', () => {
  it('ne laisse aucune table du schéma hors de la sauvegarde', () => {
    const oublis = MIGRATION_TABLES.filter((t) => !BACKUP.includes(t) && !EXEMPTIONS[t]);
    expect(oublis).toEqual([]);
  });

  it('ne laisse aucune table du schéma hors de la restauration', () => {
    const oublis = MIGRATION_TABLES.filter((t) => !RESTORE.includes(t) && !EXEMPTIONS[t]);
    expect(oublis).toEqual([]);
  });

  it('couvre exactement le même ensemble des deux côtés', () => {
    // C'est l'écart qu'avait `feedback` : sauvegardée, jamais réinjectable.
    expect([...BACKUP].sort()).toEqual([...RESTORE].sort());
  });

  it('ne nomme dans aucun script une table qui n’existe pas', () => {
    const fantomes = [...new Set([...BACKUP, ...RESTORE])].filter(
      (t) => !MIGRATION_TABLES.includes(t)
    );
    expect(fantomes).toEqual([]);
  });

  it('n’exempte que des tables qui existent, et jamais une table sauvegardée', () => {
    for (const table of Object.keys(EXEMPTIONS)) {
      expect(MIGRATION_TABLES, `${table} exemptée mais absente du schéma`).toContain(table);
      expect(BACKUP, `${table} exemptée et pourtant sauvegardée`).not.toContain(table);
      expect(RESTORE, `${table} exemptée et pourtant restaurée`).not.toContain(table);
      expect(EXEMPTIONS[table].length, `${table} exemptée sans raison écrite`).toBeGreaterThan(30);
    }
  });
});

describe('sauvegarde — ce que la purge détruit', () => {
  // Le cœur de la dette : `forecast_signatures` était purgée sans être
  // sauvegardée. Comme il n'existe ni corbeille, ni undo, ni journal d'audit,
  // la sauvegarde quotidienne est le seul filet sous la suppression définitive.
  it('sauvegarde tout ce que la suppression d’un collaborateur détruit', () => {
    const nonSauvegardees = purgedTables().filter((t) => !BACKUP.includes(t));
    expect(nonSauvegardees).toEqual([]);
  });

  it('sait réinjecter tout ce que la suppression d’un collaborateur détruit', () => {
    const nonRestaurables = purgedTables().filter((t) => !RESTORE.includes(t));
    expect(nonRestaurables).toEqual([]);
  });

  it('a bien lu la liste des tables purgées', () => {
    const purged = purgedTables();
    expect(purged.length).toBeGreaterThanOrEqual(10);
    expect(purged).toContain('forecast_signatures');
  });
});
