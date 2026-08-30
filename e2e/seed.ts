import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import { resolvePaths, type Paths, type System } from "../apps/web/lib/server/config.ts";
import { createFixtureEnv } from "../tests/web/integration/fixture-db.ts";
import { startPluggyMock } from "../tests/web/integration/pluggy-mock.ts";

/**
 * The e2e fixture environment. Creates fresh temp XDG dirs, seeds both SQLite
 * files through the real stores, starts the Pluggy mock, writes the full
 * environment to `e2e/.e2e-env.json` and then spawns the web server with it.
 *
 * The fixture is fully synthetic and dated relative to run-time today, so the
 * suite is deterministic on any day. The fixture env is built on `mktemp`
 * dirs, so it structurally cannot touch the real wallet; the guard below pins
 * that invariant and refuses any future change that would resolve the fixture
 * to the real homes.
 */

const SYSTEM: System = { platform: process.platform, home: homedir() };

/** The safety invariant: the fixture paths must never be the real wallet homes. */
export function guardFixturePaths(paths: Paths, system: System): void {
  const fallback = resolvePaths({}, system);
  if (paths.cacheDb === fallback.cacheDb || paths.dataDb === fallback.dataDb) {
    throw new Error(
      `refusing to seed the e2e fixture: the paths resolve to the real wallet homes (${fallback.cacheDb}). ` +
        "The fixture environment must never point at a populated wallet.",
    );
  }
}

type FixtureData = {
  readonly env: Readonly<Record<string, string>>;
  readonly mockBaseUrl: string;
  /** Closes the mock and removes the temp dirs; call when the server exits. */
  cleanup(): void;
};

export async function seedFixture(): Promise<FixtureData> {
  const connectionId = "e2e00000-0000-4000-8000-000000000001";
  const accountId = "e2e-account-bank-1";
  const today = new Date();

  const fixture = createFixtureEnv({
    accounts: [
      {
        id: accountId,
        connectionId,
        institution: "E2E Bank",
        name: "Conta E2E",
        type: "BANK",
        subtype: "CONTA_CORRENTE",
        amountCents: 1843210,
        currency: "BRL",
        lastUpdatedAt: null,
        credit: null,
      },
    ],
    transactionsByAccount: {
      [accountId]: [
        seededTransaction(accountId, connectionId, today, -4590, "MERCADO E2E"),
        seededTransaction(accountId, connectionId, shiftDays(today, -1), 100000, "PIX RECEBIDO E2E"),
        seededTransaction(accountId, connectionId, shiftDays(today, -2), -11990, "ACADEMIA E2E"),
      ],
    },
  });

  guardFixturePaths(fixture.paths, SYSTEM);

  const mock = await startPluggyMock({
    connections: {
      [connectionId]: {
        institution: "E2E Bank",
        status: "UPDATED",
        executionStatus: "SUCCESS",
        lastUpdatedAt: new Date().toISOString(),
        consent: { expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, products: ["TRANSACTIONS"] },
        accounts: [
          { id: accountId, itemId: connectionId, type: "BANK", subtype: "CONTA_CORRENTE", name: "Conta E2E", balance: 18432.1, currencyCode: "BRL" },
        ],
        transactions: [
          wireTransaction(accountId, today, -4590, "MERCADO E2E"),
          wireTransaction(accountId, shiftDays(today, -1), 100000, "PIX RECEBIDO E2E"),
          wireTransaction(accountId, shiftDays(today, -2), -11990, "ACADEMIA E2E"),
        ],
      },
    },
  });

  const env = { ...fixture.env, PLUGGY_API_URL: mock.baseUrl };
  writeFileSync(new URL("./.e2e-env.json", import.meta.url), JSON.stringify(env, null, 2));

  return {
    env,
    mockBaseUrl: mock.baseUrl,
    cleanup: () => {
      void mock.close();
      fixture.close();
    },
  };
}

function seededTransaction(accountId: string, connectionId: string, day: Date, amountCents: number, description: string) {
  const iso = day.toISOString().slice(0, 10);
  return {
    id: `e2e-tx-${description.toLowerCase().replace(/[^a-z]/g, "-")}`,
    accountId,
    connectionId,
    accountType: "BANK" as const,
    accountSubtype: null,
    occurredAt: `${iso}T12:00:00.000Z`,
    localDate: iso,
    amountCents,
    currency: "BRL",
    originalAmountCents: null,
    originalCurrency: null,
    description,
    descriptionNorm: description,
    categoryId: null,
    document: null,
    counterpartyName: null,
    paymentMethod: null,
    mcc: null,
    billId: null,
    billForecastDate: null,
    instalmentNumber: null,
    instalmentTotal: null,
    purchaseDate: null,
  };
}

function wireTransaction(accountId: string, day: Date, amountCents: number, description: string) {
  const iso = day.toISOString().slice(0, 10);
  return {
    id: `e2e-tx-${description.toLowerCase().replace(/[^a-z]/g, "-")}`,
    accountId,
    date: `${iso}T12:00:00.000Z`,
    description,
    amount: amountCents / 100,
    amountInAccountCurrency: amountCents / 100,
    currencyCode: "BRL",
    category: null,
    categoryId: null,
    status: "POSTED",
  };
}

function shiftDays(day: Date, offset: number): Date {
  const shifted = new Date(day);
  shifted.setDate(shifted.getDate() + offset);
  return shifted;
}

/** Runs only when executed directly: seed, then spawn the web server with the fixture env. */
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { env, cleanup } = await seedFixture();

  let child: ReturnType<typeof spawn>;
  if (process.env.E2E_PROD === "1") {
    // CI mode: no dev compilation at all — build once, then serve the build.
    await runChild("npm", ["run", "build:web"], env);
    child = spawn("npm", ["run", "start", "-w", "@cata-centavo/web"], {
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
  } else {
    child = spawn("npm", ["run", "dev:web"], {
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
  }

  await warmUpServer();
  child.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }
}

async function runChild(command: string, args: readonly string[], env: Readonly<Record<string, string>>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { env: { ...process.env, ...env }, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
    child.on("error", reject);
  });
}

/**
 * The dev server compiles each route on first hit (Turbopack cold start takes
 * ~15s on this codebase). Warming up here — before Playwright's url check even
 * runs — is what keeps the first tests from racing the compiler.
 */
async function warmUpServer(): Promise<void> {
  const baseUrl = "http://127.0.0.1:3000";
  const deadline = Date.now() + 120_000;

  for (;;) {
    try {
      const response = await fetch(baseUrl + "/");
      if (response.status < 500) {
        break;
      }
    } catch {
      // server not listening yet
    }
    if (Date.now() > deadline) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const routes = ["/api/sources", "/api/accounts", "/api/sync"];
  for (const route of routes) {
    try {
      await fetch(baseUrl + route);
    } catch {
      // best effort; the tests themselves will surface a broken route
    }
  }
}
