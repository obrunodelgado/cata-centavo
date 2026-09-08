import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CACHE_MIGRATIONS, createSaqueMarkStore, openDatabase, createTransactionStore } from "@cata-centavo/storage";

import { tx } from "../fakes/transaction-builder.ts";
import { fakeLogger } from "../fakes/fake-logger.ts";

/**
 * The saque marks (ADR-0004): the user's correction to the recognition. The
 * store owns the sign rule and reports stale ids; `"none"` is a stored denial,
 * so every mark is an upsert and nothing returns to the derivation silently.
 */

function setupStore(seedOverrides: Parameters<typeof tx>[0] = {}) {
  const db = openDatabase({ path: ":memory:", migrations: CACHE_MIGRATIONS, policy: "rebuild" });
  const cache = createTransactionStore(db, fakeLogger());
  const marks = createSaqueMarkStore(db);
  const seed = (id: string) => cache.replaceAccount("acc-1", "conn-1", [tx({ id, ...seedOverrides })], null);
  return { db, marks, seed };
}

describe("saque marks", () => {
  it("stores a saque mark on a negative CASH-leaf row", () => {
    const { db, marks, seed } = setupStore({ categoryId: "04010000", amountCents: -50_000 });
    try {
      seed("tx-1");

      const result = marks.set("tx-1", "saque");

      assert.deepEqual(result, { transactionId: "tx-1", known: true, recognised: "saque", problem: null });
      const row = db.prepare("SELECT recognised FROM userdata.saque_marks WHERE transaction_id = 'tx-1'").get();
      assert.equal(row?.["recognised"], "saque");
    } finally {
      db.close();
    }
  });

  it("refuses a saque mark on money coming in", () => {
    const { db, marks, seed } = setupStore({ categoryId: "04010000", amountCents: 26_000 });
    try {
      seed("tx-1");

      const result = marks.set("tx-1", "saque");

      assert.deepEqual(result, { transactionId: "tx-1", known: true, recognised: null, problem: "sign" });
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.saque_marks").get();
      assert.equal(rows?.["n"], 0);
    } finally {
      db.close();
    }
  });

  it("refuses an estorno mark on money going out", () => {
    const { db, marks, seed } = setupStore({ categoryId: "04010000", amountCents: -50_000 });
    try {
      seed("tx-1");

      const result = marks.set("tx-1", "estorno");

      assert.deepEqual(result, { transactionId: "tx-1", known: true, recognised: null, problem: "sign" });
    } finally {
      db.close();
    }
  });

  it("stores an estorno mark on a positive row and reports it", () => {
    const { db, marks, seed } = setupStore({ categoryId: "04010000", amountCents: 26_000 });
    try {
      seed("tx-1");

      assert.deepEqual(marks.set("tx-1", "estorno"), { transactionId: "tx-1", known: true, recognised: "estorno", problem: null });
      const row = db.prepare("SELECT recognised FROM userdata.saque_marks WHERE transaction_id = 'tx-1'").get();
      assert.equal(row?.["recognised"], "estorno");
    } finally {
      db.close();
    }
  });

  it("a stored denial keeps a leaf row unrecognised", () => {
    const { db, marks, seed } = setupStore({ categoryId: "04010000", amountCents: -50_000 });
    try {
      seed("tx-1");

      const result = marks.set("tx-1", "none");

      assert.deepEqual(result, { transactionId: "tx-1", known: true, recognised: null, problem: null });
      const row = db.prepare("SELECT recognised FROM userdata.saque_marks WHERE transaction_id = 'tx-1'").get();
      assert.equal(row?.["recognised"], "none");
    } finally {
      db.close();
    }
  });

  it("a mark on a row the leaf would miss still recognises it", () => {
    const { db, marks, seed } = setupStore({ categoryId: "05000000", amountCents: -50_000 });
    try {
      seed("tx-1");

      assert.deepEqual(marks.set("tx-1", "saque"), { transactionId: "tx-1", known: true, recognised: "saque", problem: null });
    } finally {
      db.close();
    }
  });

  it("reports a stale transaction id instead of writing it", () => {
    const { db, marks } = setupStore();
    try {
      const result = marks.set("missing-tx", "saque");

      assert.deepEqual(result, { transactionId: "missing-tx", known: false, recognised: null, problem: null });
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.saque_marks").get();
      assert.equal(rows?.["n"], 0);
    } finally {
      db.close();
    }
  });

  it("replaces an earlier mark", () => {
    const { db, marks, seed } = setupStore({ categoryId: "04010000", amountCents: -50_000 });
    try {
      seed("tx-1");
      marks.set("tx-1", "saque");

      const result = marks.set("tx-1", "none");

      assert.deepEqual(result, { transactionId: "tx-1", known: true, recognised: null, problem: null });
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.saque_marks").get();
      assert.equal(rows?.["n"], 1);
    } finally {
      db.close();
    }
  });
});
