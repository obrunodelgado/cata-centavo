import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CATEGORIES, CATEGORY_IDS } from "@cata-centavo/core";

import { categoryColor, categoryLegend } from "../../apps/web/lib/labels.ts";

/**
 * The palette is an identity encoding: two categories sharing a color make a
 * donut's slices and the transaction list's dots indistinguishable. `--c7` is
 * reserved for Outros and for ids outside the taxonomy.
 */
describe("lib/labels — categoryColor", () => {
  it("gives every top-level category a color of its own", () => {
    const colors = CATEGORY_IDS.map((id) => categoryColor(id));
    assert.equal(new Set(colors).size, CATEGORY_IDS.length);
  });

  it("reserves the fallback gray for Outros, null and unknown ids", () => {
    const fallback = "var(--c7)";
    assert.equal(categoryColor(CATEGORIES.other.id), fallback);
    assert.equal(categoryColor(null), fallback);
    assert.equal(categoryColor("77770000"), fallback);

    for (const id of CATEGORY_IDS) {
      if (id === CATEGORIES.other.id) {
        continue;
      }
      assert.notEqual(categoryColor(id), fallback, `category ${id} shares the fallback`);
    }
  });
});

/**
 * The list row's legend — the dot colors and the label. A split saque has no
 * category of its own (ADR-0004): its alocações name the money, so they are
 * the legend. An unsplit one stays "Sem categoria", honestly — the sobra is
 * real money out with nowhere named yet.
 */
describe("lib/labels — categoryLegend", () => {
  const legendRow = (overrides: Partial<Parameters<typeof categoryLegend>[0]> = {}) => ({
    categoryId: null,
    categoryName: null,
    recognised: null,
    allocations: [],
    ...overrides,
  });

  it("passes an ordinary row's category through", () => {
    assert.deepEqual(categoryLegend(legendRow({ categoryId: CATEGORIES.healthcare.id, categoryName: CATEGORIES.healthcare.pt })), [
      { id: CATEGORIES.healthcare.id, name: CATEGORIES.healthcare.pt },
    ]);
  });

  it("keeps Sem categoria for an unsplit saque and for an estorno", () => {
    assert.deepEqual(categoryLegend(legendRow({ recognised: "saque" })), [{ id: null, name: "Sem categoria" }]);
    assert.deepEqual(categoryLegend(legendRow({ recognised: "estorno" })), [{ id: null, name: "Sem categoria" }]);
  });

  it("names the alocação of a split saque", () => {
    assert.deepEqual(
      categoryLegend(legendRow({ recognised: "saque", allocations: [{ categoryId: CATEGORIES.healthcare.id }] })),
      [{ id: CATEGORIES.healthcare.id, name: CATEGORIES.healthcare.pt }],
    );
  });

  it("names every distinct alocação of a multi-category split, first seen first", () => {
    const allocations = [
      { categoryId: CATEGORIES.healthcare.id },
      { categoryId: CATEGORIES.groceries.id },
      { categoryId: CATEGORIES.healthcare.id },
    ];
    assert.deepEqual(categoryLegend(legendRow({ recognised: "saque", allocations })), [
      { id: CATEGORIES.healthcare.id, name: CATEGORIES.healthcare.pt },
      { id: CATEGORIES.groceries.id, name: CATEGORIES.groceries.pt },
    ]);
  });
});
