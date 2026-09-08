/**
 * The interfaces core requires of whoever serves it. They live here, not beside
 * their implementations, because a contract belongs to its consumer (ADR §6).
 *
 * Nothing in this file imports from `pluggy/`, `storage/` or `mcp/`, and that
 * includes the Pluggy SDK's types: the vocabulary here is ours (§14.0).
 */

import type { Account } from "./account.ts";
import type { Bill } from "./bill.ts";
import type { CategoryId } from "./category.ts";
import type { SaqueKind, SaqueMark } from "./saque.ts";
import type { DerivedTransaction, Transaction, TransactionAllocation } from "./transaction.ts";
import type { InvestmentPosition } from "./investment.ts";



/** Injectable time. Every freshness and expiry rule reads the clock (ADR §7). */
export type Clock = {
  now(): Date;
};

/** The other half of injectable time: waiting, for the transport's 429 backoff. */
export type Sleep = (milliseconds: number) => Promise<void>;

/** Why a call to the bank failed, in a form core and MCP can switch on. */
export type FailureKind =
  | "auth"
  | "unknown-connection"
  | "rate-limited"
  | "unavailable"
  | "no-accounts"
  | "bad-response"
  | "consent-revoked"
  | "consent-expired";

/** A bank failure with a stable kind for programmatic handling. */
export type BankFailure = {
  readonly kind: FailureKind;
  readonly message: string;
};

/** What travels with a log line. Never a secret's value (ADR §16.2). */
export type LogFields = Readonly<Record<string, unknown>>;

/**
 * The logger core requires of whoever serves it. Declared here rather than next
 * to pino, because a contract belongs to its consumer (ADR §6): `core/` never
 * imports pino, and the test passes a fake instead of mocking a module.
 */
