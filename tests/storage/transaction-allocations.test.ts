import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CACHE_MIGRATIONS, createTransactionSplitStore, openDatabase, createTransactionStore } from "@cata-centavo/storage";

import { tx } from "../fakes/transaction-builder.ts";
import { fakeLogger } from "../fakes/fake-logger.ts";

/**
 * The alocações of one saque (ADR-0004): one row per category, merged on write,
 * summing to at most the saque's value. Only a recognised saque is splittable,
 * an empty array is the undo, and a refused write leaves the previous state.
 */

const SAQUE = { categoryId: "04010000", amountCents: -50_000 };

function setupStore() {
  const db = openDatabase({ path: ":memory:", migrations: CACHE_MIGRATIONS, policy: "rebuild" });
  const cache = createTransactionStore(db, fakeLogger());
  const splits = createTransactionSplitStore(db);
  const seedSaque = (id: string, amountCents = -50_000) =>
    cache.replaceAccount("acc-1", "conn-1", [tx({ id, ...SAQUE, amountCents })], null);
  const stored = (id: string) =>
    db
      .prepare("SELECT category, amount_cents FROM userdata.transaction_allocations WHERE transaction_id = ? ORDER BY category")
      .all(id)
      .map((row) => ({ categoryId: String(row["category"]), amountCents: Number(row["amount_cents"]) }));
  return { db, splits, seedSaque, stored };
}

describe("transaction splits", () => {
  it("stores the alocações of a recognised saque, merged by category", () => {
    const { db, splits, seedSaque, stored } = setupStore();
    try {
      seedSaque("tx-1");

      const result = splits.set("tx-1", [
        { categoryId: "11000000", amountCents: 30_000 },
        { categoryId: "18000000", amountCents: 15_000 },
        { categoryId: "11000000", amountCents: 5_000 },
      ]);

      assert.deepEqual(result, {
        transactionId: "tx-1",
        known: true,
        allocations: [
          { categoryId: "11000000", amountCents: 5_000 },
          { categoryId: "18000000", amountCents: 15_000 },
        ],
        problem: null,
      });
      assert.deepEqual(stored("tx-1"), [
        { categoryId: "11000000", amountCents: 5_000 },
        { categoryId: "18000000", amountCents: 15_000 },
      ]);
    } finally {
      db.close();
    }
  });

  it("replaces the whole split on the next write", () => {
    const { db, splits, seedSaque, stored } = setupStore();
    try {
      seedSaque("tx-1");
      splits.set("tx-1", [{ categoryId: "11000000", amountCents: 30_000 }]);

      const result = splits.set("tx-1", [{ categoryId: "19000000", amountCents: 50_000 }]);

      assert.deepEqual(result.allocations, [{ categoryId: "19000000", amountCents: 50_000 }]);
      assert.deepEqual(stored("tx-1"), [{ categoryId: "19000000", amountCents: 50_000 }]);
    } finally {
      db.close();
    }
  });

  it("an empty array is the undo", () => {
    const { db, splits, seedSaque } = setupStore();
    try {
      seedSaque("tx-1");
      splits.set("tx-1", [{ categoryId: "11000000", amountCents: 30_000 }]);

      const result = splits.set("tx-1", []);

      assert.deepEqual(result, { transactionId: "tx-1", known: true, allocations: [], problem: null });
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.transaction_allocations").get();
      assert.equal(rows?.["n"], 0);
    } finally {
      db.close();
    }
  });

  it("refuses a split whose sum overflows the saque", () => {
    const { db, splits, seedSaque, stored } = setupStore();
    try {
      seedSaque("tx-1");
      splits.set("tx-1", [{ categoryId: "11000000", amountCents: 30_000 }]);

      const result = splits.set("tx-1", [
        { categoryId: "11000000", amountCents: 40_000 },
        { categoryId: "18000000", amountCents: 20_000 },
      ]);

      assert.deepEqual(result, { transactionId: "tx-1", known: true, allocations: [], problem: "over" });
      assert.deepEqual(stored("tx-1"), [{ categoryId: "11000000", amountCents: 30_000 }]);
    } finally {
      db.close();
    }
  });

  it("accepts a split that sums exactly to the saque", () => {
    const { db, splits, seedSaque } = setupStore();
    try {
      seedSaque("tx-1");

      const result = splits.set("tx-1", [{ categoryId: "11000000", amountCents: 50_000 }]);

      assert.equal(result.problem, null);
      assert.deepEqual(result.allocations, [{ categoryId: "11000000", amountCents: 50_000 }]);
    } finally {
      db.close();
    }
  });

  it("refuses a split on a row the recognition does not name as a saque", () => {
    const { db, splits, stored } = setupStore();
    try {
      db
        .prepare("INSERT INTO transactions (id, account_id, connection_id, account_type, occurred_at, local_date, amount_cents, currency, description, description_norm) VALUES ('tx-2', 'acc-1', 'conn-1', 'BANK', '2026-06-15T03:00:00.000Z', '2026-06-15', -1000, 'BRL', 'Compra', 'COMPRA')")
        .run();

      const result = splits.set("tx-2", [{ categoryId: "11000000", amountCents: 500 }]);

      assert.deepEqual(result, { transactionId: "tx-2", known: true, allocations: [], problem: "not-saque" });
      assert.deepEqual(stored("tx-2"), []);
    } finally {
      db.close();
    }
  });

  it("reports a stale transaction id instead of writing it", () => {
    const { db, splits } = setupStore();
    try {
      const result = splits.set("missing-tx", [{ categoryId: "11000000", amountCents: 500 }]);

      assert.deepEqual(result, { transactionId: "missing-tx", known: false, allocations: [], problem: null });
    } finally {
      db.close();
    }
  });
});
