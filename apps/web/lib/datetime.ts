const SP_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * The clock time a row displays, in São Paulo-local time, or `null` when the
 * bank did not send one. Banks stamp true midnights on card rows and default
 * times on others alike, so midnight is treated as "no clock time" — the
 * modal then shows the date only, never a fabricated 00:00.
 */
export function clockTimeOf(occurredAt: string): string | null {
  const parsed = new Date(occurredAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const formatted = SP_FORMAT.format(parsed);
  return formatted === "00:00" ? null : formatted;
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

/** "19 mar" — the prototype's short date for transaction rows. */
export function dayMonthShort(localDate: string): string {
  return `${Number(localDate.slice(8, 10))} ${MONTHS_SHORT[Number(localDate.slice(5, 7)) - 1] ?? "?"}`;
}
