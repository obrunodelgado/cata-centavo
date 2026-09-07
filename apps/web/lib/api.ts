import type { AccountsResponse, CategoriesResponse, CategoryWriteResponse, NoteWriteResponse, OverviewResponse, SourcesResponse, SyncResponse, TransactionsResponse, TransactionTypeFilter } from "./contracts.ts";
import type { Range } from "./series.ts";

/**
 * The client's only way to reach data: relative URLs to the app's own API
 * routes. No absolute hosts, ever — the trust boundary is asserted by the e2e
 * suite, which fails on any request leaving the app origin.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function getJson<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return request<T>(path, init);
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} answered ${response.status}`);
  }
  return payload as T;
}

export function fetchSources(): Promise<SourcesResponse> {
  return getJson<SourcesResponse>("/api/sources");
}

export function fetchAccounts(): Promise<AccountsResponse> {
  return getJson<AccountsResponse>("/api/accounts");
}

export type OverviewQuery = {
  readonly range: Range;
  readonly from?: string;
  readonly to?: string;
};

/**
 * The overview fetch. Empty `from`/`to` are omitted from the query string, and
 * `to` never travels without `from` — the server answers 400 to that shape,
 * and a user filling the end input before the start one must not hit it.
 */
export function fetchOverview(query: OverviewQuery): Promise<OverviewResponse> {
  const search = new URLSearchParams({ range: query.range });
  if (query.from !== undefined && query.from !== "") {
    search.set("from", query.from);
    if (query.to !== undefined && query.to !== "") {
      search.set("to", query.to);
    }
  }
  return getJson<OverviewResponse>(`/api/overview?${search.toString()}`);
}

export function postSync(): Promise<SyncResponse> {
  return postJson<SyncResponse>("/api/sync");
}

/* ─── /api/transactions ─────────────────────────────────────────── */

export type TransactionsQuery = {
  readonly range: Range;
  readonly from?: string;
  readonly to?: string;
  readonly q?: string;
  readonly type?: TransactionTypeFilter;
  readonly categoryIds?: readonly string[];
  readonly limit?: number;
  readonly after?: string;
};

/**
 * The transaction list's fetch. Same shape rules as the overview's: empty
 * `from`/`to` are omitted, `to` never travels without `from`, and the default
 * filters (todas, no category, no search) never travel at all.
 */
export function fetchTransactions(query: TransactionsQuery): Promise<TransactionsResponse> {
  const search = new URLSearchParams({ range: query.range });
  if (query.from !== undefined && query.from !== "") {
    search.set("from", query.from);
    if (query.to !== undefined && query.to !== "") {
      search.set("to", query.to);
    }
  }
  if (query.q !== undefined && query.q !== "") {
    search.set("q", query.q);
  }
  if (query.type !== undefined && query.type !== "todas") {
    search.set("type", query.type);
  }
  if (query.categoryIds !== undefined && query.categoryIds.length > 0) {
    search.set("categoryIds", query.categoryIds.join(","));
  }
  if (query.limit !== undefined) {
    search.set("limit", String(query.limit));
  }
  if (query.after !== undefined && query.after !== "") {
    search.set("after", query.after);
  }
  return getJson<TransactionsResponse>(`/api/transactions?${search.toString()}`);
}

export function fetchCategories(): Promise<CategoriesResponse> {
  return getJson<CategoriesResponse>("/api/categories");
}

export function postTransactionCategory(body: { readonly ids: readonly string[]; readonly categoryId: string }): Promise<CategoryWriteResponse> {
  return postJson<CategoryWriteResponse>("/api/transactions/category", { ids: [...body.ids], categoryId: body.categoryId });
}

export function postTransactionNote(transactionId: string, note: string): Promise<NoteWriteResponse> {
  return postJson<NoteWriteResponse>("/api/transactions/note", { transactionId, note });
}
