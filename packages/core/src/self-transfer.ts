import type { DerivedTransaction } from "./transaction.ts";

/**
 * Moving money between your own accounts is not spending, and paying a card
 * bill is not spending twice.
 *
 * Two families, one rule: the money never left the holder.
 *
 * - `04xxxx` (Same person transfer) and `05100000` (credit card payment) are
 *   matched as leaves because the distinction lives below the 22:
 *   `05100000` is excluded while its parent `05000000` (Transfers) is
 *   ordinary spending. They are matched against the *durable* leaf —
 *   `DerivedTransaction.categoryId`, which falls back to the snapshot — so
 *   the exclusion outlives the enrichment.
 * - `03xxxx` (Investments): applying to and redeeming from your own portfolio
 *   moves money between accounts of the same holder. `03060000` (proceeds,
 *   interest and dividends) is the one exception — it is income, never an
 *   internal transfer — and it is protected before the group check because
 *   every `03` leaf rolls up to the `03000000` group.
 *
 * The resolved category is matched too, so a manual correction to either
 * group excludes the row the same way — and an explicit correction wins over
 * the dividend leaf's income default (ADR-0003).
 *
 * The cash-movement recognition (ADR-0004) is the one way out: a row recognised
 * as a saque or an estorno is cash leaving or returning to the tracked
 * universe, not money moving between the holder's own accounts, so it is
 * checked before every group and never excluded.
 */
const SELF_TRANSFER_GROUPS: ReadonlySet<string> = new Set(["04000000", "03000000"]);

const SELF_TRANSFER_LEAVES: ReadonlySet<string> = new Set([
  "04000000", "04010000", "04020000", "04030000", "05100000",
  "03000000", "03010000", "03020000", "03030000", "03040000", "03050000", "03070000",
]);

/** Proceeds, interest and dividends — income, not an internal transfer. */
const DIVIDENDS_LEAF = "03060000";

export function isSelfTransfer(row: DerivedTransaction): boolean {
  if (row.recognised !== null) {
    return false;
  }
  if (row.category !== null && row.categorySrc === "override" && SELF_TRANSFER_GROUPS.has(row.category)) {
    return true;
  }
  if (row.categoryId === DIVIDENDS_LEAF) {
    return false;
  }
  if (row.category !== null && SELF_TRANSFER_GROUPS.has(row.category)) {
    return true;
  }
  return row.categoryId !== null && SELF_TRANSFER_LEAVES.has(row.categoryId);
}
