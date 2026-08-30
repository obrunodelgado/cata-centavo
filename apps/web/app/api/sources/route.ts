import { handleSources } from "../../../lib/handlers/sources.ts";
import { getSource } from "../../../lib/server/composition.ts";

export async function GET(): Promise<Response> {
  return handleSources(getSource());
}
