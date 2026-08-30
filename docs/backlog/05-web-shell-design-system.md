# [WEB] Web shell, design system and composition root

**Type:** Story
**Priority:** High
**Tracker:** none (local markdown)
**Size:** 3–4 days

## Goal

Turn the placeholder `apps/web` into the Fluxo shell — the prototype's visual system, navigation and topbar, backed by a server-side composition root over the existing packages — so the remaining views have a place to live and a way to reach real data. **This ticket also stands up the automated test infrastructure (unit, integration and Playwright e2e) every subsequent ticket's tests depend on.**

## Context

`apps/web` is a generated scaffold: one `page.tsx` that prints the date, a hello API route, and a layout titled "Welcome to web". The prototype `fluxo-dashboard-financeiro.html` defines the product's visual system in full: oklch design tokens, Space Grotesk display font, 244px sidebar with five views (Visão geral, Transações, Análises, Orçamentos, Cartões), sticky topbar with range/period/sync controls, an Open Banking status card, and a component vocabulary (card, KPI band, pill, segmented control, modal, toast, table). That file is the design source of truth for this ticket; do not restyle.

The backend packages are libraries, not a service: the web becomes a second composition root over `@cata-centavo/{core,pluggy,storage}`, mirroring `apps/cli/src/bin/main.ts` (loadConfig → openDatabases → createPluggyClient → createTransactionReader + writers). The CLI's `loadConfig`/`resolvePaths` live in `apps/cli/src/config.ts`; the web cannot import from `apps/cli` (it is a different package and a dependency-cruiser rule below), so those two small pure functions are duplicated in `apps/web/lib/` with a comment pointing at the original.

Two constraints this ticket establishes for everything after it:

- **Frontend trust boundary (hard rule):** the browser never opens a database and never calls an external API. Client code calls only the app's own routes, via relative `/api/*` URLs. Imports of `@cata-centavo/pluggy` and `@cata-centavo/storage` are forbidden outside `apps/web/app/api/` and `apps/web/lib/server/`. `@cata-centavo/core` is pure (no fetch, no sqlite) and stays importable from client-side logic.
- **The sensors do not cover the web today.** `npm run lint` passes `packages/*/src apps/cli/src tests`, `npm run deps` the same, root `tsconfig.json` excludes `apps/web`, and eslint's `files: ["**/*.ts"]` misses `.tsx`. The web ships unguarded by every sensor the repo relies on; this ticket closes that gap.
- **There is no integration or e2e infrastructure.** `npm test` covers `tests/**/*.test.ts` only. The plan requires three test levels for every web ticket — unit (`node --test`), integration (handlers + composition root against real temp-dir SQLite and a Pluggy API mock) and e2e (Playwright, chromium desktop) — and none of the plumbing for the last two exists. Two facts make the integration level cheap: `packages/pluggy/src/transport.ts` already accepts a `baseUrl` option (`options.baseUrl ?? DEFAULT_BASE_URL`, transport.ts:47,116), so a mock server needs only a test-only env seam in the composition root; and `resolvePaths` already honours `XDG_CACHE_HOME`/`XDG_DATA_HOME`, so a fixture database is just a temp directory with seeded rows. Playwright is a new devDependency and needs the written decision recorded here (see "Test infrastructure" below).

## Design

### Design system port (`apps/web/app/global.css`)

Port the prototype's stylesheet verbatim in structure, adapted from one-file CSS to `global.css` + per-component modules where it helps:

- Tokens: the `:root` block — `--bg/--surface/--fg/--muted/--border/--accent/--accent-deep`, the data-series palette `--c1..--c7` (never equal to the UI accent), `--pos/--neg` with soft variants, typography scale, spacing, radii.
- Fonts: copy `space-grotesk-latin.woff2` and `space-grotesk-latin-ext.woff2` from the prototype's `assets/fonts/` into `apps/web/public/fonts/`; declare the same two `@font-face` rules with `font-display: swap` and the same unicode-ranges. No build-time network, no `next/font`.
- Shell: `.app` grid (244px sidebar), sticky `.side`, sticky `.topbar` with blur backdrop, `.content`, the five `.view` sections, and the responsive breakpoints (1080: KPI band wraps; 920: sidebar becomes a horizontal nav).
- Components: `.card/.card-head/.card-title/.card-sub`, `.kpi-band/.kpi/.kpi-delta/.spark`, `.seg`, `.date-seg`, `.btn` variants, `.pill/.tag`, `.progress/.progress-bar`, `.ds-table`, `.filter-bar/.search`, `.cat-chart/.cat-row`, `.insight`, `.meta-item`, `.modal-backdrop/.modal`, `.toast`, `.chart-wrap/.chart-tip/.legend`.
- Accessibility: `:focus-visible`, `prefers-reduced-motion` (all animations off), `aria-*` labels on interactive elements, keyboard activation for table rows.
- `[hidden]`, `::selection`, `.num` (tabular mono) and `.meta` carry over unchanged.

