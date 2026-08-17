/**
 * Frontière des correctifs automatiques (lot 3 du chantier « correction
 * automatique des signalements »).
 *
 * Donne une forme exécutable aux garde-fous jusqu'ici en prose
 * (docs/EXPLOITATION.md §Signalements, en-tête de feedback-digest.mjs) :
 * la routine de correction soumet la liste des fichiers que son diff touche,
 * et la frontière répond fichier par fichier — autorisé, ou refusé avec le
 * sujet du refus.
 *
 * Principe : REFUS PAR DÉFAUT. Un fichier n'est modifiable que s'il figure
 * dans la liste blanche, et une zone interdite l'emporte toujours sur la
 * liste blanche. La liste blanche est étroite à dessein : elle ne s'élargit
 * que sur décision de Jérémie, mesures du lot 5 (routine à blanc) à l'appui.
 *
 * Ce module ne lit ni la base ni le disque : fonctions pures sur des chemins
 * relatifs à la racine du dépôt, testées par
 * tests/unit/feedback-frontier.test.js.
 */

// Modifiable par la routine. Rien d'autre ne l'est.
// - src/config.js ne porte plus que libellés et configuration depuis
//   l'extraction des constantes de paie vers src/lib/pay-constants.js
//   (lot 1) : c'est cette extraction qui rend la ligne sûre.
// - src/style.css : présentation pure.
export const ALLOWED_PATHS = ['src/config.js', 'src/style.css'];

// Zones interdites nommées. Elles ne rendent pas le refus plus fort que le
// refus par défaut — elles le rendent explicable : le sujet remonte dans la
// note de triage et la PR. `paths` : fichiers exacts ; `prefixes` : tout ce
// qui commence par.
export const FORBIDDEN_ZONES = [
  {
    subject: 'heures et paie',
    paths: [
      'src/lib/pay-constants.js',
      'src/lib/asv-hours.js',
      'src/lib/time-fraction.js',
      'src/dashboard-stats.js',
      'src/slots.js',
      'src/forecast.js',
      'src/annual-view.js',
      'src/week-view.js',
    ],
    prefixes: [],
  },
  {
    subject: 'congés',
    paths: ['src/lib/leave-utils.js', 'src/leave-blocks.js', 'src/leave-requests.js'],
    prefixes: [],
  },
  {
    subject: 'signatures',
    paths: ['src/signatures.js', 'src/forecast-signatures.js'],
    prefixes: [],
  },
  {
    // CLAUDE.md : gros modules porteurs de règles métier enfouies.
    subject: 'règles métier enfouies',
    paths: ['src/calendar.js', 'src/settings.js'],
    prefixes: [],
  },
  {
    subject: 'Supabase (RLS, migrations, Edge Functions)',
    paths: [],
    prefixes: ['supabase/'],
  },
  {
    subject: 'authentification et session',
    paths: ['src/auth.js', 'src/login.js', 'src/lib/planning-auth.js', 'src/api.js', 'src/idle-timeout.js'],
    prefixes: [],
  },
  {
    // La routine ne touche ni aux tests, ni à la CI, ni à son propre
    // outillage — y compris ce fichier : la frontière se protège elle-même.
    subject: 'garde-fous du dépôt (tests, CI, outillage)',
    paths: [
      'package.json',
      'package-lock.json',
      'vite.config.js',
      'playwright.config.ts',
      'eslint.config.js',
      '.gitignore',
      'run-tnr.command',
    ],
    prefixes: ['tests/', '.github/', 'scripts/'],
  },
];

const DEFAULT_RULES = { allowed: ALLOWED_PATHS, zones: FORBIDDEN_ZONES };

/**
 * Ramène un chemin à la forme canonique « relative à la racine du dépôt ».
 * Retourne null si le chemin est inexploitable (absolu, remontée `..`,
 * vide) : l'appelant le refuse, il ne devine pas.
 */
export function normalizePath(path) {
  if (typeof path !== 'string') return null;
  let p = path.trim();
  while (p.startsWith('./')) p = p.slice(2);
  if (p === '' || p.startsWith('/') || p.startsWith('..') || p.includes('/../') || p.endsWith('/..')) {
    return null;
  }
  return p;
}

/**
 * Verdict pour un fichier.
 * @returns {{ allowed: boolean, subject: string | null }}
 *   `subject` nomme la zone interdite touchée, « chemin invalide » pour un
 *   chemin inexploitable, « hors liste blanche » pour le refus par défaut,
 *   et null quand c'est autorisé.
 */
export function checkPath(path, rules = DEFAULT_RULES) {
  const p = normalizePath(path);
  if (p === null) return { allowed: false, subject: 'chemin invalide' };

  // L'interdit d'abord : une zone interdite l'emporte sur la liste blanche.
  for (const zone of rules.zones) {
    if (zone.paths.includes(p) || zone.prefixes.some((pre) => p.startsWith(pre))) {
      return { allowed: false, subject: zone.subject };
    }
  }
  if (rules.allowed.includes(p)) return { allowed: true, subject: null };
  return { allowed: false, subject: 'hors liste blanche' };
}

/**
 * Verdict pour un diff entier : la liste des fichiers touchés (créés,
 * modifiés, supprimés ou renommés — les deux noms d'un renommage comptent).
 * Un diff vide est refusé : un correctif qui ne touche rien n'en est pas un.
 * @returns {{ allowed: boolean, violations: Array<{ path: string, subject: string }> }}
 */
export function checkDiffPaths(paths, rules = DEFAULT_RULES) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { allowed: false, violations: [] };
  }
  const violations = [];
  for (const path of paths) {
    const verdict = checkPath(path, rules);
    if (!verdict.allowed) violations.push({ path, subject: verdict.subject });
  }
  return { allowed: violations.length === 0, violations };
}
