#!/usr/bin/env node
/**
 * Vérifie les invariants de sécurité Amivet PULSE en interrogeant Supabase.
 * À lancer après chaque déploiement SQL ou Edge Function.
 *
 * Usage :
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-prod.mjs
 *
 * Prérequis : migration 20260714000003_verify_invariants_fn.sql déployée en base.
 * Retourne exit code 0 si tous les invariants sont verts, 1 sinon.
 */

const SUPABASE_URL = 'https://ubowqtowyqmpraoxbaoo.supabase.co/rest/v1';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!SERVICE_ROLE_KEY) {
    process.stderr.write('❌ SUPABASE_SERVICE_ROLE_KEY non défini.\n');
    process.exit(1);
  }

  const res = await fetch(`${SUPABASE_URL}/rpc/verify_security_invariants`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!res.ok) {
    const body = await res.text();
    process.stderr.write(`❌ Appel RPC échoué (HTTP ${res.status}) — ${body.slice(0, 300)}\n`);
    process.stderr.write('   La fonction verify_security_invariants() est-elle déployée ?\n');
    process.stderr.write('   → Jouer supabase/migrations/20260714000003_verify_invariants_fn.sql\n');
    process.exit(1);
  }

  const rows = await res.json();
  let allOk = true;

  process.stdout.write('\nVérification des invariants de sécurité Amivet PULSE\n');
  process.stdout.write('─'.repeat(60) + '\n');

  for (const { invariant, ok, detail } of rows) {
    const icon = ok ? '✅' : '❌';
    const detailStr = detail ? `  → ${detail}` : '';
    process.stdout.write(`${icon}  ${invariant}${detailStr}\n`);
    if (!ok) allOk = false;
  }

  process.stdout.write('─'.repeat(60) + '\n');

  if (allOk) {
    process.stdout.write('✅ Tous les invariants sont verts.\n');
  } else {
    process.stderr.write('❌ Un ou plusieurs invariants échouent — voir ci-dessus.\n');
    process.exit(1);
  }
}

main().catch(e => { process.stderr.write(`${e}\n`); process.exit(1); });
