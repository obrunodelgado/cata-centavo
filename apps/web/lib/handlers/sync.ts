import { todayIn } from "@cata-centavo/core";

import { configurationFailure, json, type FailureRow, type SyncOutcome, type SyncResponse } from "../contracts.ts";
import { systemClock, type WebSource } from "../server/composition.ts";

/**
 * `POST /api/sync` — the topbar's "Sincronizar". Runs the read-through walk:
 * accounts are collected live, and every account whose freshness stamp
 * changed (or that was never walked) has its transactions refetched and the
 * cache replaced. The reader dedupes concurrent walks per account, so two
 * clicks cannot start two fetches.
 */
export async function handleSync(source: WebSource): Promise<Response> {
  if (!source.ok) {
    return configurationFailure(source.problems);
  }

  const collected = await source.reader.load(source.connections);

  const accountIds = collected.accounts.map((account) => account.id);
  const rows = source.reader.query({ accountIds, from: "0000-01-01", to: "9999-12-31" });
  const perAccount = new Map<string, number>();
  for (const row of rows) {
    perAccount.set(row.accountId, (perAccount.get(row.accountId) ?? 0) + 1);
  }
  const through = source.reader.dataThrough(accountIds, todayIn(systemClock));

  const byConnection = new Map<string, SyncOutcome>();
  for (const account of collected.accounts) {
    const previous = byConnection.get(account.connectionId);
    const outcome: SyncOutcome = previous ?? {
      connectionId: account.connectionId,
      kind: "ok",
      message: "Sincronizado",
      accounts: 0,
      transactions: 0,
      through: null,
    };
    byConnection.set(account.connectionId, {
      ...outcome,
      accounts: outcome.accounts + 1,
      transactions: outcome.transactions + (perAccount.get(account.id) ?? 0),
      through: through.get(account.connectionId) ?? null,
    });
  }

  const unavailable: FailureRow[] = collected.unavailable.map((entry) => ({
    kind: entry.kind,
    message: `${entry.connectionId}: ${entry.message}`,
  }));

  const response: SyncResponse = {
    ok: true,
    outcomes: [...byConnection.values()],
    unavailable,
  };
  return json(response);
}
