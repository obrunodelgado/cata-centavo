import type { DatabaseSync } from "node:sqlite";

import type { Clock, SaqueMark, TransactionAllocation, TransactionSplitStore } from "@cata-centavo/core";
import { recogniseSaque } from "@cata-centavo/core";

import { inTransaction } from "./in-transaction.ts";

const SPLIT_CLEAR = "DELETE FROM userdata.transaction_allocations WHERE transaction_id = ?";

const ALLOCATION_UPSERT = `
  INSERT INTO userdata.transaction_allocations (transaction_id, category, amount_cents, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(transaction_id, category) DO UPDATE SET
    amount_cents = excluded.amount_cents,
    updated_at = excluded.updated_at
`;

const MARKED_ROW = `
  SELECT t.amount_cents AS amount_cents, t.category_id AS category_id,
    (SELECT m.recognised FROM userdata.saque_marks m WHERE m.transaction_id = t.id) AS recognised
  FROM transactions t WHERE t.id = ?
`;

const systemClock: Clock = { now: () => new Date() };

/** Builds the local store for one saque's alocações (ADR-0004). */
export function createTransactionSplitStore(db: DatabaseSync, clock: Clock = systemClock): TransactionSplitStore {
  const context: SplitContext = {
    db,
    clock,
    clear: db.prepare(SPLIT_CLEAR),
    upsert: db.prepare(ALLOCATION_UPSERT),
    row: db.prepare(MARKED_ROW),
  };

  return {
    set: (transactionId, allocations) => setSplit(context, transactionId, allocations),
  };
}

/** Everything the one write needs, prepared once when the store is built. */
type SplitContext = {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly clear: ReturnType<DatabaseSync["prepare"]>;
  readonly upsert: ReturnType<DatabaseSync["prepare"]>;
  readonly row: ReturnType<DatabaseSync["prepare"]>;
};

/**
 * The single write, all-or-nothing: the saque's stored alocações are replaced by
 * exactly what arrived — duplicates merged by category, empty means undone. A
 * stale id is reported; a row the recognition does not name as a saque and a sum
 * past the saque's value are both refused with nothing written, so a bad draft
 * can never move money twice.
 */
function setSplit(
  context: SplitContext,
  transactionId: string,
  allocations: readonly TransactionAllocation[],
): ReturnType<TransactionSplitStore["set"]> {
  const row = context.row.get(transactionId) as
    | { readonly amount_cents: unknown; readonly category_id: unknown; readonly recognised: unknown }
    | undefined;

  if (row === undefined) {
    return { transactionId, known: false, allocations: [], problem: null };
  }

  const amountCents = Number(row.amount_cents);
  const leaf = row.category_id === null || row.category_id === undefined ? null : String(row.category_id);
  const mark: SaqueMark | null = typeof row.recognised === "string" && isSaqueMark(row.recognised) ? row.recognised : null;

  if (recogniseSaque({ categoryId: leaf, amountCents }, mark) !== "saque") {
    return { transactionId, known: true, allocations: [], problem: "not-saque" };
  }

  const merged = mergeByCategory(allocations);
  const total = merged.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  if (total > -amountCents) {
    return { transactionId, known: true, allocations: [], problem: "over" };
  }

  const now = context.clock.now().toISOString();
  inTransaction(context.db, () => {
    context.clear.run(transactionId);
    for (const allocation of merged) {
      context.upsert.run(transactionId, allocation.categoryId, allocation.amountCents, now, now);
    }
  });

  return { transactionId, known: true, allocations: merged, problem: null };
}

/** One row per category: later values replace earlier ones, zero-value rows drop out. */
function mergeByCategory(allocations: readonly TransactionAllocation[]): readonly TransactionAllocation[] {
  const byCategory = new Map<TransactionAllocation["categoryId"], number>();
  for (const allocation of allocations) {
    if (allocation.amountCents > 0) {
      byCategory.set(allocation.categoryId, allocation.amountCents);
    }
  }
  return [...byCategory.entries()]
    .map(([categoryId, amountCents]) => ({ categoryId, amountCents }))
    .sort((left, right) => left.categoryId.localeCompare(right.categoryId));
}

function isSaqueMark(value: string): value is SaqueMark {
  return value === "saque" || value === "estorno" || value === "none";
}
