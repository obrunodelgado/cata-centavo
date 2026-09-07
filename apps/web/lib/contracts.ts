/**
 * The wire shapes the API routes speak. Shared by the server handlers and the
 * client (`lib/api.ts` consumes these types) — no infrastructure imports here,
 * so client code can import this module safely.
 */

import type { Range, WindowKind } from "./series.ts";

export type { Range };

export type ConsentState = "active" | "revoked" | "expired" | "unknown";

export type FailureRow = {
  readonly kind: string;
  readonly message: string;
};

export type SourceRow = {
  readonly connectionId: string;
  readonly institution: string;
  readonly status: string;
  readonly executionStatus: string | null;
  readonly consent: ConsentState;
  readonly consentExpiresAt: string | null;
  readonly consentRevokedAt: string | null;
  readonly lastUpdatedAt: string | null;
  readonly failure: FailureRow | null;
};

export type SourcesResponse =
  | { readonly ok: true; readonly sources: readonly SourceRow[] }
  | { readonly ok: false; readonly problems: readonly string[] };

export type CreditRow = {
  readonly limitCents: number | null;
  readonly availableLimitCents: number | null;
  readonly balanceCloseDate: string | null;
  readonly balanceDueDate: string | null;
  readonly brand: string | null;
};

export type AccountRow = {
  readonly id: string;
  readonly connectionId: string;
  readonly institution: string;
  readonly name: string;
  readonly type: "BANK" | "CREDIT" | "INVESTMENT" | "LOAN";
  readonly subtype: string | null;
  /** On BANK: available funds. On CREDIT: used credit at request time. Cents. */
  readonly amountCents: number;
  readonly currency: string;
  readonly credit: CreditRow | null;
};

export type AccountsResponse =
  | { readonly ok: true; readonly accounts: readonly AccountRow[]; readonly unavailable: readonly FailureRow[] }
  | { readonly ok: false; readonly problems: readonly string[] };

export type SyncOutcome = {
  readonly connectionId: string;
  readonly kind: "ok" | "failed";
  readonly message: string;
  /** Accounts walked on this connection, and cached transaction rows after the walk. */
  readonly accounts: number;
  readonly transactions: number;
  readonly through: string | null;
};

export type SyncResponse =
  | { readonly ok: true; readonly outcomes: readonly SyncOutcome[]; readonly unavailable: readonly FailureRow[] }
  | { readonly ok: false; readonly problems: readonly string[] };

/** A configuration failure rendered as readable content, the web's analogue of MCP `isError`. */
export function configurationFailure(problems: readonly string[]): Response {
  return json({ ok: false, problems });
}

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/* ─── /api/transactions ─────────────────────────────────────────── */

/** The tipo segment: which direction of movement the list shows. */
export type TransactionTypeFilter = "todas" | "receitas" | "despesas";

export type TransactionRow = {
  readonly id: string;
  readonly localDate: string;
  /** The instant as reported, untruncated; the modal derives the clock time. */
  readonly occurredAt: string;
  readonly description: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  /** Where the category came from — the modal shows it when this is "override". */
  readonly categorySrc: string | null;
  /** The user's own annotation, from data.db; absence is null, never ''. */
  readonly note: string | null;
  readonly accountId: string;
  readonly accountName: string;
  /** The forma de pagamento label, fallbacks resolved server-side. */
  readonly paymentMethod: string;
  /** An internal transfer (ADR-0003): displayed with the "interna" tag, never a receita or a despesa. */
  readonly internal: boolean;
  readonly amountCents: number;
  /** Derived at request time from `localDate` against today — never stored. */
  readonly status: "Futuro" | "Pago";
};

/** One sidebar entry: the category's share of the filtered window. */
export type BreakdownSlice = {
  readonly categoryId: string | null;
  readonly name: string;
  /** Absolute cents; the direction is the active tipo filter's. */
  readonly totalCents: number;
  readonly count: number;
};

