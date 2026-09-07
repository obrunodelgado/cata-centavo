import { expect, test } from "@playwright/test";

/**
 * The Transações view: search, tipo and category filters narrowing the rows,
 * the breakdown sidebar's toggle semantics, "Mostrar mais" appending without
 * duplicates, and the detail modal's category correction surviving a reload.
 * The seed (e2e/seed.ts) fixes every count relative to run-time today: the
 * default 6M window holds 5 recurring months (30 rows) plus the 3 today-dated
 * rows — 33 in total, all on the first page.
 */

async function openTransactions(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.locator(".nav-item", { hasText: "Transações" }).click();
  await expect(page.locator('[data-od-id="tx-count"]')).toContainText("33 transações");
}

test("renders the seeded list with the honest count and the breakdown sidebar", async ({ page }) => {
  await openTransactions(page);

  await expect(page.locator('[data-od-id="tx-count"]')).toHaveText("33 transações");
  await expect(page.locator('[data-od-id="tx-list"] .ds-table tbody tr')).toHaveCount(33);

  // The sidebar carries the window's expense categories with Sem categoria.
  await expect(page.locator(".cat-row", { hasText: "Supermercado" })).toBeVisible();
  await expect(page.locator(".cat-row", { hasText: "Moradia" })).toBeVisible();
});

test("search narrows the rows server-side and clearing restores them", async ({ page }) => {
  await openTransactions(page);

  await page.getByLabel("Buscar transações").fill("mercado");
  await expect(page.locator('[data-od-id="tx-count"]')).toHaveText("6 transações");
  await expect(page.locator('[data-od-id="tx-list"] .ds-table tbody tr')).toHaveCount(6);

  await page.getByLabel("Buscar transações").fill("zzz-nada");
  await expect(page.locator('[data-od-id="tx-list"]')).toContainText("Nenhuma transação encontrada com esses filtros.");

  await page.getByLabel("Buscar transações").fill("");
  await expect(page.locator('[data-od-id="tx-count"]')).toHaveText("33 transações");
});

test("the tipo segment narrows the list in both directions", async ({ page }) => {
  await openTransactions(page);

  await page.locator(".seg button", { hasText: "Receitas" }).click();
  await expect(page.locator('[data-od-id="tx-count"]')).toHaveText("11 transações");

  await page.locator(".seg button", { hasText: "Despesas" }).click();
  await expect(page.locator('[data-od-id="tx-count"]')).toHaveText("22 transações");

  // The internal transfer (TED E2E) is neither: it only exists under Todas.
  await page.locator(".seg button", { hasText: "Todas" }).click();
  await expect(page.locator('[data-od-id="tx-count"]')).toHaveText("33 transações");
});

test("clicking a breakdown category filters the list and clicking again clears it", async ({ page }) => {
  await openTransactions(page);

  await page.locator(".cat-row", { hasText: "Supermercado" }).click();
  await expect(page.locator('[data-od-id="tx-count"]')).toHaveText("6 transações");
  await expect(page.locator(".cat-row.on", { hasText: "Supermercado" })).toBeVisible();

  await page.locator(".cat-row", { hasText: "Supermercado" }).click();
  await expect(page.locator('[data-od-id="tx-count"]')).toHaveText("33 transações");
});

test("Mostrar mais appends the next page without duplicates", async ({ page }) => {
  await openTransactions(page);

  await page.locator(".seg button", { hasText: "12M" }).click();
  await expect(page.locator('[data-od-id="tx-count"]')).toHaveText("69 transações");
  await expect(page.locator('[data-od-id="tx-list"] .ds-table tbody tr')).toHaveCount(50);

  await page.locator("button", { hasText: "Mostrar mais" }).click();
  await expect(page.locator('[data-od-id="tx-list"] .ds-table tbody tr')).toHaveCount(69);
  await expect(page.locator("button", { hasText: "Mostrar mais" })).toHaveCount(0);

  // (date, description) is unique across the seed: a repeated pair is a
  // duplicated row, a missing one is a skipped row.
  const keys = await page
    .locator('[data-od-id="tx-list"] .ds-table tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) => `${(row.cells[0]?.textContent ?? "").trim()}|${(row.cells[1]?.textContent ?? "").trim()}`),
    );
  expect(new Set(keys).size).toBe(69);
});

test("the detail modal corrects a category and the change survives a reload", async ({ page }) => {
  await openTransactions(page);

  await page.locator('[data-od-id="tx-list"] .ds-table tbody tr').first().click();
  await expect(page.locator(".modal-backdrop.open")).toBeVisible();
  await expect(page.locator(".modal-backdrop.open")).toContainText("Categoria");

  await page.locator("#tx-category").selectOption({ label: "Saúde" });
  await page.locator(".modal-actions button", { hasText: "Salvar" }).click();
  await expect(page.locator(".modal-backdrop.open")).toHaveCount(0);

  await page.reload();
  await openTransactions(page);
  await expect(page.locator('[data-od-id="tx-list"]')).toContainText("Saúde");
});
