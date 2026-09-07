import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { bucketSeries, customWindow, isCalendarDay, windowSpec, type WindowSpec } from "../../apps/web/lib/series.ts";
import { derived } from "../fakes/transaction-builder.ts";

/**
 * Window semantics: calendar-string arithmetic only. The tests pin the exact
 * bounds and labels so a timezone regression (a Date crossing to UTC) cannot
 * pass silently.
 */
describe("lib/series — windowSpec", () => {
  it("1D is the anchor day, one bucket", () => {
    const window = windowSpec("1D", "2026-08-30");
    assert.equal(window.kind, "dia");
    assert.deepEqual([window.from, window.to], ["2026-08-30", "2026-08-30"]);
    assert.deepEqual(window.labels, ["30/08"]);
    assert.equal(window.label, "hoje");
    assert.equal(window.unitLabel, "Ago");
  });

  it("1S starts on the anchor's Monday and ends at the anchor", () => {
    // 2026-08-30 is a Sunday: the full week, seven buckets.
    const sunday = windowSpec("1S", "2026-08-30");
    assert.deepEqual([sunday.from, sunday.to], ["2026-08-24", "2026-08-30"]);
    assert.deepEqual(sunday.labels, ["24/08", "25/08", "26/08", "27/08", "28/08", "29/08", "30/08"]);
    assert.equal(sunday.label, "esta semana");

    // 2026-08-25 is a Tuesday: the week so far, two buckets.
    const tuesday = windowSpec("1S", "2026-08-25");
    assert.deepEqual([tuesday.from, tuesday.to], ["2026-08-24", "2026-08-25"]);
    assert.deepEqual(tuesday.labels, ["24/08", "25/08"]);
  });

  it("1M spans the anchor month from day 1 to the anchor day", () => {
    const window = windowSpec("1M", "2026-08-25");
    assert.deepEqual([window.from, window.to], ["2026-08-01", "2026-08-25"]);
    assert.equal(window.kind, "mes");
    assert.equal(window.label, "este mês");
    assert.equal(window.unitLabel, "Ago");
    assert.equal(window.labels.length, 25);
    assert.equal(window.labels[0], "01");
    assert.equal(window.labels[24], "25");
  });

  it("1M handles month ends and a leap February", () => {
    const march = windowSpec("1M", "2026-03-31");
    assert.deepEqual([march.from, march.to], ["2026-03-01", "2026-03-31"]);
    assert.equal(march.labels.length, 31);

    const feb = windowSpec("1M", "2026-02-28");
    assert.deepEqual([feb.from, feb.to], ["2026-02-01", "2026-02-28"]);
    assert.equal(feb.labels.length, 28);

    const leap = windowSpec("1M", "2024-02-29");
    assert.deepEqual([leap.from, leap.to], ["2024-02-01", "2024-02-29"]);
    assert.equal(leap.labels.length, 29);
  });

  it("3M/6M/12M end at the anchor's month, one bucket per month", () => {
    const six = windowSpec("6M", "2026-08-30");
    assert.equal(six.kind, "meses");
    assert.deepEqual([six.from, six.to], ["2026-03-01", "2026-08-30"]);
    assert.deepEqual(six.labels, ["Mar", "Abr", "Mai", "Jun", "Jul", "Ago"]);
    assert.equal(six.label, "últimos 6 meses");
    assert.equal(six.unitLabel, "Ago");
    assert.deepEqual(six.buckets, ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);

    const three = windowSpec("3M", "2026-08-30");
    assert.deepEqual(three.labels, ["Jun", "Jul", "Ago"]);
    assert.equal(three.label, "últimos 3 meses");

    const twelve = windowSpec("12M", "2026-01-15");
    assert.deepEqual([twelve.from, twelve.to], ["2025-02-01", "2026-01-15"]);
    assert.equal(twelve.labels.length, 12);
    assert.equal(twelve.labels[0], "Fev");
    assert.equal(twelve.labels[11], "Jan");
    assert.equal(twelve.label, "últimos 12 meses");

    // Year rollover: 6M anchored in March covers Oct..Mar.
    const rollover = windowSpec("6M", "2026-03-01");
    assert.deepEqual(rollover.labels, ["Out", "Nov", "Dez", "Jan", "Fev", "Mar"]);
  });
});

