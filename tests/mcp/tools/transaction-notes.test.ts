import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TransactionNoteStore } from "@cata-centavo/core";
import { handleSetTransactionNote } from "../../../apps/cli/src/mcp/tools/transaction-notes.ts";
import { fakeLogger } from "../../fakes/fake-logger.ts";

function fakeNoteWriter(overrides: Partial<TransactionNoteStore> = {}): TransactionNoteStore {
  return {
    set: (transactionId) => ({ transactionId, note: null, known: false }),
    ...overrides,
  };
}

function textOf(res: { readonly content: readonly { readonly type: string; readonly text?: string }[] }): string {
  const first = res.content[0];
  assert.ok(first !== undefined && first.type === "text" && first.text !== undefined);
  return first.text;
}

describe("setTransactionNote tool", () => {
  it("passes transactionId and note to the store raw and returns the store's result", async () => {
    let calledWith: unknown = null;
    const noteWriter = fakeNoteWriter({
      set: (transactionId, note) => {
        calledWith = { transactionId, note };
        return { transactionId, note: "presente da Marina", known: true };
      },
    });

    const deps = {
      source: { ok: true as const, connections: [], bank: {} as never, toFailure: () => ({ kind: "unavailable" as const, message: "" }), reader: {} as never, writer: {} as never, noteWriter },
      log: fakeLogger(),
      reader: null,
      writer: null,
      noteWriter,
      clock: { now: () => new Date() },
    };

    const res = await handleSetTransactionNote(deps, { transactionId: "tx-1", note: "  presente da Marina " });
    assert.equal(res.isError, undefined);
    assert.deepEqual(calledWith, { transactionId: "tx-1", note: "  presente da Marina " });
    assert.deepEqual(JSON.parse(textOf(res)), { transactionId: "tx-1", note: "presente da Marina", known: true });
  });

  it("forwards an empty note so the store clears it", async () => {
    let calledWith: unknown = null;
    const noteWriter = fakeNoteWriter({
      set: (transactionId, note) => {
        calledWith = { transactionId, note };
        return { transactionId, note: null, known: true };
      },
    });

    const deps = {
      source: { ok: true as const, connections: [], bank: {} as never, toFailure: () => ({ kind: "unavailable" as const, message: "" }), reader: {} as never, writer: {} as never, noteWriter },
      log: fakeLogger(),
      reader: null,
      writer: null,
      noteWriter,
      clock: { now: () => new Date() },
    };

    const res = await handleSetTransactionNote(deps, { transactionId: "tx-1", note: "" });
    assert.equal(res.isError, undefined);
    assert.deepEqual(calledWith, { transactionId: "tx-1", note: "" });
    assert.deepEqual(JSON.parse(textOf(res)), { transactionId: "tx-1", known: true });
  });

  it("reports an unknown id as readable content, not an error", async () => {
    const deps = {
      source: { ok: true as const, connections: [], bank: {} as never, toFailure: () => ({ kind: "unavailable" as const, message: "" }), reader: {} as never, writer: {} as never, noteWriter: fakeNoteWriter() },
      log: fakeLogger(),
      reader: null,
      writer: null,
      noteWriter: fakeNoteWriter(),
      clock: { now: () => new Date() },
    };

    const res = await handleSetTransactionNote(deps, { transactionId: "tx-gone", note: "lembrar" });
    assert.equal(res.isError, undefined);
    assert.deepEqual(JSON.parse(textOf(res)), { transactionId: "tx-gone", known: false });
  });

  it("refuses invalid input", async () => {
    const deps = {
      source: { ok: true as const, connections: [], bank: {} as never, toFailure: () => ({ kind: "unavailable" as const, message: "" }), reader: {} as never, writer: {} as never, noteWriter: fakeNoteWriter() },
      log: fakeLogger(),
      reader: null,
      writer: null,
      noteWriter: fakeNoteWriter(),
      clock: { now: () => new Date() },
    };

    const cases: readonly { readonly name: string; readonly input: unknown }[] = [
      { name: "missing transactionId", input: { note: "lembrar" } },
      { name: "note longer than 500", input: { transactionId: "tx-1", note: "a".repeat(501) } },
    ];

    for (const { name, input } of cases) {
      const res = await handleSetTransactionNote(deps, input);
      assert.equal(res.isError, true, name);
      assert.ok(textOf(res).length > 0, name);
    }
  });

  it("returns configuration problems when source is not ok", async () => {
    const deps = {
      source: { ok: false as const, problems: ["no config"] },
      log: fakeLogger(),
      reader: null,
      writer: null,
      noteWriter: null,
      clock: { now: () => new Date() },
    };

    const res = await handleSetTransactionNote(deps, { transactionId: "tx-1", note: "lembrar" });
    assert.equal(res.isError, true);
    assert.match(textOf(res), /no config/);
  });

  it("reports read-only storage when no note writer is available", async () => {
    const deps = {
      source: { ok: true as const, connections: [], bank: {} as never, toFailure: () => ({ kind: "unavailable" as const, message: "" }), reader: {} as never, writer: {} as never },
      log: fakeLogger(),
      reader: null,
      writer: null,
      noteWriter: null,
      clock: { now: () => new Date() },
    };

    const res = await handleSetTransactionNote(deps, { transactionId: "tx-1", note: "lembrar" });
    assert.equal(res.isError, true);
    assert.match(textOf(res), /Storage is read-only/);
  });
});
