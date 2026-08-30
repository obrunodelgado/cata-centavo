import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openDatabase } from "@cata-centavo/storage";
import { createClosingDayStore } from "@cata-centavo/storage";
import { CACHE_MIGRATIONS } from "@cata-centavo/storage";

function setupStore() {
  const db = openDatabase({ path: ":memory:", migrations: CACHE_MIGRATIONS, policy: "rebuild" });
  return { db, store: createClosingDayStore(db) };
}

describe("closing days", () => {
  it("stores a closing day for a card", () => {
    const { db, store } = setupStore();
    try {
      store.set("card-1", 8);

      assert.deepEqual(store.list(), [{ accountId: "card-1", day: 8 }]);
    } finally {
      db.close();
    }
  });

  it("replaces a card's earlier closing day", () => {
    const { db, store } = setupStore();
    try {
      store.set("card-1", 8);
      store.set("card-1", 12);

      assert.deepEqual(store.list(), [{ accountId: "card-1", day: 12 }]);
    } finally {
      db.close();
    }
  });

  it("lists every stored card closing day", () => {
    const { db, store } = setupStore();
    try {
      store.set("card-2", 20);
      store.set("card-1", 8);

      assert.deepEqual(store.list(), [
        { accountId: "card-1", day: 8 },
        { accountId: "card-2", day: 20 },
      ]);
    } finally {
      db.close();
    }
  });

  it("deletes a stored closing day", () => {
    const { db, store } = setupStore();
    try {
      store.set("card-1", 8);

      assert.equal(store.delete("card-1"), 1);
      assert.deepEqual(store.list(), []);
    } finally {
      db.close();
    }
  });

  it("returns zero when deleting an absent card", () => {
    const { db, store } = setupStore();
    try {
      assert.equal(store.delete("missing-card"), 0);
    } finally {
      db.close();
    }
  });
});