### Shell components (`apps/web/components/`)

- `shell/sidebar.tsx` — brand mark + "Fluxo", the five nav items (active state), the Open Banking card with connection count and institution names.
- `shell/topbar.tsx` — page title, range segment (1D/1S/1M/3M/6M/12M), anchor date input, sync button with freshness label, "Nova transação" button (demo modal in ticket 07; placeholder disabled state here is fine), avatar.
- `shell/ob-modal.tsx` — the "Gerenciar bancos" modal. Real, read-only: per configured connection show institution, status, consent state, last sync. No connect/disconnect toggle — adding a connection is env configuration (ADR §2); the modal states this in plain words with the three env variables and where to paste them.
- `ui/*` — Card, Pill, Tag, Seg, Button, Progress, Modal, Toast, Table primitives mirroring the prototype's CSS classes; they take className props and render the prototype's markup.
- View containers: five placeholder views (`components/views/*.tsx`) wired to `switchView`-style navigation with the prototype's `viewEnter` animation; each placeholder shows the view title so later tickets fill them in.

View state: `tab`, `range`, `anchor`, `ds`, `ctype` in `localStorage` under the prototype's keys (`fluxo.tab`, `fluxo.range`, `fluxo.anchor`, `fluxo.ds`, `fluxo.ctype`). Anchors and ranges are calendar strings (`YYYY-MM-DD`); no `Date` arithmetic across timezones anywhere in client code.

### Composition root (`apps/web/lib/server/`)

- `config.ts` — `loadConfig` and `resolvePaths` duplicated from `apps/cli/src/config.ts` (same env vars, same XDG fallbacks, same macOS paths, same validation messages). Docblock: "duplicated from apps/cli/src/config.ts — the web cannot import apps/cli; keep the two in sync".
- `logging.ts` — a `Logger` implementing the core contract, writing to stderr (`process.stderr.write`) with the same field/message shape the CLI logger uses. Nothing human-facing on stdout, ever.
- `composition.ts` — lazy singleton: on first call, `loadConfig(process.env)`; on success `openDatabases(paths)` + `createPluggyClient(credentials)` + `createTransactionReader({bank, store, toFailure, log, clock})` + `createCategoryWriter` + `createClosingDayStore`. Returns a `Source`-shaped result: `{ok: true, …}` or `{ok: false, problems}`. Configuration and database failures are readable JSON payloads per route, never a thrown process killer.

### API routes

- `GET /api/sources` — per configured connection: institution, status, execution status, consent verdict (reuse `core/diagnose.ts`), `lastUpdatedAt`, `dataThrough`. Shape mirrors `listSources` output.
- `GET /api/accounts` — cached accounts with balance cents, type and subtype (for the cards view later), plus a `dataThrough` map per connection.
- `POST /api/sync` — runs `reader.load(all configured connections)` — the existing read-through walk, which dedupes in-flight walks. Response: per-connection outcome (`ok` with row counts, or failure kind + message) and totals. This is the topbar sync button; it can take minutes on a first run, so the client shows a per-view "Sincronizando…" state and the route responds once at the end.

### Sensors coverage (part of this ticket)

- `package.json`: `lint` and `deps` gain `apps/web/app apps/web/lib apps/web/components`; `typecheck` gains a web pass (`tsc --noEmit -p apps/web/tsconfig.json`, chained after the root pass — root tsconfig excludes `apps/web` on purpose, because the web runs with `moduleResolution: bundler`); `test` already finds `tests/**/*.test.ts`, which will include `tests/web/` once tests exist.
- `eslint.config.js`: match `.tsx` (files pattern), keep the sensor rules; `no-console` stays an error — the web logger uses `process.stderr.write`, client code must not console.log.
- `.dependency-cruiser.js`, three new rules (errors):
  - `client-imports-no-infrastructure` — from `^apps/web/(components|app)/` (not `app/api/`) to `^packages/(pluggy|storage)/src/`: the frontend trust boundary, enforced mechanically.
  - `web-imports-no-cli` — from `^apps/web/` to `^apps/cli/src/`.
  - extend `no-undeclared-folders`'s allowed paths with `^apps/web/(app|lib|components)/`.
