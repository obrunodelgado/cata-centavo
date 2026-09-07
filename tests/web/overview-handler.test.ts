import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Account, InvestmentPosition, Transaction } from "@cata-centavo/core";
import { createTransactionReader } from "@cata-centavo/core";
import { toFailure } from "@cata-centavo/pluggy";
import { CACHE_MIGRATIONS, createTransactionStore, openDatabase } from "@cata-centavo/storage";

import type { OverviewResponse } from "../../apps/web/lib/contracts.ts";
import { handleOverview } from "../../apps/web/lib/handlers/overview.ts";
import type { WebSource } from "../../apps/web/lib/server/composition.ts";
import { connection, fakeBank, type FakeBank } from "../fakes/fake-bank.ts";
import { fixedClock } from "../fakes/fixed-clock.ts";
import { fakeLogger } from "../fakes/fake-logger.ts";
import { tx } from "../fakes/transaction-builder.ts";

/**
 * Unit: the overview handler against a fake bank and a real in-memory store —
 * the series, anchor slices and balances are hand-computed in the assertions.
 */

const CONN_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONN_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACC_CASH = "acc-cash";
const ACC_CREDIT = "acc-credit";

const TODAY = "2026-08-30";

function bankAccount(overrides: Partial<Account>): Account {
  return {
    id: "unused",
    connectionId: CONN_1,
    institution: "Nubank",
    name: "Conta",
    type: "BANK",
    subtype: null,
    amountCents: 100,
    currency: "BRL",
    lastUpdatedAt: new Date("2026-08-30T10:00:00.000Z"),
    credit: null,
    ...overrides,
  };
}

function position(overrides: Partial<InvestmentPosition>): InvestmentPosition {
  return {
    id: "pos-1",
    connectionId: CONN_1,
    institution: "Nubank",
    name: "CDB",
    type: "FIXED_INCOME",
    subtype: null,
    balanceCents: 100,
    currency: "BRL",
    quantity: null,
    ...overrides,
  };
}

/** A cache row on the fixture's bank account, so the seeded store finds it. */
function row(overrides: Partial<Transaction>): Transaction {
  return tx({ accountId: ACC_CASH, connectionId: CONN_1, ...overrides });
}

type Fixture = {
  readonly bank: FakeBank;
  readonly source: WebSource;
  close(): void;
};

const open: Array<{ close(): void }> = [];

function fixture(options: {
  readonly accounts: readonly Account[];
  readonly rows: readonly Transaction[];
  readonly investments?: readonly InvestmentPosition[];
  readonly unreachable?: Readonly<Record<string, Error>>;
}): Fixture {
  const bank = fakeBank({
    connections: [connection(CONN_1, { institution: "Nubank" }), connection(CONN_2, { institution: "Inter" })],
    accounts: { [CONN_1]: options.accounts },
    investments: { [CONN_1]: options.investments ?? [] },
    unreachable: options.unreachable ?? {},
  });

  const db = openDatabase({ path: ":memory:", migrations: CACHE_MIGRATIONS, policy: "rebuild" });
  const store = createTransactionStore(db, fakeLogger());
  store.replaceAccount(ACC_CASH, CONN_1, options.rows, "2026-08-30T10:00:00.000Z");

  const reader = createTransactionReader({ bank, store, toFailure, log: fakeLogger(), clock: fixedClock(new Date()) });
  const close = () => {
    db.close();
  };
  open.push({ close });

  return {
    bank,
    source: {
      ok: true,
      connections: [CONN_1, CONN_2],
      bank,
      toFailure,
      reader,
      writer: {
        setCategory: () => ({ updated: 0, unknownIds: [] }),
        setCounterpartyCategory: () => ({ affected: 0 }),
      },
      closingDays: { list: () => [], set: () => {}, delete: () => 0 },
      clock: fixedClock(new Date(`${TODAY}T12:00:00.000Z`)),
      close,
    },
    close,
  };
}

afterEach(() => {
  for (const handle of open.splice(0)) {
    handle.close();
  }
});

