import type { DatabaseSync } from "node:sqlite";

import type { Clock, DescriptionOverrideStore } from "@cata-centavo/core";

import { inTransaction } from "./in-transaction.ts";
import { normalizeFreeText } from "./text-norm.ts";

const DESCRIPTION_UPSERT = `
  INSERT INTO userdata.description_overrides (transaction_id, description, description_norm, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(transaction_id) DO UPDATE SET
    description = excluded.description,
    description_norm = excluded.description_norm,
    updated_at = excluded.updated_at
`;

const WIRE_NORM = "SELECT description_norm FROM transactions WHERE id = ?";

const MATCHING_IDS = "SELECT id FROM transactions WHERE description_norm = ?";

const systemClock: Clock = { now: () => new Date() };

/** Builds the local store for the user's description renames (Q9). */
export function createDescriptionOverrideStore(db: DatabaseSync, clock: Clock = systemClock): DescriptionOverrideStore {
  const context: DescriptionContext = {
    db,
    clock,
    upsert: db.prepare(DESCRIPTION_UPSERT),
    wireNorm: db.prepare(WIRE_NORM),
    matching: db.prepare(MATCHING_IDS),
  };

  return {
    set: (transactionId, description) => setDescription(context, transactionId, description),
  };
}

/** Everything the one write needs, prepared once when the store is built. */
type DescriptionContext = {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly upsert: ReturnType<DatabaseSync["prepare"]>;
  readonly wireNorm: ReturnType<DatabaseSync["prepare"]>;
  readonly matching: ReturnType<DatabaseSync["prepare"]>;
};

/**
 * The single write, in cascade: the edited row's wire `description_norm` is the
 * matching key, and every cached row carrying it takes the new name — the count
 * is what the toast reports. A stale id is reported rather than written; an
 * empty name after the trim is refused, never stored.
 */
function setDescription(
  context: DescriptionContext,
  transactionId: string,
  description: string,
): ReturnType<DescriptionOverrideStore["set"]> {
  const trimmed = description.trim();

  const wireRow = context.wireNorm.get(transactionId) as { readonly description_norm: unknown } | undefined;
  if (wireRow === undefined) {
    return { transactionId, known: false, updated: 0, description: trimmed, problem: null };
  }
  if (trimmed === "") {
    return { transactionId, known: true, updated: 0, description: "", problem: "empty" };
  }

  const wireNorm = String(wireRow.description_norm);
  const matching = context.matching.all(wireNorm) as { readonly id: unknown }[];
  const now = context.clock.now().toISOString();
  const norm = normalizeFreeText(trimmed);

  inTransaction(context.db, () => {
    for (const match of matching) {
      context.upsert.run(String(match.id), trimmed, norm, now, now);
    }
  });

  return { transactionId, known: true, updated: matching.length, description: trimmed, problem: null };
}
