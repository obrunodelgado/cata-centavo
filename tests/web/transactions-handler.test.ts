import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Account, DerivedTransaction, Transaction, TransactionNoteStore, TransactionReader } from "@cata-centavo/core";
import { createTransactionReader } from "@cata-centavo/core";
import { toFailure } from "@cata-centavo/pluggy";
import { createCategoryWriter, createDescriptionOverrideStore, createSaqueMarkStore, createTransactionSplitStore, createTransactionStore, openDatabases } from "@cata-centavo/storage";

import type { CategoryWriteResponse, DescriptionWriteResponse, NoteWriteResponse, TransactionRowWriteResponse, TransactionsResponse } from "../../apps/web/lib/contracts.ts";
import { handleTransactions } from "../../apps/web/lib/handlers/transactions.ts";
import { handleTransactionCategory } from "../../apps/web/lib/handlers/transaction-category.ts";
import { handleTransactionDescription } from "../../apps/web/lib/handlers/transaction-description.ts";
import { handleTransactionNote } from "../../apps/web/lib/handlers/transaction-note.ts";
import { handleTransactionSaque } from "../../apps/web/lib/handlers/transaction-saque.ts";
import { handleTransactionSplit } from "../../apps/web/lib/handlers/transaction-split.ts";
import type { WebSource } from "../../apps/web/lib/server/composition.ts";
import { connection, fakeBank } from "../fakes/fake-bank.ts";
import { fixedClock } from "../fakes/fixed-clock.ts";
import { fakeLogger } from "../fakes/fake-logger.ts";
import { derived, tx } from "../fakes/transaction-builder.ts";

/**
 * Unit: the transactions handler against a fake bank and the real storage —
 * the two-file SQLite pair on temp dirs, so the category write below exercises
 * the real `CategoryWriter` and the next list call resolves through the
 * override. The note write is faked instead: the note store is another
 * surface's in-progress work, and the handler's contract is only that the
 * request reaches the store untouched and its verdict comes back as content.
 * Every declared query parameter provably changes the result set.
 */

const CONN_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACC_CASH = "acc-cash";
const ACC_CREDIT = "acc-credit";

const TODAY = "2026-08-30";
const CLOCK = fixedClock(new Date(`${TODAY}T12:00:00.000Z`));

/** A cash withdrawal as this bank files it: the CASH leaf, money out. */
const SAQUE = {
  id: "saque-1",
  accountId: ACC_CASH,
  connectionId: CONN_1,
  localDate: "2026-08-15",
  amountCents: -50_000,
  categoryId: "04010000",
  description: "Saque SAQUE DIGITAL CXE 46247373",
  descriptionNorm: "SAQUE SAQUE DIGITAL CXE 46247373",
};

function bankAccount(overrides: Partial<Account>): Account {
  return {
    id: "unused",
    connectionId: CONN_1,
    institution: "Nubank",
    name: "Conta",
    type: "BANK",
    subtype: null,
    amountCents: 100,
    currency: "BRL",
    lastUpdatedAt: new Date("2026-08-30T10:00:00.000Z"),
    credit: null,
    ...overrides,
  };
}

/** A cache row on the fixture's bank account, so the seeded store finds it. */
function row(overrides: Partial<Transaction>): Transaction {
  return tx({ accountId: ACC_CASH, connectionId: CONN_1, ...overrides });
}

type NoteWrite = { readonly transactionId: string; readonly note: string | null };

type Fixture = { readonly source: Extract<WebSource, { readonly ok: true }>; readonly noteWrites: NoteWrite[]; close(): void };

const open: Fixture[] = [];