async function payload(source: WebSource, params: Record<string, string> = {}): Promise<OverviewResponse> {
  const response = await handleOverview(source, new URLSearchParams(params));
  return (await response.json()) as OverviewResponse;
}

describe("handleOverview — validation at the boundary", () => {
  function validFixture(): Fixture {
    return fixture({ accounts: [bankAccount({ id: ACC_CASH, amountCents: 1_843_210 })], rows: [] });
  }

  it("rejects an unknown range with readable content", async () => {
    const response = await handleOverview(validFixture().source, new URLSearchParams({ range: "9M" }));
    assert.equal(response.status, 400);
    const body = (await response.json()) as OverviewResponse;
    assert.equal(body.ok, false);
    if (!body.ok) {
      assert.ok(body.problems.some((problem) => problem.includes("range")));
    }
  });

  it("rejects a malformed from", async () => {
    const response = await handleOverview(validFixture().source, new URLSearchParams({ from: "30/08/2026" }));
    assert.equal(response.status, 400);
    const body = (await response.json()) as OverviewResponse;
    assert.equal(body.ok, false);
    if (!body.ok) {
      assert.ok(body.problems.some((problem) => problem.includes("from")));
    }
  });

  it("rejects a malformed to", async () => {
    const response = await handleOverview(validFixture().source, new URLSearchParams({ from: "2026-08-01", to: "30/08/2026" }));
    assert.equal(response.status, 400);
  });

  it("rejects a calendar day that does not exist", async () => {
    const response = await handleOverview(validFixture().source, new URLSearchParams({ from: "2026-02-30" }));
    assert.equal(response.status, 400);
  });

  it("rejects a month outside 01..12", async () => {
    const response = await handleOverview(validFixture().source, new URLSearchParams({ from: "2026-13-01" }));
    assert.equal(response.status, 400);
  });

  it("rejects to without from", async () => {
    const response = await handleOverview(validFixture().source, new URLSearchParams({ to: "2026-08-30" }));
    assert.equal(response.status, 400);
    const body = (await response.json()) as OverviewResponse;
    assert.equal(body.ok, false);
    if (!body.ok) {
      assert.ok(body.problems.some((problem) => problem.includes("to")));
    }
  });

  it("ignores the legacy anchor param — presets anchor at today", async () => {
    const body = await payload(validFixture().source, { anchor: "2025-01-01" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.window.label, "últimos 6 meses");
    assert.equal(body.window.to, TODAY);
  });

  it("defaults range to 6M and anchors at today (São Paulo)", async () => {
    const body = await payload(validFixture().source);
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.window.label, "últimos 6 meses");
    assert.equal(body.window.to, TODAY);
  });

  it("reports configuration problems instead of crashing", async () => {
    const broken: WebSource = { ok: false, problems: ["PLUGGY_CLIENT_ID is missing."] };
    const response = await handleOverview(broken, new URLSearchParams());
    const body = (await response.json()) as OverviewResponse;
    assert.equal(body.ok, false);
    if (!body.ok) {
      assert.deepEqual(body.problems, ["PLUGGY_CLIENT_ID is missing."]);
    }
  });
});

