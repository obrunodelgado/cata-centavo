import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Account, Transaction } from "@cata-centavo/core";
import { localDayOf } from "@cata-centavo/core";

import type { CategoryWriteResponse, TransactionsResponse } from "../../../apps/web/lib/contracts.ts";
import { handleTransactionCategory } from "../../../apps/web/lib/handlers/transaction-category.ts";
import { handleTransactions } from "../../../apps/web/lib/handlers/transactions.ts";
import { createSource, type WebSource } from "../../../apps/web/lib/server/composition.ts";
import { createFixtureEnv, type FixtureEnv } from "./fixture-db.ts";
import { startPluggyMock, type PluggyMock } from "./pluggy-mock.ts";

/**
 * Integration: the transactions handler through the real composition root
 * (temp SQLite files seeded through the real stores, real pluggy client)
 * pointed at the local Pluggy mock. Rows are dated relative to run-time today
 * in São Paulo calendar days, so the assertions hold on any run day.
 */

const CONN_NUBANK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONN_INTER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONN_REVOKED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACC_NUBANK = "acc-nubank";
const ACC_INTER = "acc-inter";

function shiftDays(day: Date, offset: number): Date {
  const shifted = new Date(day);
  shifted.setDate(shifted.getDate() + offset);
  return shifted;
}

function iso(day: Date): string {
  // The cache's local_date is São Paulo-local; UTC dates drift from the anchor
  // during the 21:00–00:00 UTC window, so the seed must speak SP calendar days.
  return localDayOf(day.toISOString());
}

function account(overrides: Partial<Account>): Account {
  return {
    id: "unused",
    connectionId: CONN_NUBANK,
    institution: "Nubank",
    name: "Conta",
    type: "BANK",
    subtype: "CONTA_CORRENTE",
    amountCents: 100,
    currency: "BRL",
    lastUpdatedAt: null,
    credit: null,
    ...overrides,
  };
}

type SeedSpec = {
  readonly id: string;
  readonly amountCents: number;
  readonly description: string;
  readonly categoryId: string | null;
};

function seededRow(accountId: string, connectionId: string, day: Date, spec: SeedSpec): Transaction {
  const local = iso(day);
  return {
    id: spec.id,
    accountId,
    connectionId,
    accountType: "BANK",
    accountSubtype: "CONTA_CORRENTE",
    occurredAt: `${local}T12:00:00.000Z`,
    localDate: local,
    amountCents: spec.amountCents,
    currency: "BRL",
    originalAmountCents: null,
    originalCurrency: null,
    description: spec.description,
    descriptionNorm: spec.description,
    categoryId: spec.categoryId,
    document: null,
    counterpartyName: null,
    paymentMethod: null,
    mcc: null,
    billId: null,
    billForecastDate: null,
    instalmentNumber: null,
    instalmentTotal: null,
    purchaseDate: null,
  };
}

const SEED: readonly SeedSpec[] = [
  { id: "int-tx-1", amountCents: -45_900, description: "MERCADO", categoryId: "10000000" },
  { id: "int-tx-2", amountCents: 100_000, description: "PIX RECEBIDO", categoryId: "01000000" },
  { id: "int-tx-3", amountCents: -119_900, description: "ALUGUEL", categoryId: "17000000" },
  { id: "int-tx-4", amountCents: -5_000, description: "UBER", categoryId: "19000000" },
  { id: "int-tx-5", amountCents: 984_000, description: "SALARIO", categoryId: "01000000" },
  { id: "int-tx-6", amountCents: -2_000, description: "TED POUPANCA", categoryId: "04000000" },
  { id: "int-tx-7", amountCents: -3_000, description: "SEMCAT", categoryId: null },
  { id: "int-tx-8", amountCents: -10_000, description: "CINEMA", categoryId: "21000000" },
];

function seedRows(): readonly { readonly accountId: string; readonly connectionId: string; readonly day: Date; readonly spec: SeedSpec }[] {
  const today = new Date();
  return SEED.map((spec, index) => ({
    accountId: index < 6 ? ACC_NUBANK : ACC_INTER,
    connectionId: index < 6 ? CONN_NUBANK : CONN_INTER,
    day: shiftDays(today, -index - 1),
    spec,
  }));
}

let fixture: FixtureEnv;
let mock: PluggyMock;
let source: WebSource | null;

