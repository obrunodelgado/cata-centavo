# [WEB] Cards view

**Type:** Story
**Priority:** Medium
**Tracker:** none (local markdown)
**Size:** 2–3 days
**Depends on:** tickets 05–06 (composition root, `/api/accounts`)

## Goal

The Cartões view: per-card open bills with the posted/committed figures, used credit, instalment plans, closing-day management and the six-month bill chart — all real, matching what `getBillSummary` and `listInstalmentPlans` already report over the same cache.

## Context

Phase 4 and ticket 01 (backlog) built the bill machinery: open-cycle identification, the two-figure contract (`posted` and `committed` with the gap between them, each with the date its data stops at), and instalment plans derived over a card's whole history. The web needs the same numbers, in the same domain vocabulary, for a human instead of a model. The prototype's cards view is demo data (two cards, hardcoded bills) and includes a "Pagar fatura" action that the PRD explicitly puts out of scope — the Fluxo observes and orients, it does not move money, so that button becomes a demo toast.

No new backend work: bills are fetched live via `bank.getBills(account)` (small payloads; the transport's rate limiting and 429 backoff already live in the single send function), the open summary derives from `core/bill.ts` + `cardRows`, instalment plans from `core/instalment-plans.ts`, and closing days use the existing `ClosingDayStore`.

## Design

### API routes

- `GET /api/accounts?types=credit` — card accounts (name, institution, last four digits if present, used credit, credit limit, currency) from the cache; reused by the view header.
- `GET /api/bills?accountId=` — one card's view payload:
  - `bills`: the recent closed bills (newest first, bounded at 12) with cycle window, `totalCents`, `paymentDate` and status — the source of the "Faturas dos últimos 6 meses" chart.
  - `open`: the open-bill summary exactly as `getBillSummary` shapes it — `postedCents`, `committedCents`, the gap, and each figure's `dataThrough` — plus `usedCreditCents` and `creditLimitCents` when the account carries them. A card with no open bill is a normal, readable result (`open: null` with a notice), never an error.
  - `closingDay`: the configured day or `null`, so the modal can offer `set`/`delete`.
  - `dataThrough` for the card's cached rows.
- `GET /api/instalments?accountId=` — open instalment plans via `deriveInstalmentPlans` over `cardRows`: merchant, per-instalment amount, paid/remaining/total, remaining cents, `finalCycle`, `finalCycleSource` (`reported`/`derived`), reversed flag, and the `totals` block. Sort by `finalCycle` ascending, then remaining descending — the ticket-01 contract.
- `POST /api/closing-days` `{ accountId, day }` and `DELETE /api/closing-days?accountId=` — thin wrappers over `ClosingDayStore`; `day` validated 1–28 with Zod. A deleted day answers `{ deleted: 0|1 }`.

### View components (`components/views/cards.tsx`)

Port the prototype's layout per card account:

- Bill card: institution + last digits, "Fatura de <mês> · vence <dia>" derived from the open bill's cycle and closing day, the `posted` figure as the headline with the `committed` figure and the gap shown when they disagree (the two-figure contract exists precisely because one number cannot be trusted — do not collapse them), used-credit progress bar against the limit, "Pagar fatura" button that shows the demo toast (PRD non-goal), "Ver fatura" opening a real list of the card's recent bills.
- Instalment plans card (or section): the open plans in the ticket-01 table shape, with the `derived`/`reported` source shown on the final cycle, reversed plans flagged and excluded from totals.
- Closing-day control: a small modal to set (1–28) or remove the day; the open bill's labels re-derive after a change.
- Faturas chart: recharts grouped bars/lines of the last six closed bills per card, the prototype's legend and colors.
- Empty states: no cards configured, no open bill, no instalment plans — each readable, none an error.

## Files to touch

- `apps/web/app/api/accounts/route.ts` — extend with the `types` filter (or a sibling route; keep the response shape from ticket 05)
- `apps/web/app/api/bills/route.ts`, `apps/web/app/api/instalments/route.ts`, `apps/web/app/api/closing-days/route.ts` + `apps/web/lib/handlers/`
- `apps/web/components/views/cards.tsx`, `apps/web/components/ui/progress.tsx` (if not extracted in 05)
- `tests/web/cards-handler.test.ts`, `tests/web/instalments-handler.test.ts`, `tests/web/closing-days-handler.test.ts` (new)
- `tests/web/integration/cards.test.ts` (new — fixture DB + Pluggy mock bills)
- `e2e/cards.spec.ts` (new)

## Test plan

TDD, red before green. Handlers are plain functions; `tests/fakes/` provide the fake bank and store; instalment fixtures come from ticket 01's appendix shape (centavo drift, embedded counter, renewal, reversal) — synthetic, never real statements.

1. `bills` handler: with a fake bank returning two bills + a fake store returning open-cycle rows, `open.postedCents`/`committedCents` equal the core derivation's output; a card with an empty bill list returns `open: null` with a notice (normal result, 200); a card with no closing day returns `closingDay: null`.
2. `instalments` handler: the ticket-01 traps — centavo drift stays one plan, a counter embedded in the description stays one plan, a completed plan is absent, a reversed plan is flagged and excluded from totals; `finalCycleSource` distinguishes reported from derived.
3. `closing-days`: `day` outside 1–28 is a validation error; set then list shows the day; delete returns the row count; persistence goes through the store (fake).
4. Integration (`tests/web/integration/cards.test.ts`): against `fixture-db` + the Pluggy mock — the mock serves the card's bills, the handler's `open.postedCents`/`committedCents` equal the core derivation over the seeded rows; an empty bill list is `open: null` with a notice; instalment plans render the ticket-01 traps (centavo drift, embedded counter, renewal, reversal) from synthetic rows; a closing-day write survives a fresh composition-root instance (persistence through `data.db`).
5. E2E (`e2e/cards.spec.ts`): the seeded card shows the expected posted/committed figures and the gap; instalment rows render with their `reported`/`derived` sources; setting a closing day updates the "vence" label and survives a page reload; "Pagar fatura" shows the demo toast and never changes state.
6. Live acceptance (manual, recorded in `docs/research/`): for the author's real cards, the web's `posted`/`committed`/gap and the instalment totals equal `getBillSummary`/`listInstalmentPlans` responses for the same cache — totals and counts only.

## Validation

`npm run typecheck` → `npm run lint` → `npm run deps` → `npm test`, in that order, plus `npm run build:web` and `npm run e2e`. Manual: `browser_preview` against a real cache; compare the open-bill figures with the MCP tool output.

## Acceptance Criteria

* Each configured card renders its real open bill with both figures — `posted` and `committed` — and the gap between them, each with its `dataThrough`; the figures match `getBillSummary` on the same cache.
* Instalment plans render with the ticket-01 contract (paid/remaining, money left as a decimal string, `finalCycle` with `reported`/`derived` source, reversed flagged and excluded from totals) and match `listInstalmentPlans`.
* Closing days can be set and deleted from the UI and persist in `data.db`; the open bill's "vence" label re-derives afterwards; an invalid day is refused at the boundary. The e2e spec proves the persistence across a page reload.
* "Pagar fatura" is a demo toast, never a write (PRD non-goal); the e2e spec asserts the button's state never changes.
* Empty states — no cards, no open bill, no plans — are readable content, not errors.
