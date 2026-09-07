import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Account, Transaction } from "@cata-centavo/core";
import { localDayOf } from "@cata-centavo/core";

import type { OverviewResponse } from "../../../apps/web/lib/contracts.ts";
import { handleOverview } from "../../../apps/web/lib/handlers/overview.ts";
import { createSource, type WebSource } from "../../../apps/web/lib/server/composition.ts";
import { createFixtureEnv, type FixtureEnv } from "./fixture-db.ts";
import { startPluggyMock, type PluggyMock } from "./pluggy-mock.ts";

/**
 * Integration: the overview handler through the real composition root (temp
 * SQLite files seeded through the real stores, real pluggy client) pointed at
 * the local Pluggy mock. All rows are dated relative to run-time today, so the
 * hand-computed cents hold on any run day: everything dated today lands in the
 * last bucket, the older rows somewhere in the middle buckets, and the anchor
 * slice (KPI band, donut) covers the whole window — asserted by totals, which
 * cannot drift with the run month.
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
  readonly amountCents: number;
  readonly description: string;
  readonly categoryId: string | null;
  readonly id: string;
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

  fixture = createFixtureEnv(
    {
      accounts: [
        account({ id: ACC_NUBANK, connectionId: CONN_NUBANK, institution: "Nubank", name: "Conta Nubank", amountCents: 1_843_210, lastUpdatedAt: today }),
        account({ id: ACC_INTER, connectionId: CONN_INTER, institution: "Inter", name: "Conta Inter", amountCents: 5_000_000, lastUpdatedAt: today }),
      ],
      transactionsByAccount: {
        [ACC_NUBANK]: [
          seededRow(ACC_NUBANK, CONN_NUBANK, today, { amountCents: -45_900, description: "MERCADO", categoryId: "10000000", id: "int-tx-1" }),
          seededRow(ACC_NUBANK, CONN_NUBANK, today, { amountCents: 100_000, description: "PIX RECEBIDO", categoryId: "01000000", id: "int-tx-2" }),
          seededRow(ACC_NUBANK, CONN_NUBANK, today, { amountCents: -119_900, description: "ALUGUEL", categoryId: "17000000", id: "int-tx-3" }),
          seededRow(ACC_NUBANK, CONN_NUBANK, today, { amountCents: -5_000, description: "UBER", categoryId: "19000000", id: "int-tx-4" }),
          seededRow(ACC_NUBANK, CONN_NUBANK, today, { amountCents: 984_000, description: "SALARIO", categoryId: "01000000", id: "int-tx-5" }),
        ],
        [ACC_INTER]: [
          seededRow(ACC_INTER, CONN_INTER, shiftDays(today, -90), { amountCents: -45_000, description: "MERCADO ANTIGO", categoryId: "10000000", id: "int-tx-6" }),
          seededRow(ACC_INTER, CONN_INTER, shiftDays(today, -91), { amountCents: -10_000, description: "CINEMA", categoryId: "21000000", id: "int-tx-7" }),
        ],
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

describe("handleOverview against the fixture environment", () => {
  it("yields hand-computed series, anchor and balances; revoked connections surface in unavailable", async () => {
    assert.ok(source?.ok);
    const response = await handleOverview(source, new URLSearchParams({ range: "6M" }));
    const body = (await response.json()) as OverviewResponse;

    assert.equal(body.ok, true);
    if (!body.ok) return;

    // Window: six month buckets ending at the anchor (today).
    assert.equal(body.window.kind, "meses");
    assert.equal(body.window.to, iso(new Date()));
    assert.equal(body.series.labels.length, 6);
    assert.deepEqual(body.series.received, [0, 0, 0, 0, 0, 1_084_000]);
    assert.equal(body.series.spent[5], 170_800, "the anchor bucket holds the today-dated rows");
    assert.equal(
      body.series.spent.reduce((sum, cents) => sum + cents, 0),
      225_800,
      "the older rows land in the middle buckets — asserted by total",
    );

    // The anchor slice covers the whole window: today's rows plus the older
    // Inter rows (90/91 days back) all land in the KPI band and the donut.
    assert.deepEqual(
      body.anchor.categories.map((category) => [category.categoryId, category.spentCents, category.count]),
      [
        ["17000000", 119_900, 1],
        ["10000000", 90_900, 2],
        ["21000000", 10_000, 1],
        ["19000000", 5_000, 1],
      ],
    );
    assert.equal(body.anchor.received, 1_084_000);
    assert.equal(body.anchor.savingsRate, 79.2); // (1084000-225800)/1084000*100

    assert.deepEqual(body.balances, { cashCents: 6_843_210, investedCents: 0, owedCents: 0 });

    assert.equal(body.recent.length, 7, "all seeded rows, bounded at 10");
    assert.equal(body.recent[0]?.localDate, body.window.to);
    assert.equal(body.recent[6]?.localDate, iso(shiftDays(new Date(), -91)));

    // Sources carry the cache through dates; a stale one is carried, not hidden.
    assert.deepEqual(
      body.sources.map((row) => [row.institution, row.through]),
      [
        ["Nubank", body.window.to],
        ["Inter", iso(shiftDays(new Date(), -90))],
      ],
    );

    assert.equal(body.unavailable.length, 1);
    assert.equal(body.unavailable[0]?.kind, "consent-revoked");
    assert.ok(body.unavailable[0]?.message.includes(CONN_REVOKED));

    assert.equal(body.investments.totalCents, 0);
    assert.deepEqual(body.investments.byType, []);
    assert.equal(body.budgetsMini, null);
  });

  it("a custom period filters the same rows through the real composition root", async () => {
    assert.ok(source?.ok);
    const response = await handleOverview(
      source,
      new URLSearchParams({ from: iso(shiftDays(new Date(), -40)), to: iso(new Date()) }),
    );
    const body = (await response.json()) as OverviewResponse;

    assert.equal(body.ok, true);
    if (!body.ok) return;

    // 41 days: a daily custom period. Only the today-dated Nubank rows are
    // inside — the Inter rows (90/91 days back) fall outside the bounds.
    assert.equal(body.window.kind, "periodo");
    assert.equal(body.window.to, iso(new Date()));
    assert.equal(body.anchor.received, 1_084_000);
    assert.equal(body.anchor.spent, 170_800);
    assert.equal(body.recent.length, 5);
    assert.equal(body.series.labels.length, 41);
    assert.equal(body.series.spent[40], 170_800, "the last bucket holds the today-dated rows");
  });
});
