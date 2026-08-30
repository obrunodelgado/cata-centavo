import { handleAccounts } from "../../../lib/handlers/accounts.ts";
import { getSource } from "../../../lib/server/composition.ts";

export async function GET(): Promise<Response> {
  return handleAccounts(getSource());
}
