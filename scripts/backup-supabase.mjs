#!/usr/bin/env node
/**
 * Export quotidien de toutes les tables Amivet PULSE vers des fichiers JSON.
 *
 * Usage :
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-supabase.mjs
 *   # Produit un dossier backup-YYYY-MM-DD/ dans le répertoire courant.
 *
 * Tables incluses : données métier + RH + signatures.
 * Tables exclues :
 *   - rate_limit_log  : éphémère, aucune valeur à restaurer
 *   - (app_security incluse : contient des réglages de sécurité,
 *      pas de secrets bruts ; nécessaire pour restaurer l'état complet)
 */

import { mkdirSync, writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://ubowqtowyqmpraoxbaoo.supabase.co/rest/v1';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIMIT = 10000; // largement au-dessus du volume attendu pour cette clinique

/**
 * Tables à sauvegarder, dans l'ordre de dépendance utile pour la restauration.
 * requiredMinRows : si défini, le job échoue si la table contient moins de lignes.
 */
const TABLES = [
  { name: 'planning_data',       requiredMinRows: 1 }, // singleton, doit toujours exister
  { name: 'user_profiles' },
  { name: 'monthly_signatures' },
  { name: 'signature_tokens' },
  { name: 'email_settings' },
  { name: 'annual_interviews' },
  { name: 'cp_adjustments' },
  { name: 'medical_visits' },
  { name: 'announcements' },
  { name: 'announcement_reads' },
  { name: 'calendar_sync_tokens' },
  { name: 'push_subscriptions' },
  { name: 'app_security' },
];

async function exportTable(name) {
  const url = `${SUPABASE_URL}/${name}?select=*&limit=${LIMIT}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const rows = await res.json();
  if (rows.length >= LIMIT) {
    process.stderr.write(`⚠️  ${name} : ${LIMIT} lignes retournées — probable troncature, augmenter LIMIT\n`);
  }
  return rows;
}

async function main() {
  if (!SERVICE_ROLE_KEY) {
    process.stderr.write('❌ SUPABASE_SERVICE_ROLE_KEY non défini — arrêt.\n');
    process.exit(1);
  }

  const date = new Date().toISOString().slice(0, 10);
  const outDir = `backup-${date}`;
  mkdirSync(outDir, { recursive: true });

  const summary = [];
  let hasError = false;

  for (const { name, requiredMinRows } of TABLES) {
    try {
      const rows = await exportTable(name);
      writeFileSync(`${outDir}/${name}.json`, JSON.stringify(rows, null, 2), 'utf8');

      if (requiredMinRows !== undefined && rows.length < requiredMinRows) {
        process.stderr.write(`❌ ${name} : ${rows.length} ligne(s) — minimum attendu : ${requiredMinRows}\n`);
        hasError = true;
      } else {
        process.stdout.write(`✅ ${name.padEnd(28)} ${rows.length} ligne(s)\n`);
      }
      summary.push({ table: name, rows: rows.length });
    } catch (err) {
      process.stderr.write(`❌ ${name} : ${err.message}\n`);
      hasError = true;
      summary.push({ table: name, rows: null, error: err.message });
    }
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    date,
    tables: summary,
    ok: !hasError,
  };
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2), 'utf8');

  const exported = summary.filter(s => s.rows !== null).length;
  process.stdout.write(`\nDossier : ./${outDir}/  (${exported}/${TABLES.length} tables)\n`);

  if (hasError) {
    process.stderr.write('❌ Sauvegarde incomplète — voir les erreurs ci-dessus.\n');
    process.exit(1);
  }
  process.stdout.write('✅ Sauvegarde complète.\n');
}

main().catch(e => { process.stderr.write(`${e}\n`); process.exit(1); });
