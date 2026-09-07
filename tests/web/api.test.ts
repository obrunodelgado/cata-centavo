import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { ApiError, fetchOverview, getJson, postJson, postSync, postTransactionCategory, postTransactionNote } from "../../apps/web/lib/api.ts";

type CapturedCall = { readonly url: string; readonly init: RequestInit };

describe("lib/api — the client fetch layer", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  function captureFetch(handler: (call: CapturedCall) => Response) {
    const calls: CapturedCall[] = [];
    mock.method(globalThis, "fetch", (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(handler(calls[calls.length - 1]!));
    });
    return calls;
  }

  it("requests relative URLs only — never an absolute host", async () => {
    const calls = captureFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await getJson("/api/sources");
    await postSync();
    await postTransactionCategory({ ids: ["tx-1"], categoryId: "moradia" });
    await postTransactionNote("tx-1", "presente da Marina");

    for (const call of calls) {
      assert.ok(!/^[a-z]+:\/\//u.test(call.url), `url must be relative, got ${call.url}`);
      assert.ok(call.url.startsWith("/api/"), `url must start with /api/, got ${call.url}`);
    }
  });

  it("postTransactionCategory and postTransactionNote POST their bodies to the write routes", async () => {
    const calls = captureFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await postTransactionCategory({ ids: ["tx-1"], categoryId: "moradia" });
    await postTransactionNote("tx-1", "presente da Marina");

    assert.equal(calls[0]!.url, "/api/transactions/category");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal(calls[0]!.init.body, JSON.stringify({ ids: ["tx-1"], categoryId: "moradia" }));
    assert.equal(calls[1]!.url, "/api/transactions/note");
    assert.equal(calls[1]!.init.method, "POST");
    assert.equal(calls[1]!.init.body, JSON.stringify({ transactionId: "tx-1", note: "presente da Marina" }));
  });

  it("omits the body on POSTs without one, sends JSON with one", async () => {
    const calls = captureFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await postJson("/api/sync");
    await postJson("/api/transactions/category", { ids: ["a"], categoryId: "moradia" });

    assert.equal(calls[0]!.init.body, undefined);
    assert.equal(calls[1]!.init.body, JSON.stringify({ ids: ["a"], categoryId: "moradia" }));
  });

  it("throws ApiError on non-2xx", async () => {
    captureFetch(() => new Response("nope", { status: 500 }));

    await assert.rejects(() => getJson("/api/sources"), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 500);
      return true;
    });
  });

  it("fetchOverview builds the query, omitting empty params", async () => {
    const calls = captureFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await fetchOverview({ range: "6M" });
    await fetchOverview({ range: "6M", from: "2026-08-05" });
    await fetchOverview({ range: "6M", from: "2026-08-05", to: "2026-08-30" });
    await fetchOverview({ range: "1M", from: "", to: "" });

    assert.equal(calls[0]!.url, "/api/overview?range=6M");
    assert.equal(calls[1]!.url, "/api/overview?range=6M&from=2026-08-05");
    assert.equal(calls[2]!.url, "/api/overview?range=6M&from=2026-08-05&to=2026-08-30");
    assert.equal(calls[3]!.url, "/api/overview?range=1M");
  });

  it("fetchOverview never sends to without from — the server rejects it", async () => {
    const calls = captureFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await fetchOverview({ range: "6M", to: "2026-08-30" });

    assert.equal(calls[0]!.url, "/api/overview?range=6M");
  });
});
