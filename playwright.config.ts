import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/unit/**"],
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173/amivetpulse/",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Le site est buildé avec Vite (base "/amivetpulse/", cf. vite.config.js) et
    // deploye sur GitHub Pages : on teste le build de production via `vite preview`,
    // pas le serveur de dev, pour coller a ce qui est reellement mis en ligne.
    // Le build lui-meme est lance en amont par run-tnr.command (pas ici) pour que
    // les erreurs de build apparaissent clairement dans les logs.
    command: "npx vite preview --port 4173 --host 127.0.0.1 --strictPort",
    url: "http://127.0.0.1:4173/amivetpulse/",
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