- README: a `Running the web` section — `nvm use`, the three env vars, `npm run dev:web`, and the local-first posture (the browser talks to localhost only).

### Test infrastructure (part of this ticket)

**DevDependency decision (written, per AGENTS.md):** add `@playwright/test` (devDependency of the root package; the web app gains no runtime dependency). Costs: one devDependency plus a ~170 MB chromium download (cached in CI), seconds per e2e run, one more moving part in CI. Buys: the only level that verifies the app as a user sees it — hydration, navigation, real fetches, the trust boundary in the browser's network traffic — which unit tests cannot see. Chromium desktop only (user decision); responsive breakpoints stay manual verification.

- **`PLUGGY_API_URL` seam** — `lib/server/composition.ts` reads the optional env var and passes `baseUrl` to `createPluggyClient` (the transport already supports it). Test-only, documented in the docblock; absent in normal runs.
- **`tests/web/integration/pluggy-mock.ts`** — a `node:http` server answering the client's calls (`/auth`, `/items/{id}`, `/accounts`, `/v2/transactions` cursor pages, `/bills`, `/investments`, `/consents`) from the repo's redacted fixtures. Lives in `tests/` only — production code never imports it (the fakes-outside-`src` convention). Exercises the real transport (rate limiting, 429 backoff), the real mapper and the real walk.
- **`tests/web/integration/fixture-db.ts`** — per test: fresh temp `XDG_CACHE_HOME`/`XDG_DATA_HOME` dirs (cleaned up), `openDatabases` through the real storage package (migrations included), synthetic accounts/transactions seeded through the real stores (`createTransactionStore.replaceAccount` + domain types). The composition root is built with these paths — the same code path as production.
- **`e2e/seed.ts`** — fixture environment bootstrap: refuses to run when the resolved XDG dirs equal the real `~/Library/Caches`/`~/.cache` data homes (safety check, tested); creates a fresh temp environment; seeds accounts and 12 months of transactions **dated relative to run-time today** (so "últimos 6 meses" assertions hold on any run day); starts `pluggy-mock.ts`; prints the env block Playwright's `webServer` consumes.
- **`e2e/playwright.config.ts`** — one project `chromium-desktop` (1280×900); `webServer` boots the app with the fixture env (`npm run dev:web` locally, `build:web && next start` in CI); `reuseExistingServer: !process.env.CI`; testDir `e2e`. Specs are `*.spec.ts`, so `node --test` never sees them.
- **Scripts** — `npm run e2e` (playwright test), `npm run e2e:ui` (headed, local).
- **CI** — new job `web-e2e` in `.github/workflows/ci.yml` (node 24 only — the web and the seed run `.ts` sources; the existing node-22 matrix job stays untouched): `npm ci` → `npx playwright install --with-deps chromium` → `npm run build:web` → `npm run e2e`. Runs after the four-sensor sequence.
- **Baseline e2e specs** — `e2e/shell.spec.ts` (five views navigate with the right titles; OB modal lists the fixture sources with consent verdicts) and `e2e/trust-boundary.spec.ts`: registers `page.on("request")` and fails on any request whose origin differs from the app origin — the automated guarantee of the hard rule (also proves local fonts and recharts make no external calls).

## Files to touch

- `apps/web/app/global.css` — tokens + component CSS (replaces the generated one)
- `apps/web/app/layout.tsx`, `apps/web/app/page.tsx` — shell + view switching
- `apps/web/app/api/sources/route.ts`, `apps/web/app/api/accounts/route.ts`, `apps/web/app/api/sync/route.ts` — thin wrappers over `lib/handlers/`
- `apps/web/lib/server/{config,logging,composition}.ts`, `apps/web/lib/handlers/{sources,accounts,sync}.ts`, `apps/web/lib/api.ts` (client fetch helper — relative URLs only)
- `apps/web/components/{shell,ui,views}/*` — new
- `apps/web/public/fonts/space-grotesk-{latin,latin-ext}.woff2` — copied from the prototype
- `tests/web/integration/pluggy-mock.ts`, `tests/web/integration/fixture-db.ts` — new (test infra)
- `e2e/playwright.config.ts`, `e2e/seed.ts`, `e2e/shell.spec.ts`, `e2e/trust-boundary.spec.ts` — new
- `package.json`, `eslint.config.js`, `.dependency-cruiser.js` — sensor coverage, `e2e` scripts, `@playwright/test`
- `.github/workflows/ci.yml` — `web-e2e` job
- `tests/web/shell.test.ts` (new) — see below
- README — web section

