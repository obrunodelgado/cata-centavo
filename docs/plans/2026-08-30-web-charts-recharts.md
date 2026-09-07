# Charts on the web: recharts (written decision)

**Date:** 2026-08-30
**Ticket:** 06 (web overview), shared by 08 (cards) and 09 (analysis)
**Status:** accepted

## The decision

The web app renders its charts through **recharts 3.x** (`recharts@^3.10.1`,
`react-is` as its peer), a runtime dependency of `@cata-centavo/web` only —
nothing in `packages/` or the CLI depends on it, and the root devDependency
list is untouched.

## What it costs

- One runtime dependency (plus `react-is`) in `apps/web/package.json`.
- ~500 kB of bundled JS on the overview view; Next.js splits it per route, so
  the other views do not pay for it.
- A chart abstraction layer: views must not touch recharts components
  directly, or ticket 09's "views cannot drift apart on colors or tooltip
  format" rule dies. All recharts imports live in `apps/web/components/charts/`
  (the wrappers in ticket 06); views import the wrappers only.

## What it buys

- The prototype's charts are hand-rolled SVG with bespoke hover/tooltip code.
  Porting that machinery per view would duplicate ~150 lines of pointer
  handling four times (tickets 06, 08, 09), and every view would have its own
  tooltip format. Recharts gives the tooltip, hover band, responsive container
  and animated entry once, in wrappers that take the token colors
  (`--c1…--c7`, `--pos/--neg`) and the `lib/money.ts` pt-BR formatters.
- The trust-boundary e2e (`e2e/trust-boundary.spec.ts`) already proves the
  browser makes no external requests; recharts ships local-only SVG rendering,
  so it cannot break that invariant.
- Recharts 3 supports React 19 and keeps accessibility (keyboard, screen
  reader) enabled by default — the ADR's "acessibilidade desde o início".

## Money rule interaction

Charts consume `chartNumber(cents)` from `lib/money.ts`: cents → float **only
at the SVG geometry boundary**, documented as presentation-only. No client
code ever does arithmetic on those floats; every number a human reads comes
from the integer-cent formatters.
