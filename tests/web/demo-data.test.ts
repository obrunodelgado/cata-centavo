import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEMO_BUDGETS, DEMO_GOALS, DEMO_INSIGHTS } from "../../apps/web/lib/demo-data.ts";

/**
 * The demo constants are the prototype's own numbers, ported verbatim. The
 * tests pin the totals the prototype displays ("R$ 7.214 gastos de R$ 8.150
 * orçados") so the demo cards can never show a nonsense bar.
 */
describe("lib/demo-data — internal consistency", () => {
  it("budget totals match the prototype's displayed figures", () => {
    const spent = DEMO_BUDGETS.reduce((sum, budget) => sum + budget.spentCents, 0);
    const limit = DEMO_BUDGETS.reduce((sum, budget) => sum + budget.limitCents, 0);
    assert.equal(spent, 721400, "R$ 7.214 gastos");
    assert.equal(limit, 815000, "R$ 8.150 orçados");
  });

  it("exactly one budget is over its limit — the prototype's Lazer row", () => {
    const over = DEMO_BUDGETS.filter((budget) => budget.spentCents > budget.limitCents);
    assert.equal(over.length, 1);
    assert.equal(over[0]?.name, "Lazer");
  });

  it("every budget carries one of the token series colors", () => {
    const tokens = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)"];
    for (const budget of DEMO_BUDGETS) {
      assert.ok(tokens.includes(budget.color), `${budget.name} uses a token color`);
    }
  });

  it("goals match the prototype's figures and bar widths", () => {
    assert.equal(DEMO_GOALS.length, 2);
    const reserve = DEMO_GOALS[0]!;
    const trip = DEMO_GOALS[1]!;
    assert.equal(reserve.name, "Reserva de emergência");
    assert.deepEqual([reserve.currentCents, reserve.targetCents], [1_800_000, 2_400_000]);
    assert.equal(trip.name, "Viagem · dez/2026");
    assert.deepEqual([trip.currentCents, trip.targetCents], [620_000, 950_000]);

    const pct = (goal: (typeof DEMO_GOALS)[number]): number =>
      Math.round((goal.currentCents / goal.targetCents) * 1000) / 10;
    assert.equal(pct(reserve), 75, "the prototype's 75% bar");
    assert.equal(pct(trip), 65.3, "the prototype's 65% bar, computed");
  });

  it("insights carry a tag, a meta figure and a body, matching the prototype", () => {
    assert.equal(DEMO_INSIGHTS.length, 2);
    const subscriptions = DEMO_INSIGHTS[0]!;
    const food = DEMO_INSIGHTS[1]!;
    assert.equal(subscriptions.tag, "Assinaturas");
    assert.equal(subscriptions.meta, "R$ 59/mês");
    assert.ok(subscriptions.text.includes("R$ 59 por mês"));
    assert.equal(food.tag, "Alimentação");
    assert.equal(food.meta, "+18% vs média");
    assert.ok(food.text.includes("18% acima"));
  });
});
