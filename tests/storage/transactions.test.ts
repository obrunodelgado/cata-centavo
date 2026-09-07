import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";

import type { Logger, TransactionFilter } from "@cata-centavo/core";

import { openDatabase } from "@cata-centavo/storage";
import { CACHE_MIGRATIONS } from "@cata-centavo/storage";
import { createTransactionStore } from "@cata-centavo/storage";
import { fakeLogger } from "../fakes/fake-logger.ts";
import { derived, tx } from "../fakes/transaction-builder.ts";

/** Seven rows chosen so each filter selects a disjoint, named subset. */
const SEED = [
  tx({ id: "jun-1", accountId: "acc-bank", localDate: "2026-06-01", amountCents: -1_000, categoryId: "05020000" }),
  tx({ id: "jun-30", accountId: "acc-bank", localDate: "2026-06-30", amountCents: -2_000, categoryId: "05020000" }),
  tx({ id: "may", accountId: "acc-bank", localDate: "2026-05-31", amountCents: -3_000, categoryId: "05020000" }),
  tx({ id: "jul", accountId: "acc-bank", localDate: "2026-07-01", amountCents: -4_000, categoryId: "05020000" }),
  tx({ id: "food", accountId: "acc-bank", localDate: "2026-05-10", amountCents: -6_000, categoryId: "11000000" }),
  tx({ id: "income", accountId: "acc-bank", localDate: "2026-05-11", amountCents: 9_000, categoryId: "01000000" }),
  tx({ id: "card", accountId: "acc-card", localDate: "2026-05-12", amountCents: -8_000, categoryId: "09000000", accountType: "CREDIT", accountSubtype: "CREDIT_CARD" }),
];

const WIDE_FILTER: TransactionFilter = { accountIds: ["acc-bank", "acc-card"], from: "2000-01-01", to: "2100-01-01" };

function storeAndDbFor(log: Logger = fakeLogger()) {
  const db = openDatabase({ path: ":memory:", migrations: CACHE_MIGRATIONS, policy: "rebuild" });
  return { store: createTransactionStore(db, log), db };
}

function storeFor(log: Logger = fakeLogger()) {
  return storeAndDbFor(log).store;
}


function seededStore() {
  const store = storeFor();
  store.replaceAccount("acc-bank", "conn-1", SEED.filter((row) => row.accountId === "acc-bank"), null);
  store.replaceAccount("acc-card", "conn-1", SEED.filter((row) => row.accountId === "acc-card"), null);
  return store;
}

function filterFor(accountIds: readonly string[]): TransactionFilter {
  return { ...WIDE_FILTER, accountIds };
}

function idsOf(rows: readonly { readonly id: string }[]): readonly string[] {
  return rows.map((row) => row.id);
}

/** Notes are seeded by hand because these tests exercise the read side; the note store owns the write path. */
function insertNote(db: DatabaseSync, transactionId: string, note: string, noteNorm: string): void {
  db.prepare(
    "INSERT INTO userdata.transaction_notes (transaction_id, note, note_norm, created_at, updated_at) VALUES (?, ?, ?, '2026-01-01', '2026-01-01')",
  ).run(transactionId, note, noteNorm);
}

