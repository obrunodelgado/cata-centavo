import { isCategoryId } from "@cata-centavo/core";
import { z } from "zod";

import { configurationFailure, json } from "../contracts.ts";
import { freshRowResponse } from "./transaction-saque.ts";
import type { WebSource } from "../server/composition.ts";

/**
 * `POST /api/transactions/split` — `{ transactionId, allocations }` through
 * `TransactionSplitStore.set` (ADR-0004). The category is a closed list and the
 * amounts are integer cents; the store owns the two money rules (only a
 * recognised saque, sum never past the saque) and merges duplicates. An empty
 * array is the undo. A refused write is a 400 with a readable problem; a stale
 * id answers `row: null`; a stored one answers with the fresh row.
 */

const ALLOCATION_SCHEMA = z.object({
  categoryId: z.string().refine(isCategoryId, "must be a known category id"),
  amountCents: z.number().int().min(1),
});

const SPLIT_SCHEMA = z.object({
  transactionId: z.string().min(1),
  allocations: z.array(ALLOCATION_SCHEMA).max(20),
});

export async function handleTransactionSplit(source: WebSource, request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = SPLIT_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, 400);
  }

  if (!source.ok) {
    return configurationFailure(source.problems);
  }

  const result = source.splits.set(parsed.data.transactionId, parsed.data.allocations);
  if (!result.known) {
    return json({ ok: true, transactionId: result.transactionId, row: null });
  }
  if (result.problem !== null) {
    const problem = result.problem === "over"
      ? "allocations: the sum exceeds the saque's value"
      : "transactionId: only a recognised saque can be split";
    return json({ ok: false, problems: [problem] }, 400);
  }
  return freshRowResponse(source, result.transactionId);
}
