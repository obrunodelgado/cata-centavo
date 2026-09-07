import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Account, Clock, Transaction } from "@cata-centavo/core";
import { createTransactionStore, openDatabases, type Databases } from "@cata-centavo/storage";

import { fakeLogger } from "../../fakes/fake-logger.ts";

/**
 * A fixture environment: fresh temp XDG dirs, both SQLite files opened and
 * migrated through the real storage package, and synthetic rows seeded through
 * the real stores — the same code path production uses. The web composition
 * root is then built with these paths (`createSource(env)`), which is what
 * makes the handler tests integration tests rather than mocks of the storage.
 */

export type FixtureEnv = {
  readonly env: Readonly<Record<string, string>>;
  readonly paths: { readonly cacheDb: string; readonly dataDb: string };
  close(): void;
};

export type FixtureSeed = {
  readonly accounts: readonly Account[];
  readonly transactionsByAccount: Readonly<Record<string, readonly Transaction[]>>;
};

export type FixtureEnvOptions = {
  /** Connections to configure beyond those derived from seeded accounts
   *  (e.g. connections with no accounts: revoked, failing). */
  readonly itemIds?: readonly string[];
};

const clock: Clock = { now: () => new Date("2026-08-30T12:00:00.000Z") };

export function createFixtureEnv(seed: FixtureSeed, options: FixtureEnvOptions = {}): FixtureEnv {
  const dir = mkdtempSync(join(tmpdir(), "cata-centavo-web-"));

  const paths = {
    cacheDb: join(dir, "cache", "cata-centavo", "cache.db"),
    dataDb: join(dir, "data", "cata-centavo", "data.db"),
  };

  const databases: Databases = openDatabases(paths);
  const store = createTransactionStore(databases.db, fakeLogger(), clock);

  for (const account of seed.accounts) {
    const rows = seed.transactionsByAccount[account.id] ?? [];
    store.replaceAccount(account.id, account.connectionId, rows, account.lastUpdatedAt?.toISOString() ?? null);
  }
  databases.close();

  const connectionIds = options.itemIds ?? [...new Set(seed.accounts.map((account) => account.connectionId))];

  return {
    env: {
      PLUGGY_CLIENT_ID: "fixture-client",
      PLUGGY_CLIENT_SECRET: "fixture-secret",
      PLUGGY_ITEM_IDS: connectionIds.join(","),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
    },
    paths,
    close: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
