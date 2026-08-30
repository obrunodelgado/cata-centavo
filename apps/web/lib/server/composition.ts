import { homedir } from "node:os";

import type { Bank, BankFailure, CategoryWriter, ClosingDayStore, Clock, TransactionReader } from "@cata-centavo/core";
import { createTransactionReader } from "@cata-centavo/core";
import { createPluggyClient, toFailure } from "@cata-centavo/pluggy";
import { createCategoryWriter, createClosingDayStore, createTransactionStore, openDatabases } from "@cata-centavo/storage";

import { loadConfig, resolvePaths, type Env } from "./config.ts";
import { createLogger } from "./logging.ts";

/**
 * The web's composition root — the second one in the repository, mirroring
 * `apps/cli/src/bin/main.ts`. The web cannot import from `apps/cli`, so the
 * same assembly happens here over the same packages.
 *
 * `PLUGGY_API_URL` is a test-only seam: the pluggy transport already accepts a
 * `baseUrl`, and the integration/e2e suites point it at a local mock. Absent
 * in normal runs.
 */

export type WebSource =
  | {
      readonly ok: true;
      readonly connections: readonly string[];
      readonly bank: Bank;
      readonly toFailure: (error: unknown) => BankFailure;
      readonly reader: TransactionReader;
      readonly writer: CategoryWriter;
      readonly closingDays: ClosingDayStore;
      close(): void;
    }
  | {
      readonly ok: false;
      readonly problems: readonly string[];
      readonly databaseProblems?: readonly string[];
    };

export const systemClock: Clock = { now: () => new Date() };

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/** Builds the source the web runs against, or the problems that block it. Pure: no module state. */
export function createSource(env: Env): WebSource {
  const log = createLogger();
  const config = loadConfig(env);
  if (!config.ok) {
    return { ok: false, problems: config.problems };
  }

  const paths = resolvePaths(env, { platform: process.platform, home: homedir() });

  let databases: ReturnType<typeof openDatabases>;
  try {
    databases = openDatabases(paths);
  } catch (error) {
    const problem = `Local storage is unavailable: ${describe(error)}`;
    return { ok: false, problems: [problem], databaseProblems: [problem] };
  }

  try {
    const bank = createPluggyClient({
      credentials: config.config.credentials,
      clock: systemClock,
      fetch: globalThis.fetch,
      sleep,
      log,
      ...(env.PLUGGY_API_URL ? { baseUrl: env.PLUGGY_API_URL } : {}),
    });
    const reader = createTransactionReader({
      bank,
      store: createTransactionStore(databases.db, log),
      toFailure,
      log,
      clock: systemClock,
    });
    const writer = createCategoryWriter(databases.db, systemClock);
    const closingDays = createClosingDayStore(databases.db, systemClock);

    return {
      ok: true,
      connections: config.config.itemIds,
      bank,
      toFailure,
      reader,
      writer,
      closingDays,
      close: () => databases.close(),
    };
  } catch (error) {
    databases.close();
    const problem = `Local storage is unavailable: ${describe(error)}`;
    return { ok: false, problems: [problem], databaseProblems: [problem] };
  }
}

/** The process-wide source, built lazily on first use and kept for the server's lifetime. */
let cached: WebSource | null = null;

export function getSource(): WebSource {
  if (cached === null) {
    cached = createSource(process.env);
  }
  return cached;
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