describe("lib/series — customWindow", () => {
  type Case = {
    readonly name: string;
    readonly start: string;
    readonly end: string;
    readonly expected: WindowSpec;
  };

  const cases: readonly Case[] = [
    {
      name: "a single day (empty end) is a dia window labeled with the full date",
      start: "2026-08-30",
      end: "",
      expected: {
        kind: "dia",
        from: "2026-08-30",
        to: "2026-08-30",
        label: "dia 30/08/2026",
        unitLabel: "Ago",
        labels: ["30/08"],
        buckets: ["2026-08-30"],
      },
    },
    {
      name: "start equal to end is the same single day",
      start: "2026-08-30",
      end: "2026-08-30",
      expected: {
        kind: "dia",
        from: "2026-08-30",
        to: "2026-08-30",
        label: "dia 30/08/2026",
        unitLabel: "Ago",
        labels: ["30/08"],
        buckets: ["2026-08-30"],
      },
    },
    {
      name: "crosses a month boundary in buckets and label",
      start: "2026-08-28",
      end: "2026-09-02",
      expected: {
        kind: "periodo",
        from: "2026-08-28",
        to: "2026-09-02",
        label: "28/08 – 02/09",
        unitLabel: "Set",
        labels: ["28", "29", "30", "31", "01", "02"],
        buckets: ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"],
      },
    },
    {
      name: "appends the year to both sides when the span crosses years",
      start: "2025-12-28",
      end: "2026-01-02",
      expected: {
        kind: "periodo",
        from: "2025-12-28",
        to: "2026-01-02",
        label: "28/12/2025 – 02/01/2026",
        unitLabel: "Jan",
        labels: ["28", "29", "30", "31", "01", "02"],
        buckets: ["2025-12-28", "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"],
      },
    },
    {
      name: "swaps inverted dates",
      start: "2026-09-02",
      end: "2026-08-28",
      expected: {
        kind: "periodo",
        from: "2026-08-28",
        to: "2026-09-02",
        label: "28/08 – 02/09",
        unitLabel: "Set",
        labels: ["28", "29", "30", "31", "01", "02"],
        buckets: ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"],
      },
    },
    {
      name: "long spans bucket monthly, from = first day of the first covered month",
      start: "2026-07-10",
      end: "2026-08-30",
      expected: {
        kind: "meses",
        from: "2026-07-01",
        to: "2026-08-30",
        label: "10/07 – 30/08",
        unitLabel: "Ago",
        labels: ["Jul", "Ago"],
        buckets: ["2026-07", "2026-08"],
      },
    },
    {
      name: "multi-year month buckets get /YY suffixes",
      start: "2025-11-10",
      end: "2026-02-05",
      expected: {
        kind: "meses",
        from: "2025-11-01",
        to: "2026-02-05",
        label: "10/11/2025 – 05/02/2026",
        unitLabel: "Fev",
        labels: ["Nov/25", "Dez/25", "Jan/26", "Fev/26"],
        buckets: ["2025-11", "2025-12", "2026-01", "2026-02"],
      },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      assert.deepEqual(customWindow(c.start, c.end), c.expected);
    });
  }

  it("a 30-day span buckets every day, labeled by day-of-month numbers", () => {
    const window = customWindow("2026-08-01", "2026-08-30");
    assert.equal(window.kind, "periodo");
    assert.equal(window.label, "01/08 – 30/08");
    assert.equal(window.buckets.length, 30);
    assert.equal(window.buckets[0], "2026-08-01");
    assert.equal(window.buckets[29], "2026-08-30");
    assert.equal(window.labels[0], "01");
    assert.equal(window.labels[29], "30");
  });

  it("buckets a 45-day span daily and a 46-day span monthly (the boundary)", () => {
    const daily = customWindow("2026-08-01", "2026-09-14");
    assert.equal(daily.kind, "periodo");
    assert.equal(daily.buckets.length, 45);

    const monthly = customWindow("2026-08-01", "2026-09-15");
    assert.equal(monthly.kind, "meses");
  });
});

describe("lib/series — isCalendarDay", () => {
  it("rejects months outside 01..12, not just impossible days", () => {
    assert.equal(isCalendarDay("2026-00-10"), false);
    assert.equal(isCalendarDay("2026-13-01"), false);
    assert.equal(isCalendarDay("2026-12-31"), true);
  });
});

