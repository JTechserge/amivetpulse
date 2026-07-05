import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx http-server -p 4173 -c-1 .",
    url: "http://127.0.0.1:4173/amivet-pulse.html",
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
