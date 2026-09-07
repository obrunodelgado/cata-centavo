import { z } from "zod";

import { configurationFailure, json, type NoteWriteResponse } from "../contracts.ts";
import type { WebSource } from "../server/composition.ts";

/**
 * `POST /api/transactions/note` — `{ transactionId, note }` through
 * `TransactionNoteStore.set`. The note is the one field the user authors, so
 * unlike the category there is no closed list to enforce; the 500-character
 * cap is the only rule. The value travels raw — the store owns the
 * trim-and-empty rule, so both surfaces (MCP and web) share one definition of
 * absence. An unknown id is readable content, not an error: the response
 * carries `known: false` with a 200, the same recoverable-failure shape the
 * MCP tool reports — the row left the cache between render and save.
 */

const NOTE_SCHEMA = z.object({
  transactionId: z.string().min(1),
  note: z.string().max(500),
});

export async function handleTransactionNote(source: WebSource, request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = NOTE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, 400);
  }

  if (!source.ok) {
    return configurationFailure(source.problems);
  }

  const result = source.noteWriter.set(parsed.data.transactionId, parsed.data.note);
  const response: NoteWriteResponse = { transactionId: result.transactionId, note: result.note, known: result.known };
  return json(response);
}
