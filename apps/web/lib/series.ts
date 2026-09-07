import { isSelfTransfer, type DerivedTransaction } from "@cata-centavo/core";

/**
 * Window semantics: what "1D/1S/1M/3M/6M/12M anchored at a date" means, and how
 * cached rows land in the buckets. Pure calendar-string arithmetic only —
 * never a `Date` crossing timezones; the cache's `local_date` is already São
 * Paulo-local, and the bounds are compared as strings.
 *
 * A window always *ends at the anchor*: `to` is the anchor day (a row after
 * the anchor cannot leak into the anchor figures). The payload's `anchor`
 * slice (KPI band, donut) covers the whole window, so it is the sum of the
 * buckets below by construction.
 */

export const RANGES = ["1D", "1S", "1M", "3M", "6M", "12M"] as const;

export type Range = (typeof RANGES)[number];

export type WindowKind = "dia" | "semana" | "mes" | "periodo" | "meses";

export type WindowSpec = {
  readonly kind: WindowKind;
  /** Inclusive bounds; a query for the window uses exactly these. */
  readonly from: string;
  readonly to: string;
  /** Human label for the card subtitle: "últimos 6 meses", "este mês", … */
  readonly label: string;
  /** The anchor month's short name: "Mar". */
  readonly unitLabel: string;
  /** Display labels aligned with `buckets`. */
  readonly labels: readonly string[];
  /** Calendar keys aligned with `labels`: `YYYY-MM-DD` per day, `YYYY-MM` per month. */
  readonly buckets: readonly string[];
};

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return MONTH_DAYS[month - 1] ?? 30;
}

