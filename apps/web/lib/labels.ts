import { CATEGORIES, categoryById } from "@cata-centavo/core";

import type { Account } from "@cata-centavo/core";

import { dayMonthShort } from "./datetime.ts";

/** Pluggy's paymentMethod raw values in pt-BR; unknown values render as themselves. */
const PAYMENT_METHOD_NAMES: Readonly<Record<string, string>> = {
  PIX: "PIX",
  BOLETO: "Boleto",
  TED: "TED",
  DEBIT: "Débito",
  OTHER: "Outro",
};

/**
 * The forma de pagamento a row displays: the cash-movement recognition first
 * (ADR-0004 — the user's vocabulary outranks the wire's silence), then the
 * wire's payment method, else "Cartão" when the movement happened on a credit
 * account (Pluggy omits `paymentData` on card rows), else an em dash. Shared by
 * every handler that ships a transaction row, so the views cannot drift apart
 * on the fallbacks.
 */
export function paymentMethodOf(row: {
  readonly paymentMethod: string | null;
  readonly accountType: Account["type"];
  readonly recognised: "saque" | "estorno" | null;
}): string {
  if (row.recognised === "saque") {
    return "Saque";
  }
  if (row.recognised === "estorno") {
    return "Estorno";
  }
  if (row.paymentMethod !== null) {
    return PAYMENT_METHOD_NAMES[row.paymentMethod] ?? row.paymentMethod;
  }
  if (row.accountType === "CREDIT") {
    return "Cartão";
  }
  return "—";
}

/**
 * The detail modal's sub line — the only metadata the design gives the modal.
 * A recognised saque speaks the domain's words ("dinheiro vivo", CONTEXT.md)
 * instead of repeating the Tipo chip the row already carries; every other row
 * reads data · descrição · tipo · status.
 */
export function transactionModalSub(row: {
  readonly localDate: string;
  readonly description: string;
  readonly paymentMethod: string;
  readonly status: string;
  readonly recognised: "saque" | "estorno" | null;
}): string {
  const head = `${dayMonthShort(row.localDate)} · ${row.description}`;
  if (row.recognised === "saque") {
    return `${head} · dinheiro vivo`;
  }
  return `${head} · ${row.paymentMethod} · ${row.status}`;
}

/**
 * The value box's label: what the movement did, in the domain's words. A
 * recognised saque names itself; a receita was received; everything else is a
 * despesa.
 */
export function transactionValueLabel(row: {
  readonly amountCents: number;
  readonly recognised: "saque" | "estorno" | null;
}): string {
  if (row.recognised === "saque") {
    return "Valor do saque";
  }
  if (row.amountCents > 0) {
    return "Valor recebido";
  }
  return "Valor da despesa";
}

/**
 * The value box's tone: a receita in green, a despesa in the foreground. The
 * design never paints a despesa red inside the modal; red is the overflow's
 * color, not a negative balance's.
 */
export function transactionValueTone(amountCents: number): string {
  if (amountCents > 0) {
    return "pos";
  }
  return "";
}

/**
 * The value a row displays under an active category filter (ADR-0004): a split
 * saque's money names its alocação categories and its sobra names none, so the
 * list shows the portion the filter selects — the same membership
 * `filterByCategories` admits — instead of the transaction's whole. Any other
 * row, and any row with no filter at all, displays its own amount.
 */
export function filteredAmountCents(
  row: {
    readonly recognised: "saque" | "estorno" | null;
    readonly amountCents: number;
    readonly allocations: readonly { readonly categoryId: string; readonly amountCents: number }[];
  },
  categoryIds: readonly string[],
): number {
  if (categoryIds.length === 0 || row.recognised !== "saque") {
    return row.amountCents;
  }
  let portion = 0;
  for (const allocation of row.allocations) {
    if (categoryIds.includes(allocation.categoryId)) {
      portion += allocation.amountCents;
    }
  }
  if (categoryIds.includes("none")) {
    const allocated = row.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
    const leftover = -row.amountCents - allocated;
    if (leftover > 0) {
      portion += leftover;
    }
  }
  return -portion;
}

/** The pt-BR label of a top-level category id, or "Sem categoria". */
export function categoryName(categoryId: string | null): string {
  if (categoryId === null) {
    return "Sem categoria";
  }
  return categoryById(categoryId)?.pt ?? categoryId;
}

/**
 * The category legend a transaction row displays — one entry per category the
 * row's money names, each with the id for the dot's color and the pt-BR name
 * for the label. A split saque has no category of its own (ADR-0004): its
 * alocações name the money, so they are the legend; an unsplit one stays
 * "Sem categoria", honestly — the sobra is real money out with nowhere
 * named yet.
 */
export function categoryLegend(row: {
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly recognised: "saque" | "estorno" | null;
  readonly allocations: readonly { readonly categoryId: string }[];
}): readonly { readonly id: string | null; readonly name: string }[] {
  if (row.recognised !== "saque" || row.allocations.length === 0) {
    return [{ id: row.categoryId, name: row.categoryName ?? "Sem categoria" }];
  }
  const distinct = [...new Set(row.allocations.map((allocation) => allocation.categoryId))];
  return distinct.map((id) => ({ id, name: categoryName(id) }));
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

/** The Tipo cell's tone class: receita in green, PIX in blue, saque in terracota, the rest muted. */
export function paymentMethodClass(row: {
  readonly amountCents: number;
  readonly paymentMethod: string;
  readonly recognised: "saque" | "estorno" | null;
}): string {
  if (row.recognised === "saque") {
    return "tx-saq";
  }
  if (row.amountCents > 0) {
    return "tx-rec";
  }
  if (row.paymentMethod === "PIX") {
    return "tx-pix";
  }
  return "tx-bol";
}
