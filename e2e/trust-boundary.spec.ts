import { test, expect } from "@playwright/test";

/**
 * The frontend trust boundary, asserted in the browser: no request may leave
 * the app origin on any view — no database, no Pluggy, no external font or
 * analytics. This is the runtime half of the rule dependency-cruiser enforces
 * for imports (`client-imports-no-infrastructure`).
 */
const APP_ORIGIN = "http://127.0.0.1:3000";

test("no request leaves the app origin on any view", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== APP_ORIGIN) {
      foreign.push(request.url());
    }
  });

  await page.goto("/");

  const nav = page.locator(".nav-item");
  const titles = ["Visão geral", "Transações", "Análises", "Orçamentos", "Cartões"];
  const count = await nav.count();
  expect(count).toBe(titles.length);

  for (let index = 0; index < count; index += 1) {
    await nav.nth(index).click();
    await expect(page.locator("h1")).toHaveText(titles[index] ?? "");
  }

  expect(foreign).toEqual([]);
});