describe("replaceAccount", () => {
  it("deletes rows the walk no longer reports", () => {
    const store = storeFor();
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "a" }), tx({ id: "b" })], "2026-07-26T12:00:00.000Z");

    const deleted = store.replaceAccount("acc-1", "conn-1", [tx({ id: "a" })], "2026-07-27T12:00:00.000Z");

    assert.equal(deleted, 1);
    assert.deepEqual(idsOf(store.query(filterFor(["acc-1"]))), ["a"]);
  });

  it("reports zero deleted rows when a walk converges without removals", () => {
    const store = storeFor();

    assert.equal(store.replaceAccount("acc-1", "conn-1", [tx({ id: "a" })], null), 0);
  });

  it("does not touch another account's rows", () => {
    const store = storeFor();
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "a", accountId: "acc-1" })], null);
    store.replaceAccount("acc-2", "conn-1", [tx({ id: "b", accountId: "acc-2" })], null);

    store.replaceAccount("acc-1", "conn-1", [], null);

    assert.equal(store.query(filterFor(["acc-2"])).length, 1);
  });

  it("is idempotent", () => {
    const store = storeFor();
    const rows = [tx({ id: "a" }), tx({ id: "b" })];

    store.replaceAccount("acc-1", "conn-1", rows, null);
    store.replaceAccount("acc-1", "conn-1", rows, null);

    assert.equal(store.query(filterFor(["acc-1"])).length, 2);
  });

  it("updates a row whose amount changed between walks", () => {
    const store = storeFor();
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "a", amountCents: -1_000 })], null);

    store.replaceAccount("acc-1", "conn-1", [tx({ id: "a", amountCents: -1_500 })], null);

    assert.equal(store.query(filterFor(["acc-1"]))[0]?.amountCents, -1_500);
  });

  it("rolls back and leaves the previous state when a row is rejected", () => {
    const store = storeFor();
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "a" })], null);

    assert.throws(() => store.replaceAccount("acc-1", "conn-1", [tx({ id: "b", localDate: null as never })], null));
    assert.deepEqual(idsOf(store.query(filterFor(["acc-1"]))), ["a"]);

    store.replaceAccount("acc-1", "conn-1", [tx({ id: "c" })], null);
    assert.deepEqual(idsOf(store.query(filterFor(["acc-1"]))), ["c"]);
  });

  it("round-trips every field, including the detail columns", () => {
    const store = storeFor();
    const row = tx({ id: "a", mcc: "5814", billId: "bill-1", billForecastDate: "2026-09", instalmentNumber: 3, instalmentTotal: 12, document: "12345678900", counterpartyName: "MARIA", paymentMethod: "PIX", originalAmountCents: -2_000, originalCurrency: "USD", purchaseDate: "2026-04-20" });

    store.replaceAccount("acc-1", "conn-1", [row], null);

    assert.deepEqual(store.query(filterFor(["acc-1"]))[0], {
      ...row,
      category: "01000000",
      categorySrc: "pluggy",
      note: null,
    });
  });

  it("re-reads bill_forecast_date after an upsert of the same id", () => {
    const store = storeFor();
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "t-1", billForecastDate: null })], null);
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "t-1", billForecastDate: "2026-09" })], null);

    assert.equal(store.query(filterFor(["acc-1"]))[0]?.billForecastDate, "2026-09");
  });

});

describe("syncedLastUpdatedAt", () => {
  it("is undefined before the first walk", () => {
    assert.equal(storeFor().syncedLastUpdatedAt("acc-1"), undefined);
  });

  const FRESHNESS_CASES: readonly { readonly name: string; readonly stamp: string | null }[] = [
    { name: "a known update time round-trips", stamp: "2026-07-26T12:00:00.000Z" },
    { name: "an unknown update time is stored as null, not absent", stamp: null },
  ];

  for (const { name, stamp } of FRESHNESS_CASES) {
    it(name, () => {
      const store = storeFor();
      store.replaceAccount("acc-1", "conn-1", [], stamp);
      assert.equal(store.syncedLastUpdatedAt("acc-1"), stamp);
    });
  }
});

