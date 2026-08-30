# [WEB] Budgets view

**Type:** Story
**Priority:** Medium
**Tracker:** none (local markdown)
**Size:** 1–2 days
**Depends on:** ticket 06 (`/api/overview` anchor breakdown), ticket 05 (shell)

## Goal

The Orçamentos view: per-category budget cards with real spending, the prototype's status pills (Dentro / Atenção / Estourado), progress bars and edit affordance — with limits explicitly demo data for now, until the real budgets store lands.

## Context

The prototype's budgets are fully demo: `ORCS` constants with `limit` and `spent`, edited in memory. The web can already compute the real half — `anchor.categories` from `/api/overview` is the anchor month's spent per top-level category, in integer cents, through the same derivation the MCP aggregates use. The other half, the user-set monthly limit per category, has **no store**: nothing in `data.db` holds it, and this v1 deliberately adds no new backend surface (user decision). So the view is a documented hybrid: spent is real, limits are demo, and the boundary is visible in the UI.

The product vision (ADR 0002 §7) and the PRD both put budgets in v1 — this ticket delivers the UX and the real spending; a follow-up ticket (named below) adds the `budgets` table to `data.db` and flips the limit source without touching this view's shape.

## Design

### Data

- Spent per category: `anchor.categories` (top-level, anchor month) from `/api/overview`; the view uses the same payload the overview renders, so the two can never disagree.
- Limits: `lib/demo-data.ts` — the prototype's `ORCS` limits keyed by category id/name, **clearly labeled demo**. Edits persist in `localStorage` under `fluxo.budgets.<categoryId>` (prototype-style key), applied over the demo defaults, and are visibly demo (a "demo" tag on the card and on the edit modal).
- A category with no limit (not in the demo set) shows as "sem orçamento" rather than inventing a limit; the spent-only row still renders.

### View components (`components/views/budgets.tsx`)

Port the prototype's grid: per category — name, `spent / limit` with pt-BR money, percent, progress bar, and the status pill:

- `Estourado` (neg) when spent > limit
- `Atenção` (flat) when spent ≥ 90% of limit
- `Dentro` (pos) otherwise

Thresholds are the prototype's; they live in one pure function (`budgetStatus(spentCents, limitCents)`) with the over-limit and warning branches, so the pill logic is tested and cannot drift.

Edit modal: the prototype's limit input, saving to `localStorage` (demo) and re-rendering. The modal states the demo boundary in one line: "Limites são dados de demonstração nesta versão."

The overview's "Orçamentos do mês" mini card (demo since ticket 06) switches to this view's data path once this ticket lands — same payload, same status function, same demo tag.

## Files to touch

- `apps/web/components/views/budgets.tsx`, `apps/web/components/budget-status.ts` (new, pure)
- `apps/web/lib/demo-data.ts` — expose the demo limits keyed by category
- `apps/web/components/views/overview.tsx` — budget mini card wired to the shared status function
- `tests/web/budget-status.test.ts` (new)
- `e2e/budgets.spec.ts` (new)

## Test plan

1. `budgetStatus` table test: exactly at the limit (Dentro), 89/90/91% (Atenção at 90), just over (Estourado), zero limit (never divides by zero — treated as no budget), spent with no limit (sem orçamento).
2. Percent and money rendering: pt-BR formatting from cents; a zero-spent budget renders `R$ 0,00 / R$ 1.600,00`, never a blank.
3. Demo boundary: the demo limits module is the only source of limits in the view (a small shape test asserting the view imports no other limit source); localStorage edits override defaults and survive a reload in the test environment's storage fake.
4. E2E (`e2e/budgets.spec.ts`): the seeded fixture produces one `Dentro`, one `Atenção` and one `Estourado` pill with the exact expected texts; the demo tag is visible on the cards and in the edit modal; editing a limit persists across a page reload (localStorage) and the pill re-derives.
5. Live acceptance (manual, recorded): each card's spent equals the overview donut's figure for the same category and month.

## Validation

`npm run typecheck` → `npm run lint` → `npm run deps` → `npm test`, in that order, plus `npm run build:web` and `npm run e2e`.

## Acceptance Criteria

* Each budget card shows real spent (matching the overview's category breakdown for the anchor month) against its limit, with the correct status pill at the prototype's thresholds, tested by table.
* The demo boundary is explicit: limits come from `lib/demo-data.ts` plus localStorage edits, every demo element carries a visible "demo" tag, and the edit modal states the boundary in one line. The e2e spec pins the pill texts, the tag and the edit-persists-across-reload behavior.
* A category without a limit renders as "sem orçamento"; a zero-spent budget renders `R$ 0,00`, never blank; a zero limit never divides by zero.
* The overview's budget mini card uses the same status function and payload, so the two views cannot disagree.
* Follow-up (not this ticket): a real `budgets` store in `data.db` (migration + CRUD + API route) replaces the demo limits without changing the view's shape.
