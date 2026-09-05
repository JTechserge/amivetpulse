import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Verrou sur la surface RLS atteignable sans compte.
//
// CE QUE CE TEST PROUVE : que la migration de fermeture supprime BIEN CHACUNE des
// policies « allow anon … » créées ailleurs dans le dépôt, et qu'elle ne laisse
// aucune table sans chemin de lecture pour les comptes authentifiés.
//
// Il compare deux artefacts indépendants : l'ensemble des policies anon créées
// par l'historique des migrations (2024) d'un côté, la liste des DROP de la
// migration de fermeture de l'autre. Ce n'est pas une tautologie : si une future
// migration ajoute une policy anon sans la fermer, l'écart apparaît ici.
//
// CE QU'IL NE PROUVE PAS : que Postgres a réellement appliqué ces DROP en
// production. Il n'existe pas de compte de test Supabase (cf. CLAUDE.md), et les
// migrations sont collées à la main dans le SQL Editor. La preuve d'effet est la
// requête de vérification en fin de migration, à passer une fois après
// application — c'est elle, et elle seule, qui dit l'état réel.
//
// Si ce test casse, la question n'est jamais « comment le faire passer » mais
// « quelle surface anon vient d'être rouverte, et par qui ».
// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '../../supabase/migrations');
const CLOSE_FILE = '20260905000001_close_anon_policies.sql';

// Écarte les lignes de commentaire : plusieurs migrations citent du SQL en
// commentaire (check-lists de vérification), qui n'est jamais exécuté.
function executableSql(raw) {
  return raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function readSql(file) {
  return executableSql(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
}

// Toutes les policies anon créées par l'ensemble des migrations, sauf le fichier
// de fermeture lui-même. Clé « table::policy ».
function anonPoliciesCreatedInCorpus() {
  const found = new Set();
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith('.sql') || file === CLOSE_FILE) continue;
    const sql = readSql(file);
    const re = /create\s+policy\s+"(allow anon [a-z]+)"\s+on\s+([a-z_]+)/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
      found.add(`${m[2]}::${m[1].toLowerCase()}`);
    }
  }
  return found;
}

// Tout ce que la migration de fermeture supprime. Clé « table::policy ».
function policiesDroppedBy(sql) {
  const out = new Set();
  const re = /drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+([a-z_]+)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    out.add(`${m[2]}::${m[1].toLowerCase()}`);
  }
  return out;
}

// Les policies créées par la migration de fermeture : table → [{ name, cmd, body }].
function policiesCreatedBy(sql) {
  const out = new Map();
  const re = /create\s+policy\s+"([^"]+)"\s+on\s+([a-z_]+)([\s\S]*?);/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const table = m[2];
    const body = m[3].replace(/\s+/g, ' ');
    const cmd = (body.match(/\bfor\s+(select|insert|update|delete|all)\b/i) || [])[1];
    if (!out.has(table)) out.set(table, []);
    out.get(table).push({ name: m[1], cmd: (cmd || '').toUpperCase(), body });
  }
  return out;
}

const CLOSE_SQL = readSql(CLOSE_FILE);
const created = anonPoliciesCreatedInCorpus();
const dropped = policiesDroppedBy(CLOSE_SQL);
const recreated = policiesCreatedBy(CLOSE_SQL);

// La seule table volontairement laissée sans aucune policy : elle ne doit être
// atteignable que par les fonctions SECURITY DEFINER (20260713000001:13-18).
const TABLES_SANS_POLICY = new Set(['app_security']);

