import { handleTransactionSaque } from "../../../../lib/handlers/transaction-saque.ts";
import { getSource } from "../../../../lib/server/composition.ts";

export async function POST(request: Request): Promise<Response> {
  return handleTransactionSaque(getSource(), request);
}
