import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Verrou sur la RLS de la table `feedback`.
//
// CE QUE CE TEST PROUVE : que les prédicats de sécurité écrits dans la
// migration n'ont pas été affaiblis. Un signalement contient le texte libre
// d'un salarié sur son travail ; l'exposer à un collègue serait une fuite.
//
// CE QU'IL NE PROUVE PAS : que Postgres applique effectivement ces politiques.
// Il n'existe pas de compte de test Supabase sur ce projet (cf. CLAUDE.md), donc
// aucun test automatisé ne peut le vérifier. La preuve d'effet est la check-list
// manuelle en fin de 20260816000001_feedback.sql, à passer une fois après
// application de la migration.
//
// Si ce test casse, la question n'est jamais « comment le faire passer » mais
// « qui a relâché la politique, et pourquoi ».
// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(HERE, '../../supabase/migrations/20260816000001_feedback.sql');
const RAW = readFileSync(SQL_PATH, 'utf8');

// La migration se termine par une check-list de vérification manuelle qui cite
// du SQL en commentaire. On l'écarte pour n'analyser que le code exécuté.
const SQL = RAW.split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

// Extrait les politiques réellement créées : nom → { cmd, role, body }.
function parsePolicies(sql) {
  const out = new Map();
  const re = /CREATE POLICY "([^"]+)"\s+ON feedback\s+FOR (\w+)\s+TO (\w+)([\s\S]*?);/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    out.set(m[1], { cmd: m[2].toUpperCase(), role: m[3], body: m[4] });
  }
  return out;
}

// Normalise les espaces pour comparer un prédicat sans dépendre de l'indentation.
const flat = (s) => s.replace(/\s+/g, ' ').trim();

const POLICIES = parsePolicies(SQL);

