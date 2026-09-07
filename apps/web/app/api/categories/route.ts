import { CATEGORIES } from "@cata-centavo/core";

import { json } from "../../../lib/contracts.ts";

/**
 * `GET /api/categories` — the top-level groups, Pluggy's 22 plus the local
 * 00-prefix additions, in declaration order. Pure
 * taxonomy: nothing here can fail, so the payload carries no ok/problems
 * envelope. The category editor's select and nothing else consumes it.
 */
export async function GET(): Promise<Response> {
  return json({
    categories: Object.values(CATEGORIES).map((category) => ({ id: category.id, name: category.pt })),
  });
}
