import { handleTransactionCategory } from "../../../../lib/handlers/transaction-category.ts";
import { getSource } from "../../../../lib/server/composition.ts";

export async function POST(request: Request): Promise<Response> {
  return handleTransactionCategory(getSource(), request);
}
