import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CATEGORIES, CATEGORY_IDS } from "@cata-centavo/core";

import { categoryColor } from "../../apps/web/lib/labels.ts";

/**
 * The palette is an identity encoding: two categories sharing a color make a
 * donut's slices and the transaction list's dots indistinguishable. `--c7` is
 * reserved for Outros and for ids outside the taxonomy.
 */
describe("lib/labels — categoryColor", () => {
  it("gives every top-level category a color of its own", () => {
    const colors = CATEGORY_IDS.map((id) => categoryColor(id));
    assert.equal(new Set(colors).size, CATEGORY_IDS.length);
  });

  it("reserves the fallback gray for Outros, null and unknown ids", () => {
    const fallback = "var(--c7)";
    assert.equal(categoryColor(CATEGORIES.other.id), fallback);
    assert.equal(categoryColor(null), fallback);
    assert.equal(categoryColor("77770000"), fallback);

    for (const id of CATEGORY_IDS) {
      if (id === CATEGORIES.other.id) {
        continue;
      }
      assert.notEqual(categoryColor(id), fallback, `category ${id} shares the fallback`);
    }
  });
});
