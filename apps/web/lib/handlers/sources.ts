import { diagnose, type ConnectionDiagnosis } from "@cata-centavo/core";

import { configurationFailure, json, type SourceRow, type SourcesResponse } from "../contracts.ts";
import { systemClock, type WebSource } from "../server/composition.ts";

/**
 * `GET /api/sources` — every configured connection with its consent verdict,
 * the same picture `listSources` gives the agent, for a human. A configuration
 * failure is readable content, never a crash.
 */
export async function handleSources(source: WebSource): Promise<Response> {
  if (!source.ok) {
    return configurationFailure(source.problems);
  }

  const rows = await diagnose(source.bank, source.connections, source.toFailure, systemClock);

  const response: SourcesResponse = {
    ok: true,
    sources: rows.map(rowToSource),
  };
  return json(response);
}

function rowToSource(row: ConnectionDiagnosis): SourceRow {
  return {
    connectionId: row.id,
    institution: row.connection?.institution ?? "Desconhecido",
    status: row.connection?.status ?? "unavailable",
    executionStatus: row.connection?.executionStatus ?? null,
    consent: row.state,
    consentExpiresAt: row.consent?.expiresAt?.toISOString() ?? null,
    consentRevokedAt: row.consent?.revokedAt?.toISOString() ?? null,
    lastUpdatedAt: row.connection?.lastUpdatedAt?.toISOString() ?? null,
    failure:
      row.failure === null
        ? null
        : { kind: row.failure.kind, message: row.failure.message },
  };
}
