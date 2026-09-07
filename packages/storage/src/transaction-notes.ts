import type { DatabaseSync } from "node:sqlite";

import type { Clock, TransactionNoteStore } from "@cata-centavo/core";
import { inTransaction } from "./in-transaction.ts";
import { normalizeFreeText } from "./text-norm.ts";

const NOTE_UPSERT = `
  INSERT INTO userdata.transaction_notes (transaction_id, note, note_norm, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(transaction_id) DO UPDATE SET
    note = excluded.note,
    note_norm = excluded.note_norm,
    updated_at = excluded.updated_at
`;

const NOTE_DELETE = "DELETE FROM userdata.transaction_notes WHERE transaction_id = ?";

const KNOWN_ID = "SELECT id FROM transactions WHERE id = ?";

const systemClock: Clock = { now: () => new Date() };

/** Builds the local store for the user's per-transaction notes. */
export function createTransactionNoteStore(db: DatabaseSync, clock: Clock = systemClock): TransactionNoteStore {
  const context: NoteContext = {
    db,
    clock,
    upsert: db.prepare(NOTE_UPSERT),
    remove: db.prepare(NOTE_DELETE),
    known: db.prepare(KNOWN_ID),
  };

  return {
    set: (transactionId, note) => setNote(context, transactionId, note),
  };
}

/** Everything the one write needs, prepared once when the store is built. */
type NoteContext = {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly upsert: ReturnType<DatabaseSync["prepare"]>;
  readonly remove: ReturnType<DatabaseSync["prepare"]>;
  readonly known: ReturnType<DatabaseSync["prepare"]>;
};

/**
 * The single definition of absence: the value is trimmed, an empty result
 * clears the stored row, and a stale id is reported rather than written — an
 * agent working from a listing older than the last cache rebuild would
 * otherwise lose its note silently.
 */
function setNote(context: NoteContext, transactionId: string, note: string | null): ReturnType<TransactionNoteStore["set"]> {
  const known = context.known.get(transactionId) !== undefined;
  const trimmed = note?.trim() ?? "";

  if (!known || trimmed === "") {
    if (known) {
      context.remove.run(transactionId);
    }
    return { transactionId, note: null, known };
  }

  const now = context.clock.now().toISOString();
  return inTransaction(context.db, () => {
    context.upsert.run(transactionId, trimmed, normalizeFreeText(trimmed), now, now);
    return { transactionId, note: trimmed, known: true };
  });
}
