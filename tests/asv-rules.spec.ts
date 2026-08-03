import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

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
  await page.goto('./');
  await page.waitForTimeout(600);
  return page.evaluate<AsvPerson[]>(() => JSON.parse(localStorage.getItem('amivet_asv_roster') || '[]'));
}

// ────────────────────────────────────────────────────────────
// A. Tests navigateur
// ────────────────────────────────────────────────────────────

test.describe('Effectif ASV — localStorage après init', () => {
  // loadASVRoster() s'exécute dans init() → DOMContentLoaded
  // et sauvegarde le roster (+ Carla si absente) dans localStorage.

  test('le roster contient exactement 4 ASV (Marie, Johanna, Julie, Carla)', async ({ page }) => {
    const roster = await getRoster(page);
    expect(roster).toHaveLength(4);
    const ids = roster.map((p: AsvPerson) => p.id);
    expect(ids).toContain('marie');
    expect(ids).toContain('johanna');
    expect(ids).toContain('julie');
    expect(ids).toContain('carla');
  });

  test('Carla est marquée saturdayOnly:true', async ({ page }) => {
    const roster = await getRoster(page);
    const carla = roster.find((p: AsvPerson) => p.id === 'carla');
    expect(carla).toBeTruthy();
    expect(carla?.saturdayOnly).toBe(true);
  });

  test('Marie et Johanna sont à temps plein (timeFraction 1.0)', async ({ page }) => {
    const roster = await getRoster(page);
    const marie = roster.find((p: AsvPerson) => p.id === 'marie');
    const johanna = roster.find((p: AsvPerson) => p.id === 'johanna');
    expect(marie?.timeFraction).toBeCloseTo(1.0, 2);
    expect(johanna?.timeFraction).toBeCloseTo(1.0, 2);
  });

  test('Julie est à 3/4 temps (timeFraction 0.75)', async ({ page }) => {
    const roster = await getRoster(page);
    const julie = roster.find((p: AsvPerson) => p.id === 'julie');
    expect(julie?.timeFraction).toBeCloseTo(0.75, 2);
  });

  test('Carla a une timeFraction cohérente avec 7h25/semaine (≈ 0.207)', async ({ page }) => {
    const roster = await getRoster(page);
    const carla = roster.find((p: AsvPerson) => p.id === 'carla');
    // (7 + 25/60) / 35 ≈ 0.2119  — 7h25, pas 7,25 h
    expect(carla?.timeFraction).toBeGreaterThan(0.2);
    expect(carla?.timeFraction).toBeLessThan(0.22);
  });

  test("aucune ASV du roster n'est archivée par défaut", async ({ page }) => {
    const roster = await getRoster(page);
    const archived = roster.filter((p: AsvPerson) => p.archived === true);
    expect(archived).toHaveLength(0);
  });

  test('chaque ASV a un id, un nom et une couleur valides', async ({ page }) => {
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

test.describe('Icônes PWA — assets servis', () => {
  const icons = [
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-192.png',
    'icons/icon-maskable-512.png',
    'icons/apple-touch-icon.png',
    'logo.png',
  ];

  for (const icon of icons) {
    test(`${icon} est accessible (HTTP 200)`, async ({ request }) => {
      const res = await request.get(icon);
      expect(res.ok()).toBeTruthy();
      const ct = res.headers()['content-type'] || '';
      expect(ct).toContain('image/png');
    });
  }

  test('le manifest.json référence icon-192 et icon-512', async ({ request }) => {
    const res = await request.get('manifest.json');
    expect(res.ok()).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifest = (await res.json()) as any;
    const icons: Array<{ sizes: string; purpose?: string }> = manifest.icons || [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes.some((s) => s && s.includes('192'))).toBeTruthy();
    expect(sizes.some((s) => s && s.includes('512'))).toBeTruthy();
  });

  test('le manifest.json déclare au moins une icône maskable', async ({ request }) => {
    const res = await request.get('manifest.json');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const manifest = (await res.json()) as any;
    const icons: Array<{ sizes: string; purpose?: string }> = manifest.icons || [];
    const maskable = icons.filter((i) => i.purpose && i.purpose.includes('maskable'));
    expect(maskable.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────
// A3. Interface — éléments observables sans authentification
// ────────────────────────────────────────────────────────────

test.describe('Interface auth sans session', () => {
  test("le bouton Mot de passe oublié est visible sur l'écran de login", async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#forgot-btn')).toBeVisible();
  });

  test("l'écran de réinitialisation s'affiche au clic sur Mot de passe oublié", async ({ page }) => {
    await page.goto('./');
    await page.click('#forgot-btn');
    await expect(page.locator('#forgot-form')).toBeVisible();
    await expect(page.locator('#forgot-email')).toBeVisible();
  });

  test('le formulaire oublié repasse en login au clic Retour', async ({ page }) => {
    await page.goto('./');
    await page.click('#forgot-btn');
    await page.click('#back-login');
    await expect(page.locator('#login-form')).toBeVisible();
  });
});

// La logique pure (constantes légales, calculs quota, horaires journaliers)
// est couverte par tests/unit/planning-logic.test.js.
