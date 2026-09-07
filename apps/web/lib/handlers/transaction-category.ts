import { isCategoryId } from "@cata-centavo/core";
import { z } from "zod";

import { configurationFailure, json, type CategoryWriteResponse } from "../contracts.ts";
import type { WebSource } from "../server/composition.ts";

/**
 * `POST /api/transactions/category` — `{ ids: string[], categoryId }` through
 * `CategoryWriter.setCategory`. Unknown ids are readable content, not an
 * error: the response carries them with a 200, the same recoverable-failure
 * shape the MCP tool reports. The category is a closed list — free-form
 * strings would let `alimentacao` and `alimentação` live in one database.
 */

const CATEGORY_SCHEMA = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  categoryId: z.string().refine(isCategoryId, "must be a known category id"),
});

export async function handleTransactionCategory(source: WebSource, request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = CATEGORY_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }, 400);
  }

  if (!source.ok) {
    return configurationFailure(source.problems);
  }

  const result = source.writer.setCategory(parsed.data.ids, parsed.data.categoryId);
  const response: CategoryWriteResponse = { updated: result.updated, unknownIds: result.unknownIds };
  return json(response);
}