function fixture(options: { readonly accounts: readonly Account[]; readonly rows: readonly Transaction[] }): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "cata-centavo-tx-handler-"));
  const databases = openDatabases({
    cacheDb: join(dir, "cache", "cache.db"),
    dataDb: join(dir, "data", "data.db"),
  });
  const log = fakeLogger();
  const store = createTransactionStore(databases.db, log, CLOCK);
  for (const account of options.accounts) {
    store.replaceAccount(account.id, account.connectionId, options.rows.filter((row) => row.accountId === account.id), "2026-08-30T10:00:00.000Z");
  }

  const bank = fakeBank({
    connections: [connection(CONN_1, { institution: "Nubank" })],
    accounts: { [CONN_1]: options.accounts },
    investments: {},
  });
  const reader = createTransactionReader({ bank, store, toFailure, log, clock: CLOCK });
  const writer = createCategoryWriter(databases.db, CLOCK);
  const noteWrites: NoteWrite[] = [];
  const noteWriter: TransactionNoteStore = {
    set: (transactionId, note) => {
      noteWrites.push({ transactionId, note });
      return { transactionId, note, known: true };
    },
  };

  const handle: Fixture = {
    source: {
      ok: true,
      connections: [CONN_1],
      bank,
      toFailure,
      reader,
      writer,
      noteWriter,
      saqueMarks: createSaqueMarkStore(databases.db, CLOCK),
      splits: createTransactionSplitStore(databases.db, CLOCK),
      descriptionOverrides: createDescriptionOverrideStore(databases.db, CLOCK),
      closingDays: { list: () => [], set: () => {}, delete: () => 0 },
      clock: CLOCK,
      close: () => databases.close(),
    },
    noteWrites,
    close: () => {
      databases.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  open.push(handle);
  return handle;
}

afterEach(() => {
  for (const handle of open.splice(0)) {
    handle.close();
  }
});

async function payload(source: WebSource, params: Record<string, string>): Promise<TransactionsResponse> {
  const response = await handleTransactions(source, new URLSearchParams(params));
  return (await response.json()) as TransactionsResponse;
}

function idsOf(body: Extract<TransactionsResponse, { readonly ok: true }>): readonly string[] {
  return body.rows.map((row) => row.id);
}

/** Seven rows chosen so each filter selects a disjoint, named subset. */
function seededRows(): readonly Transaction[] {
  return [
    row({ id: "salario", localDate: "2026-08-05", amountCents: 500_000, description: "Salário mensal", categoryId: "01000000", paymentMethod: "PIX" }),
    row({ id: "mercado", localDate: "2026-08-10", amountCents: -45_900, description: "PAG* Supermercado LTDA", descriptionNorm: "SUPERMERCADO", categoryId: "10000000" }),
    row({ id: "farmacia", localDate: "2026-08-12", amountCents: -8_900, description: "Farmácia Central", descriptionNorm: "FARMACIA CENTRAL", categoryId: "18000000" }),
    row({ id: "escola", localDate: "2026-08-14", amountCents: -32_000, description: "Débito escolar", categoryId: "06000000", document: "12345678900", counterpartyName: "Escola Saber Ltda" }),
    row({ id: "cartao", localDate: "2026-08-15", amountCents: -34_900, description: "Kindle — livro", categoryId: "21000000", accountId: ACC_CREDIT, accountType: "CREDIT", accountSubtype: "CREDIT_CARD" }),
    row({ id: "aplicacao", localDate: "2026-08-15", amountCents: -100_000, description: "Aplicação CDB", categoryId: "03000000" }),
    row({ id: "sem-cat", localDate: "2026-08-18", amountCents: -1_500, description: "PIX sem categoria", categoryId: null }),
    row({ id: "futura", localDate: "2026-09-15", amountCents: -12_000, description: "Parcela futura", categoryId: "05000000" }),
  ];
}

function seededFixture(rows: readonly Transaction[] = seededRows()): Fixture {
  return fixture({
    accounts: [
      bankAccount({ id: ACC_CASH, name: "Conta Nubank", amountCents: 1_843_210, subtype: "CHECKING_ACCOUNT" }),
      bankAccount({ id: ACC_CREDIT, name: "Cartão Nubank", type: "CREDIT", subtype: "CREDIT_CARD", amountCents: 352_270 }),
    ],
    rows,
  });
}

describe("handleTransactions — validation at the boundary", () => {
  it("rejects a malformed from with readable content", async () => {
    const fx = fixture({ accounts: [], rows: [] });
    const response = await handleTransactions(fx.source, new URLSearchParams({ from: "30/08/2026" }));
    assert.equal(response.status, 400);
    const body = (await response.json()) as TransactionsResponse;
    assert.equal(body.ok, false);
    if (!body.ok) {
      assert.ok(body.problems.some((problem) => problem.includes("from")));
    }
  });

  it("rejects from after to", async () => {
    const fx = fixture({ accounts: [], rows: [] });
    const response = await handleTransactions(fx.source, new URLSearchParams({ from: "2026-08-30", to: "2026-08-01" }));
    assert.equal(response.status, 400);
    const body = (await response.json()) as TransactionsResponse;
    assert.equal(body.ok, false);
    if (!body.ok) {
      assert.ok(body.problems.some((problem) => problem.includes("must not be after to")));
    }
  });

  it("rejects to without from", async () => {
    const fx = fixture({ accounts: [], rows: [] });
    const response = await handleTransactions(fx.source, new URLSearchParams({ to: "2026-08-30" }));
    assert.equal(response.status, 400);
  });

  it("rejects an unknown category id", async () => {
    const fx = fixture({ accounts: [], rows: [] });
    const response = await handleTransactions(fx.source, new URLSearchParams({ categoryIds: "alimentacao" }));
    assert.equal(response.status, 400);
    const body = (await response.json()) as TransactionsResponse;
    assert.equal(body.ok, false);
    if (!body.ok) {
      assert.ok(body.problems.some((problem) => problem.includes("alimentacao")));
    }
  });

  it("rejects a malformed cursor", async () => {
    const fx = fixture({ accounts: [], rows: [] });
    const response = await handleTransactions(fx.source, new URLSearchParams({ after: "not-a-token" }));
    assert.equal(response.status, 400);
  });

  it("rejects a limit outside 1..100", async () => {
    const fx = fixture({ accounts: [], rows: [] });
    for (const limit of ["0", "101", "abc"]) {
      const response = await handleTransactions(fx.source, new URLSearchParams({ limit }));
      assert.equal(response.status, 400, `limit=${limit}`);
    }
  });

  it("reports configuration problems instead of crashing", async () => {
    const broken: WebSource = { ok: false, problems: ["PLUGGY_CLIENT_ID is missing."] };
    const response = await handleTransactions(broken, new URLSearchParams());
    const body = (await response.json()) as TransactionsResponse;
    assert.equal(body.ok, false);
    if (!body.ok) {
      assert.deepEqual(body.problems, ["PLUGGY_CLIENT_ID is missing."]);
    }
  });
});

describe("handleTransactions — every parameter provably changes the result set", () => {
  it("bounds the window inclusively at both ends", async () => {
    const fx = seededFixture();
    const body = await payload(fx.source, { from: "2026-08-10", to: "2026-08-12" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.deepEqual(idsOf(body), ["farmacia", "mercado"]);
  });

  it("searches the description and the counterparty, accent-insensitively", async () => {
    const fx = seededFixture();
    const body = await payload(fx.source, { q: "farmacia", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.deepEqual(idsOf(body), ["farmacia"]);
  });

  it("searches the counterparty by name", async () => {
    const fx = seededFixture();
    const body = await payload(fx.source, { q: "Escola Saber", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.deepEqual(idsOf(body), ["escola"]);
  });

  it("filters by top-level category, including none", async () => {
    const fx = seededFixture();
    const mercado = await payload(fx.source, { categoryIds: "10000000", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(mercado.ok, true);
    if (!mercado.ok) return;
    assert.deepEqual(idsOf(mercado), ["mercado"]);

    const none = await payload(fx.source, { categoryIds: "none", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(none.ok, true);
    if (!none.ok) return;
    assert.deepEqual(idsOf(none), ["sem-cat"]);
  });

  it("a split saque lists under its alocações' categories and leaves none", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    await handleTransactionSplit(fx.source, saqueRequest({
      transactionId: "saque-1",
      allocations: [{ categoryId: "10000000", amountCents: 50_000 }],
    }));

    const mercado = await payload(fx.source, { categoryIds: "10000000", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(mercado.ok, true);
    if (!mercado.ok) return;
    assert.deepEqual(idsOf(mercado), ["saque-1"]);

    const none = await payload(fx.source, { categoryIds: "none", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(none.ok, true);
    if (!none.ok) return;
    assert.deepEqual(idsOf(none), []);
  });

  it("a saque's sobra keeps it under none while its alocações name their categories", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    await handleTransactionSplit(fx.source, saqueRequest({
      transactionId: "saque-1",
      allocations: [{ categoryId: "10000000", amountCents: 30_000 }],
    }));

    const mercado = await payload(fx.source, { categoryIds: "10000000", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(mercado.ok, true);
    if (!mercado.ok) return;
    assert.deepEqual(idsOf(mercado), ["saque-1"]);

    const none = await payload(fx.source, { categoryIds: "none", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(none.ok, true);
    if (!none.ok) return;
    assert.deepEqual(idsOf(none), ["saque-1"]);
  });

  it("puts a credit-card debit and a bank debit in the same despesas set", async () => {
    const fx = seededFixture();
    const body = await payload(fx.source, { type: "despesas", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    assert.ok(idsOf(body).includes("cartao"), "a card debit is a despesa");
    assert.ok(idsOf(body).includes("mercado"), "a bank debit is a despesa");
    assert.ok(!idsOf(body).includes("salario"), "an income row is not a despesa");
  });

  it("an internal transfer is never a receita or a despesa — only todas shows it", async () => {
    const fx = seededFixture();

    const todas = await payload(fx.source, { from: "2026-08-01", to: "2026-09-30" });
    assert.equal(todas.ok, true);
    if (!todas.ok) return;
    const aplicacao = todas.rows.find((row) => row.id === "aplicacao");
    assert.equal(aplicacao?.internal, true, "the application is an internal transfer");
    assert.ok(idsOf(todas).includes("aplicacao"), "todas shows it");

    const despesas = await payload(fx.source, { type: "despesas", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(despesas.ok, true);
    if (!despesas.ok) return;
    assert.ok(!idsOf(despesas).includes("aplicacao"), "the application is not a despesa");

    const receitas = await payload(fx.source, { type: "receitas", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(receitas.ok, true);
    if (!receitas.ok) return;
    assert.ok(!idsOf(receitas).includes("aplicacao"), "the application is not a receita");
    assert.deepEqual(idsOf(receitas), ["salario"]);
  });

  it("caps the limit at 100 and defaults to 50", async () => {
    const many = Array.from({ length: 150 }, (_, index) =>
      row({ id: `row-${String(index).padStart(3, "0")}`, localDate: "2026-08-15", amountCents: -(index + 1), description: `Gasto ${index}`, categoryId: "08000000" }),
    );
    const fx = seededFixture(many);

    const rejected = await handleTransactions(fx.source, new URLSearchParams({ limit: "150", from: "2026-08-01", to: "2026-09-30" }));
    assert.equal(rejected.status, 400, "a limit above the cap is a boundary error, not a silent clamp");

    const capped = await payload(fx.source, { limit: "100", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(capped.ok, true);
    if (!capped.ok) return;
    assert.equal(capped.rows.length, 100, "the hard cap holds");
    assert.equal(capped.totalInWindow, 150, "the count is the window's, not the page's");
    assert.equal(capped.hasMore, true);

    const defaults = await payload(fx.source, { from: "2026-08-01", to: "2026-09-30" });
    assert.equal(defaults.ok, true);
    if (!defaults.ok) return;
    assert.equal(defaults.rows.length, 50);
  });

  it("pages with the opaque cursor, visiting every row exactly once", async () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      row({ id: `row-${String(index).padStart(2, "0")}`, localDate: "2026-08-15", amountCents: -(index + 1), description: `Gasto ${index}`, categoryId: "08000000" }),
    );
    const fx = seededFixture(many);

    const seen: string[] = [];
    let after: string | undefined;
    for (;;) {
      const body = await payload(fx.source, { limit: "10", from: "2026-08-01", to: "2026-09-30", ...(after !== undefined ? { after } : {}) });
      assert.equal(body.ok, true);
      if (!body.ok) return;
      seen.push(...body.rows.map((row) => row.id));
      if (!body.hasMore) {
        break;
      }
      assert.ok(body.nextAfter !== null);
      after = body.nextAfter;
    }

    assert.equal(new Set(seen).size, 25, "no repeats, no skips");
    assert.equal(seen.length, 25);
  });

  it("derives the row fields: status, forma de pagamento, account name, derivation source", async () => {
    const fx = seededFixture();
    const body = await payload(fx.source, { from: "2026-08-01", to: "2026-09-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;

    const future = body.rows.find((row) => row.id === "futura");
    assert.equal(future?.status, "Futuro", "a row after today is Futuro");
    const past = body.rows.find((row) => row.id === "salario");
    assert.equal(past?.status, "Pago");
    assert.equal(past?.paymentMethod, "PIX", "the wire's payment method renders as itself");
    assert.equal(past?.accountName, "Conta Nubank");

    const card = body.rows.find((row) => row.id === "cartao");
    assert.equal(card?.paymentMethod, "Cartão", "a card row without paymentData is Cartão");
    assert.equal(card?.categoryName, "Lazer");

    const uncategorized = body.rows.find((row) => row.id === "sem-cat");
    assert.equal(uncategorized?.categoryName, "Sem categoria");
    assert.equal(uncategorized?.categorySrc, null);
  });
});

describe("handleTransactions — the breakdown sidebar", () => {
  it("respects q and type, ignores the category filter, excludes internal transfers", async () => {
    const fx = seededFixture();

    const filtered = await payload(fx.source, { q: "farmacia", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(filtered.ok, true);
    if (!filtered.ok) return;
    assert.deepEqual(
      filtered.breakdown.map((slice) => [slice.categoryId, slice.totalCents, slice.count]),
      [["18000000", 8_900, 1]],
      "the breakdown follows the search",
    );

    const withCategory = await payload(fx.source, { categoryIds: "18000000", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(withCategory.ok, true);
    if (!withCategory.ok) return;
    assert.ok(
      withCategory.breakdown.some((slice) => slice.categoryId === "10000000"),
      "the category filter never narrows the sidebar",
    );

    const receitas = await payload(fx.source, { type: "receitas", from: "2026-08-01", to: "2026-09-30" });
    assert.equal(receitas.ok, true);
    if (!receitas.ok) return;
    assert.deepEqual(
      receitas.breakdown.map((slice) => slice.categoryId),
      ["01000000"],
      "the breakdown follows the tipo filter",
    );

    const todas = await payload(fx.source, { from: "2026-08-01", to: "2026-09-30" });
    assert.equal(todas.ok, true);
    if (!todas.ok) return;
    assert.ok(
      !todas.breakdown.some((slice) => slice.categoryId === "03000000"),
      "internal transfers never reach the sidebar",
    );
    assert.ok(
      todas.breakdown.some((slice) => slice.categoryId === null),
      "Sem categoria is a slice like any other",
    );
  });
});

describe("handleTransactionCategory — the write boundary", () => {
  it("reports unknown ids as readable content with a 200", async () => {
    const fx = seededFixture();
    const request = new Request("http://local/api/transactions/category", {
      method: "POST",
      body: JSON.stringify({ ids: ["missing-1", "missing-2"], categoryId: "18000000" }),
    });
    const response = await handleTransactionCategory(fx.source, request);
    assert.equal(response.status, 200);
    const body = (await response.json()) as CategoryWriteResponse;
    assert.deepEqual(body, { updated: 0, unknownIds: ["missing-1", "missing-2"] });
  });

  it("rejects a free-form category with readable content", async () => {
    const fx = seededFixture();
    const request = new Request("http://local/api/transactions/category", {
      method: "POST",
      body: JSON.stringify({ ids: ["mercado"], categoryId: "alimentacao" }),
    });
    const response = await handleTransactionCategory(fx.source, request);
    assert.equal(response.status, 400);
  });

  it("persists the correction and the next list resolves it through the override", async () => {
    const fx = seededFixture();
    const write = await handleTransactionCategory(
      fx.source,
      new Request("http://local/api/transactions/category", {
        method: "POST",
        body: JSON.stringify({ ids: ["mercado"], categoryId: "11000000" }),
      }),
    );
    assert.equal(write.status, 200);
    const written = (await write.json()) as CategoryWriteResponse;
    assert.deepEqual(written, { updated: 1, unknownIds: [] });

    const body = await payload(fx.source, { from: "2026-08-01", to: "2026-09-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    const mercado = body.rows.find((row) => row.id === "mercado");
    assert.equal(mercado?.categoryId, "11000000");
    assert.equal(mercado?.categoryName, "Alimentos e bebidas");
    assert.equal(mercado?.categorySrc, "override", "the modal's 'corrigida por você' comes from here");
  });
});

describe("handleTransactionNote — the note write boundary", () => {
  function noteRequest(body: unknown): Request {
    return new Request("http://local/api/transactions/note", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("hands the transactionId and note to the store raw and returns its verdict", async () => {
    const fx = seededFixture();
    const response = await handleTransactionNote(fx.source, noteRequest({ transactionId: "mercado", note: "  presente da Marina  " }));
    assert.equal(response.status, 200);
    assert.deepEqual(fx.noteWrites, [{ transactionId: "mercado", note: "  presente da Marina  " }], "the boundary passes the value through; the store owns the trim");
    const body = (await response.json()) as NoteWriteResponse;
    assert.deepEqual(body, { transactionId: "mercado", note: "  presente da Marina  ", known: true });
  });

  it("forwards an empty note so the store clears it", async () => {
    const fx = seededFixture();
    const response = await handleTransactionNote(fx.source, noteRequest({ transactionId: "mercado", note: "   " }));
    assert.equal(response.status, 200);
    assert.deepEqual(fx.noteWrites, [{ transactionId: "mercado", note: "   " }], "the boundary does not pre-trim or reject absence");
  });

  it("passes a known:false verdict through as readable content with a 200", async () => {
    const fx = seededFixture();
    const source: WebSource = { ...fx.source, noteWriter: { set: (transactionId, note) => ({ transactionId, note, known: false }) } };
    const response = await handleTransactionNote(source, noteRequest({ transactionId: "ghost", note: "sumiu" }));
    assert.equal(response.status, 200);
    const body = (await response.json()) as NoteWriteResponse;
    assert.deepEqual(body, { transactionId: "ghost", note: "sumiu", known: false });
  });

  it("rejects an invalid body with readable problems, never reaching the store", async () => {
    const fx = seededFixture();
    const bodies: unknown[] = [
      { note: "sem transactionId" },
      { transactionId: "", note: "id vazio" },
      { transactionId: "mercado" },
      { transactionId: "mercado", note: "x".repeat(501) },
      "not json",
    ];
    for (const body of bodies) {
      const response = await handleTransactionNote(fx.source, noteRequest(body));
      assert.equal(response.status, 400, `body=${JSON.stringify(body)}`);
      const parsed = (await response.json()) as { ok: boolean; problems?: readonly string[] };
      assert.equal(parsed.ok, false);
      assert.ok((parsed.problems ?? []).length > 0, "the problems array is readable content");
    }
    assert.deepEqual(fx.noteWrites, [], "an invalid body never reaches the store");
  });

  it("reports configuration problems instead of crashing", async () => {
    const broken: WebSource = { ok: false, problems: ["PLUGGY_CLIENT_ID is missing."] };
    const response = await handleTransactionNote(broken, noteRequest({ transactionId: "mercado", note: "x" }));
    const body = (await response.json()) as { ok: boolean; problems?: readonly string[] };
    assert.equal(body.ok, false);
    assert.deepEqual(body.problems, ["PLUGGY_CLIENT_ID is missing."]);
  });
});

describe("handleTransactions — the note on the wire", () => {
  it("carries the row's note into the list payload, absence as null", async () => {
    const rows: readonly DerivedTransaction[] = [
      derived({ id: "anotada", localDate: "2026-08-15", amountCents: -1_000, description: "Presente", note: "presente da Marina" }),
      derived({ id: "limpa", localDate: "2026-08-16", amountCents: -2_000, description: "Sem nota", note: null }),
    ];
    const source: WebSource = {
      ok: true,
      connections: [],
      bank: fakeBank({ connections: [], accounts: {}, investments: {} }),
      toFailure,
      reader: readerReading(rows),
      writer: { setCategory: () => ({ updated: 0, unknownIds: [] }), setCounterpartyCategory: () => ({ affected: 0 }) },
      noteWriter: { set: () => ({ transactionId: "", note: null, known: false }) },
      saqueMarks: { set: () => ({ transactionId: "", known: false, recognised: null, problem: null }) },
      splits: { set: () => ({ transactionId: "", known: false, allocations: [], problem: null }) },
      descriptionOverrides: { set: () => ({ transactionId: "", known: false, updated: 0, description: "", problem: null }) },
      closingDays: { list: () => [], set: () => {}, delete: () => 0 },
      clock: CLOCK,
      close: () => {},
    };

    const body = await payload(source, { from: "2026-08-01", to: "2026-09-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.rows.find((row) => row.id === "anotada")?.note, "presente da Marina");
    assert.equal(body.rows.find((row) => row.id === "limpa")?.note, null);
  });
});

/** A reader that answers `query` from a fixed derived set — no storage underneath. */
function readerReading(rows: readonly DerivedTransaction[]): TransactionReader {
  return {
    load: async () => ({ accounts: [], unavailable: [] }),
    query: () => rows,
    byIds: () => [],
    cardRows: () => [],
    dataThrough: () => new Map(),
  };
}

/* ─── saque marks, splits and renames on the wire (ADR-0004) ────── */

function saqueRequest(body: unknown): Request {
  return new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

describe("handleTransactionSaque", () => {
  it("marks a CASH-leaf row as a saque and answers with the fresh row", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    const response = await handleTransactionSaque(fx.source, saqueRequest({ transactionId: "saque-1", recognised: "saque" }));

    assert.equal(response.status, 200);
    const body = (await response.json()) as Extract<TransactionRowWriteResponse, { ok: true }>;
    assert.equal(body.ok, true);
    assert.equal(body.row.recognised, "saque");
    assert.equal(body.row.paymentMethod, "Saque");
    assert.equal(body.row.internal, false, "a recognised saque is never an internal transfer");
  });

  it("a stored denial returns the row to the internal population", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    await handleTransactionSaque(fx.source, saqueRequest({ transactionId: "saque-1", recognised: "saque" }));

    const response = await handleTransactionSaque(fx.source, saqueRequest({ transactionId: "saque-1", recognised: "none" }));
    const body = (await response.json()) as Extract<TransactionRowWriteResponse, { ok: true }>;

    assert.equal(body.row?.recognised, null);
    assert.equal(body.row?.internal, true, "denied, the row is an internal transfer again");
    assert.equal(body.row?.paymentMethod, "—", "the wire's own payment method is back");
  });

  it("refuses a mark that contradicts the row's direction", async () => {
    const fx = seededFixture([tx({ ...SAQUE, amountCents: 26_000 })]);
    const response = await handleTransactionSaque(fx.source, saqueRequest({ transactionId: "saque-1", recognised: "saque" }));

    assert.equal(response.status, 400);
    const body = (await response.json()) as { ok: boolean; problems?: readonly string[] };
    assert.equal(body.ok, false);
    assert.ok((body.problems ?? []).length > 0);
  });

  it("answers a stale id with row: null", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    const response = await handleTransactionSaque(fx.source, saqueRequest({ transactionId: "ghost", recognised: "saque" }));

    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; row: unknown };
    assert.equal(body.ok, true);
    assert.equal(body.row, null);
  });

  it("rejects an invalid body with readable problems", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    const bodies: unknown[] = [
      { recognised: "saque" },
      { transactionId: "saque-1", recognised: "pix" },
      { transactionId: "saque-1" },
    ];
    for (const body of bodies) {
      const response = await handleTransactionSaque(fx.source, saqueRequest(body));
      assert.equal(response.status, 400, `body=${JSON.stringify(body)}`);
    }
  });
});

describe("handleTransactionSplit", () => {
  it("stores the split and answers with the fresh row carrying the alocações", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    const response = await handleTransactionSplit(fx.source, saqueRequest({
      transactionId: "saque-1",
      allocations: [
        { categoryId: "10000000", amountCents: 30_000 },
        { categoryId: "18000000", amountCents: 15_000 },
      ],
    }));

    assert.equal(response.status, 200);
    const body = (await response.json()) as Extract<TransactionRowWriteResponse, { ok: true }>;
    assert.equal(body.row.allocations.length, 2);
    assert.equal(body.row.allocations[0]?.categoryId, "10000000");
  });

  it("refuses a split whose sum overflows the saque", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    const response = await handleTransactionSplit(fx.source, saqueRequest({
      transactionId: "saque-1",
      allocations: [
        { categoryId: "10000000", amountCents: 40_000 },
        { categoryId: "18000000", amountCents: 20_000 },
      ],
    }));

    assert.equal(response.status, 400);
    const body = (await response.json()) as { ok: boolean; problems?: readonly string[] };
    assert.ok((body.problems ?? []).some((problem) => problem.includes("exceeds")));
  });

  it("refuses a split on a row that is not a recognised saque", async () => {
    const fx = seededFixture();
    const response = await handleTransactionSplit(fx.source, saqueRequest({
      transactionId: "mercado",
      allocations: [{ categoryId: "10000000", amountCents: 500 }],
    }));

    assert.equal(response.status, 400);
    const body = (await response.json()) as { ok: boolean; problems?: readonly string[] };
    assert.ok((body.problems ?? []).some((problem) => problem.includes("saque")));
  });

  it("an empty array undoes the split and the fresh row carries no alocações", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    await handleTransactionSplit(fx.source, saqueRequest({
      transactionId: "saque-1",
      allocations: [{ categoryId: "10000000", amountCents: 30_000 }],
    }));

    const response = await handleTransactionSplit(fx.source, saqueRequest({ transactionId: "saque-1", allocations: [] }));
    const body = (await response.json()) as Extract<TransactionRowWriteResponse, { ok: true }>;

    assert.deepEqual(body.row.allocations, []);
  });

  it("rejects an unknown category with readable problems", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    const response = await handleTransactionSplit(fx.source, saqueRequest({
      transactionId: "saque-1",
      allocations: [{ categoryId: "alimentacao", amountCents: 500 }],
    }));

    assert.equal(response.status, 400);
  });
});

describe("handleTransactionDescription", () => {
  it("renames the family and answers with the count", async () => {
    const fx = seededFixture([
      tx({ ...SAQUE, id: "saque-1" }),
      tx({ ...SAQUE, id: "saque-2" }),
    ]);
    const response = await handleTransactionDescription(fx.source, saqueRequest({ transactionId: "saque-1", description: "  Saque para a feira  " }));

    assert.equal(response.status, 200);
    const body = (await response.json()) as Extract<DescriptionWriteResponse, { ok: true }>;
    assert.equal(body.updated, 2);
    assert.equal(body.description, "Saque para a feira");
  });

  it("refuses an empty name", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    const response = await handleTransactionDescription(fx.source, saqueRequest({ transactionId: "saque-1", description: "   " }));

    assert.equal(response.status, 400);
  });

  it("answers a stale id as readable content", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    const response = await handleTransactionDescription(fx.source, saqueRequest({ transactionId: "ghost", description: "sumiu" }));

    assert.equal(response.status, 200);
    const body = (await response.json()) as { known: boolean; updated: number };
    assert.equal(body.known, false);
    assert.equal(body.updated, 0);
  });
});

describe("handleTransactions — the saque on the wire", () => {
  it("carries the recognition and the alocações into the list payload", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    fx.source.saqueMarks.set("saque-1", "saque");
    fx.source.splits.set("saque-1", [
      { categoryId: "10000000", amountCents: 30_000 },
      { categoryId: "18000000", amountCents: 15_000 },
    ]);

    const body = await payload(fx.source, { from: "2026-08-01", to: "2026-09-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    const saque = body.rows.find((row) => row.id === "saque-1");
    assert.equal(saque?.recognised, "saque");
    assert.equal(saque?.paymentMethod, "Saque");
    assert.equal(saque?.internal, false);
    assert.equal(saque?.allocations.length, 2);
    assert.equal(body.unallocatedSaqueCents, 5_000);
  });

  it("an unsplit saque owes its whole value to the sobra", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    fx.source.saqueMarks.set("saque-1", "saque");

    const body = await payload(fx.source, { from: "2026-08-01", to: "2026-09-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.unallocatedSaqueCents, 50_000);
  });

  it("a fully allocated saque owes nothing", async () => {
    const fx = seededFixture([tx(SAQUE)]);
    fx.source.saqueMarks.set("saque-1", "saque");
    fx.source.splits.set("saque-1", [{ categoryId: "10000000", amountCents: 50_000 }]);

    const body = await payload(fx.source, { from: "2026-08-01", to: "2026-09-30" });
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.unallocatedSaqueCents, 0);
  });
});
