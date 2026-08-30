import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { fakeJwt } from "../../fakes/fake-fetch.ts";

/**
 * A local stand-in for the Pluggy API, serving wire-shaped JSON through the
 * real transport (rate limiting, 429 backoff, auth) and the real mapper. Lives
 * in `tests/` only — production code never imports it (the fakes-outside-`src`
 * convention). The e2e seed starts the same server the integration tests use.
 */

export type MockConsent = {
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly products: readonly string[];
};

export type MockAccount = {
  readonly id: string;
  readonly itemId: string;
  readonly type: string;
  readonly subtype: string | null;
  readonly name: string;
  readonly balance: number;
  readonly currencyCode: string;
  readonly creditData?: {
    readonly brand: string | null;
    readonly balanceCloseDate: string | null;
    readonly balanceDueDate: string | null;
    readonly availableCreditLimit: number | null;
    readonly creditLimit: number | null;
  };
};

export type MockTransaction = {
  readonly id: string;
  readonly accountId: string;
  readonly date: string;
  readonly description: string;
  readonly amount: number;
  readonly amountInAccountCurrency: number | null;
  readonly currencyCode: string | null;
  readonly category: string | null;
  readonly categoryId: string | null;
  readonly status: string | null;
  readonly creditCardMetadata?: {
    readonly billId?: string;
    readonly installmentNumber?: number;
    readonly totalInstallments?: number;
    readonly cardNumber?: string;
    readonly payeeMCC?: number;
    readonly purchaseDate?: string;
    readonly billForecastDate?: string;
  };
};

export type MockConnection = {
  readonly institution: string;
  readonly status: string;
  readonly executionStatus: string | null;
  readonly lastUpdatedAt: string | null;
  readonly consent: MockConsent | null;
  readonly accounts: readonly MockAccount[];
  readonly transactions: readonly MockTransaction[];
};

export type MockConfig = {
  readonly connections: Readonly<Record<string, MockConnection>>;
  /** Item ids whose endpoints answer 500 — the "unreachable connection" case. */
  readonly failingItems?: readonly string[];
  /** Answer the first transactions request with 429 + Retry-After: 0, then succeed. */
  readonly rateLimitOnce?: boolean;
};

export type PluggyMock = {
  readonly baseUrl: string;
  close(): Promise<void>;
};

export function startPluggyMock(config: MockConfig): Promise<PluggyMock> {
  const failing = new Set(config.failingItems ?? []);
  let rateLimited = false;

  const server = createServer((request, response) => {
    void handle(request, response);
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    try {
      if (request.method === "POST" && url.pathname === "/auth") {
        return send(response, 200, { apiKey: fakeJwt(new Date(Date.now() + 3600_000)) });
      }

      if (request.method === "GET" && url.pathname.startsWith("/items/")) {
        const id = url.pathname.slice("/items/".length);
        if (failing.has(id)) {
          return send(response, 500, { message: "mock failure" });
        }
        const connection = config.connections[id];
        if (connection === undefined) {
          return send(response, 404, { message: "Item not found" });
        }
        return send(response, 200, {
          id,
          connector: { name: connection.institution },
          status: connection.status,
          executionStatus: connection.executionStatus,
          lastUpdatedAt: connection.lastUpdatedAt,
          statusDetail: null,
          consecutiveFailedLoginAttempts: null,
        });
      }

      if (request.method === "GET" && url.pathname === "/accounts") {
        const itemId = url.searchParams.get("itemId") ?? "";
        const connection = config.connections[itemId];
        if (connection === undefined) {
          return send(response, 404, { message: "Item not found" });
        }
        return send(response, 200, page(connection.accounts.map(accountPageRow)));
      }

      if (request.method === "GET" && url.pathname === "/v2/transactions") {
        const accountId = url.searchParams.get("accountId") ?? "";
        if (config.rateLimitOnce === true && !rateLimited) {
          rateLimited = true;
          // 1s, not 0: the transport treats a non-positive Retry-After as "no
          // header" and falls back to its 60s default, which would stall tests.
          response.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
          response.end(JSON.stringify({ message: "rate limited" }));
          return;
        }
        const connection = connectionWithAccount(config, accountId);
        if (connection === null) {
          return send(response, 404, { message: "Account not found" });
        }
        const rows = connection.transactions.filter((row) => row.accountId === accountId);
        return send(response, 200, { results: rows.map(transactionPageRow), next: null });
      }

      if (request.method === "GET" && url.pathname === "/bills") {
        const accountId = url.searchParams.get("accountId") ?? "";
        const connection = connectionWithAccount(config, accountId);
        if (connection === null) {
          return send(response, 404, { message: "Account not found" });
        }
        return send(response, 200, { total: 0, totalPages: 0, page: 1, results: [] });
      }

      if (request.method === "GET" && url.pathname === "/investments") {
        return send(response, 200, { total: 0, totalPages: 0, page: 1, results: [] });
      }

      if (request.method === "GET" && url.pathname === "/consents") {
        const itemId = url.searchParams.get("itemId") ?? "";
        const connection = config.connections[itemId];
        if (connection === undefined) {
          return send(response, 404, { message: "Item not found" });
        }
        if (connection.consent === null) {
          return send(response, 200, { total: 0, totalPages: 0, page: 1, results: [] });
        }
        return send(response, 200, {
          total: 1,
          totalPages: 1,
          page: 1,
          results: [
            {
              id: "consent-" + itemId,
              expiresAt: connection.consent.expiresAt,
              revokedAt: connection.consent.revokedAt,
              products: [...connection.consent.products],
            },
          ],
        });
      }

      return send(response, 404, { message: `No mock route for ${request.method} ${url.pathname}` });
    } catch (error) {
      send(response, 500, { message: String(error) });
    }
  }

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function connectionWithAccount(config: MockConfig, accountId: string): MockConnection | null {
  for (const connection of Object.values(config.connections)) {
    if (connection.accounts.some((account) => account.id === accountId)) {
      return connection;
    }
  }
  return null;
}

function page(results: readonly unknown[]): Record<string, unknown> {
  return { total: results.length, totalPages: results.length === 0 ? 0 : 1, page: 1, results };
}

function accountPageRow(account: MockAccount): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: account.id,
    itemId: account.itemId,
    type: account.type,
    subtype: account.subtype,
    name: account.name,
    marketingName: null,
    balance: account.balance,
    currencyCode: account.currencyCode,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  if (account.creditData !== undefined) {
    row["creditData"] = account.creditData;
  }
  return row;
}

function transactionPageRow(transaction: MockTransaction): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: transaction.id,
    accountId: transaction.accountId,
    date: transaction.date,
    description: transaction.description,
    descriptionRaw: transaction.description,
    amount: transaction.amount,
    amountInAccountCurrency: transaction.amountInAccountCurrency,
    currencyCode: transaction.currencyCode,
    category: transaction.category,
    categoryId: transaction.categoryId,
    status: transaction.status,
  };
  if (transaction.creditCardMetadata !== undefined) {
    row["creditCardMetadata"] = transaction.creditCardMetadata;
  }
  return row;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
