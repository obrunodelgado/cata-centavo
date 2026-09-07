import { collectAccounts, type Account, type UnavailableConnection } from "@cata-centavo/core";

import { configurationFailure, json, type AccountRow, type AccountsResponse, type FailureRow } from "../contracts.ts";
import { systemClock, type WebSource } from "../server/composition.ts";

/**
 * `GET /api/accounts` — every account on every configured connection, fetched
 * live from Pluggy (the cache holds transactions, not accounts). Unavailable
 * connections are reported alongside, never silently dropped.
 */
export async function handleAccounts(source: WebSource): Promise<Response> {
  if (!source.ok) {
    return configurationFailure(source.problems);
  }

  const collected = await collectAccounts(source.bank, source.connections, source.toFailure, systemClock);

  const response: AccountsResponse = {
    ok: true,
    accounts: collected.accounts.map(accountToRow),
    unavailable: collected.unavailable.map(unavailableToRow),
  };
  return json(response);
}

function accountToRow(account: Account): AccountRow {
  return {
    id: account.id,
    connectionId: account.connectionId,
    institution: account.institution,
    name: account.name,
    type: account.type,
    subtype: account.subtype,
    amountCents: account.amountCents,
    currency: account.currency,
    credit:
      account.credit === null
        ? null
        : {
            limitCents: account.credit.limitCents,
            availableLimitCents: account.credit.availableLimitCents,
            balanceCloseDate: account.credit.balanceCloseDate?.toISOString() ?? null,
            balanceDueDate: account.credit.balanceDueDate?.toISOString() ?? null,
            brand: account.credit.brand,
          },
  };
}

function unavailableToRow(unavailable: UnavailableConnection): FailureRow {
  return {
    kind: unavailable.kind,
    message: `${unavailable.connectionId}: ${unavailable.message}`,
  };
}
