import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { createLogger } from "../../apps/web/lib/server/logging.ts";

describe("web logger", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("writes every level to stderr and nothing to stdout", () => {
    const stderrCalls: string[] = [];
    mock.method(process.stderr, "write", (chunk: string | Uint8Array) => {
      stderrCalls.push(String(chunk));
      return true;
    });
    const stdoutCalls: unknown[] = [];
    // eslint-disable-next-line no-restricted-properties -- the test asserts stdout stays untouched; mocking it is the only way to observe that
    mock.method(process.stdout, "write", (chunk: unknown) => {
      stdoutCalls.push(chunk);
      return true;
    });

    const log = createLogger();
    log.info({ connectionId: "abc" }, "sources fetched");
    log.warn({}, "something smells");
    log.error({}, "boom");
    log.debug({}, "invisible at this level");

    assert.ok(stderrCalls.some((line) => line.includes("[info] sources fetched") && line.includes("connectionId")));
    assert.ok(stderrCalls.some((line) => line.includes("[warn] something smells")));
    assert.ok(stderrCalls.some((line) => line.includes("[error] boom")));
    assert.equal(stdoutCalls.length, 0, "stdout must stay untouched");
  });

  it("child loggers keep writing to stderr", () => {
    const stderrCalls: string[] = [];
    mock.method(process.stderr, "write", (chunk: string | Uint8Array) => {
      stderrCalls.push(String(chunk));
      return true;
    });

    createLogger().child({ tool: "sync" }).info({}, "walking");

    assert.ok(stderrCalls.some((line) => line.includes("[info] walking")));
  });
});
