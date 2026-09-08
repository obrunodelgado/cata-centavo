import { aggregate, collectAccounts, collectInvestments, isSelfTransfer, summarizeInvestments, todayIn, type Account, type InvestmentPosition } from "@cata-centavo/core";
import { z } from "zod";

import {
  configurationFailure,
  json,
  type AnchorSlice,
  type BalancesSlice,
  type CategorySlice,
  type FailureRow,
  type InvestmentTypeRow,
  type OverviewInvestments,
  type OverviewResponse,
  type OverviewSeries,
  type OverviewSource,
  type RecentRow,
} from "../contracts.ts";
import { categoryName, paymentMethodOf } from "../labels.ts";
import { bucketSeries, customWindow, isCalendarDay, RANGES, windowSpec, type WindowSpec } from "../series.ts";
import type { WebSource } from "../server/composition.ts";

/**
 * `GET /api/overview?range=&from=&to=` — the dashboard payload. Every number
 * is computed server-side from the cache through the same core functions the
 * MCP tools use; the client renders, it never aggregates. `range` picks a
 * preset window anchored at today; `from` (with optional `to`, which without
 * `from` is a 400) overrides the presets with a custom period.
 *
 * Balances come from `collectAccounts` (the cache holds transactions, not
 * accounts — the same figure `/api/accounts` reports). `owedCents` is the sum
 * of credit accounts' *used credit* at request time, the same figure the
 * credit cards view shows; the open bills' committed figure would need the
 * bills walk, and the used credit is what the account balance endpoint
 * already reports. `investedCents` is the BRL summary of the collected
 * positions (the product is BRL-only; a multi-currency portfolio would need a
 * currency-aware wire shape). `monthDelta` stays null: positions alone cannot
 * reconstruct last month's total, and a made-up delta is worse than none.
 */

const OVERVIEW_SCHEMA = z
  .object({
    range: z.enum(RANGES).default("6M"),
    from: z
      .string()
      .optional()
      .refine((value) => value === undefined || isCalendarDay(value), "from must be a valid YYYY-MM-DD calendar day"),
    to: z
      .string()
      .optional()
      .refine((value) => value === undefined || isCalendarDay(value), "to must be a valid YYYY-MM-DD calendar day"),
  })
  .superRefine((data, context) => {
    if (data.to !== undefined && data.from === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "requires from" });
    }
  });

/** Pluggy's investment types in pt-BR; unknown types render as themselves. */
const INVESTMENT_TYPE_NAMES: Readonly<Record<string, string>> = {
  FIXED_INCOME: "Renda fixa",
  STOCKS: "Ações",
  FUNDS: "Fundos",
  REIT: "FIIs",
  CRYPTO: "Cripto",
  TREASURY_DIRECT: "Tesouro direto",
  ETF: "ETFs",
  PENSION: "Previdência",
};

/** A query parameter, absent when missing — `URLSearchParams.get` returns null. */
function queryParam(params: URLSearchParams, name: string): string | undefined {
  return params.get(name) ?? undefined;
}

