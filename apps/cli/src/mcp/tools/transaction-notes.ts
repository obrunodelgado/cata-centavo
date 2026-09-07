import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { configurationProblems, finishToolError, textResult, type ToolDeps } from "./result.ts";

export const SET_TRANSACTION_NOTE_DESCRIPTION = `Sets or clears the user's note on one transaction.

Use this tool when:
- The user asks to annotate a transaction — a reminder of what it was for, who it involved, anything worth keeping.
- The user asks to remove a transaction's note. An empty string clears it.

Returns: The transaction id, the stored note (omitted when there is none), and whether the id is in the local cache. \`known: false\` means the id came from a stale listing and nothing was written.`;

const setTransactionNoteSchema = z.object({
  transactionId: z.string().min(1),
  note: z.string().max(500),
});

export function registerSetTransactionNote(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "setTransactionNote",
    { description: SET_TRANSACTION_NOTE_DESCRIPTION, inputSchema: setTransactionNoteSchema },
    async (input) => handleSetTransactionNote(deps, input),
  );
}

export async function handleSetTransactionNote(deps: ToolDeps, rawInput: unknown): Promise<CallToolResult> {
  const startedAt = Date.now();
  if (!deps.source.ok) {
    return finishToolError(deps.log, startedAt, configurationProblems(deps.source.problems), { tool: "setTransactionNote" });
  }

  const parsed = setTransactionNoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    return finishToolError(deps.log, startedAt, parsed.error.message, { tool: "setTransactionNote" });
  }

  const noteWriter = deps.noteWriter ?? deps.source.noteWriter;
  if (!noteWriter) {
    return finishToolError(deps.log, startedAt, "Storage is read-only", { tool: "setTransactionNote" });
  }

  const result = noteWriter.set(parsed.data.transactionId, parsed.data.note);
  return textResult(result);
}
