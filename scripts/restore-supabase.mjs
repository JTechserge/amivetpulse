#!/usr/bin/env node
/**
 * Restauration d'un export Amivet PULSE vers Supabase.
 *
 * ⚠️  Les sauvegardes GitHub sont chiffrées (.tar.gz.age). Déchiffrer d'abord :
 *   age --decrypt --identity amivet-backup-key.txt backup-2026-07-14.tar.gz.age \
 *     | tar -xzf -
 *   # Produit ./backup-2026-07-14/ déchiffré, prêt pour ce script.
 *   # Requiert age installé (brew install age / apt install age) et la clé privée.
 *
 * Usage (dry-run, sans écriture — défaut) :
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore-supabase.mjs ./backup-2026-07-14
 *
 * Usage (restauration réelle — DESTRUCTIF) :
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore-supabase.mjs ./backup-2026-07-14 --confirm-prod
 *
 * Le flag --confirm-prod est obligatoire pour toute écriture. Sans lui, le script
 * n'effectue AUCUN changement et affiche uniquement ce qui serait restauré.
 *
 * ⚠️  La restauration utilise UPSERT (insert ou mise à jour si la clé primaire existe).
 *     Elle ne supprime PAS les lignes présentes en base mais absentes du backup.
 *     Pour une restauration complète sur base vierge, vider la table d'abord manuellement.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = 'https://ubowqtowyqmpraoxbaoo.supabase.co/rest/v1';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONFIRM = process.argv.includes('--confirm-prod');
const BACKUP_DIR = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);

// Tables dans l'ordre de restauration (dépendances en premier)
const TABLES = [
  'planning_data',
  'user_profiles',
  'email_settings',
  'annual_interviews',
  'cp_adjustments',
  'medical_visits',
  'announcements',
  'announcement_reads',
  'monthly_signatures',
  'signature_tokens',
  'calendar_sync_tokens',
  'push_subscriptions',
  'app_security',
];

async function upsertTable(name, rows) {
  if (!rows.length) {
    process.stdout.write(`  ⏭  ${name} : vide, rien à restaurer\n`);
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/${name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  process.stdout.write(`  ✅ ${name} : ${rows.length} ligne(s) upsertées\n`);
}

async function main() {
  if (!SERVICE_ROLE_KEY) {
    process.stderr.write('❌ SUPABASE_SERVICE_ROLE_KEY non défini.\n');
    process.exit(1);
  }
  if (!BACKUP_DIR || !existsSync(BACKUP_DIR)) {
    process.stderr.write(`❌ Dossier de backup introuvable : ${BACKUP_DIR ?? '(non spécifié)'}\n`);
    process.stderr.write('Usage : node scripts/restore-supabase.mjs ./backup-YYYY-MM-DD [--confirm-prod]\n');
    process.exit(1);
  }

  const manifestPath = join(BACKUP_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    process.stderr.write(`❌ manifest.json absent dans ${BACKUP_DIR} — dossier invalide.\n`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  process.stdout.write(`\nBackup du ${manifest.date} (exporté le ${manifest.exportedAt})\n`);
  process.stdout.write(CONFIRM
    ? '⚠️  MODE RESTAURATION RÉELLE — les données en base seront écrasées.\n\n'
    : '🔍 MODE DRY-RUN — aucune écriture. Ajouter --confirm-prod pour restaurer.\n\n'
  );

  let hasError = false;
  for (const name of TABLES) {
    const filePath = join(BACKUP_DIR, `${name}.json`);
    if (!existsSync(filePath)) {
      process.stderr.write(`  ⚠️  ${name} : fichier absent dans le backup, ignoré\n`);
      continue;
    }
    const rows = JSON.parse(readFileSync(filePath, 'utf8'));
    if (CONFIRM) {
      try {
        await upsertTable(name, rows);
      } catch (err) {
        process.stderr.write(`  ❌ ${name} : ${err.message}\n`);
        hasError = true;
      }
    } else {
      process.stdout.write(`  📋 ${name.padEnd(28)} ${rows.length} ligne(s) à restaurer\n`);
    }
  }

  if (!CONFIRM) {
    process.stdout.write('\nAucun changement effectué (dry-run).\n');
    process.stdout.write('Pour restaurer : ajouter --confirm-prod à la commande.\n');
  } else if (hasError) {
    process.stderr.write('\n❌ Restauration partielle — voir les erreurs ci-dessus.\n');
    process.exit(1);
  } else {
    process.stdout.write('\n✅ Restauration complète.\n');
  }
}

main().catch(e => { process.stderr.write(`${e}\n`); process.exit(1); });