export async function handleOverview(source: WebSource, params: URLSearchParams): Promise<Response> {
  const parsed = OVERVIEW_SCHEMA.safeParse({
    range: queryParam(params, "range"),
    from: queryParam(params, "from"),
    to: queryParam(params, "to"),
  });
  if (!parsed.success) {
    return json({ ok: false, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, 400);
  }

  if (!source.ok) {
    return configurationFailure(source.problems);
  }
  // Zod ignores unknown params, so stale `anchor` callers degrade to presets.
  let window: WindowSpec;
  if (parsed.data.from === undefined) {
    window = windowSpec(parsed.data.range, todayIn(source.clock));
  } else {
    window = customWindow(parsed.data.from, parsed.data.to ?? "");
  }
  return overviewPayload(source, window);
}

async function overviewPayload(source: Extract<WebSource, { readonly ok: true }>, window: WindowSpec): Promise<Response> {
  const today = todayIn(source.clock);

  const [collected, investments] = await Promise.all([
    collectAccounts(source.bank, source.connections, source.toFailure, source.clock),
    collectInvestments(source.bank, source.connections, source.toFailure),
  ]);

  const accountIds = collected.accounts.map((account) => account.id);
  const rows = source.reader.query({ accountIds, from: window.from, to: window.to });
  const series = bucketSeries(window, rows, today);

  const response: OverviewResponse = {
    ok: true,
    window: {
      kind: window.kind,
      label: window.label,
      unitLabel: window.unitLabel,
      from: window.from,
      to: window.to,
    },
    series: seriesPayload(window, series),
    anchor: anchorSlice(rows, window, today),
    balances: balancesSlice(collected.accounts, investments.positions),
    recent: recentRows(rows, today),
    investments: investmentsSlice(investments.positions),
    budgetsMini: null,
    sources: sourcesSlice(collected.accounts, accountIds, today, source),
    unavailable: collected.unavailable.map(unavailableRow),
  };

  return json(response);
}

function seriesPayload(
  window: ReturnType<typeof windowSpec>,
  series: ReturnType<typeof bucketSeries>,
): OverviewSeries {
  return {
    labels: window.labels,
    received: series.receivedCents,
    spent: series.spentCents,
  };
}

/**
 * The anchor slice covers the whole window — the KPI band and the donut show
 * the selected period's totals, so an anchor month that just started cannot
 * zero the headline figures. The rows of the window run through
 * `core/aggregate`, the same function the MCP period tools use, so the donut
 * and the KPIs can never disagree with each other — and the slice equals the
 * sum of the series buckets by construction, since the window ends at the
 * anchor.
 */
function anchorSlice(
  rows: ReturnType<Extract<WebSource, { readonly ok: true }>["reader"]["query"]>,
  window: ReturnType<typeof windowSpec>,
  today: string,
): AnchorSlice {
  const periodRows = rows.filter((row) => row.localDate >= window.from);

  const totals = aggregate(periodRows, today);
  return {
    received: totals.receivedCents,
    spent: totals.spentCents,
    savingsRate: savingsRateOf(totals.receivedCents, totals.spentCents),
    categories: totals.groups.filter((group) => group.totalCents < 0).map(categorySlice),
  };
}

function categorySlice(group: { readonly categoryId: string | null; readonly totalCents: number; readonly count: number }): CategorySlice {
  return {
    categoryId: group.categoryId,
    name: categoryName(group.categoryId),
    spentCents: -group.totalCents,
    count: group.count,
  };
}

function savingsRateOf(receivedCents: number, spentCents: number): number | null {
  if (receivedCents <= 0) {
    return null;
  }
  return Math.round(((receivedCents - spentCents) / receivedCents) * 1000) / 10;
}

function balancesSlice(accounts: readonly Account[], positions: readonly InvestmentPosition[]): BalancesSlice {
  let cashCents = 0;
  let owedCents = 0;
  for (const account of accounts) {
    if (account.type === "BANK") {
      cashCents += account.amountCents;
    } else if (account.type === "CREDIT") {
      owedCents += account.amountCents;
    }
  }

  const summaries = summarizeInvestments(positions);
  const brl = summaries.find((summary) => summary.currency === "BRL");
  const investedCents = brl?.balanceCents ?? summaries.reduce((sum, summary) => sum + summary.balanceCents, 0);

  return { cashCents, investedCents, owedCents };
}

/**
 * The recent list is display-only — it never feeds a total, so a future-dated
 * instalment may appear here (as `Futuro`) while the anchor slice stays clean.
 * The status is derived per request from `localDate` against `today`: one row,
 * one bucket, so a row that matures moves from upcoming to spent without ever
 * being counted twice.
 */
function recentRows(
  rows: ReturnType<Extract<WebSource, { readonly ok: true }>["reader"]["query"]>,
  today: string,
): readonly RecentRow[] {
  return rows.slice(0, 6).map((row) => ({
    id: row.id,
    localDate: row.localDate,
    description: row.description,
    categoryId: row.category,
    categoryName: categoryName(row.category),
    accountId: row.accountId,
    paymentMethod: paymentMethodOf(row),
    amountCents: row.amountCents,
    status: row.localDate > today ? "Futuro" : "Pago",
    internal: isSelfTransfer(row),
    recognised: row.recognised,
    note: row.note,
  }));
}

function investmentsSlice(positions: readonly { readonly type: string; readonly balanceCents: number }[]): OverviewInvestments {
  const byType = new Map<string, number>();
  for (const position of positions) {
    byType.set(position.type, (byType.get(position.type) ?? 0) + position.balanceCents);
  }

  const totalCents = [...byType.values()].reduce((sum, cents) => sum + cents, 0);
  const rows: InvestmentTypeRow[] = [...byType.entries()]
    .filter(([, cents]) => cents > 0)
    .sort(([, left], [, right]) => right - left)
    .map(([type, cents]) => ({
      name: INVESTMENT_TYPE_NAMES[type] ?? type,
      balanceCents: cents,
      pct: totalCents > 0 ? Math.round((cents / totalCents) * 1000) / 10 : 0,
    }));

  return { totalCents, byType: rows, monthDelta: null };
}

function sourcesSlice(
  accounts: readonly { readonly connectionId: string; readonly institution: string }[],
  accountIds: readonly string[],
  today: string,
  source: Extract<WebSource, { readonly ok: true }>,
): readonly OverviewSource[] {
  const through = source.reader.dataThrough(accountIds, today);

  const perConnection = new Map<string, { readonly institution: string; readonly through: string | null }>();
  for (const account of accounts) {
    const existing = perConnection.get(account.connectionId);
    if (existing === undefined) {
      perConnection.set(account.connectionId, { institution: account.institution, through: through.get(account.connectionId) ?? null });
    }
  }

  return [...perConnection.entries()].map(([connectionId, row]) => ({
    connectionId,
    institution: row.institution,
    through: row.through,
  }));
}

function unavailableRow(unavailable: { readonly connectionId: string; readonly kind: string; readonly message: string }): FailureRow {
  return { kind: unavailable.kind, message: `${unavailable.connectionId}: ${unavailable.message}` };
}
