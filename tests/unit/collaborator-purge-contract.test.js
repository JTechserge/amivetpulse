import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { REMOVED_AUTHOR_ID } from '../../src/lib/collaborator-removal.js';

// ─────────────────────────────────────────────────────────────────────────────
// Verrou sur la suppression définitive d'un collaborateur.
//
// CE QUE CE TEST PROUVE :
//   1. que la liste des tables purgées par la Edge Function n'a pas rétréci ;
//   2. qu'AUCUNE table de la base portant une colonne d'identité (person_id,
//      user_name, author_id) n'échappe à cette liste sans exemption écrite ;
//   3. que l'échec d'une suppression périphérique interrompt la purge AVANT
//      de retirer la ligne d'effectif et le compte — sinon la purge devient
//      irrejouable et laisse des données orphelines ;
//   4. que le marqueur d'auteur anonymisé est identique des deux côtés de la
//      frontière front / Deno, qui ne peuvent pas partager de module.
//
// CE QU'IL NE PROUVE PAS : que Supabase exécute effectivement ces suppressions.
// Il n'existe pas de compte de test sur ce projet (cf. CLAUDE.md) ; la preuve
// d'effet est la vérification manuelle en production, sur une ligne de test.
//
// Si le point 2 casse, la question n'est jamais « comment faire passer le
// test » mais « la nouvelle table doit-elle être purgée, ou exemptée, et
// pourquoi ». Une exemption sans raison écrite est une fuite de données
// personnelles après un départ.
// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_PATH = join(HERE, '../../supabase/functions/manage-users/index.ts');
const MIGRATIONS_DIR = join(HERE, '../../supabase/migrations');
const FN_SRC = readFileSync(FN_PATH, 'utf8');

// Les assertions d'ordre portent sur le SEUL bloc `purge`. L'action `delete`,
// plus haut dans le fichier, supprime elle aussi un compte auth : chercher
// dans le fichier entier ferait mesurer la mauvaise ligne.
const PURGE_BLOCK = (() => {
  const start = FN_SRC.indexOf("if (action === 'purge')");
  if (start < 0) throw new Error('Bloc `purge` introuvable dans la Edge Function.');
  return FN_SRC.slice(start);
})();

/** Les entrées de PURGE_TARGETS telles qu'elles sont écrites dans la fonction. */
function parsePurgeTargets(src) {
  const block = src.match(/const PURGE_TARGETS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error('PURGE_TARGETS introuvable dans la Edge Function.');
  const entries = [...block[1].matchAll(/\{\s*table:\s*'([^']+)'\s*,\s*column:\s*'([^']+)'\s*\}/g)];
  return entries.map(([, table, column]) => ({ table, column }));
}

/** Les colonnes déclarées par chaque CREATE TABLE des migrations. */
function parseTableColumns(dir) {
  const tables = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    const blocks = sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi
    );
    for (const [, name, body] of blocks) {
      const cols = [...body.matchAll(/^\s*([a-z_]+)\s+[a-z]/gim)].map(([, c]) => c.toLowerCase());
      // Une table peut être créée dans plusieurs migrations (IF NOT EXISTS) :
      // on cumule, pour ne jamais perdre une colonne de vue.
      tables.set(name, [...new Set([...(tables.get(name) ?? []), ...cols])]);
    }
  }
  return tables;
}

// Colonnes qui rattachent une ligne à une personne. `user_name` est le nom
// malheureux que porte push_subscriptions ; il contient un person_id.
const IDENTITY_COLUMNS = ['person_id', 'user_name', 'author_id'];

// Tables porteuses d'identité que la purge NE supprime PAS par person_id.
// Toute entrée ici est une décision, pas un oubli.
const EXEMPTIONS = {
  user_profiles: "supprimée par user_id avec le compte auth, pas par person_id (une ligne sans compte n'existe pas)",
  announcements:
    'conservée : une consigne de service survit à son auteur. Seul author_id est anonymisé (décision du 16/08/2026)',
};

const EXPECTED_TARGETS = [
  { table: 'push_subscriptions', column: 'user_name' },
  { table: 'announcement_reads', column: 'person_id' },
  { table: 'medical_visits', column: 'person_id' },
  { table: 'cp_adjustments', column: 'person_id' },
  { table: 'forecast_signatures', column: 'person_id' },
  { table: 'monthly_signatures', column: 'person_id' },
  { table: 'signature_tokens', column: 'person_id' },
  { table: 'annual_interviews', column: 'person_id' },
  { table: 'calendar_sync_tokens', column: 'person_id' },
];

