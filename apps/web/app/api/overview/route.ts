import { handleOverview } from "../../../lib/handlers/overview.ts";
import { getSource } from "../../../lib/server/composition.ts";

export async function GET(request: Request): Promise<Response> {
  return handleOverview(getSource(), new URL(request.url).searchParams);
}