function parseDay(value: string): { readonly year: number; readonly month: number; readonly day: number } {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Invalid calendar day: ${value}`);
  }
  return { year, month, day };
}

/** Whether a `YYYY-MM-DD` string names a real calendar day (2026-02-30 and 2026-13-01 are not). */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const { year, month, day } = parseDay(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Weekday of a calendar day, Monday = 0 … Sunday = 6. The `Date.UTC` trick is
 * timezone-free arithmetic (1970-01-01 was a Thursday = 3), not a timezone trip.
 */
function weekday(value: string): number {
  const days = epochDays(value);
  return ((days + 3) % 7 + 7) % 7;
}

function addDays(value: string, offset: number): string {
  const date = new Date((epochDays(value) + offset) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dayKey(year: number, month: number, day: number): string {
  return `${monthKey(year, month)}-${String(day).padStart(2, "0")}`;
}

function monthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? "?";
}

function epochDays(value: string): number {
  const { year, month, day } = parseDay(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function dayLabelWithYear(value: string): string {
  return `${dayLabel(value)}/${value.slice(0, 4)}`;
}

function addMonths(key: string, offset: number): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const total = year * 12 + (month - 1) + offset;
  return monthKey(Math.floor(total / 12), (total % 12) + 1);
}

/** `DD/MM – DD/MM`; both sides carry the year when the span crosses years. */
function periodLabel(from: string, to: string): string {
  if (from.slice(0, 4) !== to.slice(0, 4)) {
    return `${dayLabelWithYear(from)} – ${dayLabelWithYear(to)}`;
  }
  return `${dayLabel(from)} – ${dayLabel(to)}`;
}

function dayLabel(value: string): string {
  return value.slice(8, 10) + "/" + value.slice(5, 7);
}

function dayNumberLabel(value: string): string {
  return value.slice(8, 10);
}

function monthsBack(anchor: string, count: number): { readonly year: number; readonly month: number } {
  const { year, month } = parseDay(anchor);
  const total = year * 12 + (month - 1) - (count - 1);
  return { year: Math.floor(total / 12), month: (total % 12 + 12) % 12 + 1 };
}

function dayWindow(anchor: string): WindowSpec {
  return {
    kind: "dia",
    from: anchor,
    to: anchor,
    label: "hoje",
    unitLabel: monthLabel(parseDay(anchor).month),
    labels: [dayLabel(anchor)],
    buckets: [anchor],
  };
}

function weekWindow(anchor: string): WindowSpec {
  const monday = addDays(anchor, -weekday(anchor));
  const days: string[] = [];
  for (let offset = 0; ; offset += 1) {
    const day = addDays(monday, offset);
    days.push(day);
    if (day === anchor) {
      break;
    }
  }
  return {
    kind: "semana",
    from: monday,
    to: anchor,
    label: "esta semana",
    unitLabel: monthLabel(parseDay(anchor).month),
    labels: days.map(dayLabel),
    buckets: days,
  };
}

function monthWindow(anchor: string): WindowSpec {
  const { year, month } = parseDay(anchor);
  const last = daysInMonth(year, month);
  const days: string[] = [];
  for (let day = 1; day <= last; day += 1) {
    const key = dayKey(year, month, day);
    days.push(key);
    if (key === anchor) {
      break;
    }
  }
  return {
    kind: "mes",
    from: days[0] ?? anchor,
    to: anchor,
    label: "este mês",
    unitLabel: monthLabel(month),
    labels: days.map(dayNumberLabel),
    buckets: days,
  };
}

function monthsWindow(range: Range, anchor: string): WindowSpec {
  const count = Number(range.slice(0, -1));
  const { month } = parseDay(anchor);
  const start = monthsBack(anchor, count);
  const buckets: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const total = start.year * 12 + (start.month - 1) + index;
    buckets.push(monthKey(Math.floor(total / 12), (total % 12) + 1));
  }
  return {
    kind: "meses",
    from: buckets[0] + "-01",
    to: anchor,
    label: `últimos ${count} meses`,
    unitLabel: monthLabel(month),
    labels: buckets.map((key) => monthLabel(Number(key.slice(5, 7)))),
    buckets,
  };
}

/**
 * The window a range anchored at a calendar day covers. `from`/`to` are
 * inclusive; `to` is always the anchor itself, so a row after the anchor is
 * outside the window no matter the range.
 */
export function windowSpec(range: Range, anchor: string): WindowSpec {
  switch (range) {
    case "1D":
      return dayWindow(anchor);
    case "1S":
      return weekWindow(anchor);
    case "1M":
      return monthWindow(anchor);
    default:
      return monthsWindow(range, anchor);
  }
}

/**
 * The window a custom start–optional-end pair covers, the prototype's
 * `.date-seg` behavior. Bounds are inclusive calendar-day strings; an empty
 * `end` means only the start day, and inverted dates are swapped. One day →
 * `dia`; up to 45 days → `periodo` with daily buckets; beyond → `meses` with
 * monthly buckets, `/YY` labels when the span covers more than one year, and
 * `from` pulled back to the first day of the first covered month.
 */
export function customWindow(start: string, end: string): WindowSpec {
  let from = start;
  let to = end;
  if (to === "") {
    to = from;
  }
  if (to < from) {
    const swapped = to;
    to = from;
    from = swapped;
  }

  const days = epochDays(to) - epochDays(from) + 1;
  if (days === 1) {
    return customDayWindow(from);
  }
  if (days <= 45) {
    return customPeriodWindow(from, to);
  }
  return customMonthsWindow(from, to);
}

function customDayWindow(day: string): WindowSpec {
  return {
    kind: "dia",
    from: day,
    to: day,
    label: `dia ${dayLabelWithYear(day)}`,
    unitLabel: monthLabel(parseDay(day).month),
    labels: [dayLabel(day)],
    buckets: [day],
  };
}

function customPeriodWindow(from: string, to: string): WindowSpec {
  const buckets: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    buckets.push(day);
  }
  return {
    kind: "periodo",
    from,
    to,
    label: periodLabel(from, to),
    unitLabel: monthLabel(parseDay(to).month),
    labels: buckets.map(dayNumberLabel),
    buckets,
  };
}

function customMonthsWindow(from: string, to: string): WindowSpec {
  const buckets: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = addMonths(month, 1)) {
    buckets.push(month);
  }
  const first = buckets[0] ?? from.slice(0, 7);
  const last = buckets[buckets.length - 1] ?? to.slice(0, 7);
  const multiYear = first.slice(0, 4) !== last.slice(0, 4);
  return {
    kind: "meses",
    from: `${first}-01`,
    to,
    label: periodLabel(from, to),
    unitLabel: monthLabel(Number(last.slice(5, 7))),
    labels: buckets.map((key) => monthBucketLabel(key, multiYear)),
    buckets,
  };
}

function monthBucketLabel(key: string, multiYear: boolean): string {
  const label = monthLabel(Number(key.slice(5, 7)));
  if (!multiYear) {
    return label;
  }
  return `${label}/${key.slice(2, 4)}`;
}

/**
 * Buckets rows into the window, aligned with `window.labels`. The same money
 * rules `core/aggregate` applies to period totals apply here, so the series'
 * last bucket and the payload's `anchor` slice can never disagree:
 * self-transfers are not income or spending, and rows after today are upcoming,
 * not yet received or spent.
 */
export function bucketSeries(
  window: WindowSpec,
  rows: readonly DerivedTransaction[],
  today: string,
): { readonly receivedCents: readonly number[]; readonly spentCents: readonly number[] } {
  const receivedCents = window.buckets.map(() => 0);
  const spentCents = window.buckets.map(() => 0);

  for (const row of rows) {
    if (row.localDate > today) {
      continue;
    }
    if (isSelfTransfer(row)) {
      continue;
    }
    const index = bucketIndex(window, row.localDate);
    if (index === null) {
      continue;
    }
    if (row.amountCents < 0) {
      // bucketIndex bounds index to the bucket list; the assertion mirrors core's `requests[index]!`.
      spentCents[index]! += -row.amountCents;
    } else if (row.amountCents > 0) {
      receivedCents[index]! += row.amountCents;
    }
  }

  return { receivedCents, spentCents };
}

function bucketIndex(window: WindowSpec, localDate: string): number | null {
  if (localDate < window.from || localDate > window.to) {
    return null;
  }
  if (window.kind === "meses") {
    const index = window.buckets.indexOf(localDate.slice(0, 7));
    if (index < 0) {
      return null;
    }
    return index;
  }
  return epochDays(localDate) - epochDays(window.from);
}
