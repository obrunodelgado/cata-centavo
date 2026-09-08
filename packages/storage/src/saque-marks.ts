import type { DatabaseSync } from "node:sqlite";

import type { Clock, SaqueKind, SaqueMark, SaqueMarkStore } from "@cata-centavo/core";
import { recogniseSaque } from "@cata-centavo/core";


const MARK_UPSERT = `
  INSERT INTO userdata.saque_marks (transaction_id, recognised, created_at, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(transaction_id) DO UPDATE SET
    recognised = excluded.recognised,
    updated_at = excluded.updated_at
`;

/** The row the mark needs: existence, direction and the durable leaf. */
const MARKED_ROW = "SELECT id, amount_cents, category_id FROM transactions WHERE id = ?";

const systemClock: Clock = { now: () => new Date() };

/** Builds the local store for the user's saque marks (ADR-0004). */
export function createSaqueMarkStore(db: DatabaseSync, clock: Clock = systemClock): SaqueMarkStore {
  const context: MarkContext = {
    clock,
    upsert: db.prepare(MARK_UPSERT),
    row: db.prepare(MARKED_ROW),
  };

  return {
    set: (transactionId, recognised) => setMark(context, transactionId, recognised),
  };
}

/** Everything the one write needs, prepared once when the store is built. */
type MarkContext = {
  readonly clock: Clock;
  readonly upsert: ReturnType<DatabaseSync["prepare"]>;
  readonly row: ReturnType<DatabaseSync["prepare"]>;
};

/**
 * The single write. A stale id is reported rather than written; a mark that
 * contradicts the row's direction is refused with `"sign"` — a saque is money
 * out and an estorno is money in, and storing the opposite would let the
 * recognition say both. `"none"` upserts a denial, so the leaf's verdict stays
 * overridden until the user says otherwise.
 */
function setMark(context: MarkContext, transactionId: string, recognised: SaqueMark): ReturnType<SaqueMarkStore["set"]> {
  const row = context.row.get(transactionId) as
    | { readonly id: unknown; readonly amount_cents: unknown; readonly category_id: unknown }
    | undefined;

  if (row === undefined) {
    return { transactionId, known: false, recognised: null, problem: null };
  }

  const amountCents = Number(row.amount_cents);
  const leaf = row.category_id === null || row.category_id === undefined ? null : String(row.category_id);

  if (recognised === "saque" && amountCents >= 0) {
    return { transactionId, known: true, recognised: null, problem: "sign" };
  }
  if (recognised === "estorno" && amountCents <= 0) {
    return { transactionId, known: true, recognised: null, problem: "sign" };
  }

  const now = context.clock.now().toISOString();
  context.upsert.run(transactionId, recognised, now, now);

  const effective: SaqueKind | null = recogniseSaque({ categoryId: leaf, amountCents }, recognised);
  return { transactionId, known: true, recognised: effective, problem: null };
}
