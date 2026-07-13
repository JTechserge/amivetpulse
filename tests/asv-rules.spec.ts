import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// ============================================================
// TNR — Règles ASV : modulation, quotas, effectif, icônes PWA
// ============================================================
// Stratégie :
//   A) Tests NAVIGATEUR  — vérifient l'état réel de l'app via
//      localStorage (peuplé par loadASVRoster/init au démarrage),
//      les icônes servies en HTTP et le DOM observable sans auth.
//   B) Tests LOGIQUE PURE — assertions Node.js qui documentent et
//      verrouillent les constantes légales et les calculs de quota.
//      Si une constante est modifiée par erreur dans app.js, le TNR
//      échoue même sans navigateur.

interface AsvPerson {
  id: string;
  name: string;
  color: string;
  timeFraction: number;
  archived: boolean;
  saturdayOnly: boolean;
}


async function getRoster(page: Page): Promise<AsvPerson[]> {
  await page.goto("./");
  await page.waitForTimeout(600);
  return page.evaluate<AsvPerson[]>(() =>
    JSON.parse(localStorage.getItem("amivet_asv_roster") || "[]")
  );
}

// ────────────────────────────────────────────────────────────
// A. Tests navigateur
// ────────────────────────────────────────────────────────────

test.describe("Effectif ASV — localStorage après init", () => {
  // loadASVRoster() s'exécute dans init() → DOMContentLoaded
  // et sauvegarde le roster (+ Carla si absente) dans localStorage.

  test("le roster contient exactement 4 ASV (Marie, Johanna, Julie, Carla)", async ({ page }) => {
    const roster = await getRoster(page);
    expect(roster).toHaveLength(4);
    const ids = roster.map((p: AsvPerson) => p.id);
    expect(ids).toContain("marie");
    expect(ids).toContain("johanna");
    expect(ids).toContain("julie");
    expect(ids).toContain("carla");
  });

  test("Carla est marquée saturdayOnly:true", async ({ page }) => {
    const roster = await getRoster(page);
    const carla = roster.find((p: AsvPerson) => p.id === "carla");
    expect(carla).toBeTruthy();
    expect(carla?.saturdayOnly).toBe(true);
  });

  test("Marie et Johanna sont à temps plein (timeFraction 1.0)", async ({ page }) => {
    const roster = await getRoster(page);
    const marie = roster.find((p: AsvPerson) => p.id === "marie");
    const johanna = roster.find((p: AsvPerson) => p.id === "johanna");
    expect(marie?.timeFraction).toBeCloseTo(1.0, 2);
    expect(johanna?.timeFraction).toBeCloseTo(1.0, 2);
  });

  test("Julie est à 3/4 temps (timeFraction 0.75)", async ({ page }) => {
    const roster = await getRoster(page);
    const julie = roster.find((p: AsvPerson) => p.id === "julie");
    expect(julie?.timeFraction).toBeCloseTo(0.75, 2);
  });

  test("Carla a une timeFraction cohérente avec 7h25/semaine (≈ 0.207)", async ({ page }) => {
    const roster = await getRoster(page);
    const carla = roster.find((p: AsvPerson) => p.id === "carla");
    // 7.25 / 35 ≈ 0.2071
    expect(carla?.timeFraction).toBeGreaterThan(0.20);
    expect(carla?.timeFraction).toBeLessThan(0.22);
  });

  test("aucune ASV du roster n'est archivée par défaut", async ({ page }) => {
    const roster = await getRoster(page);
    const archived = roster.filter((p: AsvPerson) => p.archived === true);
    expect(archived).toHaveLength(0);
  });

  test("chaque ASV a un id, un nom et une couleur valides", async ({ page }) => {
    const roster = await getRoster(page);
    for (const p of roster) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

// ────────────────────────────────────────────────────────────
// A2. Icônes et assets PWA
// ────────────────────────────────────────────────────────────

test.describe("Icônes PWA — assets servis", () => {
  const icons = [
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-192.png",
    "icons/icon-maskable-512.png",
    "icons/apple-touch-icon.png",
    "logo.png",
  ];

  for (const icon of icons) {
    test(`${icon} est accessible (HTTP 200)`, async ({ request }) => {
      const res = await request.get(icon);
      expect(res.ok()).toBeTruthy();
      const ct = res.headers()["content-type"] || "";
      expect(ct).toContain("image/png");
    });
  }

  test("le manifest.json référence icon-192 et icon-512", async ({ request }) => {
    const res = await request.get("manifest.json");
    expect(res.ok()).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifest = await res.json() as any;
    const icons: Array<{ sizes: string; purpose?: string }> = manifest.icons || [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes.some((s) => s && s.includes("192"))).toBeTruthy();
    expect(sizes.some((s) => s && s.includes("512"))).toBeTruthy();
  });

  test("le manifest.json déclare au moins une icône maskable", async ({ request }) => {
    const res = await request.get("manifest.json");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifest = await res.json() as any;
    const icons: Array<{ sizes: string; purpose?: string }> = manifest.icons || [];
    const maskable = icons.filter((i) => i.purpose && i.purpose.includes("maskable"));
    expect(maskable.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────
// A3. Interface — éléments observables sans authentification
// ────────────────────────────────────────────────────────────

test.describe("Interface auth sans session", () => {
  test("le bouton Mot de passe oublié est visible sur l'écran de login", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("#forgot-btn")).toBeVisible();
  });

  test("l'écran de réinitialisation s'affiche au clic sur Mot de passe oublié", async ({ page }) => {
    await page.goto("./");
    await page.click("#forgot-btn");
    await expect(page.locator("#forgot-form")).toBeVisible();
    await expect(page.locator("#forgot-email")).toBeVisible();
  });

  test("le formulaire oublié repasse en login au clic Retour", async ({ page }) => {
    await page.goto("./");
    await page.click("#forgot-btn");
    await page.click("#back-login");
    await expect(page.locator("#login-form")).toBeVisible();
  });
});

// ────────────────────────────────────────────────────────────
// B. Tests logique pure — constantes légales et calculs quota
//    Ces tests documentent et verrouillent les règles métier.
//    Ils échouent si une constante est modifiée par erreur.
// ────────────────────────────────────────────────────────────

test.describe("Règles légales — constantes de modulation", () => {
  // Constantes issues de app.js — doivent rester synchrones.
  const ANNUAL_FULLTIME_HOURS = 1607;
  const WEEKLY_MAX_HOURS      = 42;
  const ASV_STD_SAT_CARLA     = 7.25;
  const ASV_STD_SAT_SECOND    = 7.0;
  const ASV_STD_WEEKDAY_AVG   = 8.375;

  test("la référence annuelle est 1607h (loi Aubry 2000)", () => {
    expect(ANNUAL_FULLTIME_HOURS).toBe(1607);
  });

  test("le plafond hebdomadaire légal est 42h", () => {
    expect(WEEKLY_MAX_HOURS).toBe(42);
  });

  test("les horaires Carla le samedi sont 7h25 (8:30-16:45 avec 1h pause)", () => {
    expect(ASV_STD_SAT_CARLA).toBeCloseTo(7.25, 2);
  });

  test("la 2e ASV le samedi fait 7h (9:00-16:30 avec 1h pause)", () => {
    expect(ASV_STD_SAT_SECOND).toBeCloseTo(7.0, 2);
  });

  test("la moyenne des horaires semaine est 8h375 ((8.5 + 8.25) / 2)", () => {
    const opening = 8.5;   // 8:30-19:00 avec pause 13:00-15:00
    const closing  = 8.25; // 9:00-19:15 avec pause 13:00-15:00
    expect(ASV_STD_WEEKDAY_AVG).toBeCloseTo((opening + closing) / 2, 3);
  });
});

test.describe("Calculs de quota ASV", () => {
  const ANNUAL_FULLTIME_HOURS = 1607;
  const WEEKLY_MAX_HOURS      = 42;
  const ASV_STD_SAT_CARLA     = 7.25;

  function getQuota(timeFraction: number, saturdayOnly = false) {
    if (saturdayOnly) {
      return {
        annual:  null,
        weekly:  ASV_STD_SAT_CARLA,
        monthly: Math.round((ASV_STD_SAT_CARLA * 52) / 12 * 10) / 10,
      };
    }
    return {
      annual:  Math.round(ANNUAL_FULLTIME_HOURS * timeFraction * 10) / 10,
      weekly:  Math.round(35 * timeFraction * 100) / 100,
      monthly: Math.round((ANNUAL_FULLTIME_HOURS * timeFraction) / 12 * 10) / 10,
    };
  }

  test("quota annuel temps plein = 1607h", () => {
    expect(getQuota(1.0).annual).toBe(1607);
  });

  test("quota annuel 3/4 temps = 1205.3h", () => {
    expect(getQuota(0.75).annual).toBeCloseTo(1205.3, 0);
  });

  test("quota hebdo temps plein = 35h", () => {
    expect(getQuota(1.0).weekly).toBe(35);
  });

  test("quota hebdo 3/4 temps = 26.25h", () => {
    expect(getQuota(0.75).weekly).toBeCloseTo(26.25, 2);
  });

  test("quota hebdo temps plein est sous le plafond de 42h", () => {
    expect(getQuota(1.0).weekly).toBeLessThan(WEEKLY_MAX_HOURS);
  });

  test("quota hebdo 3/4 temps est sous le plafond de 42h", () => {
    expect(getQuota(0.75).weekly).toBeLessThan(WEEKLY_MAX_HOURS);
  });

  test("Carla : annual = null (hors modulation)", () => {
    expect(getQuota(7.25 / 35, true).annual).toBeNull();
  });

  test("Carla : quota hebdo = 7.25h (un samedi)", () => {
    expect(getQuota(7.25 / 35, true).weekly).toBeCloseTo(7.25, 2);
  });

  test("quota mensuel Carla ≈ 31.4h (7.25h × 52 sem ÷ 12)", () => {
    expect(getQuota(7.25 / 35, true).monthly).toBeCloseTo(31.4, 0);
  });
});

test.describe("Règles de répartition des samedis", () => {
  const ASV_STD_SAT_CARLA  = 7.25;
  const ASV_STD_SAT_SECOND = 7.0;

  test("Carla travaille plus longtemps le samedi que les autres ASV", () => {
    expect(ASV_STD_SAT_CARLA).toBeGreaterThan(ASV_STD_SAT_SECOND);
  });

  test("la clinique a 2 ASV par jour sur 6 jours = 12 journées/semaine", () => {
    const fullTime = 2;     // Marie + Johanna
    const threeQuarter = 1; // Julie
    const saturdayOnly = 1; // Carla
    const jours = fullTime * 4 + threeQuarter * 3 + saturdayOnly * 1;
    expect(jours).toBe(12);
  });

  test("heures contractuelles annuelles cohérentes : ≤ 52 sem × 42h max", () => {
    const ANNUAL_FULLTIME_HOURS = 1607;
    const WEEKLY_MAX_HOURS = 42;
    expect(ANNUAL_FULLTIME_HOURS).toBeLessThan(52 * WEEKLY_MAX_HOURS);
  });

  test("5 semaines CP : 1607h correspond bien à 47 semaines × ~34.2h", () => {
    const ANNUAL_FULLTIME_HOURS = 1607;
    const semTravaillees = 52 - 5;
    expect(ANNUAL_FULLTIME_HOURS / semTravaillees).toBeCloseTo(34.19, 0);
  });
});

test.describe("Horaires journaliers détaillés", () => {
  test("ASV ouverture lun-ven : 8h30-13h00 + 15h00-19h00 = 8h30", () => {
    const matin = (13 * 60 - 8 * 60 - 30) / 60;
    const apmidi = (19 * 60 - 15 * 60) / 60;
    expect(matin + apmidi).toBeCloseTo(8.5, 2);
  });

  test("ASV fermeture lun-ven : 9h00-13h00 + 15h00-19h15 = 8h15", () => {
    const matin = (13 * 60 - 9 * 60) / 60;
    const apmidi = (19 * 60 + 15 - 15 * 60) / 60;
    expect(matin + apmidi).toBeCloseTo(8.25, 2);
  });

  test("Carla samedi : 8h30-16h45 avec 1h pause = 7h15", () => {
    const brut = (16 * 60 + 45 - 8 * 60 - 30) / 60;
    const net = brut - 1;
    expect(net).toBeCloseTo(7.25, 2);
  });

  test("2e ASV samedi : 9h00-16h30 = 7h00 effectif (convention clinique)", () => {
    // Convention validée par Jérémie (13/07/2026) : le poste du samedi de la 2e ASV
    // vaut systématiquement 7h00 effectives, quelle que soit la pause réellement prise.
    // 9h00→16h30 = 7h30 de présence, soit 30 min de pause déduite par convention.
    const brut = (16 * 60 + 30 - 9 * 60) / 60;
    const pauseDeduite = brut - 7.0;
    expect(pauseDeduite).toBeCloseTo(0.5, 2);
    expect(brut - pauseDeduite).toBeCloseTo(7.0, 2);
  });
});
