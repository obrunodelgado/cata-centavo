import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Account } from "@cata-centavo/core";

import { handleAccounts } from "../../../apps/web/lib/handlers/accounts.ts";
import { handleSources } from "../../../apps/web/lib/handlers/sources.ts";
import { handleSync } from "../../../apps/web/lib/handlers/sync.ts";
import { createSource, type WebSource } from "../../../apps/web/lib/server/composition.ts";
import type { AccountsResponse, SourcesResponse, SyncResponse } from "../../../apps/web/lib/contracts.ts";
import { createFixtureEnv, type FixtureEnv } from "./fixture-db.ts";
import { startPluggyMock, type MockConnection, type PluggyMock } from "./pluggy-mock.ts";

/**
 * Integration: the real composition root (real SQLite files in temp dirs, real
 * pluggy client) pointed at the local Pluggy mock — the same code path the
 * running app uses, no fakes inside the handlers.
 */

const CONN_HEALTHY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONN_REVOKED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONN_FAILING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACCOUNT_BANK = "account-bank-1";

function account(overrides: Partial<Account>): Account {
  return {
    id: "unused",
    connectionId: CONN_HEALTHY,
    institution: "Nubank",
    name: "Conta",
    type: "BANK",
    subtype: null,
    amountCents: 100,
    currency: "BRL",
    lastUpdatedAt: null,
    credit: null,
    ...overrides,
  };
}

function mockConnection(overrides: Partial<MockConnection> & { readonly institution: string }): MockConnection {
  return {
    status: "UPDATED",
    executionStatus: "SUCCESS",
    lastUpdatedAt: "2026-08-30T10:00:00.000Z",
    consent: { expiresAt: "2027-01-01T00:00:00.000Z", revokedAt: null, products: ["TRANSACTIONS"] },
    accounts: [],
    transactions: [],
    ...overrides,
  };
}

let fixture: FixtureEnv;
let mock: PluggyMock;
let source: WebSource | null;

beforeEach(async () => {
  mock = await startPluggyMock({
    connections: {
      [CONN_HEALTHY]: mockConnection({
        institution: "Nubank",
        accounts: [
          { id: ACCOUNT_BANK, itemId: CONN_HEALTHY, type: "BANK", subtype: "CONTA_CORRENTE", name: "Conta Nubank", balance: 18432.1, currencyCode: "BRL" },
        ],
        transactions: [
          { id: "tx-1", accountId: ACCOUNT_BANK, date: "2026-08-01T12:00:00.000Z", description: "MERCADO", amount: -45.9, amountInAccountCurrency: -45.9, currencyCode: "BRL", category: null, categoryId: null, status: "POSTED" },
          { id: "tx-2", accountId: ACCOUNT_BANK, date: "2026-08-02T12:00:00.000Z", description: "PIX RECEBIDO", amount: 1000, amountInAccountCurrency: 1000, currencyCode: "BRL", category: null, categoryId: null, status: "POSTED" },
          { id: "tx-3", accountId: ACCOUNT_BANK, date: "2026-08-03T12:00:00.000Z", description: "ACADEMIA", amount: -119.9, amountInAccountCurrency: -119.9, currencyCode: "BRL", category: null, categoryId: null, status: "POSTED" },
        ],
      }),
      [CONN_REVOKED]: mockConnection({
        institution: "Inter",
        consent: { expiresAt: null, revokedAt: "2026-08-01T00:00:00.000Z", products: [] },
        accounts: [],
      }),
    },
    failingItems: [CONN_FAILING],
  });

  fixture = createFixtureEnv(
    {
      accounts: [
        account({ id: ACCOUNT_BANK, connectionId: CONN_HEALTHY, name: "Conta Nubank", amountCents: 1843210, lastUpdatedAt: null }),
      ],
      transactionsByAccount: {
        // Empty cache on purpose: the sync test below must exercise the walk.
        [ACCOUNT_BANK]: [],
      },
    },
    { itemIds: [CONN_HEALTHY, CONN_REVOKED, CONN_FAILING] },
  );

  source = createSource({ ...fixture.env, PLUGGY_API_URL: mock.baseUrl });
});

