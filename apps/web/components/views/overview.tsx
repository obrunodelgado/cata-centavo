"use client";

import { useState } from "react";

import { fetchOverview } from "../../lib/api.ts";
import type { CategorySlice, OverviewResponse, OverviewSource, RecentRow } from "../../lib/contracts.ts";
import { dayMonthShort } from "../../lib/datetime.ts";
import { categoryColor, paymentMethodClass } from "../../lib/labels.ts";
import { DEMO_BUDGETS, DEMO_GOALS, DEMO_INSIGHTS } from "../../lib/demo-data.ts";
import { centsToBRL, centsToBRLShort, centsToSignedBRL, percentBRL } from "../../lib/money.ts";
import type { Range } from "../../lib/series.ts";
import { useApi } from "../../lib/use-api.ts";
import { DonutChart } from "../charts/donut-chart.tsx";
import { FlowChart, type FlowDatum } from "../charts/flow-chart.tsx";
import { Sparkline } from "../charts/sparkline.tsx";
import { Button } from "../ui/button.tsx";
import { Modal } from "../ui/modal.tsx";
import { Pill } from "../ui/pill.tsx";
import { DataTable, type TableColumn } from "../ui/table.tsx";
import { UnavailableNotice } from "../ui/unavailable-notice.tsx";

/**
 * Visão geral — the prototype's layout fed by `/api/overview`. Every number a
 * human reads comes from `lib/money.ts` over the integer cents the API sends;
 * the only floats in this file are bar widths and chart geometry, and nothing
 * is ever computed back from them. The KPI band and the donut show the whole
 * window's totals (the payload's `anchor` slice), never just the anchor month.
 * The Orçamentos/Insights/Metas cards render the demo constants and carry a
 * visible demo tag until their tickets land.
 */

type OverviewViewProps = {
  readonly range: Range;
  readonly periodStart: string;
  readonly periodEnd: string;
  /** Bumped by the shell after a sync so the view refetches. */
  readonly refreshKey: number;
  /** Where "Ver todas" lands — the transactions view. */
  readonly onVerTodas: () => void;
};

/** The series palette keyed by top-level category; anything else is `--c7`. */

const INVESTMENT_COLORS = ["var(--c1)", "var(--c4)", "var(--c2)", "var(--c6)", "var(--c7)"] as const;

