import type { CategoryId } from "./category.ts";
import { isSelfTransfer } from "./self-transfer.ts";
import type { DerivedTransaction } from "./transaction.ts";

/** One rolled-up category's signed total and the rows most useful for follow-up. */
export type CategoryGroup = {
  readonly categoryId: CategoryId | null;
  readonly totalCents: number;
  readonly count: number;
  readonly sampleIds: readonly string[];
};

/** The period totals returned by the transaction domain before display labels. */
export type Aggregate = {
  readonly groups: readonly CategoryGroup[];
  readonly spentCents: number;
  readonly receivedCents: number;
  readonly upcoming: { readonly totalCents: number; readonly count: number };
};

/** One contribution to a group: the row (or alocação) behind it, for the sample. */
type GroupEntry = {
  readonly id: string;
  readonly amountCents: number;
};

type GroupState = {
  readonly categoryId: CategoryId | null;
  totalCents: number;
  count: number;
  entries: GroupEntry[];
};

/**
 * Groups by the category the derivation resolved, not by the leaf Pluggy sent.
 *
 * Those are the same answer only while the enrichment is alive. Rolling the raw
 * leaf up here instead would make a manual override invisible to the totals,
 * and would report a whole wallet as uncategorized the day the plan drops to
 * free — while the `categories` filter, which resolves the same rows in SQL,
 * kept returning them. Two totals for one question is the failure the PRD's
 * first rule names.
 *
 * Internal transfers (`isSelfTransfer`, ADR-0003) never reach the groups
 * either, so the category breakdown and the period totals can never disagree:
 * a row excluded from `spentCents` does not show up in the donut.
 *
 * A recognised saque (ADR-0004) is spending without a category of its own: an
 * unsplit one groups whole under `null`, a split one contributes each alocação
 * to its category and the sobra não alocada to `null`. The estorno is income
 * under `null`. The period totals are untouched by the split — the alocações
 * only redistribute which category the money names.
 */
export function aggregate(rows: readonly DerivedTransaction[], today: string): Aggregate {
  const groups = new Map<CategoryId | null, GroupState>();
  const totals = { spentCents: 0, receivedCents: 0, upcomingCents: 0, upcomingCount: 0 };

  for (const row of rows) {
    addToGroups(groups, row);
    addToTotals(totals, row, today);
  }

  return {
    groups: [...groups.values()].map(toCategoryGroup).sort(compareGroups),
    spentCents: totals.spentCents,
    receivedCents: totals.receivedCents,
    upcoming: { totalCents: totals.upcomingCents, count: totals.upcomingCount },
  };
}

function addToGroups(groups: Map<CategoryId | null, GroupState>, row: DerivedTransaction): void {
  if (isSelfTransfer(row)) {
    return;
  }
  if (row.recognised === "saque") {
    let allocated = 0;
    for (const allocation of row.allocations) {
      allocated += allocation.amountCents;
      addEntry(groups, allocation.categoryId, { id: row.id, amountCents: -allocation.amountCents });
    }
    const leftover = -row.amountCents - allocated;
    if (leftover > 0) {
      addEntry(groups, null, { id: row.id, amountCents: -leftover });
    }
    return;
  }
  if (row.recognised === "estorno") {
    addEntry(groups, null, { id: row.id, amountCents: row.amountCents });
    return;
  }
  addEntry(groups, row.category, { id: row.id, amountCents: row.amountCents });
}

function addEntry(groups: Map<CategoryId | null, GroupState>, categoryId: CategoryId | null, entry: GroupEntry): void {
  let group = groups.get(categoryId);
  if (group === undefined) {
    group = { categoryId, totalCents: 0, count: 0, entries: [] };
    groups.set(categoryId, group);
  }
  group.totalCents += entry.amountCents;
  group.count += 1;
  group.entries.push(entry);
}

type Totals = {
  spentCents: number;
  receivedCents: number;
  upcomingCents: number;
  upcomingCount: number;
};

function addToTotals(totals: Totals, row: DerivedTransaction, today: string): void {
  if (isSelfTransfer(row)) {
    return;
  }
  if (row.localDate > today) {
    totals.upcomingCents += row.amountCents;
    totals.upcomingCount += 1;
    return;
  }
  if (row.amountCents < 0) {
    totals.spentCents += -row.amountCents;
    return;
  }
  if (row.amountCents > 0) {
    totals.receivedCents += row.amountCents;
  }
}

function toCategoryGroup(group: GroupState): CategoryGroup {
  const sampleEntries = [...group.entries].sort(compareSampleEntries).slice(0, 10);
  return {
    categoryId: group.categoryId,
    totalCents: group.totalCents,
    count: group.count,
    sampleIds: sampleEntries.map((entry) => entry.id),
  };
}

function compareSampleEntries(left: GroupEntry, right: GroupEntry): number {
  const amountDifference = Math.abs(right.amountCents) - Math.abs(left.amountCents);
  if (amountDifference !== 0) {
    return amountDifference;
  }
  return left.id.localeCompare(right.id);
}

function compareGroups(left: CategoryGroup, right: CategoryGroup): number {
  const totalDifference = Math.abs(right.totalCents) - Math.abs(left.totalCents);
  if (totalDifference !== 0) {
    return totalDifference;
  }
  return groupKey(left.categoryId).localeCompare(groupKey(right.categoryId));
}

function groupKey(categoryId: CategoryId | null): string {
  if (categoryId === null) {
    return "";
  }
  return categoryId;
}
