import { handleTransactionSplit } from "../../../../lib/handlers/transaction-split.ts";
import { getSource } from "../../../../lib/server/composition.ts";

export async function POST(request: Request): Promise<Response> {
  return handleTransactionSplit(getSource(), request);
}
