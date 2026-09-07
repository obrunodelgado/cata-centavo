import { test, expect } from "@playwright/test";

/**
 * The shell: navigation across the five views, localStorage persistence of the
 * active tab, the Open Banking card and modal fed by `/api/sources`, and the
 * sync button walking the fixture's Pluggy mock.
 */

test("renders the Fluxo shell with all five views", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".side-brand")).toContainText("Fluxo");
  await expect(page.locator(".nav-item")).toHaveCount(5);
  await expect(page.locator("h1")).toHaveText("Visão geral");
  await expect(page.locator(".topbar")).toContainText("Sincronizar");
});

test("navigates between views and persists the active tab across reloads", async ({ page }) => {
  await page.goto("/");

  await page.locator(".nav-item", { hasText: "Transações" }).click();
  await expect(page.locator("h1")).toHaveText("Transações");

  await page.reload();
  await expect(page.locator("h1")).toHaveText("Transações");
});

test("open banking card lists the fixture connection and the modal shows its consent", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".ob-card")).toContainText("1 bancos conectados");
  await expect(page.locator(".ob-card")).toContainText("E2E Bank");

  await page.locator(".ob-card button", { hasText: "Gerenciar bancos" }).click();
  await expect(page.locator(".modal-backdrop.open")).toBeVisible();
  await expect(page.locator(".modal-backdrop.open")).toContainText("E2E Bank");
  await expect(page.locator(".modal-backdrop.open .pill")).toHaveText("ativo");

  await page.keyboard.press("Escape");
  await expect(page.locator(".modal-backdrop.open")).toHaveCount(0);
});

test("sync walks the fixture mock and reports completion", async ({ page }) => {
  await page.goto("/");

  await page.locator(".topbar button", { hasText: "Sincronizar" }).click();
  // The walk against the fixture mock is near-instant, so the transient
  // "Sincronizando…" label is not asserted — only the stable end states.
  await expect(page.locator(".topbar")).toContainText("Sincronizado agora");
  await expect(page.locator(".toast.show")).toContainText("Sincronização concluída");
  await expect(page.locator(".toast.show")).toContainText("1 conta");
});
