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

// ─────────────────────────────────────────────────────────────────────────────
// LOT 2 — tokens de flux calendrier.
//
// Même portée de preuve que le lot 1 : l'intention du code, pas le comportement
// de Postgres. S'y ajoute une vérification de cohérence entre la migration et
// l'Edge Function calendar-feed, qui doivent être déployées ensemble — la
// migration révoque anon sur get_calendar_feed_access, la fonction Edge doit
// donc avoir basculé sur service_role. Un écart ici casse le flux ICS des
// téléphones abonnés.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_FILE = '20260905000003_calendar_token_guard.sql';
const TOKEN_SQL = readSql(TOKEN_FILE);

const CALENDAR_FEED_TS = readFileSync(join(HERE, '../../supabase/functions/calendar-feed/index.ts'), 'utf8');

// Les quatre fonctions de GESTION : réservées au propriétaire ou à vet/admin.
const GESTION_CALENDRIER = [
  'generate_calendar_sync_token',
  'revoke_calendar_sync_token',
  'get_calendar_sync_status',
  'update_calendar_sync_preferences',
];

// Les deux fonctions de VÉRIFICATION : fermées à anon ET authenticated.
const VERIFICATION_CALENDRIER = ['verify_calendar_sync_token', 'get_calendar_feed_access'];

