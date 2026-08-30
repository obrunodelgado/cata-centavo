/**
 * The wire shapes the API routes speak. Shared by the server handlers and the
 * client (`lib/api.ts` consumes these types) — no infrastructure imports here,
 * so client code can import this module safely.
 */

export type ConsentState = "active" | "revoked" | "expired" | "unknown";

export type FailureRow = {
  readonly kind: string;
  readonly message: string;
};

export type SourceRow = {
  readonly connectionId: string;
  readonly institution: string;
  readonly status: string;
  readonly executionStatus: string | null;
  readonly consent: ConsentState;
  readonly consentExpiresAt: string | null;
  readonly consentRevokedAt: string | null;
  readonly lastUpdatedAt: string | null;
  readonly failure: FailureRow | null;
};

export type SourcesResponse =
  | { readonly ok: true; readonly sources: readonly SourceRow[] }
  | { readonly ok: false; readonly problems: readonly string[] };

export type CreditRow = {
  readonly limitCents: number | null;
  readonly availableLimitCents: number | null;
  readonly balanceCloseDate: string | null;
  readonly balanceDueDate: string | null;
  readonly brand: string | null;
};

export type AccountRow = {
  readonly id: string;
  readonly connectionId: string;
  readonly institution: string;
  readonly name: string;
  readonly type: "BANK" | "CREDIT" | "INVESTMENT" | "LOAN";
  readonly subtype: string | null;
  /** On BANK: available funds. On CREDIT: used credit at request time. Cents. */
  readonly amountCents: number;
  readonly currency: string;
  readonly credit: CreditRow | null;
};

export type AccountsResponse =
  | { readonly ok: true; readonly accounts: readonly AccountRow[]; readonly unavailable: readonly FailureRow[] }
  | { readonly ok: false; readonly problems: readonly string[] };

export type SyncOutcome = {
  readonly connectionId: string;
  readonly kind: "ok" | "failed";
  readonly message: string;
  /** Accounts walked on this connection, and cached transaction rows after the walk. */
  readonly accounts: number;
  readonly transactions: number;
  readonly through: string | null;
};

export type SyncResponse =
  | { readonly ok: true; readonly outcomes: readonly SyncOutcome[]; readonly unavailable: readonly FailureRow[] }
  | { readonly ok: false; readonly problems: readonly string[] };

/** A configuration failure rendered as readable content, the web's analogue of MCP `isError`. */
export function configurationFailure(problems: readonly string[]): Response {
  return json({ ok: false, problems });
}

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
