import { handleTransactionDescription } from "../../../../lib/handlers/transaction-description.ts";
import { getSource } from "../../../../lib/server/composition.ts";

export async function POST(request: Request): Promise<Response> {
  return handleTransactionDescription(getSource(), request);
}