describe("lib/series — bucketSeries", () => {
  const today = "2026-08-30";

  it("buckets rows per day on the fine ranges, sums received and spent", () => {
    const window = windowSpec("1M", "2026-08-30");
    const rows = [
      derived({ localDate: "2026-08-30", amountCents: 984000 }),
      derived({ localDate: "2026-08-30", amountCents: -721435 }),
      derived({ localDate: "2026-08-05", amountCents: -4590 }),
      derived({ localDate: "2026-08-05", amountCents: 100000 }),
      derived({ localDate: "2026-08-01", amountCents: 500 }),
    ];
    const series = bucketSeries(window, rows, today);

    assert.equal(series.receivedCents.length, 30);
    assert.equal(series.receivedCents[29], 984000);
    assert.equal(series.spentCents[29], 721435);
    assert.equal(series.receivedCents[4], 100000);
    assert.equal(series.spentCents[4], 4590);
    assert.equal(series.receivedCents[0], 500);
    assert.equal(series.spentCents[0], 0);
  });

  it("buckets a custom period per day, aligned with its labels", () => {
    const window = customWindow("2026-08-28", "2026-09-02");
    const rows = [
      derived({ localDate: "2026-08-28", amountCents: -100 }),
      derived({ localDate: "2026-09-01", amountCents: 0 }),
      derived({ localDate: "2026-09-02", amountCents: 200 }),
    ];
    const series = bucketSeries(window, rows, "2026-09-02");
    assert.deepEqual(series.spentCents, [100, 0, 0, 0, 0, 0]);
    assert.deepEqual(series.receivedCents, [0, 0, 0, 0, 0, 200]);
  });

  it("buckets rows per month on the coarse ranges", () => {
    const window = windowSpec("6M", "2026-08-30");
    const rows = [
      derived({ localDate: "2026-08-12", amountCents: -1000 }),
      derived({ localDate: "2026-08-30", amountCents: 3000 }),
      derived({ localDate: "2026-07-01", amountCents: -2000 }),
      derived({ localDate: "2026-03-31", amountCents: -4000 }),
      derived({ localDate: "2026-03-01", amountCents: 9000 }),
    ];
    const series = bucketSeries(window, rows, today);

    assert.deepEqual(series.receivedCents, [9000, 0, 0, 0, 0, 3000]);
    assert.deepEqual(series.spentCents, [4000, 0, 0, 0, 2000, 1000]);
  });

  it("excludes self-transfers from both sides, like core/aggregate", () => {
    const window = windowSpec("1M", "2026-08-30");
    const rows = [
      derived({ localDate: "2026-08-10", amountCents: -5000, category: "04000000", categoryId: "04000000" }),
      derived({ localDate: "2026-08-10", amountCents: 5000, category: "04000000", categoryId: "04000000" }),
      derived({ localDate: "2026-08-10", amountCents: -1000 }),
    ];
    const series = bucketSeries(window, rows, today);
    assert.equal(series.spentCents[9], 1000);
    assert.equal(series.receivedCents[9], 0);
  });

  it("excludes investment moves but keeps dividend earnings, like core/aggregate", () => {
    const window = windowSpec("1M", "2026-08-30");
    const rows = [
      derived({ localDate: "2026-08-10", amountCents: -5000, categoryId: "03000000" }),
      derived({ localDate: "2026-08-10", amountCents: 3000, categoryId: "03000000" }),
      derived({ localDate: "2026-08-10", amountCents: 200, categoryId: "03060000" }),
      derived({ localDate: "2026-08-10", amountCents: -1000 }),
    ];
    const series = bucketSeries(window, rows, today);
    assert.equal(series.spentCents[9], 1000);
    assert.equal(series.receivedCents[9], 200);
  });

  it("excludes upcoming rows (after today), the aggregate's rule", () => {
    // With a future anchor the whole window is after today: nothing counts,
    // the same answer core/aggregate gives the anchor slice.
    const window = windowSpec("1M", "2026-09-05");
    const rows = [
      derived({ localDate: "2026-09-05", amountCents: 5000 }),
      derived({ localDate: "2026-09-01", amountCents: -1000 }),
    ];
    const series = bucketSeries(window, rows, "2026-08-30");
    assert.ok(series.receivedCents.every((value) => value === 0), "future income is not received yet");
    assert.ok(series.spentCents.every((value) => value === 0), "future spending is not spent yet");
  });

  it("ignores rows outside the window bounds entirely", () => {
    const window = windowSpec("1M", "2026-08-25");
    const rows = [
      derived({ localDate: "2026-08-25", amountCents: -100 }),
      derived({ localDate: "2026-08-28", amountCents: -9999 }), // in the anchor month, outside the window
      derived({ localDate: "2026-07-31", amountCents: -9999 }),
    ];
    const series = bucketSeries(window, rows, today);
    assert.equal(series.spentCents[24], 100);
    assert.ok(series.spentCents.every((value) => value === 0 || value === 100));
    assert.ok(series.receivedCents.every((value) => value === 0));
  });

  it("handles a week whose buckets straddle a month boundary", () => {
    // 2026-08-31 is a Monday; the week before spans July 27 .. Aug 2.
    const window = windowSpec("1S", "2026-08-02");
    assert.deepEqual([window.from, window.to], ["2026-07-27", "2026-08-02"]);
    assert.deepEqual(window.labels, ["27/07", "28/07", "29/07", "30/07", "31/07", "01/08", "02/08"]);

    const series = bucketSeries(
      window,
      [
        derived({ localDate: "2026-07-27", amountCents: -100 }),
        derived({ localDate: "2026-08-01", amountCents: 200 }),
        derived({ localDate: "2026-08-02", amountCents: -300 }),
      ],
      today,
    );
    assert.deepEqual(series.spentCents, [100, 0, 0, 0, 0, 0, 300]);
    assert.deepEqual(series.receivedCents, [0, 0, 0, 0, 0, 200, 0]);
  });
});
