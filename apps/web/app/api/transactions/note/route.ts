import { handleTransactionNote } from "../../../../lib/handlers/transaction-note.ts";
import { getSource } from "../../../../lib/server/composition.ts";

export async function POST(request: Request): Promise<Response> {
  return handleTransactionNote(getSource(), request);
}
