import { aggregate, collectAccounts, isCategoryFilterValue, isSelfTransfer, todayIn, type DerivedTransaction, type TransactionFilter } from "@cata-centavo/core";
import { z } from "zod";

import { isCalendarDay, customWindow, windowSpec, RANGES } from "../series.ts";
import {
  configurationFailure,
  json,
  type BreakdownSlice,
  type FailureRow,
  type TransactionsResponse,
  type TransactionRow,
} from "../contracts.ts";
import { categoryName, paymentMethodOf } from "../labels.ts";
import type { WebSource } from "../server/composition.ts";

/**
 * `GET /api/transactions?range=&from=&to=&categoryIds=&accountIds=&q=&type=&limit=&after=`
 * — the Transações view's payload. One read of the whole filtered window; the
 * page, the count and the breakdown are sliced from the same array, so the
 * list, the "N transações" subtitle and the sidebar can never disagree.
 *
 * The window semantics are the overview's (`range` preset anchored at today,
 * or a custom `from`/`to` pair): the server computes the window, the client
 * never does calendar arithmetic. `type` is decided here too — the client
 * must never reason about the BANK/CREDIT sign — and an internal transfer is
 * never a receita or a despesa (ADR-0003): it surfaces only under `todas`,
 * marked by the row's `internal` tag.
 *
 * `after` is the opaque base64url token of `{localDate, id}`. It never reaches
 * SQL on the web path; the storage's keyset filter remains for the MCP tools.
 */

const TYPE_VALUES = ["todas", "receitas", "despesas"] as const;

export type TransactionTypeFilter = (typeof TYPE_VALUES)[number];

const TRANSACTIONS_SCHEMA = z
  .object({
    range: z.enum(RANGES).default("6M"),
    from: z
      .string()
      .optional()
      .refine((value) => value === undefined || isCalendarDay(value), "must be a valid YYYY-MM-DD calendar day"),
    to: z
      .string()
      .optional()
      .refine((value) => value === undefined || isCalendarDay(value), "must be a valid YYYY-MM-DD calendar day"),
    q: z.string().optional(),
    type: z.enum(TYPE_VALUES).default("todas"),
    categoryIds: z.string().optional(),
    accountIds: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    after: z.string().optional(),
  })
  .superRefine((data, context) => {
    if (data.to !== undefined && data.from === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "requires from" });
    }
    if (data.from !== undefined && data.to !== undefined && data.from > data.to) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "must not be after to" });
    }
  });

export async function handleTransactions(source: WebSource, params: URLSearchParams): Promise<Response> {
  const parsed = TRANSACTIONS_SCHEMA.safeParse({
    range: queryParam(params, "range"),
    from: queryParam(params, "from"),
    to: queryParam(params, "to"),
    q: queryParam(params, "q"),
    type: queryParam(params, "type"),
    categoryIds: queryParam(params, "categoryIds"),
    accountIds: queryParam(params, "accountIds"),
    limit: queryParam(params, "limit"),
    after: queryParam(params, "after"),
  });
  if (!parsed.success) {
    return json({ ok: false, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, 400);
  }

  const categoryIds = parseIdList(parsed.data.categoryIds);
  if (categoryIds !== undefined) {
    const unknown = categoryIds.filter((value) => !isCategoryFilterValue(value));
    if (unknown.length > 0) {
      return json({ ok: false, problems: [`categoryIds: unknown category filter: ${unknown.join(", ")}`] }, 400);
    }
  }

  const cursor = parsed.data.after === undefined ? null : decodeCursor(parsed.data.after);
  if (parsed.data.after !== undefined && cursor === null) {
    return json({ ok: false, problems: ["after: malformed cursor"] }, 400);
  }

  if (!source.ok) {
    return configurationFailure(source.problems);
  }

  const today = todayIn(source.clock);
  const window = parsed.data.from === undefined ? windowSpec(parsed.data.range, today) : customWindow(parsed.data.from, parsed.data.to ?? "");

  const collected = await collectAccounts(source.bank, source.connections, source.toFailure, source.clock);
  const accountNames = new Map(collected.accounts.map((account) => [account.id, account.name]));
  const cached = collected.accounts.map((account) => account.id);
  const accountIds = parsed.data.accountIds === undefined ? cached : cached.filter((id) => parsed.data.accountIds!.includes(id));

  const filter: TransactionFilter = {
    accountIds,
    from: window.from,
    to: window.to,
    ...(parsed.data.q !== undefined && parsed.data.q.trim() !== "" ? { q: parsed.data.q } : {}),
  };

  // One read of the window; every number below is sliced from this array.
  // The category filter runs here, in JS, not in SQL: the sidebar's universe
  // is window + q + type, and a category-filtered read would narrow it.
  const windowRows = source.reader.query(filter);
  const typed = filterByType(windowRows, parsed.data.type);
  const visible = filterByCategories(typed, categoryIds ?? []);

  const start = cursor === null ? 0 : indexAfter(visible, cursor);
  const page = visible.slice(start, start + parsed.data.limit);
  const hasMore = start + parsed.data.limit < visible.length;

  const response: TransactionsResponse = {
    ok: true,
    rows: page.map((row) => transactionRow(row, accountNames, today)),
    hasMore,
    nextAfter: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null,
    totalInWindow: visible.length,
    breakdown: breakdownOf(typed, today, parsed.data.type),
    unavailable: collected.unavailable.map(unavailableRow),
  };
  return json(response);
}

/** A query parameter, absent when missing — `URLSearchParams.get` returns null. */
function queryParam(params: URLSearchParams, name: string): string | undefined {
  return params.get(name) ?? undefined;
}

/** A comma-separated id list, absent when the parameter is missing or blank. */
function parseIdList(raw: string | undefined): readonly string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const values = raw.split(",").map((value) => value.trim()).filter((value) => value !== "");
  return values.length === 0 ? undefined : values;
}

