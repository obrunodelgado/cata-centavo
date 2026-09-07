import type { AccountsResponse, OverviewResponse, SourcesResponse, SyncResponse } from "./contracts.ts";
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
