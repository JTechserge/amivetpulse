/**
 * La frontière des correctifs automatiques, en contrat.
 *
 * Les chemins et les sujets attendus sont écrits EN DUR ici, sans importer
 * les listes de production : le test pince la frontière de l'extérieur.
 * Élargir la liste blanche ou rétrécir une zone interdite doit faire rougir
 * ce fichier — c'est son rôle, pas un accident.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkPath, checkDiffPaths, normalizePath } from '../../scripts/feedback-frontier.mjs';

describe('checkPath — zones interdites, chacune refusée avec son sujet', () => {
  const cases = [
    ['src/lib/pay-constants.js', 'heures et paie'],
    ['src/lib/asv-hours.js', 'heures et paie'],
    ['src/lib/time-fraction.js', 'heures et paie'],
    ['src/dashboard-stats.js', 'heures et paie'],
    ['src/slots.js', 'heures et paie'],
    ['src/lib/leave-utils.js', 'congés'],
    ['src/leave-blocks.js', 'congés'],
    ['src/leave-requests.js', 'congés'],
    ['src/signatures.js', 'signatures'],
    ['src/forecast-signatures.js', 'signatures'],
    ['src/calendar.js', 'règles métier enfouies'],
    ['src/settings.js', 'règles métier enfouies'],
    ['supabase/migrations/20260816000001_feedback.sql', 'Supabase (RLS, migrations, Edge Functions)'],
    ['supabase/functions/_shared/asv-hours.ts', 'Supabase (RLS, migrations, Edge Functions)'],
    ['src/auth.js', 'authentification et session'],
    ['src/lib/planning-auth.js', 'authentification et session'],
    ['src/api.js', 'authentification et session'],
    ['tests/unit/asv-hours-contract.test.js', 'garde-fous du dépôt (tests, CI, outillage)'],
    ['.github/workflows/ci.yml', 'garde-fous du dépôt (tests, CI, outillage)'],
    ['package.json', 'garde-fous du dépôt (tests, CI, outillage)'],
  ];
  for (const [path, subject] of cases) {
    it(`refuse ${path} (${subject})`, () => {
      expect(checkPath(path)).toEqual({ allowed: false, subject });
    });
  }

  it('refuse la frontière elle-même : la routine ne peut pas éditer son propre garde-fou', () => {
    expect(checkPath('scripts/feedback-frontier.mjs')).toEqual({
      allowed: false,
      subject: 'garde-fous du dépôt (tests, CI, outillage)',
    });
  });
});

describe('checkPath — liste blanche', () => {
  it('autorise src/config.js (libellés seulement depuis le lot 1)', () => {
    expect(checkPath('src/config.js')).toEqual({ allowed: true, subject: null });
  });
  it('autorise src/style.css', () => {
    expect(checkPath('src/style.css')).toEqual({ allowed: true, subject: null });
  });
  it('normalise le préfixe ./ avant de décider', () => {
    expect(checkPath('./src/config.js').allowed).toBe(true);
  });
});

describe('checkPath — refus par défaut', () => {
  it.each([['src/ui.js'], ['src/index.html'], ['public/manifest.json'], ['public/sw.js'], ['docs/EXPLOITATION.md'], ['src/fichier-qui-n-existe-pas-encore.js']])(
    'refuse %s : hors liste blanche',
    (path) => {
      expect(checkPath(path)).toEqual({ allowed: false, subject: 'hors liste blanche' });
    }
  );
});

describe('checkPath — chemins inexploitables', () => {
  it.each([['/etc/passwd'], ['../autre-depot/fichier.js'], ['src/../../evasion.js'], ['']])(
    'refuse %s : chemin invalide',
    (path) => {
      expect(checkPath(path)).toEqual({ allowed: false, subject: 'chemin invalide' });
    }
  );
  it('normalizePath rend null pour un non-string', () => {
    expect(normalizePath(undefined)).toBeNull();
  });
});

describe('checkPath — précédence', () => {
  it("une zone interdite l'emporte sur la liste blanche", () => {
    const rules = {
      allowed: ['src/fichier.js'],
      zones: [{ subject: 'zone-test', paths: ['src/fichier.js'], prefixes: [] }],
    };
    expect(checkPath('src/fichier.js', rules)).toEqual({ allowed: false, subject: 'zone-test' });
  });
});

describe('checkDiffPaths — verdict sur un diff entier', () => {
  it('accepte un diff entièrement en liste blanche', () => {
    expect(checkDiffPaths(['src/config.js', 'src/style.css'])).toEqual({ allowed: true, violations: [] });
  });
  it("refuse le diff entier dès qu'un fichier sort de la frontière, et nomme chaque violation", () => {
    const { allowed, violations } = checkDiffPaths(['src/config.js', 'src/lib/pay-constants.js', 'src/ui.js']);
    expect(allowed).toBe(false);
    expect(violations).toEqual([
      { path: 'src/lib/pay-constants.js', subject: 'heures et paie' },
      { path: 'src/ui.js', subject: 'hors liste blanche' },
    ]);
  });
  it("refuse un diff vide : un correctif qui ne touche rien n'en est pas un", () => {
    expect(checkDiffPaths([]).allowed).toBe(false);
    expect(checkDiffPaths(null).allowed).toBe(false);
  });
});

describe('la frontière reste vraie — src/config.js ne reprend pas de constante de paie', () => {
  // Les 11 constantes extraites par le lot 1. En dur, volontairement : si
  // l'une revient dans config.js, la ligne « src/config.js » de la liste
  // blanche redevient fausse et ce test doit le dire.
  const PAY_CONSTANT_NAMES = [
    'ANNUAL_FULLTIME_HOURS',
    'HALFDAY_HOURS',
    'WEEKLY_MAX_HOURS',
    'ASV_STD_SAT_CARLA',
    'ASV_STD_SAT_SECOND',
    'ASV_STD_WEEKDAY_AVG',
    'CLINIC_HOURS',
    'CLINIC_M_H',
    'CLINIC_AM_H',
    'CP_DAYS_PER_MONTH',
    'CP_REFERENCE_START_MONTH',
  ];
  const configSource = readFileSync(new URL('../../src/config.js', import.meta.url), 'utf8');
  const payConstantsSource = readFileSync(new URL('../../src/lib/pay-constants.js', import.meta.url), 'utf8');

  for (const name of PAY_CONSTANT_NAMES) {
    it(`${name} est définie dans lib/pay-constants.js et pas dans config.js`, () => {
      expect(payConstantsSource).toMatch(new RegExp(`^export const ${name} `, 'm'));
      expect(configSource).not.toMatch(new RegExp(`^\\s*export const ${name} `, 'm'));
    });
  }
});