export type Logger = {
  debug(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
  child(fields: LogFields): Logger;
};

/**
 * A link to one financial institution. Pluggy calls this an *item*; no human
 * does, so the domain word is "connection" and the translation stays inside
 * `pluggy/mapper.ts` (ADR §14.0).
 */
export type Connection = {
  readonly id: string;
  readonly institution: string;
  /**
   * Left open as a string on purpose. The SDK's `ITEM_STATUSES` omits
   * `PARTIAL_SUCCESS` while its own docblock two lines below describes an item
   * having exactly that status, so the set is not trustworthy enough to close.
   * Phase 0.5 sees real data and can close it then; until then an unrecognised
   * status is displayed rather than rejected, because losing a whole connection
   * report to an unknown enum value is the worse failure.
   */
  readonly status: string;
  /**
   * The finer-grained progress signal underneath `status`, and open for a
   * stronger reason than `status` is: Pluggy's OpenAPI schema declares it a bare
   * `string` with no enum at all, while its prose docs and its own SDK disagree
   * about the members — down to the spelling of the investments one. See
   * `docs/research/pluggy-item-update.md`.
   */
  readonly executionStatus: string | null;
  readonly lastUpdatedAt: Date | null;
  /** The label of what the bank is asking a human for, when it is asking. */
  readonly parameter: string | null;
  /**
   * Why a sync came back `PARTIAL_SUCCESS` — typically a product that hit its
   * Open Finance monthly quota. Empty rather than absent, because a caller that
   * has to check for undefined is a caller that will forget to.
   */
  readonly warnings: readonly string[];
  /** How many consecutive login attempts the institution has refused. */
  readonly failedLogins: number | null;
};

/** An Open Finance consent, as far as our domain is concerned. */
export type Consent = {
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly products: readonly string[];
};

/** What `init` needs from whoever holds the credentials. */
export type Bank = {
  /** Rejects when the credentials are refused. One round trip, no side effects. */
  verifyCredentials(): Promise<void>;
  /** Rejects when the id is unknown, or when the request cannot be made. */
  getConnection(id: string): Promise<Connection>;
  /** Every account on one connection, with the connection's freshness stamped on each. */
  getAccounts(connectionId: string): Promise<readonly Account[]>;
  /** Rejects with a NotFoundError when Pluggy does not know the id. */
  getAccount(accountId: string): Promise<Account>;
  /** Every transaction on one account, walked to the end of the cursor. */
  getTransactions(account: Account): Promise<readonly Transaction[]>;
  /** Every published credit-card statement on one account, newest first. */
  getBills(account: Account): Promise<readonly Bill[]>;
  /** `null` when the endpoint answered with no consent at all — distinct from revoked. */
  getConsent(connectionId: string): Promise<Consent | null>;
  /** Every active investment position on one connection. */
  getInvestments(connectionId: string): Promise<readonly InvestmentPosition[]>;
};


/** A top-level category id, or the absence of one. */

export type CategoryFilterValue = CategoryId | "none";

/** What a cached transaction range is filtered by. */
export type TransactionFilter = {
  readonly accountIds: readonly string[];
  readonly from: string;
  readonly to: string;
  readonly categories?: readonly CategoryFilterValue[];
  /**
   * Free text matched against the description and the counterparty. Case is
   * always insensitive; accents are folded on the description side (through
   * `description_norm`, the query-side half of the contract in
   * `core/description.ts`) and ASCII-case only on the counterparty, which has
   * no normalized column.
   */
  readonly q?: string;
  readonly minAmountCents?: number;
  readonly maxAmountCents?: number;
  readonly accountType?: Account["type"];
  readonly accountSubtype?: string;
  readonly limit?: number;
  readonly after?: { readonly localDate: string; readonly id: string };
};

/** The synchronous relational cache core requires of whoever serves it. */
export type TransactionStore = {
  /** `undefined` when never walked; `null` when walked against an unknown update time. */
  syncedLastUpdatedAt(accountId: string): string | null | undefined;
  replaceAccount(
    accountId: string,
    connectionId: string,
    rows: readonly Transaction[],
    lastUpdatedAt: string | null,
  ): number;
  query(filter: TransactionFilter): readonly DerivedTransaction[];
  byIds(ids: readonly string[]): readonly DerivedTransaction[];
  /**
   * Every cached row for one card, unbounded by date. The bill derivation needs
   * future-dated instalments and closed-cycle history, neither of which a range filter can express.
   */
  cardRows(accountId: string): readonly DerivedTransaction[];
  /** The newest `local_date` at or before `today`, per connection. */
  dataThrough(accountIds: readonly string[], today: string): ReadonlyMap<string, string>;
};

/** The category writes `data.db` accepts. Both are retroactive by construction. */
export type CategoryWriter = {
  setCategory(ids: readonly string[], category: CategoryId): {
    readonly updated: number;
    readonly unknownIds: readonly string[];
  };
  /** `affected` counts cached rows that now resolve through this document. */
  setCounterpartyCategory(document: string, category: CategoryId): { readonly affected: number };
};

/** The client id and secret that authenticate us to the bank. */
export type Credentials = {
  readonly clientId: string;
  readonly clientSecret: string;
};

/** A user-provided billing-cycle closing day for one credit card. */
export type ClosingDay = {
  readonly accountId: string;
  readonly day: number;
};

/** Local closing-day writes and reads the credit-card tools require. */
export type ClosingDayStore = {
  list(): readonly ClosingDay[];
  set(accountId: string, day: number): void;
  delete(accountId: string): number;
};

/**
 * The note writes `data.db` accepts: one user-authored annotation per
 * transaction, never dropped with the cache (§10). The store owns the
 * trim-and-empty rule — an empty result clears the stored note — so both
 * surfaces (MCP and web) share one definition of absence.
 */
export type TransactionNoteStore = {
  set(transactionId: string, note: string | null): {
    readonly transactionId: string;
    /** The stored note after the write; `null` when absent. */
    readonly note: string | null;
    /** Whether the id is in the cache; a stale id is reported, never written. */
    readonly known: boolean;
  };
};

/**
 * The saque-mark writes `data.db` accepts (ADR-0004): the user's correction to
 * the cash-movement recognition, one row per transaction. `"none"` is a stored
 * denial — it keeps a row the leaf would recognise out of the recognition — so
 * every mark is an upsert and nothing is ever deleted back into the derivation.
 * The store owns the sign rule: a saque mark on money coming in, or an estorno
 * mark on money going out, is refused rather than stored.
 */
export type SaqueMarkStore = {
  set(transactionId: string, recognised: SaqueMark): {
    readonly transactionId: string;
    /** Whether the id is in the cache; a stale id is reported, never written. */
    readonly known: boolean;
    /** The effective recognition after the write, derivation included. */
    readonly recognised: SaqueKind | null;
    /** `"sign"` when the mark contradicts the row's direction; nothing written. */
    readonly problem: "sign" | null;
  };
};

/**
 * The split writes `data.db` accepts (ADR-0004): one saque's alocações, one row
 * per category — duplicates arrive merged or are merged here. The store owns
 * the two money rules: only a recognised saque is splittable, and the
 * alocações may sum to the saque's value but never past it. An empty array is
 * the undo — every stored alocação of the saque is removed.
 */
export type TransactionSplitStore = {
  set(transactionId: string, allocations: readonly TransactionAllocation[]): {
    readonly transactionId: string;
    /** Whether the id is in the cache; a stale id is reported, never written. */
    readonly known: boolean;
    /** The stored split after the write; empty when undone. */
    readonly allocations: readonly TransactionAllocation[];
    /** Why nothing was written: the row is not a saque, or the sum overflows it. */
    readonly problem: "not-saque" | "over" | null;
  };
};

/**
 * The description rename `data.db` accepts: one per-transaction override,
 * applied in cascade to every cached row whose wire description matches the
 * edited row's (Q9 — the bulk write). The wire description stays the matching
 * key, so a rename never drags another rename's family along. The store owns
 * the trim rule; an empty name is refused, never stored.
 */
export type DescriptionOverrideStore = {
  set(transactionId: string, description: string): {
    readonly transactionId: string;
    /** Whether the edited id is in the cache; a stale id is reported, never written. */
    readonly known: boolean;
    /** How many cached rows now carry the name — the toast's number. */
    readonly updated: number;
    /** The stored name after the write, trimmed. */
    readonly description: string;
    /** `"empty"` when the trimmed name is empty; nothing written. */
    readonly problem: "empty" | null;
  };
};
