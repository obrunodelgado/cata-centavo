import { z } from "zod";

import { configurationFailure, json, type DescriptionWriteResponse } from "../contracts.ts";
import type { WebSource } from "../server/composition.ts";

/**
 * `POST /api/transactions/description` — `{ transactionId, description }`
 * through `DescriptionOverrideStore.set` (Q9): the bulk write keyed by the
 * edited row's wire description. The store owns the trim rule and the cascade;
 * `updated` is the count the toast reports. A stale id is readable content
 * (`known: false`), the same recoverable-failure shape the note reports.
 */

const DESCRIPTION_SCHEMA = z.object({
  transactionId: z.string().min(1),
  description: z.string().max(120),
});

export async function handleTransactionDescription(source: WebSource, request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = DESCRIPTION_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, 400);
  }

  if (!source.ok) {
    return configurationFailure(source.problems);
  }

  const result = source.descriptionOverrides.set(parsed.data.transactionId, parsed.data.description);
  if (result.problem !== null) {
    return json({ ok: false, problems: ["description: the name cannot be empty"] }, 400);
  }
  const response: DescriptionWriteResponse = {
    ok: true,
    transactionId: result.transactionId,
    known: result.known,
    updated: result.updated,
    description: result.description,
  };
  return json(response);
}
