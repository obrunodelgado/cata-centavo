import { isAbsolute, join } from "node:path";

import type { Credentials } from "@cata-centavo/core";

/**
 * Duplicated from `apps/cli/src/config.ts` — the web cannot import from
 * `apps/cli` (different package, and a dependency-cruiser rule forbids it).
 * Keep the two in sync: same env vars, same validation messages, same XDG
 * resolution. ADR §4: configuration comes from the environment and nowhere
 * else; never a `.env` file.
 */

const APP_DIR = "cata-centavo";

/**
 * 8-4-4-4-12 hex, deliberately looser than a real UUID check. The point is to
 * catch a truncated or mis-pasted id before it costs a network round trip, not
 * to assert a UUID version we have never verified Pluggy emits.
 */
const ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HOW_TO_SET =
  'Export it in your shell, or declare it in the environment of the process that starts the web server.';

export type Env = Readonly<Record<string, string | undefined>>;

export type Config = {
  readonly credentials: Credentials;
  readonly itemIds: readonly string[];
};

export type ConfigResult =
  | { readonly ok: true; readonly config: Config }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Validates the environment into a `Config`, collecting every problem rather
 * than stopping at the first — a user missing two variables should learn that
 * in one run.
 */
export function loadConfig(env: Env): ConfigResult {
  const problems: string[] = [];

  const clientId = readRequired(env, "PLUGGY_CLIENT_ID", problems);
  const clientSecret = readRequired(env, "PLUGGY_CLIENT_SECRET", problems);
  const itemIds = readItemIds(env, problems);

  if (clientId === undefined || clientSecret === undefined || problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, config: { credentials: { clientId, clientSecret }, itemIds } };
}

function readRequired(env: Env, name: string, problems: string[]): string | undefined {
  let value = env[name]?.trim();

  if (value !== undefined) {
    value = cleanToken(value);
  }

  if (value === undefined || value === "") {
    problems.push(`${name} is missing or empty. ${HOW_TO_SET}`);
    return undefined;
  }

  return value;
}

function readItemIds(env: Env, problems: string[]): readonly string[] {
  const name = "PLUGGY_ITEM_IDS";
  const raw = env[name]?.trim();

  if (raw === undefined || raw === "") {
    problems.push(
      `${name} is missing or empty. It holds the connection ids from your MeuPluggy dashboard, separated by commas. ${HOW_TO_SET}`,
    );
    return [];
  }

  const ids = raw
    .split(/[,;\n]+/)
    .map((id) => cleanToken(id))
    .filter((id) => id !== "");

  if (ids.length === 0) {
    problems.push(`${name} lists no ids, only separators.`);
    return [];
  }

  problems.push(...idProblems(name, ids));

  return ids;
}

function cleanToken(value: string): string {
  return value.replace(/^[\["'`\s]+|[\]"'`\s]+$/g, "");
}

/** Both problems are reported, because a list can be malformed *and* repeat itself. */
function idProblems(name: string, ids: readonly string[]): readonly string[] {
  const problems: string[] = [];

  const malformed = ids.filter((id) => !ITEM_ID.test(id));
  if (malformed.length > 0) {
    problems.push(`${name} has ${malformed.length} entry that is not a connection id: ${malformed.join(", ")}`);
  }

  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length > 0) {
    problems.push(`${name} lists a duplicate id: ${duplicates.join(", ")}`);
  }

  return problems;
}

export type System = {
  readonly platform: string;
  readonly home: string;
};

export type Paths = {
  readonly cacheDb: string;
  readonly dataDb: string;
};

/**
 * The two files of ADR §10. `XDG_CACHE_HOME`/`XDG_DATA_HOME` are honoured so a
 * fixture environment can point the web at a temp directory (that is how the
 * e2e suite and the integration tests run); macOS falls back to the same
 * directories the CLI uses, so the web and the CLI share one cache.
 */
export function resolvePaths(env: Env, system: System): Paths {
  const darwin = system.platform === "darwin";

  let cacheFallback: string;
  let dataFallback: string;
  if (darwin) {
    cacheFallback = join(system.home, "Library", "Caches");
    dataFallback = join(system.home, "Library", "Application Support");
  } else {
    cacheFallback = join(system.home, ".cache");
    dataFallback = join(system.home, ".local", "share");
  }

  const cacheHome = xdgHome(env, "XDG_CACHE_HOME", cacheFallback);
  const dataHome = xdgHome(env, "XDG_DATA_HOME", dataFallback);

  return {
    cacheDb: join(cacheHome, APP_DIR, "cache.db"),
    dataDb: join(dataHome, APP_DIR, "data.db"),
  };
}

/** The XDG spec says a relative path in one of these variables must be ignored. */
function xdgHome(env: Env, name: string, fallback: string): string {
  const value = env[name];
  if (value !== undefined && isAbsolute(value)) {
    return value;
  }
  return fallback;
}