describe('surface anon — lot 2, tokens de flux calendrier', () => {
  it('révoque anon sur les six fonctions calendrier', () => {
    const nonRevoquees = [...GESTION_CALENDRIER, ...VERIFICATION_CALENDRIER].filter(
      (fn) =>
        !new RegExp(
          `revoke\\s+execute\\s+on\\s+function\\s+${fn}\\s*\\([^)]*\\)\\s+from\\s+public\\s*,\\s*anon`,
          'i'
        ).test(TOKEN_SQL)
    );
    expect(nonRevoquees).toEqual([]);
  });

  it('conserve authenticated sur les quatre fonctions de gestion', () => {
    const nonAccordees = GESTION_CALENDRIER.filter(
      (fn) =>
        !new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${fn}\\s*\\([^)]*\\)\\s+to\\s+authenticated`, 'i').test(
          TOKEN_SQL
        )
    );
    expect(nonAccordees).toEqual([]);
  });

  it('ferme aussi authenticated sur les deux fonctions de vérification', () => {
    for (const fn of VERIFICATION_CALENDRIER) {
      expect(
        new RegExp(
          `revoke\\s+execute\\s+on\\s+function\\s+${fn}\\s*\\([^)]*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
          'i'
        ).test(TOKEN_SQL),
        `${fn} reste ouverte à authenticated`
      ).toBe(true);
      // Et jamais réaccordée ensuite.
      expect(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${fn}`, 'i').test(TOKEN_SQL),
        `${fn} est réaccordée après avoir été révoquée`
      ).toBe(false);
    }
  });

  it("les quatre fonctions de gestion dérivent l'identité et acceptent vet/admin", () => {
    for (const fn of GESTION_CALENDRIER) {
      const body = functionBody(TOKEN_SQL, fn);
      expect(body, `corps introuvable pour ${fn}`).not.toBeNull();
      expect(body, `${fn} ne dérive pas l'identité`).toMatch(/v_caller\s+text\s*:=\s*my_person_id\(\)/i);
      expect(body, `${fn} ne refuse pas un person_id étranger`).toMatch(
        /p_person_id\s+is\s+distinct\s+from\s+v_caller/i
      );
      expect(body, `${fn} traite un appelant NULL comme un joker`).toMatch(/v_caller\s+is\s+null/i);
      expect(body, `${fn} n'ouvre pas à vet/admin`).toMatch(
        /get_my_role\(\)\s+not\s+in\s*\(\s*'admin'\s*,\s*'vet'\s*\)/i
      );
      expect(body, `${fn} ne lève pas de refus`).toMatch(/raise\s+exception/i);
    }
  });

  it('calendar-feed appelle get_calendar_feed_access en service_role, pas en anon', () => {
    // La migration révoque anon sur cette fonction : sans cette bascule, tous
    // les téléphones abonnés reçoivent un 502 au prochain rafraîchissement.
    const appel = CALENDAR_FEED_TS.match(/rpc\/get_calendar_feed_access[\s\S]{0,400}?\}\)/);
    expect(appel, "l'appel à get_calendar_feed_access est introuvable").not.toBeNull();
    expect(appel[0]).toMatch(/SERVICE_ROLE_KEY/);
    expect(appel[0]).not.toMatch(/ANON_KEY/);
  });

  it('calendar-feed reste public : aucun garde JWT ajouté par erreur', () => {
    // C'est l'exception assumée du chantier — le flux ICS est un lien porteur,
    // consulté par un téléphone qui n'a aucune session Supabase.
    expect(CALENDAR_FEED_TS).not.toMatch(/auth\/v1\/user/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lot 3 — gardes d'identité sur les deux Edge Functions qui n'en avaient aucune.
//
// Portée de preuve : l'intention du code déployé, pas son exécution. Il n'existe
// pas de compte de test Supabase (CLAUDE.md) — ces tests constatent que le garde
// est écrit, qu'il précède tout traitement, et que les deux voies d'entrée
// n'ouvrent pas les mêmes actions. S'y ajoute la cohérence avec save-planning,
// seul appelant interne : si sa requête cessait d'être reconnue, la synchro
// iCloud s'arrêterait silencieusement à la prochaine sauvegarde de planning.
// ─────────────────────────────────────────────────────────────────────────────

const CALDAV_PUSH_TS = readFileSync(join(HERE, '../../supabase/functions/caldav-push/index.ts'), 'utf8');
const PUSH_SERVER_TS = readFileSync(join(HERE, '../../supabase/functions/push-server/index.ts'), 'utf8');
const SAVE_PLANNING_TS = readFileSync(join(HERE, '../../supabase/functions/save-planning/index.ts'), 'utf8');

function section(source, from, to) {
  const start = source.indexOf(from);
  if (start === -1) return null;
  const end = to ? source.indexOf(to, start + from.length) : -1;
  return source.slice(start, end === -1 ? source.length : end);
}

const DISCOVER_BLOC = section(CALDAV_PUSH_TS, "body.action === 'discover'", '── Suppression totale');
const CLEAR_BLOC = section(CALDAV_PUSH_TS, "body.action === 'clear'", '── Sync complet');
const SYNC_BLOC = section(CALDAV_PUSH_TS, '── Sync complet', 'return json({ ok: true, results })');

describe("surface anon — lot 3, gardes d'identité des Edge Functions", () => {
  it('les deux fonctions vérifient le JWT et relisent le profil côté serveur', () => {
    for (const [nom, src] of [['caldav-push', CALDAV_PUSH_TS], ['push-server', PUSH_SERVER_TS]]) {
      expect(src, `${nom} ne vérifie pas le JWT`).toMatch(/auth\/v1\/user/);
      expect(src, `${nom} ne relit pas user_profiles`).toMatch(/rest\/v1\/user_profiles\?id=eq\./);
    }
  });

  it('caldav-push refuse tout appel non identifié avant même de lire le corps', () => {
    const handler = section(CALDAV_PUSH_TS, 'Deno.serve(async (req)');
    expect(handler).toMatch(/const caller = await identifyCaller\(req\);/);
    expect(handler).toMatch(/if \(!caller\) return json\(\{ error: 'Non authentifié\.' \}, 401\);/);
    expect(
      handler.indexOf('identifyCaller'),
      'le corps est lu avant le garde'
    ).toBeLessThan(handler.indexOf('req.json()'));
  });

  it("caldav-push n'ouvre discover et clear qu'à un compte connecté, jamais à service_role", () => {
    // La voie service_role n'a pas d'utilisateur derrière elle : lui laisser
    // « clear » rendrait la destruction d'un calendrier iCloud accessible à tout
    // appel interne, et « discover » ferait du serveur une sonde de comptes Apple.
    for (const [nom, bloc] of [['discover', DISCOVER_BLOC], ['clear', CLEAR_BLOC]]) {
      expect(bloc, `bloc ${nom} introuvable`).not.toBeNull();
      expect(bloc, `${nom} accepte la voie service_role`).toMatch(/caller\.kind !== 'user'/);
    }
  });

  it("caldav-push ignore le personId du corps pour clear — on n'efface que son propre calendrier", () => {
    expect(CLEAR_BLOC).toMatch(/const personId = caller\.personId/);
    expect(CLEAR_BLOC, 'le personId du corps est encore lu').not.toMatch(/body as \{ personId/);
    expect(CLEAR_BLOC, 'un compte sans collaborateur associé passe quand même').toMatch(
      /if \(!personId\) return json\([^)]*403\)/
    );
  });

  it("caldav-push ne synchronise que le calendrier de l'appelant quand il vient d'un JWT", () => {
    expect(SYNC_BLOC, 'bloc de sync introuvable').not.toBeNull();
    expect(SYNC_BLOC, 'la liste du corps est prise telle quelle').toMatch(/caller\.kind === 'service'/);
    expect(SYNC_BLOC, "la voie JWT ne se limite pas à l'appelant").toMatch(
      /caller\.personId \? \[caller\.personId\] : \[\]/
    );
  });

  it('caldav-push reconnaît la voie service_role, telle que save-planning la présente', () => {
    expect(CALDAV_PUSH_TS, 'la voie service_role a disparu').toMatch(
      /authHeader === `Bearer \$\{SERVICE_ROLE_KEY\}`/
    );
    const appel = SAVE_PLANNING_TS.match(/functions\/v1\/caldav-push[\s\S]{0,400}?\}\)/);
    expect(appel, "l'appel interne de save-planning est introuvable").not.toBeNull();
    expect(appel[0], 'save-planning ne présente plus la clé service_role').toMatch(
      /Bearer \$\{SERVICE_ROLE_KEY\}/
    );
    expect(appel[0], "save-planning envoie une action, que la voie service_role refuse").not.toMatch(
      /action/
    );
  });

  it("push-server exige un compte avant d'envoyer la moindre notification", () => {
    const handler = section(PUSH_SERVER_TS, 'serve(async (req)');
    expect(handler).toMatch(/if \(!await isAuthorizedCaller\(req\)\)/);
    expect(
      handler.indexOf('isAuthorizedCaller'),
      'le corps est lu avant le garde'
    ).toBeLessThan(handler.indexOf('req.json()'));
  });

  it('push-server accepte tous les rôles — les ASV déclenchent des notifications légitimes', () => {
    // src/calendar.js:1602 et :1668 : une demande de congé d'ASV notifie les vets.
    // Un filtre vet/admin ici couperait cette chaîne sans erreur visible.
    expect(PUSH_SERVER_TS, 'un filtre de rôle a été introduit').not.toMatch(
      /'vet'\s*,\s*'admin'|'admin'\s*,\s*'vet'/
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lot 4 — suppression des six fonctions du mot de passe partagé.
//
// Portée de preuve : la couverture, pas l'exécution. Ce que ces tests protègent,
// c'est qu'aucune des fonctions créées par 20240201000001 ne survive à la
// migration de suppression, et qu'aucune colonne sensible ne soit oubliée en
// route — les deux sont dérivés du fichier d'origine, pas recopiés à la main.
// S'y ajoute le piège propre au DROP : `DROP FUNCTION IF EXISTS f(text)` sur une
// fonction `f(text, text)` ne supprime rien et ne dit rien. L'arité est donc
// comparée entre création et suppression.
// ─────────────────────────────────────────────────────────────────────────────

const ORIGINE_FILE = '20240201000001_password_security.sql';
const ORIGINE_SQL = readSql(ORIGINE_FILE);
const DROP_FILE = '20260905000004_drop_password_functions.sql';
const DROP_SQL = readSql(DROP_FILE);

// Les fonctions telles que la migration d'origine les déclare : nom → nombre
// de paramètres. Rien n'est saisi à la main ici.
const FONCTIONS_ORIGINE = new Map(
  [...ORIGINE_SQL.matchAll(/create\s+or\s+replace\s+function\s+(\w+)\s*\(([^)]*)\)/gi)].map(
    ([, nom, params]) => [nom, params.trim() === '' ? 0 : params.split(',').length]
  )
);

// Les colonnes de app_security, telles que la migration d'origine les crée.
const COLONNES_ORIGINE = (() => {
  const bloc = ORIGINE_SQL.match(/create table if not exists app_security \(([\s\S]*?)\n\);/i);
  if (!bloc) return [];
  return bloc[1]
    .split('\n')
    .map((l) => l.trim().match(/^(\w+)\s/))
    .filter(Boolean)
    .map((m) => m[1]);
})();

// Colonnes conservées : la clé et l'horodatage. La table survit vidée de son
// contenu sensible parce que backup-restore-contract.test.js exige sa présence.
const COLONNES_CONSERVEES = new Set(['id', 'updated_at']);

function fichiersSources() {
  const racines = ['src', 'scripts', 'supabase/functions', '.github'];
  const fichiers = [];
  for (const racine of racines) {
    let entrees;
    try {
      entrees = readdirSync(join(HERE, '../..', racine), { recursive: true, withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entrees) {
      if (e.isFile() && /\.(js|mjs|ts|html|yml|yaml)$/.test(e.name)) {
        fichiers.push(join(e.parentPath ?? e.path, e.name));
      }
    }
  }
  return fichiers;
}

describe('surface anon — lot 4, fonctions du mot de passe partagé', () => {
  it('le corpus contient bien six fonctions à supprimer (garde-fou du test lui-même)', () => {
    expect(FONCTIONS_ORIGINE.size).toBe(6);
    expect(COLONNES_ORIGINE.length).toBeGreaterThan(2);
  });

  it("chaque fonction créée par la migration d'origine est supprimée", () => {
    const survivantes = [...FONCTIONS_ORIGINE.keys()].filter(
      (nom) => !new RegExp(`drop\\s+function\\s+if\\s+exists\\s+${nom}\\s*\\(`, 'i').test(DROP_SQL)
    );
    expect(survivantes).toEqual([]);
  });

  it("chaque DROP porte l'arité de la fonction créée — sinon il ne supprime rien, en silence", () => {
    for (const [nom, arite] of FONCTIONS_ORIGINE) {
      const drop = DROP_SQL.match(
        new RegExp(`drop\\s+function\\s+if\\s+exists\\s+${nom}\\s*\\(([^)]*)\\)`, 'i')
      );
      expect(drop, `DROP introuvable pour ${nom}`).not.toBeNull();
      const ariteDrop = drop[1].trim() === '' ? 0 : drop[1].split(',').length;
      expect(ariteDrop, `${nom} : DROP à ${ariteDrop} paramètre(s), création à ${arite}`).toBe(arite);
    }
  });

  it('ne recrée ni ne réaccorde aucune de ces fonctions', () => {
    for (const nom of FONCTIONS_ORIGINE.keys()) {
      expect(new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+${nom}`, 'i').test(DROP_SQL)).toBe(false);
      expect(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${nom}`, 'i').test(DROP_SQL)).toBe(false);
    }
  });

  it('supprime toutes les colonnes sensibles de app_security, et ne garde que la clé et la date', () => {
    const aSupprimer = COLONNES_ORIGINE.filter((c) => !COLONNES_CONSERVEES.has(c));
    const oubliees = aSupprimer.filter(
      (c) => !new RegExp(`alter\\s+table\\s+app_security\\s+drop\\s+column\\s+if\\s+exists\\s+${c}\\b`, 'i').test(DROP_SQL)
    );
    expect(oubliees).toEqual([]);
    for (const gardee of COLONNES_CONSERVEES) {
      expect(
        new RegExp(`drop\\s+column\\s+if\\s+exists\\s+${gardee}\\b`, 'i').test(DROP_SQL),
        `${gardee} est supprimée alors qu'elle porte la table`
      ).toBe(false);
    }
  });

  it('ne supprime pas la table elle-même — le contrat de sauvegarde en dépend', () => {
    expect(/drop\s+table[^;]*app_security/i.test(DROP_SQL)).toBe(false);
  });

  it("aucune de ces fonctions n'est appelée nulle part dans le code", () => {
    // Le vrai garde-fou du lot : si quelqu'un réintroduit un appel après le DROP,
    // il obtiendra un 404 PostgREST en production, sans erreur au build.
    const appelantes = [];
    for (const fichier of fichiersSources()) {
      const contenu = readFileSync(fichier, 'utf8');
      for (const nom of FONCTIONS_ORIGINE.keys()) {
        if (contenu.includes(nom)) appelantes.push(`${nom} → ${fichier}`);
      }
    }
    expect(appelantes).toEqual([]);
  });
});