describe("query", () => {
  const QUERY_CASES: readonly { readonly name: string; readonly filter: Partial<TransactionFilter>; readonly ids: readonly string[] }[] = [
    { name: "bounds the range inclusively at both ends", filter: { from: "2026-06-01", to: "2026-06-30" }, ids: ["jun-30", "jun-1"] },
    { name: "filters by several categories", filter: { categories: ["11000000", "01000000"] }, ids: ["income", "food"] },

    { name: "filters by minimum signed amount", filter: { minAmountCents: -5_000 }, ids: ["jul", "jun-30", "jun-1", "may", "income"] },
    { name: "filters by maximum signed amount", filter: { maxAmountCents: -5_000 }, ids: ["card", "food"] },
    { name: "filters by account type", filter: { accountType: "CREDIT" }, ids: ["card"] },
    { name: "filters by account subtype", filter: { accountSubtype: "CREDIT_CARD" }, ids: ["card"] },
    { name: "filters by account id", filter: { accountIds: ["acc-card"] }, ids: ["card"] },
    { name: "combines filters with AND", filter: { accountType: "CREDIT", categories: ["11000000"] }, ids: [] },
  ];

  for (const { name, filter, ids } of QUERY_CASES) {
    it(name, () => {
      assert.deepEqual(idsOf(seededStore().query({ ...WIDE_FILTER, ...filter })), ids);
    });
  }

  it("returns no rows for an empty account filter", () => {
    assert.deepEqual(seededStore().query({ ...WIDE_FILTER, accountIds: [] }), []);
  });

  it("returns no rows for an explicitly empty category filter", () => {
    assert.deepEqual(seededStore().query({ ...WIDE_FILTER, categories: [] }), []);
  });

  it("orders by date descending and breaks ties on id descending", () => {
    const store = storeFor();
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "b", localDate: "2026-06-01" }), tx({ id: "a", localDate: "2026-06-01" }), tx({ id: "c", localDate: "2026-06-02" })], null);

    assert.deepEqual(idsOf(store.query(filterFor(["acc-1"]))), ["c", "b", "a"]);
  });

  it("pages with a keyset without repeating or skipping a row", () => {
    const store = seededStore();
    const first = store.query({ ...WIDE_FILTER, limit: 3 });
    const last = first.at(-1);
    assert.ok(last);

    const second = store.query({ ...WIDE_FILTER, limit: 3, after: { localDate: last.localDate, id: last.id } });

    assert.equal(new Set([...idsOf(first), ...idsOf(second)]).size, 6);
  });
});


describe("search (q)", () => {
  const SEARCH_SEED = [
    tx({ id: "mercado", accountId: "acc-bank", localDate: "2026-05-01", description: "PAG* Mercado Livre LTDA", descriptionNorm: "MERCADO LIVRE" }),
    tx({ id: "farmacia", accountId: "acc-bank", localDate: "2026-05-02", description: "Farmácia São Paulo", descriptionNorm: "FARMACIA SAO PAULO" }),
    tx({ id: "counterparty", accountId: "acc-bank", localDate: "2026-05-03", document: "12345678900", counterpartyName: "Escola Saber Ltda" }),
    tx({ id: "pct", accountId: "acc-bank", localDate: "2026-05-04", description: "100% OK", descriptionNorm: "100% OK" }),
    tx({ id: "digits", accountId: "acc-bank", localDate: "2026-05-05", description: "1000 OK", descriptionNorm: "1000 OK" }),
    tx({ id: "other", accountId: "acc-card", localDate: "2026-05-06", description: "UBER TRIP", descriptionNorm: "UBER TRIP", accountType: "CREDIT" }),
  ];

  function searchStore() {
    const store = storeFor();
    store.replaceAccount("acc-bank", "conn-1", SEARCH_SEED.filter((row) => row.accountId === "acc-bank"), null);
    store.replaceAccount("acc-card", "conn-1", SEARCH_SEED.filter((row) => row.accountId === "acc-card"), null);
    return store;
  }

  const SEARCH_CASES: readonly { readonly name: string; readonly q: string; readonly ids: readonly string[] }[] = [
    { name: "matches the description case-insensitively", q: "mercado", ids: ["mercado"] },
    { name: "matches the description accent-insensitively through description_norm", q: "farmacia", ids: ["farmacia"] },
    { name: "matches an accented query against the normalized description", q: "farmácia", ids: ["farmacia"] },
    { name: "matches the counterparty case-insensitively", q: "ESCOLA saber", ids: ["counterparty"] },
    { name: "escapes % so it matches literally", q: "100%", ids: ["pct"] },
    { name: "escapes _ so it matches literally", q: "100_", ids: [] },
    { name: "finds nothing for a term no field holds", q: "netflix", ids: [] },
  ];

  for (const { name, q, ids } of SEARCH_CASES) {
    it(name, () => {
      assert.deepEqual(idsOf(searchStore().query({ ...WIDE_FILTER, q })), ids);
    });
  }

  it("an absent q filters nothing", () => {
    assert.equal(searchStore().query({ ...WIDE_FILTER }).length, SEARCH_SEED.length);
  });

  it("a whitespace-only q filters nothing", () => {
    assert.equal(searchStore().query({ ...WIDE_FILTER, q: "   " }).length, SEARCH_SEED.length);
  });

  it("combines with the other filters with AND", () => {
    const store = searchStore();
    assert.deepEqual(idsOf(store.query({ ...WIDE_FILTER, q: "mercado", categories: ["10000000"] })), []);
    assert.deepEqual(idsOf(store.query({ ...WIDE_FILTER, q: "mercado", accountIds: ["acc-card"] })), []);
  });

  it("pages a searched window without repeating or skipping a row", () => {
    const store = searchStore();
    const first = store.query({ ...WIDE_FILTER, q: "a", limit: 2 });
    const last = first.at(-1);
    assert.ok(last);

    const second = store.query({ ...WIDE_FILTER, q: "a", limit: 2, after: { localDate: last.localDate, id: last.id } });

    assert.equal(new Set([...idsOf(first), ...idsOf(second)]).size, 3);
  });
});