/**
 * The tipo filter, decided server-side from the normalized sign. An internal
 * transfer is neither a receita nor a despesa (ADR-0003) — it surfaces only
 * under `todas`, where the row's `internal` tag marks it.
 */
export function filterByType(rows: readonly DerivedTransaction[], type: TransactionTypeFilter): readonly DerivedTransaction[] {
  if (type === "receitas") {
    return rows.filter((row) => row.amountCents > 0 && !isSelfTransfer(row));
  }
  if (type === "despesas") {
    return rows.filter((row) => row.amountCents < 0 && !isSelfTransfer(row));
  }
  return rows;
}

/**
 * The category filter, resolved in JS against the derived category. `"none"`
 * selects the rows the derivation could not categorize — the same value the
 * MCP boundary accepts. An unknown id never reaches here: the boundary
 * answers 400 first.
 */
export function filterByCategories(rows: readonly DerivedTransaction[], categoryIds: readonly string[]): readonly DerivedTransaction[] {
  if (categoryIds.length === 0) {
    return rows;
  }
  const wantsNone = categoryIds.includes("none");
  const ids = categoryIds.filter((value) => value !== "none");
  return rows.filter((row) => (row.category === null ? wantsNone : ids.includes(row.category)));
}

/**
 * The sidebar's per-category totals: the same `aggregate()` the overview's
 * donut uses, over the tipo-filtered window, in the direction the filter asks
 * for. The category filter is deliberately not applied — the sidebar is
 * navigation, so every category stays clickable while one is active.
 */
export function breakdownOf(rows: readonly DerivedTransaction[], today: string, type: TransactionTypeFilter): readonly BreakdownSlice[] {
  const wanted = type === "receitas" ? (total: number): boolean => total > 0 : (total: number): boolean => total < 0;
  return aggregate(rows, today)
    .groups.filter((group) => wanted(group.totalCents))
    .map((group) => ({
      categoryId: group.categoryId,
      name: categoryName(group.categoryId),
      totalCents: Math.abs(group.totalCents),
      count: group.count,
    }));
}

function transactionRow(row: DerivedTransaction, accountNames: ReadonlyMap<string, string>, today: string): TransactionRow {
  return {
    id: row.id,
    localDate: row.localDate,
    occurredAt: row.occurredAt,
    description: row.description,
    categoryId: row.category,
    categoryName: categoryName(row.category),
    categorySrc: row.categorySrc,
    note: row.note,
    accountId: row.accountId,
    accountName: accountNames.get(row.accountId) ?? row.accountId,
    paymentMethod: paymentMethodOf(row),
    internal: isSelfTransfer(row),
    amountCents: row.amountCents,
    status: row.localDate > today ? "Futuro" : "Pago",
  };
}

/* ─── the keyset cursor ─────────────────────────────────────────── */

type Cursor = { readonly localDate: string; readonly id: string };

function encodeCursor(row: { readonly localDate: string; readonly id: string }): string {
  return Buffer.from(JSON.stringify({ localDate: row.localDate, id: row.id }), "utf8").toString("base64url");
}

/** The opaque token's decode; anything malformed is null, and the boundary answers 400. */
export function decodeCursor(token: string): Cursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record["localDate"] !== "string" || typeof record["id"] !== "string") {
    return null;
  }
  return { localDate: record["localDate"], id: record["id"] };
}

/** The first index strictly after the cursor, in the storage's (date DESC, id DESC) order. */
export function indexAfter(rows: readonly DerivedTransaction[], cursor: Cursor): number {
  const index = rows.findIndex((row) => row.localDate < cursor.localDate || (row.localDate === cursor.localDate && row.id < cursor.id));
  return index === -1 ? rows.length : index;
}

function unavailableRow(unavailable: { readonly connectionId: string; readonly kind: string; readonly message: string }): FailureRow {
  return { kind: unavailable.kind, message: `${unavailable.connectionId}: ${unavailable.message}` };
}
