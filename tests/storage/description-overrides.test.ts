import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CACHE_MIGRATIONS, createDescriptionOverrideStore, createTransactionStore, openDatabase } from "@cata-centavo/storage";

import { tx } from "../fakes/transaction-builder.ts";
import { fakeLogger } from "../fakes/fake-logger.ts";

/**
 * The description renames (Q9): the bulk write keyed by the edited row's wire
 * `description_norm`. The count is the toast's number; a stale id is reported;
 * an empty name is refused.
 */

function setupStore() {
  const db = openDatabase({ path: ":memory:", migrations: CACHE_MIGRATIONS, policy: "rebuild" });
  const cache = createTransactionStore(db, fakeLogger());
  const renames = createDescriptionOverrideStore(db);
  const seed = (rows: readonly { readonly id: string; readonly description: string }[]) =>
    cache.replaceAccount(
      "acc-1",
      "conn-1",
      rows.map((row) => tx({ id: row.id, description: row.description, descriptionNorm: row.description.toUpperCase() })),
      null,
    );
  const overrideFor = (id: string) =>
    db.prepare("SELECT description FROM userdata.description_overrides WHERE transaction_id = ?").get(id)?.["description"];
  return { db, renames, seed, overrideFor };
}

describe("description renames", () => {
  it("renames every cached row sharing the edited row's wire description", () => {
    const { db, renames, seed, overrideFor } = setupStore();
    try {
      seed([
        { id: "tx-1", description: "Saque SAQUE DIGITAL CXE 46247373" },
        { id: "tx-2", description: "Saque SAQUE DIGITAL CXE 46247373" },
        { id: "tx-3", description: "UBER — ida ao escritório" },
      ]);

      const result = renames.set("tx-1", "  Saque para a feira  ");

      assert.deepEqual(result, { transactionId: "tx-1", known: true, updated: 2, description: "Saque para a feira", problem: null });
      assert.equal(overrideFor("tx-1"), "Saque para a feira");
      assert.equal(overrideFor("tx-2"), "Saque para a feira");
      assert.equal(overrideFor("tx-3"), undefined);
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.description_overrides").get();
      assert.equal(rows?.["n"], 2);
    } finally {
      db.close();
    }
  });

  it("matches on the wire description, never on a name a previous rename gave", () => {
    const { db, renames, seed, overrideFor } = setupStore();
    try {
      seed([
        { id: "tx-1", description: "Saque SAQUE DIGITAL CXE 46247373" },
        { id: "tx-2", description: "Saque SAQUE DIGITAL CXE 46247373" },
      ]);
      renames.set("tx-1", "Saque para a feira");

      renames.set("tx-1", "Saque da semana");

      assert.equal(overrideFor("tx-1"), "Saque da semana");
      assert.equal(overrideFor("tx-2"), "Saque da semana");
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.description_overrides").get();
      assert.equal(rows?.["n"], 2);
    } finally {
      db.close();
    }
  });

  it("refuses an empty name without writing anything", () => {
    const { db, renames, seed } = setupStore();
    try {
      seed([{ id: "tx-1", description: "Saque SAQUE DIGITAL CXE 46247373" }]);

      const result = renames.set("tx-1", "   ");

      assert.deepEqual(result, { transactionId: "tx-1", known: true, updated: 0, description: "", problem: "empty" });
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.description_overrides").get();
      assert.equal(rows?.["n"], 0);
    } finally {
      db.close();
    }
  });

  it("reports a stale transaction id instead of writing it", () => {
    const { db, renames } = setupStore();
    try {
      const result = renames.set("missing-tx", "Nome órfão");

      assert.deepEqual(result, { transactionId: "missing-tx", known: false, updated: 0, description: "Nome órfão", problem: null });
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.description_overrides").get();
      assert.equal(rows?.["n"], 0);
    } finally {
      db.close();
    }
  });
});
