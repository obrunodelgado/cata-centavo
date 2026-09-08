import type { CategoryId } from "./category.ts";
import type { SaqueKind } from "./saque.ts";

/**
 * The derivation, in precedence order. This array is the single source of
 * truth: `storage/category-sql.ts` generates the SQL `COALESCE` from it and
 * `resolveCategory` walks it, so the order and the reported provenance cannot
 * drift apart (design, "The derivation query").
 */
export const BRANCHES = ["override", "counterparty", "pluggy", "snapshot", "learned", "mcc"] as const;

export type Branch = (typeof BRANCHES)[number];

/** What the user is told about where a category came from. */
export type CategorySource = "override" | "counterparty" | "pluggy" | "learned" | "mcc";

/** A harvested Pluggy answer is still a Pluggy answer. */
const REPORTED: Readonly<Record<Branch, CategorySource>> = {
  override: "override",
  counterparty: "counterparty",
  pluggy: "pluggy",
  snapshot: "pluggy",
  learned: "learned",
  mcc: "mcc",
};

export type DerivedColumns = Readonly<Record<Branch, string | null>>;

export type ResolvedCategory = {
  readonly category: CategoryId | null;
  readonly categorySrc: CategorySource | null;
};

/**
 * The walk, with the saque gate of ADR-0004 between the override and the rest:
 * an explicit override categorises even a recognised saque, a recognised saque
 * or estorno resolves to no category at all, and everything unrecognised runs
 * the chain in precedence order. The SQL in `category-sql.ts` mirrors the gate —
 * the two encodings name each other here and there.
 */
export function resolveCategory(columns: DerivedColumns, recognised: SaqueKind | null = null): ResolvedCategory {
  const override = columns.override;
  if (override !== null) {
    return { category: override as CategoryId, categorySrc: REPORTED.override };
  }
  if (recognised !== null) {
    return { category: null, categorySrc: null };
  }
  for (const branch of BRANCHES) {
    if (branch === "override") {
      continue;
    }
    const value = columns[branch];
    if (value !== null) {
      return { category: value as CategoryId, categorySrc: REPORTED[branch] };
    }
  }
  return { category: null, categorySrc: null };
}
