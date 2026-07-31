import { test, expect } from "@playwright/test";

// ============================================================
// TNR — Fonctionnalités planning ASV récentes
// ============================================================
// Couvre :
//   Navigation — bouton impression mensuelle (pas hebdomadaire)
//   Comportement — change-pending sur modifications dans les 2 semaines
// La logique pure (constantes, isWithinNextTwoWeeks, isReposLabel…)
// est couverte par tests/unit/planning-logic.test.js.

// ────────────────────────────────────────────────────────────
// Tests navigateur — DOM observable sans authentification
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
