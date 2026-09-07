import { expect, test } from "@playwright/test";

import { localDayOf } from "@cata-centavo/core";

/**
 * The overview: seeded KPI figures rendered verbatim, range/custom-period
 * interactions refetching `/api/overview`, the demo cards carrying their tag,
 * and sync refreshing the freshness label. The seed fixes every pinned figure
 * relative to run-time today (see `e2e/seed.ts`), so these assertions hold on
 * any run day.
 *
 * pt-BR currency inserts a non-breaking space between R$ and the figure, so
 * money assertions use a regex with `\s`.
 */

const nbsp = "\u00A0";

test("renders the seeded KPI figures verbatim", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('[data-od-id="kpi-saldo"]')).toContainText(/R\$\s*18\.432,10/);
  await expect(page.locator('[data-od-id="kpi-receitas"]')).toContainText(/R\$\s*55\.200,00/);
  await expect(page.locator('[data-od-id="kpi-despesas"]')).toContainText(/R\$\s*15\.231,30/);
  await expect(page.locator('[data-od-id="kpi-economia"]')).toContainText("72,4%");

  // The fluxo band shows the window's figures (default range 6M).
  await expect(page.locator('[data-od-id="chart-fluxo"]')).toContainText(`+R$${nbsp}55.200,00`);
  await expect(page.locator('[data-od-id="chart-fluxo"]')).toContainText(`−R$${nbsp}15.231,30`);

  // The recent table shows the seeded rows with their resolved categories.
  await expect(page.locator('[data-od-id="tx-recentes"]')).toContainText("PIX RECEBIDO E2E");
  await expect(page.locator('[data-od-id="tx-recentes"]')).toContainText("MERCADO E2E");
  await expect(page.locator('[data-od-id="tx-recentes"]')).toContainText("ACADEMIA E2E");
  await expect(page.locator('[data-od-id="tx-recentes"]')).toContainText("Supermercado");
  await expect(page.locator('[data-od-id="tx-recentes"]')).toContainText("Saúde");

  // The donut legend carries the window's categories.
  await expect(page.locator('[data-od-id="chart-categorias"]')).toContainText("Saúde");
  await expect(page.locator('[data-od-id="chart-categorias"]')).toContainText("Supermercado");
});

test("switching the range changes the series label and refetches /api/overview", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/overview")) {
      calls.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.locator('[data-od-id="chart-fluxo"]')).toContainText("últimos 6 meses");

  await page.locator(".seg button", { hasText: "12M" }).click();
  await expect(page.locator('[data-od-id="chart-fluxo"]')).toContainText("últimos 12 meses");

  await page.locator(".seg button", { hasText: "1D" }).click();
  await expect(page.locator('[data-od-id="chart-fluxo"]')).toContainText("hoje");

  expect(calls.filter((url) => url.includes("range=12M") || url.includes("range=1D")).length).toBeGreaterThanOrEqual(2);
  expect(calls.at(-1)).toContain("range=1D");
});

test("a custom period overrides the presets and a preset click clears it", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/overview")) {
      calls.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.locator('[data-od-id="kpi-receitas"]')).toContainText(/R\$\s*55\.200,00/);
  await expect(page.locator(".seg button", { hasText: "6M" })).toHaveClass(/active/);

  // A single-day window can only ever hold that day's rows, so the 6M figure
  // cannot survive — and the call carries from= only (empty end = start day).
  const pastDay = localDayOf(new Date(Date.now() - 35 * 86_400_000).toISOString());

  await page.locator(".date-seg input").nth(0).fill(pastDay);
  await expect(page.locator(".date-seg input").nth(0)).toHaveValue(pastDay);
  await expect(page.locator('[data-od-id="kpi-receitas"]')).not.toContainText(/R\$\s*55\.200,00/);
  expect(calls.some((url) => url.includes(`from=${pastDay}`))).toBe(true);
  expect(calls.at(-1)).not.toContain("to=");

  // The end input's min follows the start; filling it adds to= to the call.
  await expect(page.locator(".date-seg input").nth(1)).toHaveAttribute("min", pastDay);
  await page.locator(".date-seg input").nth(1).fill(pastDay);
  expect(calls.some((url) => url.includes(`from=${pastDay}&to=${pastDay}`))).toBe(true);

  // While the custom period is set, no preset shows active.
  await expect(page.locator(".seg button.active")).toHaveCount(0);

  // A reload restores the period from localStorage and refetches with it.
  await page.reload();
  await expect(page.locator(".date-seg input").nth(0)).toHaveValue(pastDay);
  await expect(page.locator(".date-seg input").nth(1)).toHaveValue(pastDay);
  await expect(page.locator(".seg button.active")).toHaveCount(0);
  expect(calls.some((url) => url.includes(`from=${pastDay}&to=${pastDay}`))).toBe(true);

  // A preset click clears both inputs and re-activates the preset.
  await page.locator(".seg button", { hasText: "1D" }).click();
  await expect(page.locator(".date-seg input").nth(0)).toHaveValue("");
  await expect(page.locator(".date-seg input").nth(1)).toHaveValue("");
  await expect(page.locator(".seg button", { hasText: "1D" })).toHaveClass(/active/);
  await expect(page.locator('[data-od-id="chart-fluxo"]')).toContainText("hoje");
});

test("demo cards carry the demo tag", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('[data-od-id="orcamentos-mini"] .pill.flat')).toHaveText("demo");
  await expect(page.locator('[data-od-id="insights"] .pill.flat')).toHaveText("demo");
  await expect(page.locator('[data-od-id="metas-economia"] .pill.flat')).toHaveText("demo");

  // The demo figures themselves render (the prototype's numbers).
  await expect(page.locator('[data-od-id="orcamentos-mini"]')).toContainText("Moradia");
  await expect(page.locator('[data-od-id="metas-economia"]')).toContainText("Reserva de emergência");
  await expect(page.locator('[data-od-id="insights"]')).toContainText("Assinaturas");
});

test("sync completes and refreshes the freshness label", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/overview")) {
      calls.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.locator('[data-od-id="freshness"]')).toContainText("Dados até");
  const before = calls.length;

  await page.locator(".topbar button", { hasText: "Sincronizar" }).click();
  await expect(page.locator(".topbar")).toContainText("Sincronizado agora");
  await expect(page.locator(".toast.show")).toContainText("Sincronização concluída");

  // The overview refetches after the walk (refreshKey) and the freshness
  // label still reflects the cache's through date.
  await expect.poll(() => calls.length).toBeGreaterThan(before);
  await expect(page.locator('[data-od-id="freshness"]')).toContainText("E2E Bank");
});
