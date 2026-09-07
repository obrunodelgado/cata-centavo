import { handleSync } from "../../../lib/handlers/sync.ts";
import { getSource } from "../../../lib/server/composition.ts";

export async function POST(): Promise<Response> {
  return handleSync(getSource());
}
