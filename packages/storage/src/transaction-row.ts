import type { Logger } from "@cata-centavo/core";
import { resolveCategory } from "@cata-centavo/core";
import type { CategoryId, DerivedTransaction, Transaction } from "@cata-centavo/core";
import { topCategoryFor } from "./harvest.ts";

/**
 * The codec between a SQLite row and our domain object.
 *
 * It lives apart from the store because it answers a different question: the
 * store decides *which* rows, this decides what a row *is*. Both directions are
 * here so the column list and the value list cannot drift apart.
 */

export function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: String(row["id"]),
    accountId: String(row["account_id"]),
    connectionId: String(row["connection_id"]),
    accountType: row["account_type"] as Transaction["accountType"],
    accountSubtype: nullableString(row["account_subtype"]),
    occurredAt: String(row["occurred_at"]),
    localDate: String(row["local_date"]),
    amountCents: Number(row["amount_cents"]),
    currency: String(row["currency"]),
    originalAmountCents: nullableNumber(row["original_amount_cents"]),
    originalCurrency: nullableString(row["original_currency"]),
    description: String(row["description"]),
    descriptionNorm: String(row["description_norm"]),
    categoryId: nullableString(row["category_id"]),
    document: nullableString(row["document"]),
    counterpartyName: nullableString(row["counterparty_name"]),
    paymentMethod: nullableString(row["payment_method"]),
    mcc: nullableString(row["mcc"]),
    billId: nullableString(row["bill_id"]),
    billForecastDate: nullableString(row["bill_forecast_date"]),
    instalmentNumber: nullableNumber(row["instalment_number"]),
    instalmentTotal: nullableNumber(row["instalment_total"]),
    purchaseDate: nullableString(row["purchase_date"]),
  };
}

export function rowToDerived(row: Record<string, unknown>): DerivedTransaction {
  const wireDescription = String(row["description"]);
  const override = nullableString(row["c_description"]);
  return {
    ...rowToTransaction(row),
    description: override ?? wireDescription,
    categoryId: nullableString(row["c_leaf"]),
    note: nullableString(row["note"]),
    recognised: saqueKind(row["c_recognised"]),
    allocations: allocations(row["c_allocations"]),
    ...resolveCategory(
      {
        override: nullableString(row["c_override"]),
        counterparty: nullableString(row["c_counterparty"]),
        pluggy: nullableString(row["c_pluggy"]),
        snapshot: nullableString(row["c_snapshot"]),
        learned: nullableString(row["c_learned"]),
        mcc: nullableString(row["c_mcc"]),
      },
      saqueKind(row["c_recognised"]),
    ),
  };
}

/** The recognition column's two values; anything else is "not recognised". */
function saqueKind(value: unknown): "saque" | "estorno" | null {
  if (value === "saque" || value === "estorno") {
    return value;
  }
  return null;
}

/** The alocações column rides as a JSON array; absent or malformed is empty. */
function allocations(value: unknown): readonly { categoryId: CategoryId; amountCents: number }[] {
  if (value === null || value === undefined || typeof value !== "string") {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const rows: { categoryId: CategoryId; amountCents: number }[] = [];
  for (const entry of parsed) {
    if (typeof entry === "object" && entry !== null) {
      const record = entry as Record<string, unknown>;
      const categoryId = record["categoryId"];
      const amountCents = record["amountCents"];
      if (typeof categoryId === "string" && typeof amountCents === "number") {
        rows.push({ categoryId: categoryId as CategoryId, amountCents });
      }
    }
  }
  return rows;
}

export function transactionValues(row: Transaction, log: Logger): readonly (string | number | null)[] {
  return [
    row.id, row.accountId, row.connectionId, row.accountType, row.accountSubtype,
    row.occurredAt, row.localDate, row.amountCents, row.currency, row.originalAmountCents,
    row.originalCurrency, row.description, row.descriptionNorm, row.categoryId, row.document,
    row.counterpartyName, row.paymentMethod, row.mcc, row.billId, row.instalmentNumber,
    row.billForecastDate, row.instalmentTotal, row.purchaseDate, topCategoryFor(row, log),
  ];
}

function nullableString(value: unknown): string | null {
  // Stryker disable next-line ConditionalExpression,LogicalOperator,BlockStatement: SQLite columns are NULL or concrete values; undefined is defensive input handling.
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function nullableNumber(value: unknown): number | null {
  // Stryker disable next-line ConditionalExpression,LogicalOperator,BlockStatement: SQLite columns are NULL or concrete values; undefined is defensive input handling.
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}