describe('surface anon — policies RLS', () => {
  it('le corpus contient bien des policies anon à fermer (garde-fou du test lui-même)', () => {
    // Si ce compte tombe à zéro, c'est que la regex ne matche plus rien et que
    // tous les tests suivants passeraient à vide.
    expect(created.size).toBeGreaterThanOrEqual(27);
  });

  it('chaque policy anon créée dans le dépôt est supprimée par la migration de fermeture', () => {
    const manquantes = [...created].filter((key) => !dropped.has(key)).sort();
    expect(manquantes).toEqual([]);
  });

  it('la migration de fermeture ne crée elle-même aucune policy anon', () => {
    const fautives = [...recreated.entries()].flatMap(([table, list]) =>
      list.filter((p) => /anon/i.test(p.name)).map((p) => `${table}::${p.name}`)
    );
    expect(fautives).toEqual([]);
  });

  it('aucune policy créée ne cible explicitement le rôle anon ou public', () => {
    const fautives = [...recreated.entries()].flatMap(([table, list]) =>
      list.filter((p) => /\bto\s+(anon|public)\b/i.test(p.body)).map((p) => `${table}::${p.name}`)
    );
    expect(fautives).toEqual([]);
  });

  it('chaque table dont on ferme la lecture anon garde un chemin de lecture authentifié', () => {
    const tablesFermees = new Set(
      [...created].filter((key) => key.endsWith('::allow anon read')).map((key) => key.split('::')[0])
    );
    const sansLecture = [...tablesFermees]
      .filter((table) => !TABLES_SANS_POLICY.has(table))
      .filter((table) => !(recreated.get(table) || []).some((p) => p.cmd === 'SELECT'))
      .sort();
    expect(sansLecture).toEqual([]);
  });

  it("n'utilise pas CREATE POLICY IF NOT EXISTS — invalide dans toutes les versions de PostgreSQL", () => {
    // C'est exactement l'erreur qui a forcé le rejeu de 20260713000001.
    expect(/create\s+policy\s+if\s+not\s+exists/i.test(CLOSE_SQL)).toBe(false);
  });

  it('est idempotente : chaque CREATE POLICY est précédé du DROP correspondant', () => {
    const sansDrop = [...recreated.entries()]
      .flatMap(([table, list]) => list.map((p) => `${table}::${p.name.toLowerCase()}`))
      .filter((key) => !dropped.has(key))
      .sort();
    expect(sansDrop).toEqual([]);
  });
});

