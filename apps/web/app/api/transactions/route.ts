import { handleTransactions } from "../../../lib/handlers/transactions.ts";
import { getSource } from "../../../lib/server/composition.ts";

export async function GET(request: Request): Promise<Response> {
  return handleTransactions(getSource(), new URL(request.url).searchParams);
}