describe("handleOverview — series, anchor and balances", () => {
  const accounts = [
    bankAccount({ id: ACC_CASH, name: "Conta Nubank", amountCents: 1_843_210 }),
    bankAccount({
      id: ACC_CREDIT,
      name: "Cartão Nubank",
      type: "CREDIT",
      subtype: "CREDIT_CARD",
      amountCents: 352_270,
      credit: { limitCents: 1_000_000, availableLimitCents: 647_730, balanceCloseDate: null, balanceDueDate: null, brand: "Mastercard" },
    }),
  ];
  const rows = [
    row({ id: "t1", localDate: "2026-08-30", amountCents: 984_000, description: "Salário", categoryId: "01000000" }),
    row({ id: "t2", localDate: "2026-08-30", amountCents: -721_435, description: "Aluguel", categoryId: "17000000" }),
    row({ id: "t3", localDate: "2026-08-05", amountCents: -45_900, description: "Mercado", categoryId: "10000000" }),
    row({ id: "t4", localDate: "2026-08-01", amountCents: 100_000, description: "PIX recebido", categoryId: "01000000" }),
    row({ id: "t5", localDate: "2026-07-15", amountCents: -123_000, description: "UBER", categoryId: "19000000" }),
    row({ id: "t6", localDate: "2026-03-01", amountCents: -400_000, description: "Obra", categoryId: "17000000" }),
  ];
  const investments = [
    position({ id: "pos-1", name: "CDB", type: "FIXED_INCOME", balanceCents: 2_990_000 }),
    position({ id: "pos-2", name: "PETR4", type: "STOCKS", balanceCents: 1_157_500 }),
  ];

  it("buckets hand-computed cents into the series and the anchor", async () => {
    const fx = fixture({ accounts, rows, investments });
    const body = await payload(fx.source, { range: "6M" });

    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.deepEqual(body.series.labels, ["Mar", "Abr", "Mai", "Jun", "Jul", "Ago"]);
    assert.deepEqual(body.series.received, [0, 0, 0, 0, 0, 1_084_000]);
    assert.deepEqual(body.series.spent, [400_000, 0, 0, 0, 123_000, 767_335]);

    // The anchor slice covers the whole window — the KPI band and the donut
    // show the selected period's totals, not just the anchor month.
    assert.equal(body.anchor.received, 1_084_000);
    assert.equal(body.anchor.spent, 1_290_335); // 767335 (ago) + 123000 (jul) + 400000 (mar)
    assert.equal(body.anchor.savingsRate, -19.0); // (1084000-1290335)/1084000*100

    assert.deepEqual(
      body.anchor.categories.map((category) => [category.categoryId, category.spentCents, category.count]),
      [
        ["17000000", 1_121_435, 2],
        ["19000000", 123_000, 1],
        ["10000000", 45_900, 1],
      ],
    );
  });

  it("internal transfers never reach the donut, the totals or the savings rate", async () => {
    const fx = fixture({
      accounts: [bankAccount({ id: ACC_CASH, amountCents: 1_843_210 })],
      rows: [
        row({ id: "t1", localDate: "2026-08-10", amountCents: -50_000, description: "Aplicação", categoryId: "03000000" }),
        row({ id: "t2", localDate: "2026-08-11", amountCents: 30_000, description: "Resgate", categoryId: "03000000" }),
        row({ id: "t3", localDate: "2026-08-12", amountCents: 10_000, description: "Rendimento", categoryId: "03060000" }),
        row({ id: "t4", localDate: "2026-08-13", amountCents: -5_000, description: "PIX entre contas", categoryId: "04000000" }),
        row({ id: "t5", localDate: "2026-08-14", amountCents: -1_000, description: "Mercado", categoryId: "10000000" }),
      ],
    });
    const body = await payload(fx.source, { range: "1M" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.anchor.received, 10_000, "the redemption is excluded, the dividend is not");
    assert.equal(body.anchor.spent, 1_000, "the application and the own-account transfer are excluded");
    assert.equal(body.anchor.savingsRate, 90.0);
    assert.deepEqual(
      body.anchor.categories.map((category) => [category.categoryId, category.spentCents]),
      [["10000000", 1_000]],
      "the donut never shows internal transfers",
    );
  });

  it("categories resolve through the core aggregate with pt-BR names", async () => {
    const fx = fixture({ accounts, rows, investments });
    const body = await payload(fx.source, { range: "1M" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    const moradia = body.anchor.categories.find((category) => category.categoryId === "17000000");
    assert.equal(moradia?.name, "Moradia");
    const mercado = body.anchor.categories.find((category) => category.categoryId === "10000000");
    assert.equal(mercado?.name, "Supermercado");
  });

  it("a zero cash balance survives serialization", async () => {
    const fx = fixture({ accounts: [bankAccount({ id: ACC_CASH, amountCents: 0 })], rows: [] });
    const body = await payload(fx.source);
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.balances.cashCents, 0, "a balance of exactly 0 must never disappear");
  });

  it("a row inside the window's month but outside its bounds does not leak into the anchor", async () => {
    const fx = fixture({
      accounts: [bankAccount({ id: ACC_CASH, amountCents: 1_843_210 })],
      rows: [
        row({ id: "t1", localDate: "2026-08-25", amountCents: -100, description: "Dentro", categoryId: "17000000" }),
        row({ id: "t2", localDate: "2026-08-28", amountCents: -9_999, description: "Fora da janela", categoryId: "17000000" }),
        row({ id: "t3", localDate: "2026-07-31", amountCents: -9_999, description: "Mês anterior", categoryId: "17000000" }),
      ],
    });
    const body = await payload(fx.source, { from: "2026-08-01", to: "2026-08-25" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.anchor.spent, 100);
    assert.deepEqual(body.series.spent, [...Array(24).fill(0), 100]);
    const only = body.anchor.categories.filter((category) => category.spentCents > 0);
    assert.equal(only.length, 1);
    assert.equal(only[0]?.spentCents, 100);
  });

  it("savingsRate is null when the period has no income", async () => {
    const fx = fixture({
      accounts: [bankAccount({ id: ACC_CASH, amountCents: 1_843_210 })],
      rows: [row({ id: "t1", localDate: "2026-08-10", amountCents: -500, description: "Só gasto" })],
    });
    const body = await payload(fx.source, { range: "1M" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.anchor.savingsRate, null, "no income → null, never a division artifact");
  });

  it("an unavailable connection is listed with the totals otherwise intact", async () => {
    const fx = fixture({
      accounts: [bankAccount({ id: ACC_CASH, name: "Conta Nubank", amountCents: 1_843_210 })],
      rows: [row({ id: "t1", localDate: "2026-08-10", amountCents: -500, description: "Gasto" })],
      unreachable: { [CONN_2]: new Error("connection down") },
    });
    const body = await payload(fx.source, { range: "1M" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.unavailable.length, 1);
    assert.equal(body.unavailable[0]?.kind, "unavailable");
    assert.ok(body.unavailable[0]?.message.includes(CONN_2));
    assert.equal(body.balances.cashCents, 1_843_210, "the healthy totals survive");
    assert.equal(body.anchor.spent, 500);
    assert.equal(body.sources.length, 1, "only the healthy connection is a source");
  });

  it("reports recent rows bounded at 10, newest first, with resolved categories", async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      row({
        id: `t-${index}`,
        localDate: `2026-08-${String(30 - index).padStart(2, "0")}`,
        amountCents: -(index + 1) * 100,
        description: `Gasto ${index}`,
        categoryId: "17000000",
      }),
    );
    const fx = fixture({ accounts: [bankAccount({ id: ACC_CASH, amountCents: 1_843_210 })], rows: many });
    const body = await payload(fx.source, { range: "6M" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.recent.length, 10);
    assert.equal(body.recent[0]?.localDate, "2026-08-30");
    assert.equal(body.recent[0]?.description, "Gasto 0");
    assert.equal(body.recent[0]?.categoryName, "Moradia");
    assert.ok(
      body.recent.every((row, index) => index === 0 || body.recent[index - 1]!.localDate >= row.localDate),
      "newest first",
    );
  });

  it("carries sources with the cache through date and investments with type bars", async () => {
    const fx = fixture({
      accounts: [bankAccount({ id: ACC_CASH, amountCents: 1_843_210 })],
      rows: [row({ id: "t1", localDate: "2026-08-10", amountCents: -500, description: "Gasto" })],
      investments,
    });
    const body = await payload(fx.source, { range: "6M" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.sources.length, 1);
    assert.equal(body.sources[0]?.institution, "Nubank");
    assert.equal(body.sources[0]?.through, "2026-08-10");

    assert.equal(body.investments.totalCents, 4_147_500);
    assert.equal(body.investments.monthDelta, null, "a month delta over positions alone is not computable");
    assert.deepEqual(
      body.investments.byType.map((row) => [row.name, row.balanceCents]),
      [
        ["Renda fixa", 2_990_000],
        ["Ações", 1_157_500],
      ],
    );
    assert.equal(body.investments.byType[0]?.pct, 72.1);
    assert.equal(body.budgetsMini, null, "demo budgets stay null until ticket 10");
  });
});

describe("handleOverview — custom periods (from/to)", () => {
  function cashFixture(rows: readonly Transaction[]): Fixture {
    return fixture({ accounts: [bankAccount({ id: ACC_CASH, amountCents: 1_843_210 })], rows });
  }

  it("a from-only request is a single-day window with the day payload", async () => {
    const fx = cashFixture([row({ id: "t1", localDate: "2026-08-05", amountCents: -500, description: "Gasto" })]);
    const body = await payload(fx.source, { from: "2026-08-05" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.window.kind, "dia");
    assert.equal(body.window.label, "dia 05/08/2026");
    assert.deepEqual([body.window.from, body.window.to], ["2026-08-05", "2026-08-05"]);
    assert.deepEqual(body.series.labels, ["05/08"]);
    assert.deepEqual(body.series.spent, [500]);
    assert.equal(body.anchor.spent, 500);
    assert.equal(body.recent.length, 1);
  });

  it("from+to builds a daily custom period bounded exactly by the pair", async () => {
    const fx = cashFixture([
      row({ id: "t1", localDate: "2026-08-01", amountCents: -100, description: "Início" }),
      row({ id: "t2", localDate: "2026-08-30", amountCents: 300, description: "Fim" }),
      row({ id: "t3", localDate: "2026-07-31", amountCents: -9_999, description: "Antes" }),
      row({ id: "t4", localDate: "2026-08-31", amountCents: -9_999, description: "Depois" }),
    ]);
    const body = await payload(fx.source, { from: "2026-08-01", to: "2026-08-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.window.kind, "periodo");
    assert.equal(body.window.label, "01/08 – 30/08");
    assert.deepEqual([body.window.from, body.window.to], ["2026-08-01", "2026-08-30"]);
    assert.equal(body.series.labels.length, 30);
    assert.deepEqual(body.series.spent[0], 100);
    assert.deepEqual(body.series.received[29], 300);
    assert.equal(body.anchor.spent, 100);
    assert.equal(body.anchor.received, 300);
    assert.equal(body.recent.length, 2, "the out-of-bounds rows are not even queried");
  });

  it("long custom spans bucket monthly with the first-of-month from", async () => {
    const fx = cashFixture([
      row({ id: "t1", localDate: "2026-07-10", amountCents: -100, description: "Julho" }),
      row({ id: "t2", localDate: "2026-08-30", amountCents: 200, description: "Agosto" }),
      row({ id: "t3", localDate: "2026-06-30", amountCents: -9_999, description: "Junho" }),
    ]);
    const body = await payload(fx.source, { from: "2026-07-10", to: "2026-08-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.equal(body.window.kind, "meses");
    assert.deepEqual([body.window.from, body.window.to], ["2026-07-01", "2026-08-30"]);
    assert.equal(body.window.label, "10/07 – 30/08");
    assert.deepEqual(body.series.labels, ["Jul", "Ago"]);
    assert.deepEqual(body.series.spent, [100, 0]);
    assert.deepEqual(body.series.received, [0, 200]);
    assert.equal(body.anchor.spent, 100);
    assert.equal(body.anchor.received, 200);
  });

  it("inverted from/to are swapped server-side", async () => {
    const fx = cashFixture([row({ id: "t1", localDate: "2026-08-28", amountCents: -100, description: "Gasto" })]);
    const body = await payload(fx.source, { from: "2026-09-02", to: "2026-08-28" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.deepEqual([body.window.from, body.window.to], ["2026-08-28", "2026-09-02"]);
    assert.equal(body.anchor.spent, 100);
  });
});