export function OverviewView({ range, periodStart, periodEnd, refreshKey, onVerTodas }: OverviewViewProps) {
  const requestKey = `${range}|${periodStart}|${periodEnd}|${refreshKey}`;
  const { data: payload, error, loading } = useApi(requestKey, () => fetchOverview({ range, from: periodStart, to: periodEnd }));

  if (error !== null) {
    return (
      <section className="view enter" aria-label="Visão geral">
        <div className="card" role="alert">
          <div className="card-title">Não foi possível carregar a visão geral</div>
          <p className="card-sub">{error}</p>
        </div>
      </section>
    );
  }

  if (loading || payload === null) {
    return (
      <section className="view enter" aria-label="Visão geral">
        <div className="card">
          <div className="card-title">Visão geral</div>
          <p className="card-sub">Carregando…</p>
        </div>
      </section>
    );
  }

  if (!payload.ok) {
    return (
      <section className="view enter" aria-label="Visão geral">
        <div className="card" role="alert">
          <div className="card-title">Configuração pendente</div>
          <ul>
            {payload.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return <OverviewLoaded payload={payload} onVerTodas={onVerTodas} />;
}

function OverviewLoaded({ payload, onVerTodas }: {
  readonly payload: Extract<OverviewResponse, { readonly ok: true }>;
  readonly onVerTodas: () => void;
}) {
  const { window, series, anchor, balances, recent, investments, sources, unavailable } = payload;
  const [detail, setDetail] = useState<RecentRow | null>(null);

  const net = anchor.received - anchor.spent;
  const receivedDelta = bucketDelta(series.received);
  const spentDelta = bucketDelta(series.spent);
  const spentTotal = anchor.categories.reduce((sum, category) => sum + category.spentCents, 0);
  const stale = sources.filter((source) => source.through !== null && source.through < window.from);

  return (
    <section className="view enter" aria-label="Visão geral">
      <div className="kpi-band">
        <div className="kpi" data-od-id="kpi-saldo">
          <div className="kpi-top">
            <span className="kpi-label">Saldo em conta</span>
            <span className={`kpi-delta ${net >= 0 ? "up" : "down"} num`}>{centsToSignedBRL(net)}</span>
          </div>
          <div className="kpi-num num">{centsToBRL(balances.cashCents)}</div>
          <Sparkline dataCents={netPerBucket(series)} color="var(--c1)" />
        </div>
        <div className="kpi" data-od-id="kpi-receitas">
          <div className="kpi-top">
            <span className="kpi-label">Receitas · {window.label}</span>
            <DeltaPill value={receivedDelta} goodWhenNegative={false} />
          </div>
          <div className="kpi-num num">{centsToBRL(anchor.received)}</div>
          <Sparkline dataCents={series.received} color="var(--pos)" />
        </div>
        <div className="kpi" data-od-id="kpi-despesas">
          <div className="kpi-top">
            <span className="kpi-label">Despesas · {window.label}</span>
            <DeltaPill value={spentDelta} goodWhenNegative={true} />
          </div>
          <div className="kpi-num num">{centsToBRL(anchor.spent)}</div>
          <Sparkline dataCents={series.spent} color="var(--neg)" />
        </div>
        <div className="kpi" data-od-id="kpi-economia">
          <div className="kpi-top">
            <span className="kpi-label">Taxa de economia</span>
            <span className="kpi-delta up num">meta 20%</span>
          </div>
          <div className="kpi-num num">{percentBRL(anchor.savingsRate)}</div>
          <Sparkline dataCents={savingsPerBucket(series)} color="var(--c4)" />
        </div>
      </div>

      <FreshnessLine sources={sources} stale={stale} />
      {unavailable.length > 0 && <UnavailableNotice unavailable={unavailable} />}

      <div className="grid-2-1" style={{ alignItems: "stretch" }}>
        <div className="card band" data-od-id="chart-fluxo">
          <div className="band-left">
            <div className="card-title">Fluxo de caixa</div>
            <div className="card-sub">Receitas × despesas · {window.label}</div>
            <div className="band-nums">
              <div className="band-num">
                <span>Receitas · {window.label}</span>
                <b className="num">{centsToSignedBRL(anchor.received)}</b>
              </div>
              <div className="band-num">
                <span>Despesas · {window.label}</span>
                <b className="num">{centsToSignedBRL(-anchor.spent)}</b>
              </div>
              <div className="band-num">
                <span>Saldo do período</span>
                <b className={`num ${net >= 0 ? "pos" : ""}`}>{centsToSignedBRL(net)}</b>
              </div>
            </div>
          </div>
          <FlowChart
            kind={window.kind}
            data={flowData(series.labels, series.received, series.spent)}
            receivedColor="var(--pos)"
            spentColor="var(--neg)"
            ariaLabel="Fluxo de caixa — receitas e despesas"
          />
        </div>
        <div className="card card-tight" data-od-id="chart-categorias">
          <div className="card-head">
            <div>
              <div className="card-title">Despesas por categoria</div>
              <div className="card-sub">{window.label} · {centsToBRL(spentTotal)}</div>
            </div>
          </div>
          <CategoryDonut categories={anchor.categories} totalCents={spentTotal} caption={window.label} />
        </div>
      </div>

      <div className="grid-2-1" style={{ alignItems: "stretch" }}>
        <div className="card" data-od-id="tx-recentes">
          <div className="card-head">
            <div>
              <div className="card-title">Transações recentes</div>
              <div className="card-sub">{window.label === "hoje" ? "Hoje" : `Últimos movimentos · ${window.label}`}</div>
            </div>
            <Button variant="ghost" className="btn-arrow" onClick={onVerTodas}>
              Ver todas
            </Button>
          </div>
          <DataTable
            columns={RECENT_COLUMNS}
            rows={recent}
            rowKey={(row) => row.id}
            emptyMessage="Sem movimentações neste período."
            onActivate={setDetail}
            rowAriaLabel={(row) => `Ver detalhes: ${row.description}`}
          />
        </div>
        <div className="card" data-od-id="orcamentos-mini">
          <div className="card-head">
            <div>
              <div className="card-title">Orçamentos do mês</div>
              <div className="card-sub">
                {centsToBRL(DEMO_BUDGETS.reduce((sum, budget) => sum + budget.spentCents, 0))} gastos de{" "}
                {centsToBRL(DEMO_BUDGETS.reduce((sum, budget) => sum + budget.limitCents, 0))} orçados
              </div>
            </div>
            <Pill tone="flat">demo</Pill>
          </div>
          {DEMO_BUDGETS.slice(0, 4).map((budget) => (
            <BudgetRow key={budget.name} name={budget.name} spentCents={budget.spentCents} limitCents={budget.limitCents} color={budget.color} />
          ))}
          <Button variant="ghost" className="btn-arrow" disabled title="Disponível em breve">
            Abrir
          </Button>
        </div>
      </div>

      <div className="grid-2-1" style={{ alignItems: "stretch" }}>
        <div className="card" data-od-id="investimentos">
          <div className="card-head">
            <div>
              <div className="card-title">Investimentos</div>
              <div className="card-sub">
                Patrimônio investido{investments.monthDelta === null ? "" : ` · ${investments.monthDelta} no mês`}
              </div>
            </div>
            <Pill tone="pos">{centsToBRL(investments.totalCents)}</Pill>
          </div>
          {investments.byType.length === 0 ? (
            <div className="chart-empty">Sem investimentos ativos</div>
          ) : (
            investments.byType.map((row, index) => (
              <div className="hbar-row" key={row.name}>
                <span className="hbar-name">{row.name}</span>
                <div className="hbar-track">
                  <div className="hbar-fill" style={{ width: `${row.pct}%`, background: INVESTMENT_COLORS[index % INVESTMENT_COLORS.length] }} />
                </div>
                <span className="hbar-val num">
                  {row.pct}% · {centsToBRLShort(row.balanceCents)}
                </span>
              </div>
            ))
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="card" data-od-id="insights">
            <div className="card-head">
              <div>
                <div className="card-title">Insights</div>
                <div className="card-sub" style={{ marginBottom: 14 }}>
                  Gerados automaticamente a partir dos seus dados
                </div>
              </div>
              <Pill tone="flat">demo</Pill>
            </div>
            {DEMO_INSIGHTS.map((insight) => (
              <div className="insight" key={insight.tag}>
                <div className="insight-head">
                  <span
                    className="pill"
                    style={{
                      background: `color-mix(in oklch, ${insight.tagColor} 14%, transparent)`,
                      color: `color-mix(in oklch, ${insight.tagColor} 45%, var(--fg))`,
                    }}
                  >
                    {insight.tag}
                  </span>
                  <span className="meta">{insight.meta}</span>
                </div>
                <p>{insight.text}</p>
              </div>
            ))}
          </div>
          <div className="card" data-od-id="metas-economia">
            <div className="card-head">
              <div>
                <div className="card-title" style={{ fontSize: 13.5 }}>
                  Metas de economia
                </div>
              </div>
              <Pill tone="flat">demo</Pill>
            </div>
            {DEMO_GOALS.map((goal) => (
              <div className="meta-item" key={goal.name}>
                <div className="budget-top">
                  <span className="budget-name">{goal.name}</span>
                  <span className="budget-vals num">
                    {centsToBRL(goal.currentCents)} / {centsToBRL(goal.targetCents)}
                  </span>
                </div>
                <div className="progress">
                  <div
                    className="progress-bar"
                    style={{ width: `${progressWidth(goal.currentCents, goal.targetCents)}%`, background: goal.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RecentDetailModal row={detail} onClose={() => setDetail(null)} />
    </section>
  );
}

function DeltaPill({ value, goodWhenNegative }: { readonly value: number | null; readonly goodWhenNegative: boolean }) {
  if (value === null) {
    return <span className="kpi-delta num">—</span>;
  }
  const good = goodWhenNegative ? value <= 0 : value >= 0;
  const text = value >= 0 ? `+${percentBRL(value)}` : percentBRL(value);
  return <span className={`kpi-delta ${good ? "up" : "down"} num`}>{text}</span>;
}

/** The percent change between the last two buckets; null when the baseline is zero. */
function bucketDelta(perBucket: readonly number[]): number | null {
  const previous = perBucket[perBucket.length - 2] ?? 0;
  const current = perBucket[perBucket.length - 1] ?? 0;
  if (previous <= 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function netPerBucket(series: { readonly received: readonly number[]; readonly spent: readonly number[] }): readonly number[] {
  return series.received.map((received, index) => received - (series.spent[index] ?? 0));
}

function savingsPerBucket(series: { readonly received: readonly number[]; readonly spent: readonly number[] }): readonly number[] {
  return series.received.map((received, index) => {
    const spent = series.spent[index] ?? 0;
    if (received <= 0) {
      return 0;
    }
    return Math.round(((received - spent) / received) * 1000) / 10;
  });
}

function flowData(
  labels: readonly string[],
  received: readonly number[],
  spent: readonly number[],
): readonly FlowDatum[] {
  return labels.map((label, index) => ({
    label,
    receivedCents: received[index] ?? 0,
    spentCents: spent[index] ?? 0,
  }));
}

function CategoryDonut({
  categories,
  totalCents,
  caption,
}: {
  readonly categories: readonly CategorySlice[];
  readonly totalCents: number;
  readonly caption: string;
}) {
  if (categories.length === 0) {
    return <div className="chart-empty">Sem despesas neste período</div>;
  }
  const data = categories.map((category) => ({
    name: category.name,
    spentCents: category.spentCents,
    color: categoryColor(category.categoryId),
  }));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ maxWidth: 130, flex: "none", width: 130 }}>
        <DonutChart data={data} totalCents={totalCents} caption={caption} />
      </div>
      <div className="legend legend-v">
        {categories.map((category) => (
          <span className="legend-item" key={category.categoryId ?? "none"}>
            <span className="swatch" style={{ background: categoryColor(category.categoryId) }}></span>
            {category.name} <b className="num">{slicePercent(category, totalCents)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function slicePercent(category: CategorySlice, totalCents: number): string {
  if (totalCents <= 0) {
    return "0,0%";
  }
  return percentBRL(Math.round((category.spentCents / totalCents) * 1000) / 10);
}

/** The recent table's columns, shared shape with the transactions view's table. */
const RECENT_COLUMNS: readonly TableColumn<RecentRow>[] = [
  {
    header: "Data",
    numeric: true,
    render: (row) => <span style={{ whiteSpace: "nowrap" }}>{dayMonthShort(row.localDate)}</span>,
  },
  {
    header: "Descrição",
    render: (row) => (
      <div>
        <div className="tx-desc">{row.description}</div>
        <div className="tx-cat">
          <i style={{ background: categoryColor(row.categoryId) }}></i>
          {row.categoryName ?? "Sem categoria"}
          {row.internal ? (
            <span className="tag" style={{ marginLeft: 6 }}>
              interna
            </span>
          ) : null}
        </div>
      </div>
    ),
  },
  {
    header: "Tipo",
    render: (row) => <span className={`tx-type ${paymentMethodClass(row)}`}>{row.paymentMethod}</span>,
  },
  {
    header: "Status",
    render: (row) => <span className="tag">{row.status}</span>,
  },
  {
    header: "Valor",
    numeric: true,
    render: (row) => (
      <span className={row.amountCents > 0 ? "val-pos" : "val-neg"}>
        {row.amountCents > 0 ? "+" : ""}
        {centsToBRL(row.amountCents)}
      </span>
    ),
  },
];

/** Read-only detail: the model's modal minus the editable fields that ticket 07 owns. */
function RecentDetailModal({ row, onClose }: { readonly row: RecentRow | null; readonly onClose: () => void }) {
  if (row === null) {
    return null;
  }
  const positive = row.amountCents > 0;
  return (
    <Modal
      title={row.description}
      sub={`${dayMonthShort(row.localDate)} · ${row.categoryName ?? "Sem categoria"} · ${row.paymentMethod}`}
      open
      onClose={onClose}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <span className="meta">Valor</span>
        <span className={`num ${positive ? "val-pos" : "val-neg"}`} style={{ fontSize: 22, fontWeight: 650 }}>
          {positive ? "+" : ""}
          {centsToBRL(row.amountCents)}
        </span>
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}

function dayMonth(localDate: string): string {
  return `${localDate.slice(8, 10)}/${localDate.slice(5, 7)}`;
}

function BudgetRow({
  name,
  spentCents,
  limitCents,
  color,
}: {
  readonly name: string;
  readonly spentCents: number;
  readonly limitCents: number;
  readonly color: string;
}) {
  const over = spentCents > limitCents;
  return (
    <div className="budget-row" style={{ marginTop: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="budget-top" style={{ marginBottom: 4 }}>
          <span className="budget-name">{name}</span>
          <span className="budget-vals num">
            {centsToBRL(spentCents)} / {centsToBRL(limitCents)}
          </span>
        </div>
        <div className="progress">
          <div
            className="progress-bar"
            style={{ width: `${progressWidth(spentCents, limitCents)}%`, background: over ? "var(--neg)" : color }}
          />
        </div>
      </div>
    </div>
  );
}

/** Bar width only — a float that never feeds back into money. */
function progressWidth(currentCents: number, targetCents: number): number {
  if (targetCents <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((currentCents / targetCents) * 1000) / 10);
}

function FreshnessLine({ sources, stale }: { readonly sources: readonly OverviewSource[]; readonly stale: readonly OverviewSource[] }) {
  if (sources.length === 0) {
    return null;
  }
  const throughs = sources
    .map((source) => source.through)
    .filter((through): through is string => through !== null)
    .sort();
  const newest = throughs[throughs.length - 1];
  return (
    <p className="meta" style={{ margin: 0 }} data-od-id="freshness">
      Dados até {newest === undefined ? "—" : dayMonth(newest)} ·{" "}
      {sources.map((source, index) => (
        <span key={source.connectionId}>
          {index > 0 ? ", " : ""}
          {source.institution}
          {stale.some((candidate) => candidate.connectionId === source.connectionId) ? " (desatualizado)" : ""}
        </span>
      ))}
    </p>
  );
}

