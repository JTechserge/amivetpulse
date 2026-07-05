import { test, expect } from "@playwright/test";

// TNR "coquille statique" pour Amivet Pulse : verifie que la page se charge sans
// erreur JS et que la structure critique (login, navigation, service worker,
// manifest PWA) est bien presente. Ne teste pas les parcours authentifies
// (pas de compte de test Supabase disponible) - voir README.md du dossier .tnr.

test.describe("Amivet Pulse - coquille statique", () => {
  test("la page se charge sans erreur console ni erreur reseau bloquante", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const response = await page.goto("/amivet-pulse.html");
    expect(response?.ok()).toBeTruthy();

    // Laisse le temps a init()/DOMContentLoaded de s'executer.
    await page.waitForTimeout(500);

    expect(pageErrors, `Erreurs JS non interceptees: ${pageErrors.join(" | ")}`).toEqual([]);
    // On tolere les erreurs reseau vers des services externes (police Google, etc.)
    // mais pas les erreurs de script propres a l'app.
    const appErrors = consoleErrors.filter((e) => !/fonts\.googleapis|fonts\.gstatic|net::ERR/.test(e));
    expect(appErrors, `Erreurs console de l'app: ${appErrors.join(" | ")}`).toEqual([]);
  });

  test("le titre et les meta PWA essentiels sont presents", async ({ page }) => {
    await page.goto("/amivet-pulse.html");
    await expect(page).toHaveTitle(/Amivet PULSE/);
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toBeTruthy();
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute("content");
    expect(themeColor).toBeTruthy();
  });

  test("l'ecran de connexion s'affiche par defaut (pas de session)", async ({ page }) => {
    await page.goto("/amivet-pulse.html");
    await expect(page.locator("#login-overlay")).not.toHaveClass(/hidden/);
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.locator('#login-form button[type="submit"]')).toBeVisible();
  });

  test("la navigation principale est presente dans le DOM", async ({ page }) => {
    await page.goto("/amivet-pulse.html");
    const nav = page.locator("#main-nav");
    await expect(nav).toBeAttached();
    await expect(page.locator('.nav-tab[data-view="dashboard"]')).toBeAttached();
    await expect(page.locator('.nav-tab[data-view="annonces"]')).toBeAttached();
  });

  test("le manifest.json est accessible et valide", async ({ page, request }) => {
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name || manifest.short_name).toBeTruthy();
  });

  test("le service worker (sw.js) est accessible", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBeTruthy();
  });

  test("le formulaire de connexion rejette un identifiant invalide sans planter la page", async ({ page }) => {
    await page.goto("/amivet-pulse.html");
    await page.fill("#login-email", "test-tnr-inexistant@example.com");
    await page.fill("#login-password", "mot-de-passe-invalide-tnr");
    await page.click('#login-form button[type="submit"]');
    // On attend soit un message d'erreur affiche, soit que le formulaire soit toujours la
    // (dans tous les cas la page ne doit pas planter / rester blanche).
    await page.waitForTimeout(2000);
    await expect(page.locator("#login-overlay")).toBeVisible();
  });
});