describe("note on reads", () => {
  function notedStore() {
    const { store, db } = storeAndDbFor();
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "tx-1" }), tx({ id: "tx-2" })], null);
    insertNote(db, "tx-1", "Reajuste IGP-M aplicado em março", "REAJUSTE IGP-M APLICADO EM MARCO");
    return store;
  }

  it("carries the note on query rows and leaves unannotated rows null", () => {
    const rows = notedStore().query(filterFor(["acc-1"]));

    assert.deepEqual(rows.find((row) => row.id === "tx-1"), derived({ id: "tx-1", note: "Reajuste IGP-M aplicado em março" }));
    assert.equal(rows.find((row) => row.id === "tx-2")?.note, null);
  });

  it("carries the note on byIds rows", () => {
    const rows = notedStore().byIds(["tx-1", "tx-2"]);

    assert.deepEqual(rows.find((row) => row.id === "tx-1"), derived({ id: "tx-1", note: "Reajuste IGP-M aplicado em março" }));
    assert.equal(rows.find((row) => row.id === "tx-2")?.note, null);
  });
});

describe("search (q) over notes", () => {
  function notedSearchStore() {
    const { store, db } = storeAndDbFor();
    store.replaceAccount("acc-bank", "conn-1", [
      tx({ id: "reajuste", accountId: "acc-bank", description: "Tarifa bancária", descriptionNorm: "TARIFA BANCARIA" }),
      tx({ id: "reuniao", accountId: "acc-bank", description: "Transferência recebida", descriptionNorm: "TRANSFERENCIA RECEBIDA" }),
      tx({ id: "pct", accountId: "acc-bank", description: "Compra aprovada", descriptionNorm: "COMPRA APROVADA" }),
      tx({ id: "digits", accountId: "acc-bank", description: "500 OK", descriptionNorm: "500 OK" }),
    ], null);
    insertNote(db, "reajuste", "Reajuste IGP-M aplicado em março", "REAJUSTE IGP-M APLICADO EM MARCO");
    insertNote(db, "reuniao", "Reunião com o contador", "REUNIAO COM O CONTADOR");
    insertNote(db, "pct", "50% de desconto", "50% DE DESCONTO");
    return store;
  }

  const NOTE_SEARCH_CASES: readonly { readonly name: string; readonly q: string; readonly ids: readonly string[] }[] = [
    { name: "matches the note case-insensitively", q: "reajuste", ids: ["reajuste"] },
    { name: "matches the note accent-insensitively through note_norm", q: "reuniao", ids: ["reuniao"] },
    { name: "matches an accented query against the normalized note", q: "reunião", ids: ["reuniao"] },
    { name: "escapes % so it matches the note literally", q: "50%", ids: ["pct"] },
    { name: "escapes _ so a wildcard reading of the note finds nothing", q: "50_", ids: [] },
    { name: "finds nothing for a term no field holds", q: "netflix", ids: [] },
  ];

  for (const { name, q, ids } of NOTE_SEARCH_CASES) {
    it(name, () => {
      assert.deepEqual(idsOf(notedSearchStore().query({ ...WIDE_FILTER, q })), ids);
    });
  }
});

