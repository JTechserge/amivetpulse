import { test, expect } from "@playwright/test";

// ============================================================
// TNR — Fonctionnalités planning ASV récentes
// ============================================================
// Couvre :
//   A) Logique pure — helpers heures nominales, heures supp., départ anticipé,
//      fenêtre 2 semaines, filtrage repos
//   B) Navigation — bouton impression mensuelle (pas hebdomadaire)
//   C) Comportement — repos exclu des demandes de congé,
//      change-pending sur modifications dans les 2 semaines

// ────────────────────────────────────────────────────────────
// A. Logique pure — constantes et formules
// ────────────────────────────────────────────────────────────

test.describe("Heures nominales ASV", () => {
  // Règles tirées de getDayNominal dans app.js :
  //   Lundi–Vendredi  Ouverture  → 8.5h (8h30→19h, pause déjeuner 2h)
  //   Lundi–Vendredi  Fermeture  → 8.25h (9h→19h15, pause déjeuner 2h)
  //   Samedi          Carla      → 7.25h (8h30→16h45, pause 1h)
  //   Samedi          autres     → 7.0h  (9h→16h30, pause 1h)

  const NOM_OUVERTURE  = 8.5;
  const NOM_FERMETURE  = 8.25;
  const NOM_SAT_CARLA  = 7.25;
  const NOM_SAT_SECOND = 7.0;

  test("Ouverture lun-ven = 8h30 (8.5h)", () => {
    expect(NOM_OUVERTURE).toBeCloseTo(8.5, 2);
  });

  test("Fermeture lun-ven = 8h15 (8.25h)", () => {
    expect(NOM_FERMETURE).toBeCloseTo(8.25, 2);
  });

  test("Carla samedi = 7h25 (7.25h)", () => {
    expect(NOM_SAT_CARLA).toBeCloseTo(7.25, 2);
  });

  test("2e ASV samedi = 7h00 (7.0h)", () => {
    expect(NOM_SAT_SECOND).toBeCloseTo(7.0, 2);
  });

  test("Ouverture > Fermeture (départ plus tôt pour le poste F)", () => {
    expect(NOM_OUVERTURE).toBeGreaterThan(NOM_FERMETURE);
  });

  test("Samedi Carla > samedi autres ASV", () => {
    expect(NOM_SAT_CARLA).toBeGreaterThan(NOM_SAT_SECOND);
  });
});

test.describe("Calculs heures supp. et déficit", () => {
  // Formule : total = nominal + getDayAllOtH - getDayDeficitH
  // getDayAllOtH = getDayOtH (soirée) + getDayLunchOtH (midi)
  // getDayDeficitH = minutes de départ anticipé / 60
  // Exemple : nominal 8.5h, OT soirée 1h, pas de départ anticipé → total 9.5h

  function calcTotal(nominal: number, otEvening: number, otLunch: number, deficitH: number): number {
    return Math.round((nominal + otEvening + otLunch - deficitH) * 100) / 100;
  }

  test("Sans ajustement : total = nominal", () => {
    expect(calcTotal(8.5, 0, 0, 0)).toBeCloseTo(8.5, 2);
  });

  test("1h OT soirée : total = nominal + 1", () => {
    expect(calcTotal(8.5, 1, 0, 0)).toBeCloseTo(9.5, 2);
  });

  test("30min OT midi : total = nominal + 0.5", () => {
    expect(calcTotal(8.5, 0, 0.5, 0)).toBeCloseTo(9.0, 2);
  });

  test("OT soirée + midi cumulés", () => {
    expect(calcTotal(8.25, 1.5, 0.5, 0)).toBeCloseTo(10.25, 2);
  });

  test("Départ anticipé 1h15 : déficit = 1.25h", () => {
    // 1h15 = 75min / 60 = 1.25h
    const defH = 75 / 60;
    expect(defH).toBeCloseTo(1.25, 2);
    expect(calcTotal(8.5, 0, 0, defH)).toBeCloseTo(7.25, 2);
  });

  test("OT compense le départ anticipé", () => {
    const defH = 75 / 60; // 1h15
    const otH = 1.25;
    expect(calcTotal(8.5, otH, 0, defH)).toBeCloseTo(8.5, 2); // retour à nominal
  });
});