describe('surface anon — invariants de sécurité conservés', () => {
  it('planning_data garde le verrou RESTRICTIVE en écriture', () => {
    const p = (recreated.get('planning_data') || []).find((x) => x.name === 'block direct writes');
    expect(p).toBeDefined();
    expect(p.body).toMatch(/as\s+restrictive/i);
    expect(p.body).toMatch(/with\s+check\s*\(\s*false\s*\)/i);
  });

  it("calendar_sync_tokens dérive l'identité de auth.uid() et n'ouvre qu'à vet/admin", () => {
    const p = (recreated.get('calendar_sync_tokens') || []).find((x) => x.name === 'owner or vet reads token');
    expect(p).toBeDefined();
    expect(p.body).toMatch(
      /person_id\s*=\s*\(\s*select\s+person_id\s+from\s+user_profiles\s+where\s+id\s*=\s*auth\.uid\(\)\s*\)/i
    );
    expect(p.body).toMatch(/get_my_role\(\)\s+in\s*\(\s*'admin'\s*,\s*'vet'\s*\)/i);
  });

  it("monthly_signatures réserve l'insertion au propriétaire (preuve juridique)", () => {
    const p = (recreated.get('monthly_signatures') || []).find((x) => x.name === 'owner insert signature');
    expect(p).toBeDefined();
    expect(p.body).toMatch(
      /person_id\s*=\s*\(\s*select\s+person_id\s+from\s+user_profiles\s+where\s+id\s*=\s*auth\.uid\(\)\s*\)/i
    );
  });

  it("medical_visits — données de santé — réserve l'écriture à admin/vet", () => {
    const list = recreated.get('medical_visits') || [];
    for (const cmd of ['INSERT', 'UPDATE', 'DELETE']) {
      const p = list.find((x) => x.cmd === cmd);
      expect(p, `policy ${cmd} manquante sur medical_visits`).toBeDefined();
      expect(p.body).toMatch(/get_my_role\(\)\s+in\s*\(\s*'admin'\s*,\s*'vet'\s*\)/i);
    }
    expect(list.some((x) => x.cmd === 'SELECT')).toBe(true);
  });

  it("app_security ne reçoit aucune policy — la table reste hors d'atteinte directe", () => {
    expect(recreated.get('app_security')).toBeUndefined();
    expect(dropped.has('app_security::allow anon update')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT 1 — chaîne CalDAV.
//
// CE QUE CES TESTS PROUVENT : que la migration de durcissement révoque bien anon
// sur les trois fonctions, et que chaque corps dérive l'identité de l'appelant
// au lieu de faire confiance au p_person_id reçu.
//
// CE QU'ILS NE PROUVENT PAS : qu'un appel anon est effectivement refusé par
// Postgres. Sans compte de test Supabase (CLAUDE.md), aucun test automatisé ne
// peut le vérifier. La preuve d'effet est la requête has_function_privilege en
// fin de migration.
// ─────────────────────────────────────────────────────────────────────────────

const CALDAV_FILE = '20260905000002_caldav_owner_guard.sql';
const CALDAV_SQL = readSql(CALDAV_FILE);

// Isole le corps d'une fonction : de sa signature jusqu'au $$; de fermeture.
function functionBody(sql, name) {
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+${name}\\s*\\(([\\s\\S]*?)\\$\\$\\s*;`, 'i');
  const m = sql.match(re);
  return m ? m[0].replace(/\s+/g, ' ') : null;
}

const CALDAV_ECRITURE = ['save_caldav_credentials', 'clear_caldav_credentials'];
const CALDAV_TOUTES = [...CALDAV_ECRITURE, 'get_caldav_status'];

describe('surface anon — lot 1, chaîne CalDAV', () => {
  it('révoque EXECUTE à anon et à PUBLIC sur les trois fonctions', () => {
    const nonRevoquees = CALDAV_TOUTES.filter(
      (fn) =>
        !new RegExp(
          `revoke\\s+execute\\s+on\\s+function\\s+${fn}\\s*\\([^)]*\\)\\s+from\\s+public\\s*,\\s*anon`,
          'i'
        ).test(CALDAV_SQL)
    );
    expect(nonRevoquees).toEqual([]);
  });

  it("conserve EXECUTE pour authenticated — sinon l'écran de synchro casse", () => {
    const nonAccordees = CALDAV_TOUTES.filter(
      (fn) =>
        !new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${fn}\\s*\\([^)]*\\)\\s+to\\s+authenticated`, 'i').test(
          CALDAV_SQL
        )
    );
    expect(nonAccordees).toEqual([]);
  });

  it('ne réaccorde jamais anon', () => {
    expect(/grant\s+execute[\s\S]*?\bto\b[^;]*\banon\b/i.test(CALDAV_SQL)).toBe(false);
  });

  it("chaque fonction dérive l'identité de l'appelant, sans faire confiance au paramètre", () => {
    for (const fn of CALDAV_TOUTES) {
      const body = functionBody(CALDAV_SQL, fn);
      expect(body, `corps introuvable pour ${fn}`).not.toBeNull();
      expect(body, `${fn} ne dérive pas l'identité`).toMatch(/my_person_id\(\)/i);
    }
  });

  it("les deux fonctions d'écriture refusent tout person_id qui n'est pas celui de l'appelant", () => {
    for (const fn of CALDAV_ECRITURE) {
      const body = functionBody(CALDAV_SQL, fn);
      expect(body, `${fn} n'a pas de refus strict`).toMatch(/p_person_id\s+is\s+distinct\s+from\s+v_caller/i);
      // Un caller NULL (pas de session, ou profil sans person_id) doit être un
      // refus. Sans cette branche, `NULL IS DISTINCT FROM NULL` vaut false et un
      // p_person_id NULL passerait.
      expect(body, `${fn} traite un appelant NULL comme un joker`).toMatch(/v_caller\s+is\s+null\s+or/i);
      expect(body, `${fn} ne lève pas de refus`).toMatch(/raise\s+exception/i);
    }
  });

  it("les fonctions d'écriture n'ouvrent PAS aux autres vet/admin — le mot de passe Apple est personnel", () => {
    for (const fn of CALDAV_ECRITURE) {
      const body = functionBody(CALDAV_SQL, fn);
      expect(body, `${fn} accepte un rôle à la place du propriétaire`).not.toMatch(/get_my_role/i);
    }
  });

  it('get_caldav_status reste lisible par vet/admin, et ne renvoie jamais le mot de passe', () => {
    const body = functionBody(CALDAV_SQL, 'get_caldav_status');
    expect(body).toMatch(/get_my_role\(\)\s+not\s+in\s*\(\s*'admin'\s*,\s*'vet'\s*\)/i);
    expect(body).not.toMatch(/select[\s\S]*caldav_app_password\s*,/i);
  });

  it('ferme les privilèges par défaut du schéma public', () => {
    // Sans cette ligne, tout DROP + CREATE ultérieur réattribuerait anon.
    expect(CALDAV_SQL).toMatch(
      /alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+execute\s+on\s+functions\s+from\s+anon/i
    );
  });

  it("n'altère aucune signature : rejouable en CREATE OR REPLACE, sans DROP FUNCTION", () => {
    expect(/drop\s+function/i.test(CALDAV_SQL)).toBe(false);
  });
});
