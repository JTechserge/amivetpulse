#!/usr/bin/env node
/**
 * Purge des signalements au-delà de la durée de rétention (15 jours).
 *
 * Usage :
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/feedback-purge.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/feedback-purge.mjs --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/feedback-purge.mjs --days 30
 *
 * ⚠️ Suppression définitive en base vive. L'historique ne survit que dans les
 * sauvegardes quotidiennes (scripts/backup-supabase.mjs inclut `feedback`).
 *
 * La règle de rétention vit en base (fonction purge_old_feedback, migration
 * 20260816000002) et non ici : ce script ne fait que l'appeler, pour qu'un
 * DELETE massif ne puisse pas être forgé depuis un poste client.
 *
 * Délibérément séparé de feedback-digest.mjs, qui est en lecture seule :
 * mélanger un DELETE dans un outil de lecture est le genre de surprise qui se
 * paie plus tard.
 */

const SUPABASE_URL = 'https://ubowqtowyqmpraoxbaoo.supabase.co/rest/v1';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_RETENTION_DAYS = 15;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { days: DEFAULT_RETENTION_DAYS, dryRun: argv.includes('--dry-run') };
  const i = argv.indexOf('--days');
  if (i !== -1) {
    const raw = Number(argv[i + 1]);
    if (!Number.isInteger(raw) || raw < 1) fail('--days attend un entier >= 1.');
    opts.days = raw;
  }
  return opts;
}

function headers(extra) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

/** Compte ce qui serait supprimé, sans rien supprimer. */
async function countExpired(days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/feedback?created_at=lt.${encodeURIComponent(cutoff)}&select=id`,
    { headers: headers({ Prefer: 'count=exact', Range: '0-0' }) }
  );
  if (!res.ok) fail(`comptage impossible (HTTP ${res.status}) : ${await res.text()}`);
  // PostgREST renvoie « 0-0/42 » dans Content-Range.
  const total = res.headers.get('content-range')?.split('/')[1];
  return total === '*' || total == null ? null : Number(total);
}

async function purge(days) {
  const res = await fetch(`${SUPABASE_URL}/rpc/purge_old_feedback`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ retention_days: days }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404) {
      fail(
        'fonction purge_old_feedback absente. ' +
          'Jouer supabase/migrations/20260816000002_feedback_invariants_purge.sql.'
      );
    }
    fail(`purge refusée (HTTP ${res.status}) : ${body}`);
  }
  return Number(await res.json());
}

async function main() {
  if (!SERVICE_ROLE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY manquante dans l'environnement.");
  const { days, dryRun } = parseArgs(process.argv.slice(2));

  const expired = await countExpired(days);
  const label = expired === null ? 'un nombre indéterminé de' : String(expired);

  if (dryRun) {
    console.log(`[à blanc] ${label} signalement(s) de plus de ${days} jours seraient supprimés.`);
    return;
  }
  if (expired === 0) {
    console.log(`Rien à purger : aucun signalement de plus de ${days} jours.`);
    return;
  }

  const deleted = await purge(days);
  console.log(`✓ ${deleted} signalement(s) de plus de ${days} jours supprimés.`);
}

main().catch((err) => fail(err?.stack || String(err)));
