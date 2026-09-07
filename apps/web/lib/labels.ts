import { CATEGORIES, categoryById } from "@cata-centavo/core";

import type { Account } from "@cata-centavo/core";

/** Pluggy's paymentMethod raw values in pt-BR; unknown values render as themselves. */
const PAYMENT_METHOD_NAMES: Readonly<Record<string, string>> = {
  PIX: "PIX",
  BOLETO: "Boleto",
  TED: "TED",
  DEBIT: "Débito",
  OTHER: "Outro",
};

/**
 * The forma de pagamento a row displays: the wire's payment method, else
 * "Cartão" when the movement happened on a credit account (Pluggy omits
 * `paymentData` on card rows), else an em dash. Shared by every handler that
 * ships a transaction row, so the views cannot drift apart on the fallbacks.
 */
export function paymentMethodOf(row: { readonly paymentMethod: string | null; readonly accountType: Account["type"] }): string {
  if (row.paymentMethod !== null) {
    return PAYMENT_METHOD_NAMES[row.paymentMethod] ?? row.paymentMethod;
  }
  if (row.accountType === "CREDIT") {
    return "Cartão";
  }
  return "—";
}

/** The pt-BR label of a top-level category id, or "Sem categoria". */
export function categoryName(categoryId: string | null): string {
  if (categoryId === null) {
    return "Sem categoria";
  }
  return categoryById(categoryId)?.pt ?? categoryId;
}

/**
 * The series palette, one color per top-level category — two categories on
 * the same color make a donut's slices and the list's dots indistinguishable.
 * Keyed through `CATEGORIES` so a taxonomy change cannot silently orphan a
 * color the way a raw id string would. `--c7` stays reserved for Outros and
 * for anything outside the list.
 */
const CATEGORY_COLOR: Readonly<Record<string, string>> = {
  [CATEGORIES.income.id]: "var(--c8)",
  [CATEGORIES.loansAndFinancing.id]: "var(--c9)",
  [CATEGORIES.investments.id]: "var(--c10)",
  [CATEGORIES.samePersonTransfer.id]: "var(--c11)",
  [CATEGORIES.transfers.id]: "var(--c12)",
  [CATEGORIES.legalObligations.id]: "var(--c13)",
  [CATEGORIES.services.id]: "var(--c14)",
  [CATEGORIES.shopping.id]: "var(--c15)",
  [CATEGORIES.digitalServices.id]: "var(--c6)",
  [CATEGORIES.groceries.id]: "var(--c3)",
  [CATEGORIES.foodAndDrinks.id]: "var(--c16)",
  [CATEGORIES.travel.id]: "var(--c17)",
  [CATEGORIES.donations.id]: "var(--c18)",
  [CATEGORIES.gambling.id]: "var(--c19)",
  [CATEGORIES.taxes.id]: "var(--c20)",
  [CATEGORIES.bankFees.id]: "var(--c21)",
  [CATEGORIES.housing.id]: "var(--c1)",
  [CATEGORIES.healthcare.id]: "var(--c2)",
  [CATEGORIES.transportation.id]: "var(--c4)",
  [CATEGORIES.insurance.id]: "var(--c22)",
  [CATEGORIES.leisure.id]: "var(--c5)",
  [CATEGORIES.pet.id]: "var(--c23)",
  [CATEGORIES.restaurants.id]: "var(--c24)",
  [CATEGORIES.study.id]: "var(--c25)",
  [CATEGORIES.other.id]: "var(--c7)",
};

/** The category's palette color; Outros, unknown ids and the absence of one share `--c7`. */
export function categoryColor(categoryId: string | null): string {
  if (categoryId === null) {
    return "var(--c7)";
  }
  return CATEGORY_COLOR[categoryId] ?? "var(--c7)";
}

/** The Tipo cell's tone class: receita in green, PIX in blue, the rest muted. */
export function paymentMethodClass(row: { readonly amountCents: number; readonly paymentMethod: string }): string {
  if (row.amountCents > 0) {
    return "tx-rec";
  }
  if (row.paymentMethod === "PIX") {
    return "tx-pix";
  }
  return "tx-bol";
}
