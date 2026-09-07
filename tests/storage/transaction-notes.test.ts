import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CACHE_MIGRATIONS, openDatabase, openDatabases } from "@cata-centavo/storage";
import { createTransactionNoteStore } from "@cata-centavo/storage";
import { createTransactionStore } from "@cata-centavo/storage";

import { tx } from "../fakes/transaction-builder.ts";
import { fakeLogger } from "../fakes/fake-logger.ts";

function setupStore() {
  const db = openDatabase({ path: ":memory:", migrations: CACHE_MIGRATIONS, policy: "rebuild" });
  const cache = createTransactionStore(db, fakeLogger());
  const notes = createTransactionNoteStore(db);
  const seed = (id: string) => cache.replaceAccount("acc-1", "conn-1", [tx({ id })], null);
  return { db, notes, seed };
}

describe("transaction notes", () => {
  it("stores a trimmed note for a cached transaction", () => {
    const { db, notes, seed } = setupStore();
    try {
      seed("tx-1");

      const result = notes.set("tx-1", "  presente da Marina  ");

      assert.deepEqual(result, { transactionId: "tx-1", note: "presente da Marina", known: true });
      const row = db.prepare("SELECT note, note_norm FROM userdata.transaction_notes WHERE transaction_id = 'tx-1'").get();
      assert.equal(row?.["note"], "presente da Marina");
      assert.equal(row?.["note_norm"], "PRESENTE DA MARINA");
    } finally {
      db.close();
    }
  });

  it("replaces an earlier note", () => {
    const { db, notes, seed } = setupStore();
    try {
      seed("tx-1");
      notes.set("tx-1", "primeira versão");
      notes.set("tx-1", "reajuste IGP-M aplicado em março");

      assert.deepEqual(notes.set("tx-1", "reajuste IGP-M aplicado em março"), {
        transactionId: "tx-1",
        note: "reajuste IGP-M aplicado em março",
        known: true,
      });
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.transaction_notes").get();
      assert.equal(rows?.["n"], 1);
    } finally {
      db.close();
    }
  });

  it("folds accents into note_norm so search can match without them", () => {
    const { db, notes, seed } = setupStore();
    try {
      seed("tx-1");
      notes.set("tx-1", "Reunião com o contador");

      const row = db.prepare("SELECT note_norm FROM userdata.transaction_notes WHERE transaction_id = 'tx-1'").get();
      assert.equal(row?.["note_norm"], "REUNIAO COM O CONTADOR");
    } finally {
      db.close();
    }
  });

  it("clears the note when the value trims to empty", () => {
    const { db, notes, seed } = setupStore();
    try {
      seed("tx-1");
      notes.set("tx-1", "anotação");

      const result = notes.set("tx-1", "   ");

      assert.deepEqual(result, { transactionId: "tx-1", note: null, known: true });
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.transaction_notes").get();
      assert.equal(rows?.["n"], 0);
    } finally {
      db.close();
    }
  });

  it("clears the note when asked with null", () => {
    const { db, notes, seed } = setupStore();
    try {
      seed("tx-1");
      notes.set("tx-1", "anotação");

      assert.deepEqual(notes.set("tx-1", null), { transactionId: "tx-1", note: null, known: true });
    } finally {
      db.close();
    }
  });

  it("reports a stale transaction id instead of writing it", () => {
    const { db, notes } = setupStore();
    try {
      const result = notes.set("missing-tx", "anotação órfã");

      assert.deepEqual(result, { transactionId: "missing-tx", note: null, known: false });
      const rows = db.prepare("SELECT COUNT(*) AS n FROM userdata.transaction_notes").get();
      assert.equal(rows?.["n"], 0);
    } finally {
      db.close();
    }
  });

  it("keeps notes when the transaction cache is rebuilt", () => {
    const dir = mkdtempSync(join(tmpdir(), "cata-note-test-"));
    const paths = { cacheDb: join(dir, "cache.db"), dataDb: join(dir, "data.db"), logFile: join(dir, "app.log") };
    try {
      const first = openDatabases(paths);
      const cache = createTransactionStore(first.db, fakeLogger());
      const notes = createTransactionNoteStore(first.db);
      cache.replaceAccount("acc-1", "conn-1", [tx({ id: "tx-1" })], null);
      notes.set("tx-1", "compra do mês + limpeza");
      first.close();

      const reopened = openDatabases(paths);
      try {
        const row = reopened.db.prepare("SELECT note FROM userdata.transaction_notes WHERE transaction_id = 'tx-1'").get();
        assert.equal(row?.["note"], "compra do mês + limpeza");
      } finally {
        reopened.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
