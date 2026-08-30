# [WEB] Overview view with real aggregates

**Type:** Story
**Priority:** High
**Tracker:** none (local markdown)
**Size:** 3–4 days
**Depends on:** ticket 05 (shell, composition root, `/api/accounts`, `/api/sync`)

## Goal

The Visão geral view answers "how is my money doing" at a glance: KPI band, cash-flow chart, spending donut, recent transactions and the investment snapshot — every number real, computed server-side from the cache through the same core functions the MCP tools use.

## Context

The prototype's overview renders from a hardcoded demo dataset (REC/DESP/SALDO arrays, CATS, INV, TXNS). The backend already holds everything the view needs: cached accounts with balances, cached transactions with derived categories, and `collectInvestments`. What does not exist anywhere is the *window semantics* — the prototype computes 1D/1S/1M/3M/6M/12M windows client-side over a full transaction list. In the web this has to happen server-side, over the cache, because the client must not see raw rows for the whole year just to render a KPI band (and the frontend trust boundary of ticket 05 forbids touching the store directly).

The money rules from the PRD apply verbatim: aggregation never hand-rolled over `amount` (the sign convention inverts between BANK and CREDIT — `core/aggregate.ts` already normalizes), a balance of exactly `0` must survive serialization, and a stale or unavailable connection is reported, never counted as zero.

## Design

### `lib/series.ts` — window semantics (pure, no I/O)

One function derives a window from the anchor and range, and a second builds its buckets from a list of rows:

```
windowSpec(range, anchor) → { kind: "dia"|"semana"|"mes"|"meses", from, to, labels, … }
```

- `1D` — the anchor day, one bucket; `1S` — the anchor's week (Monday start, prototype's `mondayOf`), seven buckets; `1M` — the anchor month, one bucket per day; `3M/6M/12M` — that many months ending at the anchor's month, one bucket per month.
- Calendar-string arithmetic only (`YYYY-MM-DD`), mirroring the prototype's `addDays`/`mondayOf`/month-end logic but on strings — never `Date` objects crossing timezones. The cache's `local_date` is already São Paulo-local.
- `from`/`to` are inclusive; a query for the window uses exactly those bounds.

A second function buckets rows into the window: per-day `{receivedCents, spentCents}` for the fine ranges, per-month for the coarse ones. The coarse range can aggregate with SQL (`GROUP BY substr(local_date,1,7)`) via the existing store, or by calling `core/aggregate` per bucket — pick whichever the data volume justifies; the handler stays the only caller.

### `GET /api/overview?range=&anchor=` — the dashboard payload

Query params validated with Zod at the boundary: `range ∈ {1D,1S,1M,3M,6M,12M}`, `anchor` a `YYYY-MM-DD` string (defaults to today, São Paulo).

Response (our shape, cents as integers, `null`/`undefined` pruned, `0` kept):

```jsonc
{
  "window": { "kind": "meses", "label": "últimos 6 meses", "unitLabel": "Mar" },
  "series": { "labels": ["Out","Nov","Dez","Jan","Fev","Mar"],
              "received": [918000, …], "spent": [723000, …] },   // cents
  "anchor": { "received": 984000, "spent": 721435,
              "savingsRate": 26.7,                              // null when no income
              "categories": [{ "categoryId": "moradia", "name": "Moradia",
                               "spentCents": 258700, "count": 12 }] },
  "balances": { "cashCents": 1843210, "investedCents": 4823000, "owedCents": 3522700 },
  "recent": [ /* ≤ 10 rows, same shape as ticket 07's list rows */ ],
  "investments": { "totalCents": 4823000, "byType": [/* hbar data */],
                   "monthDelta": "+1,12%" },
  "budgetsMini": null,                // demo payload from lib/demo-data.ts — ticket 10
  "sources": [{ "connectionId": "…", "institution": "Nubank",
                "through": "2026-08-29" }],
  "unavailable": [{ "connectionId": "…", "kind": "consent-revoked", "message": "…" }]
}
```

Composition inside the handler:

1. `balances` — cached accounts: `cashCents` = checking/savings balances summed in integer cents; `investedCents` from `collectInvestments` + `summarizeInvestments`; `owedCents` = sum of credit accounts' used credit (or the open bills' committed — the same figure `getBillSummary` reports; name the choice in the docblock).
2. `series` + `anchor` — `reader.query({from, to})` for the window, then the bucket functions; `anchor.categories` via `core/aggregate(rows, today).groups` (top-level categories, the 22-group taxonomy, `COALESCE` chain already inside the SQL).
3. `recent` — the newest rows in the window, bounded at 10, formatted like ticket 07's list rows.
4. `sources`/`unavailable` — from the sources handler's data; a connection whose `dataThrough` predates the window start stays visible, never silent.

### View components (`components/views/overview.tsx`)

Port the prototype's overview markup with the payload wired in:

