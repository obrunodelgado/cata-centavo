import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadConfig, resolvePaths } from "../../apps/web/lib/server/config.ts";

const SYSTEM = { platform: "darwin", home: "/Users/test" };

describe("loadConfig", () => {
  it("collects every missing variable in one run", () => {
    const result = loadConfig({});
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.problems.some((p) => p.includes("PLUGGY_CLIENT_ID")), "mentions client id");
    assert.ok(result.problems.some((p) => p.includes("PLUGGY_CLIENT_SECRET")), "mentions client secret");
    assert.ok(result.problems.some((p) => p.includes("PLUGGY_ITEM_IDS")), "mentions item ids");
  });

  it("strips surrounding quotes and whitespace from tokens", () => {
    const result = loadConfig({
      PLUGGY_CLIENT_ID: '" client-id "',
      PLUGGY_CLIENT_SECRET: "'secret'",
      PLUGGY_ITEM_IDS: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.config.credentials.clientId, "client-id");
    assert.equal(result.config.credentials.clientSecret, "secret");
  });

  it("reports malformed and duplicate ids, both", () => {
    const result = loadConfig({
      PLUGGY_CLIENT_ID: "c",
      PLUGGY_CLIENT_SECRET: "s",
      PLUGGY_ITEM_IDS: "not-a-uuid,11111111-1111-4111-8111-111111111111,11111111-1111-4111-8111-111111111111",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.problems.filter((p) => p.includes("not a connection id")).length, 1);
    assert.equal(result.problems.filter((p) => p.includes("duplicate id")).length, 1);
  });

  it("accepts comma, semicolon and newline separators", () => {
    const result = loadConfig({
      PLUGGY_CLIENT_ID: "c",
      PLUGGY_CLIENT_SECRET: "s",
      PLUGGY_ITEM_IDS: "11111111-1111-4111-8111-111111111111\n22222222-2222-4222-8222-222222222222;33333333-3333-4333-8333-333333333333",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.config.itemIds.length, 3);
  });
});

describe("resolvePaths", () => {
  it("falls back to macOS cache and application support homes", () => {
    const paths = resolvePaths({}, SYSTEM);
    assert.equal(paths.cacheDb, "/Users/test/Library/Caches/cata-centavo/cache.db");
    assert.equal(paths.dataDb, "/Users/test/Library/Application Support/cata-centavo/data.db");
  });

  it("honours absolute XDG overrides", () => {
    const paths = resolvePaths(
      { XDG_CACHE_HOME: "/tmp/cache", XDG_DATA_HOME: "/tmp/data" },
      { platform: "linux", home: "/home/test" },
    );
    assert.equal(paths.cacheDb, "/tmp/cache/cata-centavo/cache.db");
    assert.equal(paths.dataDb, "/tmp/data/cata-centavo/data.db");
  });

  it("ignores relative XDG overrides, per the spec", () => {
    const paths = resolvePaths(
      { XDG_CACHE_HOME: "relative/cache", XDG_DATA_HOME: "relative/data" },
      { platform: "linux", home: "/home/test" },
    );
    assert.equal(paths.cacheDb, "/home/test/.cache/cata-centavo/cache.db");
    assert.equal(paths.dataDb, "/home/test/.local/share/cata-centavo/data.db");
  });
});
