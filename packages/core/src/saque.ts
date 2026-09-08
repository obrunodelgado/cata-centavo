/**
 * The cash-movement recognition (ADR-0004). The wire never names a withdrawal:
 * this bank files one under the same-person CASH leaf, inside the exclusion
 * ADR-0003 grants genuine internal transfers. Leaf plus sign decides; the user's
 * stored mark outranks the derivation in both directions — including the denial,
 * which is stored precisely so the derivation stays denied.
 *
 * The storage mirrors this rule in SQL (`category-sql.ts`); the two encodings
 * name each other in their docblocks and the tests hold both sides.
 */

/** The two cash movements the recognition names. */
export type SaqueKind = "saque" | "estorno";

/** What the user can assert about a row: the kind, or a denial of the derivation. */
export type SaqueMark = SaqueKind | "none";

/** The taxonomy leaf this bank files cash withdrawals under. */
export const CASH_LEAF = "04010000";

/** What a row is recognised as, once the mark and the leaf have had their say. */
export function recogniseSaque(
  row: { readonly categoryId: string | null; readonly amountCents: number },
  mark: SaqueMark | null,
): SaqueKind | null {
  if (mark === "saque" || mark === "estorno") {
    return mark;
  }
  if (mark === "none") {
    return null;
  }
  if (row.categoryId !== CASH_LEAF) {
    return null;
  }
  if (row.amountCents < 0) {
    return "saque";
  }
  if (row.amountCents > 0) {
    return "estorno";
  }
  return null;
}