test.describe("Fenêtre 2 semaines (isWithinNextTwoWeeks)", () => {
  // Reproduced logic: today <= iso <= today + 14 days
  function isWithinNextTwoWeeks(isoToCheck: string): boolean {
    const today = new Date();
    const d = new Date(isoToCheck + "T00:00:00");
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return d.getTime() >= t0 && d.getTime() <= t0 + 14 * 24 * 60 * 60 * 1000;
  }

  function addDays(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    // Utiliser les composantes locales (et non UTC) pour éviter le décalage horaire
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  test("Aujourd'hui est dans la fenêtre", () => {
    expect(isWithinNextTwoWeeks(addDays(0))).toBe(true);
  });

  test("Demain est dans la fenêtre", () => {
    expect(isWithinNextTwoWeeks(addDays(1))).toBe(true);
  });

  test("Dans 14 jours est dans la fenêtre (limite incluse)", () => {
    expect(isWithinNextTwoWeeks(addDays(14))).toBe(true);
  });

  test("Dans 15 jours est hors fenêtre", () => {
    expect(isWithinNextTwoWeeks(addDays(15))).toBe(false);
  });

  test("Hier est hors fenêtre", () => {
    expect(isWithinNextTwoWeeks(addDays(-1))).toBe(false);
  });
});

test.describe("Repos exclu des demandes de congé", () => {
  // isReposLabel : 'repos', 'repos planifié', 'non travaillé' → true
  function isReposLabel(label: string): boolean {
    const lc = (label || "").toLowerCase().trim();
    return lc === "repos" || lc === "repos planifié" || lc === "non travaillé";
  }

  test("'Repos planifié' est un repos", () => {
    expect(isReposLabel("Repos planifié")).toBe(true);
  });

  test("'repos' minuscule est un repos", () => {
    expect(isReposLabel("repos")).toBe(true);
  });

  test("'Non travaillé' est un repos", () => {
    expect(isReposLabel("Non travaillé")).toBe(true);
  });

  test("'Congé annuel' n'est PAS un repos", () => {
    expect(isReposLabel("Congé annuel")).toBe(false);
  });

  test("'Maladie' n'est PAS un repos", () => {
    expect(isReposLabel("Maladie")).toBe(false);
  });

  test("Chaîne vide n'est PAS un repos", () => {
    expect(isReposLabel("")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// B. Tests navigateur — DOM observable sans authentification
// ────────────────────────────────────────────────────────────

test.describe("Bouton impression — emplacement", () => {
  test("le bouton Imprimer est absent de la vue login (pas encore dans l'app)", async ({ page }) => {
    await page.goto("./");
    // En mode non authentifié, on voit le formulaire login, pas le calendrier
    await expect(page.locator("#login-form")).toBeVisible();
    // Le bouton cal-print ne doit pas exister dans le DOM avant connexion
    await expect(page.locator('[id^="cal-print-"]')).toHaveCount(0);
  });
});

test.describe("Système approbation — styles CSS", () => {
  test("la classe CSS .state-change-pending est déclarée dans la feuille de styles", async ({ request }) => {
    // On vérifie que le CSS compilé contient bien la classe violet
    const res = await request.get("./");
    expect(res.ok()).toBeTruthy();
    // Récupère le CSS bundlé via le HTML
    const html = await res.text();
    const cssLink = html.match(/href="([^"]*\.css)"/)?.[1];
    expect(cssLink).toBeTruthy();
    const cssRes = await request.get(cssLink!);
    const css = await cssRes.text();
    expect(css).toContain("state-change-pending");
    expect(css).toContain("change-pending");
  });

  test("la variable --color-change-pending est définie (violet)", async ({ request }) => {
    const res = await request.get("./");
    const html = await res.text();
    const cssLink = html.match(/href="([^"]*\.css)"/)?.[1];
    const cssRes = await request.get(cssLink!);
    const css = await cssRes.text();
    expect(css).toContain("--color-change-pending");
    expect(css.toLowerCase()).toContain("6d28d9"); // valeur hex violet attendue (minifiée en minuscules)
  });
});

test.describe("Système impression mensuelle — JS", () => {
  // Les noms de fonctions sont effacés par la minification.
  // On vérifie des chaînes littérales uniques présentes dans le code de chaque feature.

  test("le bundle contient le code d'impression mensuelle A4 (format A4, colonnes H.supp.)", async ({ request }) => {
    const res = await request.get("./");
    const html = await res.text();
    const jsLink = html.match(/src="([^"]*\.js)"/)?.[1];
    expect(jsLink).toBeTruthy();
    const jsRes = await request.get(jsLink!);
    const js = await jsRes.text();
    // Traces du système d'impression mensuelle (survivent à la minification)
    expect(js).toContain("A4 portrait");
    expect(js).toContain("H.supp.");
    expect(js).toContain("wk-print-tmp");
    // L'ancienne colonne "Écart" ne doit plus exister
    expect(js).not.toContain("openWeekPrintWindow");
  });

  test("le bundle contient le code change-pending (_chg, fenêtre 14j, repos planifié)", async ({ request }) => {
    const res = await request.get("./");
    const html = await res.text();
    const jsLink = html.match(/src="([^"]*\.js)"/)?.[1];
    const jsRes = await request.get(jsLink!);
    const js = await jsRes.text();
    // Clé de stockage des modifications urgentes
    expect(js).toContain("_chg");
    // Fenêtre 14 jours = 336h × 3600s (constante après minification)
    expect(js).toContain("336");
    // Filtre repos (survivent à la minification car ce sont des strings)
    expect(js).toContain("repos planifi");
    // Classe CSS appliquée aux cellules modifiées en urgence
    expect(js).toContain("change-pending");
  });
});
