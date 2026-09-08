import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveCategory,
  type CategorySource,
  type DerivedColumns,
} from "@cata-centavo/core";

const ALL: DerivedColumns = {
  override: "01000000",
  counterparty: "02000000",
  pluggy: "03000000",
  snapshot: "04000000",
  learned: "05000000",
  mcc: "06000000",
};

const NONE: DerivedColumns = {
  override: null,
  counterparty: null,
  pluggy: null,
  snapshot: null,
  learned: null,
  mcc: null,
};

const PRECEDENCE_CASES: readonly {
  readonly name: string;
  readonly columns: DerivedColumns;
  readonly category: string | null;
  readonly source: CategorySource | null;
}[] = [
  { name: "an override beats everything", columns: ALL, category: "01000000", source: "override" },
  { name: "a manual counterparty beats Pluggy", columns: { ...ALL, override: null }, category: "02000000", source: "counterparty" },
  { name: "live Pluggy beats the harvest", columns: { ...ALL, override: null, counterparty: null }, category: "03000000", source: "pluggy" },
  { name: "the snapshot answers once live Pluggy goes quiet", columns: { ...ALL, override: null, counterparty: null, pluggy: null }, category: "04000000", source: "pluggy" },
  { name: "a learned counterparty beats the MCC", columns: { override: null, counterparty: null, pluggy: null, snapshot: null, learned: "05000000", mcc: "06000000" }, category: "05000000", source: "learned" },
  { name: "the MCC is the last resort", columns: { override: null, counterparty: null, pluggy: null, snapshot: null, learned: null, mcc: "06000000" }, category: "06000000", source: "mcc" },
  { name: "nothing matched", columns: NONE, category: null, source: null },
];

describe("resolveCategory", () => {
  for (const { name, columns, category, source } of PRECEDENCE_CASES) {
    it(name, () => {
      assert.deepEqual(resolveCategory(columns), { category, categorySrc: source });
    });
  }

  /* ─── the saque gate (ADR-0004) ─────────────────────────────────── */

  const GATE_CASES: readonly {
    readonly name: string;
    readonly columns: DerivedColumns;
    readonly recognised: "saque" | "estorno" | null;
    readonly category: string | null;
    readonly source: CategorySource | null;
  }[] = [
    { name: "an override categorises a recognised saque anyway", columns: ALL, recognised: "saque", category: "01000000", source: "override" },
    { name: "a recognised saque suppresses the whole chain below the override", columns: { ...ALL, override: null }, recognised: "saque", category: null, source: null },
    { name: "a recognised estorno suppresses the chain too", columns: { ...ALL, override: null }, recognised: "estorno", category: null, source: null },
    { name: "an unrecognised row runs the chain unchanged", columns: ALL, recognised: null, category: "01000000", source: "override" },
    { name: "a recognised saque with nothing anywhere is still none", columns: NONE, recognised: "saque", category: null, source: null },
  ];

  for (const { name, columns, recognised, category, source } of GATE_CASES) {
    it(name, () => {
      assert.deepEqual(resolveCategory(columns, recognised), { category, categorySrc: source });
    });
  }
});
