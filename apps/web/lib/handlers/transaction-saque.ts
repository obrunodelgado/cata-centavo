import { collectAccounts, todayIn } from "@cata-centavo/core";
import { z } from "zod";

import { configurationFailure, json, type TransactionRowWriteResponse } from "../contracts.ts";
import { transactionRow } from "./transactions.ts";
import type { WebSource } from "../server/composition.ts";

/**
 * `POST /api/transactions/saque` — `{ transactionId, recognised }` through
 * `SaqueMarkStore.set` (ADR-0004). The mark is the user's correction to the
 * cash-movement recognition; the store owns the sign rule and the denial
 * upsert. A stale id is readable content (`row: null`), the same
 * recoverable-failure shape the note reports. A known row answers with the
 * fresh `TransactionRow` — recognition, category and forma de pagamento may all
 * have moved — ready to patch in place.
 */

const SAQUE_SCHEMA = z.object({
  transactionId: z.string().min(1),
  recognised: z.enum(["saque", "estorno", "none"]),
});

export async function handleTransactionSaque(source: WebSource, request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = SAQUE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, 400);
  }

  if (!source.ok) {
    return configurationFailure(source.problems);
  }

  const result = source.saqueMarks.set(parsed.data.transactionId, parsed.data.recognised);
  if (!result.known) {
    return json({ ok: true, transactionId: result.transactionId, row: null });
  }
  if (result.problem !== null) {
    return json({ ok: false, problems: ["recognised: the mark contradicts the row's direction"] }, 400);
  }
  return freshRowResponse(source, result.transactionId);
}

/** The fresh row a write answers with, resolved the same way the list resolves its rows. */
export async function freshRowResponse(source: Extract<WebSource, { readonly ok: true }>, transactionId: string): Promise<Response> {
  const [collected, rows] = await Promise.all([
    collectAccounts(source.bank, source.connections, source.toFailure, source.clock),
    Promise.resolve(source.reader.byIds([transactionId])),
  ]);
  const fresh = rows[0];
  if (fresh === undefined) {
    return json({ ok: true, transactionId, row: null });
  }
  const accountNames = new Map(collected.accounts.map((account) => [account.id, account.name]));
  const response: TransactionRowWriteResponse = {
    ok: true,
    transactionId,
    row: transactionRow(fresh, accountNames, todayIn(source.clock)),
  };
  return json(response);
}
