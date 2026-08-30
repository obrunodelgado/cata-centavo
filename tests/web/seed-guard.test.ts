import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolvePaths } from "../../apps/web/lib/server/config.ts";
import { guardFixturePaths } from "../../e2e/seed.ts";

const SYSTEM = { platform: "darwin", home: "/Users/test" };

describe("guardFixturePaths", () => {
  it("refuses paths that resolve to the real wallet homes", () => {
    const real = resolvePaths({}, SYSTEM);
    assert.throws(() => guardFixturePaths(real, SYSTEM), /real wallet homes/);
  });

  it("accepts fresh temp dirs", () => {
    const dir = mkdtempSync(join(tmpdir(), "cata-centavo-guard-"));
    try {
      assert.doesNotThrow(() =>
        guardFixturePaths({ cacheDb: join(dir, "cache.db"), dataDb: join(dir, "data.db") }, SYSTEM),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
