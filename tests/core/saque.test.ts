import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recogniseSaque } from "@cata-centavo/core";

/**
 * The recognition rule (ADR-0004): the CASH leaf plus the sign decides, and the
 * user's stored mark outranks the derivation in both directions — including the
 * denial, which keeps a row excluded.
 */

const CASES: readonly {
  readonly name: string;
  readonly categoryId: string | null;
  readonly amountCents: number;
  readonly mark: "saque" | "estorno" | "none" | null;
  readonly expected: "saque" | "estorno" | null;
}[] = [
  { name: "a negative CASH-leaf row is a saque", categoryId: "04010000", amountCents: -50_000, mark: null, expected: "saque" },
  { name: "a positive CASH-leaf row is an estorno", categoryId: "04010000", amountCents: 26_000, mark: null, expected: "estorno" },
  { name: "a zero-amount CASH row is neither", categoryId: "04010000", amountCents: 0, mark: null, expected: null },
  { name: "the plain same-person leaf is not a saque", categoryId: "04000000", amountCents: -50_000, mark: null, expected: null },
  { name: "a PIX same-person leaf is not a saque", categoryId: "04020000", amountCents: -50_000, mark: null, expected: null },
  { name: "a transfers leaf is not a saque", categoryId: "05070000", amountCents: -50_000, mark: null, expected: null },
  { name: "no leaf at all is not a saque", categoryId: null, amountCents: -50_000, mark: null, expected: null },
  { name: "the snapshot-backed leaf recognises too", categoryId: "04010000", amountCents: -50_000, mark: null, expected: "saque" },
  { name: "an explicit saque mark wins on a row the leaf would miss", categoryId: "05000000", amountCents: -50_000, mark: "saque", expected: "saque" },
  { name: "an explicit estorno mark wins on a positive row", categoryId: "04020000", amountCents: 10_000, mark: "estorno", expected: "estorno" },
  { name: "a stored denial keeps a leaf row unrecognised", categoryId: "04010000", amountCents: -50_000, mark: "none", expected: null },
  { name: "a denial on an ordinary row stays unrecognised", categoryId: "11000000", amountCents: -50_000, mark: "none", expected: null },
  { name: "a mark on a leaf row outranks the sign the leaf would give", categoryId: "04010000", amountCents: -50_000, mark: "estorno", expected: "estorno" },
];

describe("recogniseSaque", () => {
  for (const { name, categoryId, amountCents, mark, expected } of CASES) {
    it(name, () => {
      assert.equal(recogniseSaque({ categoryId, amountCents }, mark), expected);
    });
  }
});