## Test plan

TDD, red before green. `tests/web/` uses the repo's `node --test`; route handlers are plain functions taking `Request` and returning `Response`, so tests call them directly. `tests/fakes/` (fake-bank, fixed-clock, fake-store) are importable from `tests/` and cover the handler paths.

1. `lib/server/config.ts`: table tests for env validation (missing vars, malformed/duplicate item ids, XDG overrides, macOS fallbacks) — behavior must match `apps/cli/src/config.ts`'s existing suite.
2. `handlers/sources`: with a fake bank returning one healthy + one revoked connection, the payload lists both, the revoked one with its consent verdict; a configuration failure returns readable JSON with the problems, not a throw.
3. `handlers/sync`: a fake bank + fake store shows per-connection outcomes and row counts; a failing connection is reported, not fatal; two concurrent calls share one walk (the reader's in-flight map).
4. `logging`: every line lands on stderr; nothing ever touches stdout.
5. **Boundary proof (the test that guards the rule):** a temporary `import` of `@cata-centavo/storage` from a component must make `npm run deps` fail with `client-imports-no-infrastructure`. Run it once, show the failure, revert. The rule itself is the regression test — it stays in CI.
6. `lib/api.ts`: all generated URLs are relative (unit test over the helper's output).

Integration (`tests/web/integration/`, `node --test`):

7. `fixture-db`: seeding a temp XDG environment through the real stores produces databases whose `PRAGMA user_version` matches the migrations and whose row counts equal the seed.
8. `pluggy-mock`: a sync walk through the real client (`createPluggyClient({baseUrl: mock})` → transport → mapper → `createTransactionReader.load`) lands exactly the fixture's rows in the store; a multi-page cursor walk visits every page; the 429 path honours `Retry-After` (the mock can be told to answer 429 once).
9. `handlers/sync` against `fixture-db` + mock: per-connection outcomes and row counts; a failing connection (mock answers 500 for one item) is reported, not fatal; two concurrent calls share one walk.
10. `handlers/sources` and `handlers/accounts` against `fixture-db`: payloads match the seeded state, including `dataThrough` and an unavailable connection's verdict.

E2E (`e2e/`, Playwright):

11. `shell.spec.ts`: all five views navigate and show the right titles; the OB modal lists the fixture sources.
12. `trust-boundary.spec.ts`: for each view, any browser request whose origin differs from the app origin fails the test.

## Validation

`npm run typecheck` → `npm run lint` → `npm run deps` → `npm test`, in that order, plus `npm run build:web` and `npm run e2e` (green against the seeded fixture environment). `npm run dev:web` with the three env vars exported; `browser_preview` against the shell; check the browser's network tab shows only same-origin `/api/*` requests.

## Acceptance Criteria

* The app renders the prototype's shell — sidebar with five navigable views, topbar with range segment and anchor date, Open Banking card — with the prototype's tokens, fonts and responsive behavior, pt-BR copy.
* `GET /api/sources` and `GET /api/accounts` return real data from a real cache, with per-connection `dataThrough`; a revoked or expired connection is reported with its verdict, never silently absent.
* `POST /api/sync` walks every configured connection and returns per-connection outcomes; a second call while one is in flight does not start a second walk. Integration tests cover the walk against the Pluggy mock (multi-page cursor, 429 backoff, failing connection reported).
* `npm run e2e` runs green against the seeded fixture environment: shell navigation, OB modal, and the trust-boundary spec (no browser request leaves the app origin on any view).
* The `PLUGGY_API_URL` seam is documented as test-only in the composition root's docblock and changes nothing in a normal run.
* The `web-e2e` CI job exists, runs after the four-sensor sequence on node 24, and caches the chromium download.
* The Open Banking modal is read-only and states plainly that connections are configured via `PLUGGY_ITEM_IDS` in the environment.
* `npm run deps` fails when any file under `apps/web/components/` imports `@cata-centavo/storage` or `@cata-centavo/pluggy`, and when any web file imports `apps/cli`.
* `npm run typecheck`, `lint`, `deps` and `test` cover `apps/web` and `tests/web`; all four pass; `npm run build:web` passes.
* The browser's network activity during a session shows only relative `/api/*` requests.
