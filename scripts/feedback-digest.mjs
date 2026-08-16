#!/usr/bin/env node
/**
 * Digest quotidien des signalements non soldés.
 *
 * Usage :
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/feedback-digest.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/feedback-digest.mjs --out digest.md
 *
 * Déterministe et sans risque : il LIT la base et écrit du Markdown. Il ne
 * modifie rien, ne touche à aucune branche, n'appelle aucun modèle. C'est la
 * moitié « 5a » du pipeline ; le triage assisté (« 5b ») consomme sa sortie.
 *
 * Garde-fous du triage, à ne pas contourner :
 *   - jamais de git push, jamais de merge, jamais de déploiement ;
 *   - jamais de modification automatique de src/lib/asv-hours.js,
 *     supabase/functions/_shared/, src/slots.js, supabase/migrations/,
 *     ni de rien qui touche heures, congés, signatures ou RLS :
 *     ces signalements sortent en « décision humaine ».
 */

import { writeFileSync } from 'node:fs';
import { OPEN_STATUSES } from '../src/lib/feedback-payload.js';

const SUPABASE_URL = 'https://ubowqtowyqmpraoxbaoo.supabase.co/rest/v1';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Ordre de lecture : le bloquant d'abord, c'est ce qui empêche quelqu'un de
// travailler ce matin.
const SEVERITY_ORDER = ['bloquant', 'normal', 'confort'];
const SEVERITY_TITLES = {
  bloquant: '🛑 Bloquants',
  normal: '⚠️ Gênants',
  confort: '💡 Confort',
};
const STATUS_LABELS = {
  nouveau: 'nouveau',
  en_cours: 'en cours',
  decision_humaine: 'décision humaine',
};

// Zones où un correctif automatique se paierait en erreur de paie ou en perte
// de preuve. Un signalement qui les mentionne est marqué comme tel dans le
// digest : c'est une alerte de lecture, pas un filtre.
const SENSITIVE_HINTS = [
  'heure',
  'paie',
  'salaire',
  'congé',
  'conge',
  'récup',
  'recup',
  'signature',
  'signé',
  'signe',
  'feuille',
  'férié',
  'ferie',
];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { outPath: null };
  const i = argv.indexOf('--out');
  if (i !== -1) {
    out.outPath = argv[i + 1];
    if (!out.outPath) fail('--out attend un chemin de fichier.');
  }
  return out;
}

async function fetchOpenFeedback() {
  const url =
    `${SUPABASE_URL}/feedback` +
    `?status=in.(${OPEN_STATUSES.join(',')})` +
    `&select=id,created_at,severity,status,role,screen,app_version,message,admin_note` +
    `&order=created_at.asc`;

  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    fail(`lecture de feedback refusée (HTTP ${res.status}) : ${await res.text()}`);
  }
  return res.json();
}

export function isSensitive(row) {
  const haystack = `${row?.message || ''} ${row?.screen || ''}`.toLowerCase();
  return SENSITIVE_HINTS.some((word) => haystack.includes(word));
}

function formatRow(row) {
  const date = new Date(row.created_at);
  const when = Number.isNaN(date.getTime())
    ? row.created_at
    : date.toISOString().slice(0, 16).replace('T', ' ');

  const lines = [
    `#### \`${row.id}\` — ${when} · ${row.role} · ${STATUS_LABELS[row.status] || row.status}`,
    '',
    `- **Écran** : ${row.screen || 'inconnu'} — version \`${row.app_version || '?'}\``,
  ];
  if (isSensitive(row)) {
    lines.push(
      '- ⚖️ **Décision humaine requise** : touche aux heures, aux congés ou aux signatures. Aucun correctif automatique.'
    );
  }
  if (row.admin_note) lines.push(`- **Note** : ${row.admin_note}`);
  lines.push('', '> ' + String(row.message || '').split('\n').join('\n> '), '');
  return lines.join('\n');
}

export function buildDigest(rows, generatedAt) {
  const day = generatedAt.toISOString().slice(0, 10);
  const parts = [`# Signalements à traiter — ${day}`, ''];

  if (!rows.length) {
    parts.push('Aucun signalement ouvert. Rien à faire.', '');
    return parts.join('\n');
  }

  const sensitive = rows.filter(isSensitive).length;
  parts.push(
    `${rows.length} signalement${rows.length > 1 ? 's' : ''} ouvert${rows.length > 1 ? 's' : ''}` +
      (sensitive ? `, dont ${sensitive} à décision humaine.` : '.'),
    ''
  );

  for (const severity of SEVERITY_ORDER) {
    const group = rows.filter((r) => r.severity === severity);
    if (!group.length) continue;
    parts.push(`## ${SEVERITY_TITLES[severity]} (${group.length})`, '');
    parts.push(...group.map(formatRow));
  }

  // Une gravité hors de l'énumération connue ne doit pas faire disparaître un
  // signalement du digest sans bruit.
  const orphans = rows.filter((r) => !SEVERITY_ORDER.includes(r.severity));
  if (orphans.length) {
    parts.push(`## ❓ Gravité inconnue (${orphans.length})`, '');
    parts.push(...orphans.map(formatRow));
  }

  parts.push(
    '---',
    '',
    'Garde-fous : aucun correctif ne part en production sans relecture.',
    'Le triage prépare une branche ; Jérémie relit, pousse et déploie.',
    ''
  );
  return parts.join('\n');
}

async function main() {
  if (!SERVICE_ROLE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY manquante dans l'environnement.");
  const { outPath } = parseArgs(process.argv.slice(2));

  const rows = await fetchOpenFeedback();
  const digest = buildDigest(rows, new Date());

  if (outPath) {
    writeFileSync(outPath, digest, 'utf8');
    console.error(`✓ ${rows.length} signalement(s) → ${outPath}`);
  } else {
    process.stdout.write(digest);
  }
}

// Exécuté seulement en ligne de commande : les tests importent buildDigest
// sans déclencher d'appel réseau.
if (process.argv[1] && process.argv[1].endsWith('feedback-digest.mjs')) {
  main().catch((err) => fail(err?.stack || String(err)));
}