export type TransactionsResponse =
  | {
      readonly ok: true;
      readonly rows: readonly TransactionRow[];
      readonly hasMore: boolean;
      /** The opaque keyset token for the next page; null on the last page. */
      readonly nextAfter: string | null;
      /** The whole filtered window's row count — the "N transações" subtitle. */
      readonly totalInWindow: number;
      /** Per-category totals for the window, ignoring the category filter. */
      readonly breakdown: readonly BreakdownSlice[];
      readonly unavailable: readonly FailureRow[];
    }
  | { readonly ok: false; readonly problems: readonly string[] };

export type CategoryOption = {
  readonly id: string;
  readonly name: string;
};

export type CategoriesResponse = {
  readonly categories: readonly CategoryOption[];
};

export type CategoryWriteResponse = {
  readonly updated: number;
  readonly unknownIds: readonly string[];
};

export type NoteWriteResponse = {
  readonly transactionId: string;
  /** The stored note after the write; null when absent. */
  readonly note: string | null;
  /** Whether the id is still in the cache; a stale id is reported, never written. */
  readonly known: boolean;
};

/* ─── /api/overview ─────────────────────────────────────────────── */

export type OverviewWindow = {
  readonly kind: WindowKind;
  readonly label: string;
  readonly unitLabel: string;
  /** Inclusive bounds, exactly what the server queried. */
  readonly from: string;
  readonly to: string;
};

export type OverviewSeries = {
  readonly labels: readonly string[];
  /** Integer cents per bucket, aligned with `labels`. */
  readonly received: readonly number[];
  readonly spent: readonly number[];
};

export type CategorySlice = {
  readonly categoryId: string | null;
  readonly name: string;
  readonly spentCents: number;
  readonly count: number;
};

export type AnchorSlice = {
  readonly received: number;
  readonly spent: number;
  /** Percentage, one decimal; null when the period had no income. */
  readonly savingsRate: number | null;
  readonly categories: readonly CategorySlice[];
};

export type BalancesSlice = {
  readonly cashCents: number;
  readonly investedCents: number;
  readonly owedCents: number;
};

export type RecentRow = {
  readonly id: string;
  readonly localDate: string;
  readonly description: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly accountId: string;
  /** Display label for the Tipo column: the wire's payment method, "Cartão" on card rows, "—" when unknown. */
  readonly paymentMethod: string;
  readonly amountCents: number;
  /** Derived at request time from `localDate` against today — never stored. */
  readonly status: "Futuro" | "Pago";
  /** An internal transfer (ADR-0003): displayed with the "interna" tag, never a total. */
  readonly internal: boolean;
  /** The user's own annotation; absence is `null`, never `''`. */
  readonly note: string | null;
};

export type InvestmentTypeRow = {
  readonly name: string;
  readonly balanceCents: number;
  readonly pct: number;
};

export type OverviewInvestments = {
  readonly totalCents: number;
  readonly byType: readonly InvestmentTypeRow[];
  /** A formatted pt-BR delta, or null when it cannot be computed. */
  readonly monthDelta: string | null;
};

export type OverviewSource = {
  readonly connectionId: string;
  readonly institution: string;
  /** The newest cached `local_date` for the connection, or null when never synced. */
  readonly through: string | null;
};

export type OverviewResponse =
  | {
      readonly ok: true;
      readonly window: OverviewWindow;
      readonly series: OverviewSeries;
      readonly anchor: AnchorSlice;
      readonly balances: BalancesSlice;
      readonly recent: readonly RecentRow[];
      readonly investments: OverviewInvestments;
      /** Demo payload from lib/demo-data.ts; null until ticket 10. */
      readonly budgetsMini: null;
      readonly sources: readonly OverviewSource[];
      readonly unavailable: readonly FailureRow[];
    }
  | { readonly ok: false; readonly problems: readonly string[] };
