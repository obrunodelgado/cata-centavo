import { defineConfig, devices } from "@playwright/test";

/**
 * E2E for the web app. The `webServer` command seeds a fully synthetic fixture
 * environment (temp XDG dirs + Pluggy mock) and then spawns the dev server
 * with it — see `e2e/seed.ts`. Chromium desktop only by decision; the
 * responsive breakpoints stay manual verification.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // A dev server compiles routes on first hit; give first-load fetches room.
  expect: { timeout: 15_000 },
  // One worker: Turbopack's dev server serializes per-route compilation, and
  // parallel cold loads made the first tests time out. CI runs the production
  // server (E2E_PROD=1) where compilation does not exist at all.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/seed.ts",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
});
