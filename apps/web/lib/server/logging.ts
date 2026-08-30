import type { Logger } from "@cata-centavo/core";

/**
 * The minimal stderr logger. The core `Logger` contract is all the web's
 * server code needs; pino would be a new dependency for a dashboard that
 * already has the CLI's logger. Nothing human-facing may reach stdout (ADR §4
 * spirit: stdout belongs to the protocol channel; in the web it belongs to
 * nothing at all).
 */
export function createLogger(): Logger {
  return {
    debug: (fields, message) => write("debug", fields, message),
    info: (fields, message) => write("info", fields, message),
    warn: (fields, message) => write("warn", fields, message),
    error: (fields, message) => write("error", fields, message),
    child: () => createLogger(),
  };
}

function write(level: string, fields: Readonly<Record<string, unknown>>, message: string): void {
  const fieldsText = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : "";
  process.stderr.write(`[${level}] ${message}${fieldsText}\n`);
}