describe("byIds", () => {
  it("returns the requested rows and handles an empty request", () => {
    const store = seededStore();

    assert.deepEqual(idsOf(store.byIds(["food", "card"])), ["card", "food"]);
    assert.deepEqual(store.byIds([]), []);
  });
});

describe("cardRows", () => {
  it("returns rows outside any date window, ordered oldest first", () => {
    const store = storeFor();
    store.replaceAccount("card-1", "conn-1", [
      tx({ id: "future", accountId: "card-1", localDate: "2026-11-25" }),
      tx({ id: "past", accountId: "card-1", localDate: "2025-07-31" }),
    ], null);
    store.replaceAccount("card-2", "conn-1", [tx({ id: "other", accountId: "card-2" })], null);

    assert.deepEqual(idsOf(store.cardRows("card-1")), ["past", "future"]);
  });
});

describe("dataThrough", () => {
  it("reports where the data stops, ignoring future instalments", () => {
    const store = storeFor();
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "past", localDate: "2026-07-08" }), tx({ id: "future", localDate: "2026-10-01" })], null);

    assert.equal(store.dataThrough(["acc-1"], "2026-07-26").get("conn-1"), "2026-07-08");
  });

  it("omits a connection with no cached rows rather than reporting a false date", () => {
    assert.equal(storeFor().dataThrough(["acc-1"], "2026-07-26").size, 0);
  });

  it("returns no connections for an empty account list", () => {
    assert.equal(seededStore().dataThrough([], "2026-07-26").size, 0);
  });
});

describe("top_category_id write-time roll-up", () => {
  it("stores the top-level ancestor of the leaf Pluggy sent", () => {
    const { store, db } = storeAndDbFor();
    store.replaceAccount("acc-1", "conn-1", [tx({ id: "a", categoryId: "11010000" })], null);

    const row = db.prepare("SELECT top_category_id FROM transactions WHERE id = 'a'").get();
    assert.equal(row?.["top_category_id"], "11000000");
  });

  it("keeps the leaf and warns when the tree does not know it, instead of failing the walk", () => {
    const log = fakeLogger();
    const { store, db } = storeAndDbFor(log);

    store.replaceAccount("acc-1", "conn-1", [tx({ id: "a", categoryId: "77770000" })], null);

    const row = db.prepare("SELECT category_id, top_category_id FROM transactions WHERE id = 'a'").get();
    assert.equal(row?.["category_id"], "77770000");
    assert.equal(row?.["top_category_id"], null);
    assert.ok(log.lines.some((line) => line.level === "warn" && line.message.includes("category")));
  });

  it("stores no top-level category for an uncategorized row", () => {
    const { store, db } = storeAndDbFor();

    store.replaceAccount("acc-1", "conn-1", [tx({ id: "a", categoryId: null })], null);

    const row = db.prepare("SELECT category_id, top_category_id FROM transactions WHERE id = 'a'").get();
    assert.equal(row?.["category_id"], null);
    assert.equal(row?.["top_category_id"], null);
  });
});
