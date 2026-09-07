/**
 * The prototype's demo constants, exported under one module — the only source
 * the demo-labeled cards (Orçamentos do mês, Insights, Metas de economia) may
 * render from. These are the prototype's own numbers, verbatim; `budgetsMini`
 * stays `null` in the API until ticket 10, so until then these cards are
 * visibly demo (each carries a "demo" tag) and can never be confused with the
 * real aggregates around them.
 */

export type DemoBudget = {
  readonly name: string;
  readonly limitCents: number;
  readonly spentCents: number;
  readonly color: string;
};

export type DemoInsight = {
  readonly tag: string;
  readonly tagColor: string;
  readonly meta: string;
  readonly text: string;
};

export type DemoGoal = {
  readonly name: string;
  readonly currentCents: number;
  readonly targetCents: number;
  readonly color: string;
};

/** The prototype's ORCS: seven budgets, Lazer deliberately over its limit. */
export const DEMO_BUDGETS: readonly DemoBudget[] = [
  { name: "Moradia", limitCents: 280_000, spentCents: 258_700, color: "var(--c1)" },
  { name: "Alimentação", limitCents: 200_000, spentCents: 169_000, color: "var(--c3)" },
  { name: "Transporte", limitCents: 70_000, spentCents: 47_000, color: "var(--c4)" },
  { name: "Assinaturas", limitCents: 35_000, spentCents: 30_000, color: "var(--c6)" },
  { name: "Saúde", limitCents: 40_000, spentCents: 24_600, color: "var(--c2)" },
  { name: "Lazer", limitCents: 30_000, spentCents: 39_100, color: "var(--c5)" },
  { name: "Outros", limitCents: 160_000, spentCents: 153_000, color: "var(--c7)" },
];

/** The prototype's two insight cards. */
export const DEMO_INSIGHTS: readonly DemoInsight[] = [
  {
    tag: "Assinaturas",
    tagColor: "var(--c6)",
    meta: "R$ 59/mês",
    text: "Duas assinaturas não são usadas desde dezembro. Cancelá-las economiza R$ 59 por mês.",
  },
  {
    tag: "Alimentação",
    tagColor: "var(--c3)",
    meta: "+18% vs média",
    text: "Gastos com alimentação ficaram 18% acima da média dos últimos 3 meses.",
  },
];

/** The prototype's two savings goals with their displayed figures. */
export const DEMO_GOALS: readonly DemoGoal[] = [
  { name: "Reserva de emergência", currentCents: 1_800_000, targetCents: 2_400_000, color: "var(--c1)" },
  { name: "Viagem · dez/2026", currentCents: 620_000, targetCents: 950_000, color: "var(--c4)" },
];
