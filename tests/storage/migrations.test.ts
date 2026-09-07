import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MCC_CATEGORIES } from "@cata-centavo/core";
import { openDatabase } from "@cata-centavo/storage";
import { CACHE_MIGRATIONS, DATA_MIGRATIONS } from "@cata-centavo/storage";

describe("CACHE_MIGRATIONS", () => {
  it("seeds one row per MCC mapping", () => {
    const db = openDatabase({ path: ":memory:", migrations: CACHE_MIGRATIONS, policy: "rebuild" });
    const rows = db.prepare("SELECT mcc, category, samples, agreeing FROM mcc_categories ORDER BY mcc").all();
    assert.equal(rows.length, MCC_CATEGORIES.length);
    db.close();
  });

  it("seeds the MCC as the text form the mapper writes", () => {
    const db = openDatabase({ path: ":memory:", migrations: CACHE_MIGRATIONS, policy: "rebuild" });
    const row = db.prepare("SELECT category FROM mcc_categories WHERE mcc = '780'").get();
    assert.equal(row?.["category"], "05000000");
    db.close();
  });
});

describe("DATA_MIGRATIONS", () => {
  it("creates the five tables the derivation and the user's writes read", () => {
    const db = openDatabase({ path: ":memory:", migrations: DATA_MIGRATIONS, policy: "migrate" });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => String(r["name"]));
    assert.deepEqual(tables, ["card_closing_day", "category_overrides", "category_snapshot", "counterparty_categories", "transaction_notes"]);
    db.close();
  });
});
