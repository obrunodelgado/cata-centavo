import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import { localDayOf, type Transaction } from "@cata-centavo/core";

import { resolvePaths, type Paths, type System } from "../apps/web/lib/server/config.ts";
import { createFixtureEnv } from "../tests/web/integration/fixture-db.ts";
import { startPluggyMock, type MockTransaction } from "../tests/web/integration/pluggy-mock.ts";

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
  const rows = seededRows(accountId, connectionId);

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
      [accountId]: rows.map((row) => row.cache),
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
        transactions: rows.map((row) => row.wire),
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

type SeededRow = {
  readonly cache: Transaction;
  readonly wire: MockTransaction;
};

type SeedSpec = {
  readonly amountCents: number;
  readonly description: string;
  readonly categoryId: string | null;
  readonly paymentMethod: string | null;
};

type RecurringSpec = SeedSpec & { readonly day: number };

/**
 * Twelve months of transactions dated relative to run-time today, in São
 * Paulo calendar days (the cache's `local_date` unit — a UTC date drifts from
 * the anchor during the 21:00–00:00 UTC window).
 *
 * The current month holds exactly three today-dated rows with pinned figures
 * (MERCADO −R$ 45,90, PIX +R$ 1.000,00, ACADEMIA −R$ 119,90), so the fine
 * ranges (1D/1S/1M) show Receitas R$ 1.000,00, Despesas R$ 165,80, taxa 83,4%
 * on any run day. The previous eleven months carry the recurring rows that
 * give the 3M/6M/12M series their shape — and, since the KPI band covers the
 * whole window, the default 6M figures are Receitas R$ 55.200,00 (5 ×
 * (984.000 + 100.000) + 100.000 — the window ends at the anchor, so it holds
 * five full recurring months plus the anchor month's today-dated rows),
 * Despesas R$ 15.231,30 (5 × 301.310 + 16.580), taxa 72,4%.
 */
function seededRows(accountId: string, connectionId: string): readonly SeededRow[] {
  const today = spToday();
  const rows: SeededRow[] = [];

  const recurring: readonly RecurringSpec[] = [
    { day: 3, amountCents: 984000, description: "SALARIO E2E", categoryId: "01000000", paymentMethod: null },
    { day: 5, amountCents: -240000, description: "ALUGUEL E2E", categoryId: "17000000", paymentMethod: null },
    { day: 10, amountCents: -45900, description: "MERCADO E2E", categoryId: "10000000", paymentMethod: null },
    { day: 15, amountCents: -3420, description: "UBER E2E", categoryId: "19000000", paymentMethod: null },
    { day: 20, amountCents: -11990, description: "ACADEMIA E2E", categoryId: "18000000", paymentMethod: null },
    { day: 25, amountCents: 100000, description: "PIX RECEBIDO E2E", categoryId: "01000000", paymentMethod: "PIX" },
  ];
  for (let monthsBack = 1; monthsBack <= 11; monthsBack += 1) {
    for (const spec of recurring) {
      rows.push(seededRow(accountId, connectionId, monthDay(today, monthsBack, spec.day), spec));
    }
  }

  const pinned: readonly SeedSpec[] = [
    { amountCents: -4590, description: "MERCADO E2E", categoryId: "10000000", paymentMethod: null },
    { amountCents: 100000, description: "PIX RECEBIDO E2E", categoryId: "01000000", paymentMethod: "PIX" },
    { amountCents: -11990, description: "ACADEMIA E2E", categoryId: "18000000", paymentMethod: null },
  ];
  for (const spec of pinned) {
    rows.push(seededRow(accountId, connectionId, today, spec));
  }

  return rows;
}

function seededRow(accountId: string, connectionId: string, localDate: string, spec: SeedSpec): SeededRow {
  const slug = spec.description.toLowerCase().replace(/[^a-z]/g, "-");
  const id = `e2e-tx-${localDate.slice(0, 7).replace("-", "")}-${slug}`;
  const occurredAt = `${localDate}T12:00:00.000Z`;

  return {
    cache: {
      id,
      accountId,
      connectionId,
      accountType: "BANK",
      accountSubtype: "CONTA_CORRENTE",
      occurredAt,
      localDate,
      amountCents: spec.amountCents,
      currency: "BRL",
      originalAmountCents: null,
      originalCurrency: null,
      description: spec.description,
      descriptionNorm: spec.description,
      categoryId: spec.categoryId,
      document: null,
      counterpartyName: null,
      paymentMethod: spec.paymentMethod,
      mcc: null,
      billId: null,
      billForecastDate: null,
      instalmentNumber: null,
      instalmentTotal: null,
      purchaseDate: null,
    },
    wire: {
      id,
      accountId,
      date: occurredAt,
      description: spec.description,
      amount: spec.amountCents / 100,
      amountInAccountCurrency: spec.amountCents / 100,
      currencyCode: "BRL",
      category: null,
      categoryId: spec.categoryId,
      status: "POSTED",
      ...(spec.paymentMethod === null ? {} : { paymentData: { paymentMethod: spec.paymentMethod, receiver: null } }),
    },
  };
}

/** Today's calendar day in São Paulo — the anchor the server computes. */
function spToday(): string {
  return localDayOf(new Date().toISOString());
}

/** A calendar day `monthsBack` months before `today`, at a fixed day of month. */
function monthDay(today: string, monthsBack: number, day: number): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const total = year * 12 + (month - 1) - monthsBack;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total % 12 + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${pad(targetMonth)}-${pad(clampedDay)}`;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    if (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
      return 29;
    }
    return 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
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

  const routes = ["/api/sources", "/api/accounts", "/api/sync", "/api/overview"];
  for (const route of routes) {
    try {
      await fetch(baseUrl + route);
    } catch {
      // best effort; the tests themselves will surface a broken route
    }
  }
}
