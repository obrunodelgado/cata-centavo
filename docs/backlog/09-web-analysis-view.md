# [WEB] Analysis view

**Type:** Story
**Priority:** Medium
**Tracker:** none (local markdown)
**Size:** 2 days
**Depends on:** tickets 06–08 (overview payload, bills, aggregates)

## Goal

The Análises view: the prototype's dataset × chart-type explorer — fluxo de caixa, saldo acumulado, por categoria, por cartão — each renderable as linha, área, barras, barras horizontais or rosca where the combination makes sense, over real data.

## Context

The prototype implements the explorer entirely client-side over its demo arrays. The web has everything needed already: `/api/overview` yields the fluxo and saldo-acumulado series for any window, ticket 07's aggregate data (or the overview's `anchor.categories`) yields the category dataset, and `/api/bills` yields the per-card bill series. This ticket is mostly composition and chart wiring — no new data path, no new backend surface — plus the constraint matrix the prototype encodes in `DS_META`:

| Dataset | Allowed chart types |
|---|---|
| fluxo (Fluxo de caixa) | linha, area, barras |
| saldo (Saldo acumulado) | linha, area, barras |
| categorias (Por categoria) | barras, hbar, rosca |
| cartoes (Por cartão) | linha, barras, hbar |

A combination outside the matrix is disabled in the type segment, not silently re-mapped.

## Design

### Data wiring

- `fluxo` — `/api/overview?range&anchor` → `series.received`/`series.spent`; the prototype's day-window behavior (1D/1S/1M render as bar chart) carries over when `window.kind` is `dia`/`semana`/`mes`.
- `saldo` — cumulative: bucket-level `received - spent` accumulated over the window (computed client-side in integer cents from the same payload — addition of integers is exact; no floats).
- `categorias` — `anchor.categories` from the overview payload (the anchor month), or a dedicated aggregate call when the view needs a non-anchor window; totals and percentages from cents.
- `cartoes` — last six closed bills per card from `/api/bills` (the same series the cards view charts).

### Components

- `components/views/analysis.tsx` — the prototype's two segments (dataset, chart type), the note line ("Fluxo de caixa · últimos 6 meses"), the chart surface and legend.
- `components/charts/{line,area,bar,hbar,donut}-chart.tsx` — recharts wrappers shared with tickets 06 and 08 (export them from one module so the views cannot drift apart on colors or tooltip format): token colors, pt-BR money tooltips via `lib/money.ts`, `ResponsiveContainer`, empty-state handling ("Sem movimentações neste período" variants per window kind).
- State: `ds` and `ctype` persisted under the prototype's localStorage keys (`fluxo.ds`, `fluxo.ctype`); changing the range or anchor (topbar) re-renders the active dataset.

## Files to touch

- `apps/web/components/views/analysis.tsx` (new)
- `apps/web/components/charts/*` — extracted/expanded wrappers (shared with 06/08)
- `tests/web/analysis.test.ts` (new)
- `e2e/analysis.spec.ts` (new)

## Test plan

1. Constraint matrix: a table test pins every (dataset, chart-type) pair to allowed/disabled exactly as `DS_META` states; the type segment disables the rest.
2. Series derivation: saldo acumulado over a fixture payload equals hand-computed cumulative cents; a window with no rows renders the empty state, not a zero-line chart.
3. Dataset payloads: each dataset consumes exactly the fields it declares (fluxo → series; categorias → anchor.categories; cartoes → bills) — a shape test per dataset so a payload change in tickets 06/08 fails here first.
4. E2E (`e2e/analysis.spec.ts`): the constraint matrix holds in the browser — for each dataset, the disallowed chart types are disabled in the type segment and each allowed combination renders an SVG chart with the dataset's title; switching dataset resets the chart type to the dataset's default.
5. Manual: visual parity with the prototype for each dataset × type pair; network tab shows only the routes the dataset needs.

## Validation

`npm run typecheck` → `npm run lint` → `npm run deps` → `npm test`, in that order, plus `npm run build:web` and `npm run e2e`.

## Acceptance Criteria

* The explorer renders all four datasets with the allowed chart types and disables the rest, matching the prototype's matrix; `ds`/`ctype` persist across reloads. The e2e spec pins the matrix and the per-dataset default chart type in the browser.
* Every chart's numbers come from the corresponding API payloads — the fluxo chart equals the overview series, the categoria donut equals the anchor breakdown, the cartões chart equals the bills series.
* Saldo acumulado accumulates in integer cents and matches hand computation on the fixture.
* Empty windows render the prototype's empty states; tooltips show pt-BR money from cents, never floats.