describe('feedback — la table et ses contraintes', () => {
  it('active RLS', () => {
    expect(SQL).toMatch(/ALTER TABLE feedback ENABLE ROW LEVEL SECURITY/);
  });

  it('rattache reported_by à auth.users', () => {
    expect(flat(SQL)).toContain('reported_by UUID NOT NULL REFERENCES auth.users(id)');
  });

  it('borne le message pour éviter le champ vide et le dépôt massif', () => {
    expect(flat(SQL)).toContain('CHECK (length(btrim(message)) BETWEEN 5 AND 2000)');
  });

  it('énumère les statuts, sans état libre', () => {
    const statuses = flat(SQL).match(/status IN \(([^)]+)\)/);
    expect(statuses).not.toBeNull();
    expect(
      statuses[1]
        .split(',')
        .map((s) => s.trim().replace(/'/g, ''))
        .sort()
    ).toEqual(['corrige', 'decision_humaine', 'en_cours', 'nouveau', 'rejete']);
  });

  it('énumère les sévérités et les rôles connus', () => {
    expect(flat(SQL)).toContain("severity IN ('bloquant','normal','confort')");
    expect(flat(SQL)).toContain("role IN ('admin','vet','vet_employe','asv')");
  });

  it("n'expose pas clinic_id comme une isolation multi-tenant", () => {
    // La colonne existe pour le portage VetPulse, mais aucune politique ne doit
    // s'appuyer dessus tant que user_profiles ne porte pas de clinique :
    // le prédicat serait décoratif et donnerait une fausse assurance.
    expect(SQL).toMatch(/clinic_id\s+TEXT\s+NOT NULL DEFAULT 'amivet'/);
    for (const [, p] of POLICIES) {
      expect(p.body).not.toContain('clinic_id');
    }
  });
});

describe('feedback — politiques RLS', () => {
  it('en déclare exactement cinq', () => {
    expect([...POLICIES.keys()].sort()).toEqual([
      'admin delete feedback',
      'admin select feedback',
      'admin update feedback',
      'own insert feedback',
      'own select feedback',
    ]);
  });

  it("n'en ouvre aucune à anon ni à public", () => {
    for (const [name, p] of POLICIES) {
      expect(p.role, `politique « ${name} »`).toBe('authenticated');
    }
  });

  it("n'en laisse aucune inconditionnelle", () => {
    // C'est le défaut d'`announcements` (USING (true)) : le reproduire ici
    // rendrait chaque signalement lisible par toute la clinique.
    for (const [name, p] of POLICIES) {
      const body = flat(p.body);
      expect(body, `politique « ${name} »`).not.toMatch(/USING \(\s*true\s*\)/i);
      expect(body, `politique « ${name} »`).not.toMatch(/WITH CHECK \(\s*true\s*\)/i);
    }
  });
});

describe('feedback — insertion', () => {
  const p = () => POLICIES.get('own insert feedback');

  it("interdit de signaler au nom de quelqu'un d'autre", () => {
    expect(flat(p().body)).toContain('reported_by = auth.uid()');
  });

  it("force la naissance à l'état neuf, non traité", () => {
    const body = flat(p().body);
    expect(body).toContain("status = 'nouveau'");
    expect(body).toContain('admin_note IS NULL');
    expect(body).toContain('resolved_at IS NULL');
  });

  it('exprime ces garanties dans un WITH CHECK, pas dans un USING', () => {
    // Un USING sur INSERT ne serait jamais évalué : la contrainte doit être
    // dans le WITH CHECK, sinon elle ne protège rien.
    expect(p().cmd).toBe('INSERT');
    expect(p().body).toMatch(/WITH CHECK/);
  });
});

describe('feedback — lecture', () => {
  it("limite l'auteur à ses propres signalements", () => {
    const p = POLICIES.get('own select feedback');
    expect(p.cmd).toBe('SELECT');
    expect(flat(p.body)).toContain('USING (reported_by = auth.uid())');
  });

  it("n'ouvre la lecture complète qu'à l'admin", () => {
    const p = POLICIES.get('admin select feedback');
    expect(p.cmd).toBe('SELECT');
    expect(flat(p.body)).toContain("USING (get_my_role() = 'admin')");
  });

  it('ne donne la lecture complète ni au vétérinaire associé ni au salarié', () => {
    const readable = [...POLICIES.values()].filter((x) => x.cmd === 'SELECT');
    for (const p of readable) {
      expect(p.body).not.toMatch(/'vet'/);
      expect(p.body).not.toMatch(/'vet_employe'/);
    }
  });
});

describe('feedback — modification', () => {
  it("réserve l'UPDATE à l'admin, à l'entrée comme à la sortie", () => {
    const p = POLICIES.get('admin update feedback');
    const body = flat(p.body);
    expect(p.cmd).toBe('UPDATE');
    // Sans WITH CHECK, un admin pourrait réattribuer une ligne à un autre
    // utilisateur et la faire disparaître de sa propre vue.
    expect(body).toContain("USING (get_my_role() = 'admin')");
    expect(body).toContain("WITH CHECK (get_my_role() = 'admin')");
  });

  it("réserve le DELETE à l'admin", () => {
    const p = POLICIES.get('admin delete feedback');
    expect(p.cmd).toBe('DELETE');
    expect(flat(p.body)).toContain("USING (get_my_role() = 'admin')");
  });

  it("ne laisse aucun UPDATE à l'auteur", () => {
    // Un utilisateur qui pourrait modifier sa ligne pourrait la classer
    // « corrigé » et la sortir du digest quotidien.
    const writable = [...POLICIES.entries()].filter(([, p]) => p.cmd === 'UPDATE');
    for (const [name, p] of writable) {
      expect(flat(p.body), `politique « ${name} »`).not.toContain('reported_by = auth.uid()');
    }
  });
});

describe('feedback — récursion RLS', () => {
  it('passe par get_my_role() et ne lit jamais user_profiles directement', () => {
    // Référencer user_profiles dans une politique a déjà provoqué une récursion
    // infinie qui bloquait toutes les connexions (20240515000001_fix_rls_recursion).
    for (const [name, p] of POLICIES) {
      expect(p.body, `politique « ${name} »`).not.toContain('user_profiles');
    }
  });
});