beforeEach(async () => {
  const today = new Date();

  mock = await startPluggyMock({
    connections: {
      [CONN_NUBANK]: {
        institution: "Nubank",
        status: "UPDATED",
        executionStatus: "SUCCESS",
        lastUpdatedAt: today.toISOString(),
        consent: { expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, products: ["TRANSACTIONS"] },
        accounts: [
          { id: ACC_NUBANK, itemId: CONN_NUBANK, type: "BANK", subtype: "CONTA_CORRENTE", name: "Conta Nubank", balance: 18432.1, currencyCode: "BRL" },
        ],
        transactions: [],
      },
      [CONN_INTER]: {
        institution: "Inter",
        status: "UPDATED",
        executionStatus: "SUCCESS",
        lastUpdatedAt: today.toISOString(),
        consent: { expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, products: ["TRANSACTIONS"] },
        accounts: [
          { id: ACC_INTER, itemId: CONN_INTER, type: "BANK", subtype: "CONTA_CORRENTE", name: "Conta Inter", balance: 50000, currencyCode: "BRL" },
        ],
        transactions: [],
      },
      [CONN_REVOKED]: {
        institution: "Inter",
        status: "UPDATED",
        executionStatus: "SUCCESS",
        lastUpdatedAt: today.toISOString(),
        consent: { expiresAt: null, revokedAt: "2026-08-01T00:00:00.000Z", products: [] },
        accounts: [],
        transactions: [],
      },
    },
  });

  const seeded = seedRows();
  fixture = createFixtureEnv(
    {
      accounts: [
        account({ id: ACC_NUBANK, connectionId: CONN_NUBANK, institution: "Nubank", name: "Conta Nubank", amountCents: 1_843_210, lastUpdatedAt: today }),
        account({ id: ACC_INTER, connectionId: CONN_INTER, institution: "Inter", name: "Conta Inter", amountCents: 5_000_000, lastUpdatedAt: today }),
      ],
      transactionsByAccount: {
        [ACC_NUBANK]: seeded.filter((row) => row.accountId === ACC_NUBANK).map((row) => seededRow(row.accountId, row.connectionId, row.day, row.spec)),
        [ACC_INTER]: seeded.filter((row) => row.accountId === ACC_INTER).map((row) => seededRow(row.accountId, row.connectionId, row.day, row.spec)),
      },
    },
    { itemIds: [CONN_NUBANK, CONN_INTER, CONN_REVOKED] },
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

const WINDOW = { from: iso(shiftDays(new Date(), -120)), to: iso(new Date()) };

async function list(params: Record<string, string> = {}): Promise<TransactionsResponse> {
  if (!source?.ok) {
    throw new Error("fixture source is not ok");
  }
  const response = await handleTransactions(source, new URLSearchParams({ from: WINDOW.from, to: WINDOW.to, ...params }));
  return (await response.json()) as TransactionsResponse;
}

describe("handleTransactions against the fixture environment", () => {
  it("pages with the cursor, visiting every seeded row exactly once for every filter combination", async () => {
    const wide = await list();
    assert.equal(wide.ok, true);
    if (!wide.ok) return;
    assert.ok(wide.totalInWindow >= 8, "the seed spans both accounts");

    for (const filters of [
      {},
      { q: "mercado" },
      { type: "despesas" },
      { type: "receitas" },
      { categoryIds: "10000000" },
      { categoryIds: "none" },
      { q: "mercado", type: "despesas", categoryIds: "10000000" },
    ]) {
      const whole = await list(filters);
      assert.equal(whole.ok, true);
      if (!whole.ok) return;
      const expectedIds = whole.rows.map((row) => row.id).sort();

      const seen: string[] = [];
      let after: string | undefined;
      for (;;) {
        const response = await handleTransactions(source!, new URLSearchParams({ from: WINDOW.from, to: WINDOW.to, limit: "3", ...filters, ...(after !== undefined ? { after } : {}) }));
        const body = (await response.json()) as TransactionsResponse;
        assert.equal(body.ok, true);
        if (!body.ok) return;
        seen.push(...body.rows.map((row) => row.id));
        if (!body.hasMore) {
          break;
        }
        assert.ok(body.nextAfter !== null, "hasMore implies a cursor");
        after = body.nextAfter;
      }
      assert.deepEqual(seen.sort(), expectedIds, `every row visited exactly once for ${JSON.stringify(filters)}`);
    }
  });

  it("a category write persists and the next list resolves it through the override", async () => {
    assert.ok(source?.ok);
    const before = await list();
    assert.equal(before.ok, true);
    if (!before.ok) return;
    const target = before.rows.find((row) => row.description === "CINEMA");
    assert.ok(target !== undefined, "the seed holds the row the test corrects");

    const write = await handleTransactionCategory(
      source,
      new Request("http://local/api/transactions/category", {
        method: "POST",
        body: JSON.stringify({ ids: [target.id], categoryId: "18000000" }),
      }),
    );
    assert.equal(write.status, 200);
    const written = (await write.json()) as CategoryWriteResponse;
    assert.deepEqual(written, { updated: 1, unknownIds: [] });

    const after = await list();
    assert.equal(after.ok, true);
    if (!after.ok) return;
    const corrected = after.rows.find((row) => row.id === target.id);
    assert.equal(corrected?.categoryId, "18000000");
    assert.equal(corrected?.categoryName, "Saúde");
    assert.equal(corrected?.categorySrc, "override");
  });

  it("a revoked connection is reported, never silently absent", async () => {
    const body = await list();
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.unavailable.length, 1);
    assert.equal(body.unavailable[0]?.kind, "consent-revoked");
    assert.ok(body.rows.length > 0, "the healthy connections' rows survive");
  });
});
