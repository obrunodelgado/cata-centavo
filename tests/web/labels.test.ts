import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CATEGORIES, CATEGORY_IDS } from "@cata-centavo/core";

import { categoryColor, categoryLegend, filteredAmountCents, transactionModalSub, transactionValueLabel, transactionValueTone } from "../../apps/web/lib/labels.ts";

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

/**
 * The detail modal's sub line — the only metadata the design gives it. A
 * recognised saque speaks the domain's words ("dinheiro vivo") instead of
 * repeating the Tipo chip the row already carries; every other row reads
 * data · descrição · tipo · status.
 */
describe("lib/labels — transactionModalSub", () => {
  const subRow = (overrides: Partial<Parameters<typeof transactionModalSub>[0]> = {}) => ({
    localDate: "2026-08-16",
    description: "iFood — jantar",
    paymentMethod: "Cartão",
    status: "Pago",
    recognised: null,
    ...overrides,
  });

  it("reads data · descrição · tipo · status for an ordinary row", () => {
    assert.equal(transactionModalSub(subRow()), "16 ago · iFood — jantar · Cartão · Pago");
  });

  it("says dinheiro vivo for a recognised saque, with no Tipo and no Status", () => {
    assert.equal(
      transactionModalSub(subRow({ description: "Saque — caixa 24h Itaú", paymentMethod: "Saque", recognised: "saque" })),
      "16 ago · Saque — caixa 24h Itaú · dinheiro vivo",
    );
  });
});

/**
 * The value box's label — what the movement did, in the domain's words. A
 * recognised saque names itself; a receita was received; everything else is a
 * despesa.
 */
describe("lib/labels — transactionValueLabel", () => {
  const labelRow = (overrides: Partial<Parameters<typeof transactionValueLabel>[0]> = {}) => ({
    amountCents: -8970,
    recognised: null,
    ...overrides,
  });

  it("names a recognised saque after the saque, not the despesa", () => {
    assert.equal(transactionValueLabel(labelRow({ recognised: "saque" })), "Valor do saque");
  });

  it("names a receita and a despesa after the movement's direction", () => {
    assert.equal(transactionValueLabel(labelRow({ amountCents: 984000 })), "Valor recebido");
    assert.equal(transactionValueLabel(labelRow()), "Valor da despesa");
  });
});

/**
 * The value box's tone — a receita in green, a despesa in the foreground. The
 * design never paints a despesa red inside the modal; red is the overflow's
 * color, not a negative balance's.
 */
describe("lib/labels — transactionValueTone", () => {
  it("tones a receita green and leaves a despesa and zero in the foreground", () => {
    assert.equal(transactionValueTone(984000), "pos");
    assert.equal(transactionValueTone(-8970), "");
    assert.equal(transactionValueTone(0), "");
  });
});

/**
 * The value a row displays under an active category filter (ADR-0004): a split
 * saque's money names its alocação categories and its sobra names none, so the
 * list shows the portion the filter selects — the same membership
 * `filterByCategories` admits — or the Valor cell would disagree with the
 * sidebar slice the reader clicked. Every other row, and any row with no
 * filter at all, displays its own amount whole.
 */
describe("lib/labels — filteredAmountCents", () => {
  const CENTS = -100000;
  const row = (overrides: Partial<Parameters<typeof filteredAmountCents>[0]> = {}) => ({
    recognised: null,
    amountCents: CENTS,
    allocations: [],
    ...overrides,
  });

  it("displays a row's own amount when no category filter is active", () => {
    assert.equal(filteredAmountCents(row(), []), CENTS);
    assert.equal(
      filteredAmountCents(row({ recognised: "saque", allocations: [{ categoryId: "estudo", amountCents: 50000 }] }), []),
      CENTS,
    );
  });

  it("displays a non-saque row's whole amount even under a filter", () => {
    assert.equal(filteredAmountCents(row({ amountCents: -48690 }), ["estudo"]), -48690);
  });

  it("displays only the matching alocação of a split saque under its category", () => {
    const allocations = [{ categoryId: "estudo", amountCents: 50000 }];
    assert.equal(filteredAmountCents(row({ recognised: "saque", allocations }), ["estudo"]), -50000);
  });

  it("displays the sobra — never the whole — under Sem categoria", () => {
    const allocations = [{ categoryId: "estudo", amountCents: 50000 }];
    assert.equal(filteredAmountCents(row({ recognised: "saque", allocations }), ["none"]), -50000);
  });

  it("displays an unsplit saque whole under Sem categoria — it is all sobra", () => {
    assert.equal(filteredAmountCents(row({ recognised: "saque" }), ["none"]), CENTS);
  });

  it("sums every alocação the filter names and leaves the sobra out of a category portion", () => {
    const allocations = [
      { categoryId: "estudo", amountCents: 30000 },
      { categoryId: "moradia", amountCents: 20000 },
    ];
    assert.equal(filteredAmountCents(row({ recognised: "saque", allocations }), ["estudo", "moradia"]), -50000);
    assert.equal(filteredAmountCents(row({ recognised: "saque", allocations }), ["estudo"]), -30000);
  });
});