- KPI band: Saldo em conta (cash, with the delta vs the previous equivalent window), Receitas · período, Despesas · período, Taxa de economia (null → "—"). Numbers formatted `pt-BR` via `lib/money.ts` (`Intl.NumberFormat` over integer cents; floats only inside chart geometry).
- Fluxo de caixa chart + Despesas por categoria donut: recharts wrappers in `components/charts/` (see decision record in the megaplan; wrappers take the token colors `--c1…--c7`, `--pos/--neg`).
- Transações recentes table (reuse ticket 07's row renderer when it lands; until then a minimal row renderer with the same columns).
- Investimentos card — real totals and by-type bars from `investments`.
- **Demo-labeled cards**: Orçamentos do mês (mini), Insights, Metas de economia render from `lib/demo-data.ts` (the prototype's ORCS/insight/meta constants) and each carries a visible "demo" tag; `budgetsMini` stays `null` in the API until ticket 10.
- Freshness: the topbar sync label reflects `sources` (through dates); an unavailable connection shows a notice on the view, not an empty number.

### `lib/money.ts` (part of this ticket, used by every view)

`centsToBRL(cents)` (pt-BR, `R$ 1.234,56`), `centsToSignedBRL`, `percentBRL`, and a `chartNumber(cents)` helper that converts cents to a float **only** for chart scales — documented as presentation-only: no arithmetic ever happens on the float.

## Files to touch

- `apps/web/lib/series.ts`, `apps/web/lib/money.ts` (new, pure)
- `apps/web/lib/handlers/overview.ts` + `apps/web/app/api/overview/route.ts` (new)
- `apps/web/components/views/overview.tsx`, `components/charts/{flow-chart,donut-chart,sparkline}.tsx` (new)
- `apps/web/lib/demo-data.ts` (new — prototype's demo constants, exported under one module)
- `tests/web/{series,money,overview-handler,demo-data}.test.ts` (new)
- `tests/web/integration/overview.test.ts` (new — handler against fixture DB + Pluggy mock)
- `e2e/overview.spec.ts` (new)

## Test plan

TDD. Prefer table tests — one array of cases, one loop, one assertion body.

1. `series`: window boundaries — anchor mid-month for `1M`, anchor on a Sunday for `1S`, month ends and a leap February for `1D/1M`, `3M/6M/12M` ending at the anchor's month; inclusive `from`/`to`.
2. `money`: zero cents → `R$ 0,00` (never blank); negative → signed; rounding matches pt-BR conventions; `chartNumber` is documented as presentation-only.
3. `overview` handler with fake store rows: spent/received per bucket equal hand-computed cents; categories resolve through the core aggregate; a `0` balance survives; a row in the anchor month but outside the window range does not leak into `anchor`; unavailable connection appears in `unavailable` with the same totals otherwise intact; `savingsRate` is null when the period has no income.
4. `demo-data`: the demo constants are internally consistent (each budget's spent ≤ its demo limit where the prototype says so; totals match the prototype's displayed figures) so the demo cards can never show a nonsense bar.
5. Integration (`tests/web/integration/overview.test.ts`): the overview handler against `fixture-db` + the Pluggy mock — seeded rows yield the expected per-bucket series and anchor categories (hand-computed cents); a seeded unavailable connection appears in `unavailable` with the rest intact; a stale `dataThrough` is carried through.
6. E2E (`e2e/overview.spec.ts`): the seeded KPI figures appear verbatim on screen (the seed fixes their values, e.g. `R$ 18.432,10`); switching the range (1D→12M) changes the series label and refetches `/api/overview`; changing the anchor re-renders; the insights/metas/budgets-mini cards carry the demo tag; clicking sync against the mock completes and updates the freshness label.
7. Live acceptance (manual, recorded in `docs/research/`): with the author's real cache, every KPI and chart figure equals a direct SQL query against `cache.db` for the same window — totals and counts only, never statements or ids.

## Validation

`npm run typecheck` → `npm run lint` → `npm run deps` → `npm test`, in that order, plus `npm run build:web` and `npm run e2e`. Manual: `browser_preview` against a real cache; visual comparison with the prototype (same layout, same tokens); network tab shows one `/api/overview` call per range/anchor change.

## Acceptance Criteria

* The overview renders the prototype's layout with real data: KPI band, fluxo chart, category donut, recent transactions and the investments card; demo cards (budgets mini, insights, metas) are visibly tagged as demo.
* Every KPI and chart figure equals a direct SQL query over the same cache for the same window — the equality is asserted in tests for the fixture and recorded in `docs/research/` for the live cache.
* A balance of exactly zero renders `R$ 0,00`; a period with no income shows "—" for the savings rate, never a division artifact.
* Changing the range (1D/1S/1M/3M/6M/12M) or the anchor date refetches `/api/overview` and re-renders; the window labels match the prototype's wording. The e2e spec pins the range/anchor interactions and the seeded KPI texts.
* An unavailable connection is listed with its verdict and the remaining numbers still render; a stale `dataThrough` is shown, not hidden.
* All money is integer cents on the wire and formatted pt-BR on screen; no client code performs arithmetic on chart floats.
