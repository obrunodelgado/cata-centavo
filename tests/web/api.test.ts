import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { ApiError, getJson, postJson, postSync } from "../../apps/web/lib/api.ts";

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

    for (const call of calls) {
      assert.ok(!/^[a-z]+:\/\//u.test(call.url), `url must be relative, got ${call.url}`);
      assert.ok(call.url.startsWith("/api/"), `url must start with /api/, got ${call.url}`);
    }
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
});