describe('purge — liste des tables', () => {
  const targets = parsePurgeTargets(FN_SRC);

  it('purge exactement les tables attendues, sur la bonne colonne', () => {
    expect(targets).toEqual(EXPECTED_TARGETS);
  });

  it('ne purge pas deux fois la même table', () => {
    const names = targets.map((t) => t.table);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('purge — couverture de la base', () => {
  const tables = parseTableColumns(MIGRATIONS_DIR);
  const purged = new Set(parsePurgeTargets(FN_SRC).map((t) => t.table));

  it('a bien lu les migrations', () => {
    // Garde-fou du garde-fou : si le parseur casse, il ne doit pas rendre le
    // test vert en ne trouvant plus rien à vérifier.
    expect(tables.size).toBeGreaterThanOrEqual(15);
    expect(tables.get('cp_adjustments')).toContain('person_id');
  });

  it('ne laisse aucune table porteuse d’identité hors de la purge', () => {
    const oublis = [];
    for (const [table, cols] of tables) {
      const identity = cols.filter((c) => IDENTITY_COLUMNS.includes(c));
      if (!identity.length) continue;
      if (purged.has(table) || EXEMPTIONS[table]) continue;
      oublis.push(`${table} (${identity.join(', ')})`);
    }
    expect(oublis).toEqual([]);
  });

  it('n’exempte que des tables qui existent, et jamais une table déjà purgée', () => {
    for (const table of Object.keys(EXEMPTIONS)) {
      expect(tables.has(table)).toBe(true);
      expect(purged.has(table)).toBe(false);
    }
  });
});

describe('purge — ordre et échecs', () => {
  it('interrompt la purge avant l’effectif si une table a échoué', () => {
    const iThrow = PURGE_BLOCK.indexOf('Purge incomplète');
    const iRoster = PURGE_BLOCK.indexOf("from('vet_roster').delete()");
    expect(iThrow).toBeGreaterThan(-1);
    expect(iRoster).toBeGreaterThan(iThrow);
  });

  it('rend fatal l’échec de la ligne d’effectif', () => {
    expect(PURGE_BLOCK).toMatch(/rosterError\)\s*throw new Error/);
  });

  it('lit le résultat de chaque suppression au lieu de l’ignorer', () => {
    // Le bug d'origine : Promise.all sur des requêtes dont personne ne
    // regardait le retour, et un ok:true renvoyé malgré l'échec.
    expect(PURGE_BLOCK).toMatch(/const \{ error \} = await adminClient\.from\(table\)\.delete\(\)/);
  });

  it('supprime le compte auth après les données périphériques', () => {
    const iThrow = PURGE_BLOCK.indexOf('Purge incomplète');
    const iAuth = PURGE_BLOCK.indexOf('auth.admin.deleteUser(user_id)');
    expect(iAuth).toBeGreaterThan(-1);
    expect(iAuth).toBeGreaterThan(iThrow);
  });

  it('supprime le compte auth AVANT la ligne d’effectif', () => {
    // Invariant inversé le 16/08/2026. L'ordre d'origine — effectif puis
    // compte — laissait, quand deleteUser échouait, un compte capable
    // d'obtenir un jeton alors que la personne avait déjà disparu de tous les
    // écrans : plus aucun bouton pour rejouer la purge, seule une intervention
    // en base pouvait le retirer. Tant que l'effectif survit à l'échec, la
    // ligne reste visible et la purge reste relançable.
    const iAuth = PURGE_BLOCK.indexOf('auth.admin.deleteUser(user_id)');
    const iRoster = PURGE_BLOCK.indexOf("from('vet_roster').delete()");
    expect(iAuth).toBeGreaterThan(-1);
    expect(iRoster).toBeGreaterThan(iAuth);
  });

  it('ne retire le profil qu’après le compte, jamais avant', () => {
    // `user_profiles` porte le bouton de purge des comptes. Le supprimer avant
    // deleteUser ferait disparaître ce bouton même quand le compte, lui, est
    // resté — exactement le cas que l'inversion ci-dessus corrige.
    const iAuth = PURGE_BLOCK.indexOf('auth.admin.deleteUser(user_id)');
    const iProfile = PURGE_BLOCK.indexOf("from('user_profiles').delete()");
    expect(iProfile).toBeGreaterThan(-1);
    expect(iProfile).toBeGreaterThan(iAuth);
  });

  it('traite un compte auth déjà absent comme un succès', () => {
    // Sans cette tolérance, une purge interrompue après la suppression du
    // compte ne peut plus être rejouée : le second passage échouerait sur un
    // 404 et n'atteindrait jamais la ligne d'effectif restée en place.
    expect(PURGE_BLOCK).toMatch(/delError\.status !== 404/);
  });
});

describe('purge — anonymisation de l’auteur des annonces', () => {
  it('utilise le même marqueur côté front et côté Edge Function', () => {
    const literal = FN_SRC.match(/const REMOVED_AUTHOR_ID = '([^']+)'/);
    expect(literal, 'REMOVED_AUTHOR_ID absent de la Edge Function').not.toBeNull();
    expect(literal[1]).toBe(REMOVED_AUTHOR_ID);
  });

  it('réécrit l’auteur au lieu de supprimer l’annonce', () => {
    expect(FN_SRC).toMatch(/from\('announcements'\)\s*\.update\(\{ author_id: REMOVED_AUTHOR_ID \}\)/);
    expect(FN_SRC).not.toMatch(/from\('announcements'\)\s*\.delete\(\)/);
  });

  it('n’anonymise que les annonces de la personne supprimée', () => {
    expect(FN_SRC).toMatch(/update\(\{ author_id: REMOVED_AUTHOR_ID \}\)\s*\.eq\('author_id', person_id\)/);
  });
});