afterEach(() => {
  if (source?.ok) {
    source.close();
  }
  fixture.close();
  void mock.close();
});

describe("handleSources", () => {
  it("reports configuration problems as readable content", async () => {
    const response = await handleSources(createSource({}));
    const body = (await response.json()) as SourcesResponse;
    assert.equal(body.ok, false);
    if (body.ok) return;
    assert.ok(body.problems.length >= 3);
  });

  it("lists every connection with its consent verdict, failures included", async () => {
    const response = await handleSources(source!);
    const body = (await response.json()) as SourcesResponse;
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.sources.length, 3);

    const healthy = body.sources.find((s) => s.connectionId === CONN_HEALTHY);
    assert.equal(healthy?.institution, "Nubank");
    assert.equal(healthy?.consent, "active");
    assert.equal(healthy?.failure, null);

    const revoked = body.sources.find((s) => s.connectionId === CONN_REVOKED);
    assert.equal(revoked?.consent, "revoked");

    const failing = body.sources.find((s) => s.connectionId === CONN_FAILING);
    assert.equal(failing?.failure?.kind, "unavailable");
  });
});

describe("handleAccounts", () => {
  it("returns live accounts with cents and reports unavailable connections", async () => {
    const response = await handleAccounts(source!);
    const body = (await response.json()) as AccountsResponse;
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.accounts.length, 1);
    assert.equal(body.accounts[0]?.id, ACCOUNT_BANK);
    assert.equal(body.accounts[0]?.amountCents, 1843210);
    assert.equal(body.accounts[0]?.type, "BANK");

    assert.equal(body.unavailable.length, 2, "revoked + failing connections are reported");
  });
});

describe("handleSync", () => {
  it("walks the empty cache and reports per-connection outcomes with counts", async () => {
    const response = await handleSync(source!);
    const body = (await response.json()) as SyncResponse;
    assert.equal(body.ok, true);
    if (!body.ok) return;

    const healthy = body.outcomes.find((o) => o.connectionId === CONN_HEALTHY);
    assert.equal(healthy?.kind, "ok");
    assert.equal(healthy?.accounts, 1);
    assert.equal(healthy?.transactions, 3);
    assert.equal(healthy?.through, "2026-08-03");

    assert.equal(body.unavailable.length, 2, "revoked + failing connections are reported, never silent");
  });

  it("is a no-op on a second call — the reader dedupes and freshness holds", async () => {
    const first = (await (await handleSync(source!)).json()) as SyncResponse;
    const second = (await (await handleSync(source!)).json()) as SyncResponse;
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;

    assert.equal(second.outcomes.find((o) => o.connectionId === CONN_HEALTHY)?.transactions, 3);
  });

  it("survives a rate-limit response with the transport's retry", async () => {
    if (source?.ok) {
      source.close();
    }
    await mock.close();
    mock = await startPluggyMock({
      rateLimitOnce: true,
      connections: {
        [CONN_HEALTHY]: mockConnection({
          institution: "Nubank",
          accounts: [
            { id: ACCOUNT_BANK, itemId: CONN_HEALTHY, type: "BANK", subtype: null, name: "Conta", balance: 100, currencyCode: "BRL" },
          ],
          transactions: [
            { id: "tx-1", accountId: ACCOUNT_BANK, date: "2026-08-01T12:00:00.000Z", description: "MERCADO", amount: -10, amountInAccountCurrency: -10, currencyCode: "BRL", category: null, categoryId: null, status: "POSTED" },
          ],
        }),
      },
    });
    source = createSource({ ...fixture.env, PLUGGY_API_URL: mock.baseUrl });

    const response = await handleSync(source);
    const body = (await response.json()) as SyncResponse;
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.outcomes.find((o) => o.connectionId === CONN_HEALTHY)?.transactions, 1);
  });
});
