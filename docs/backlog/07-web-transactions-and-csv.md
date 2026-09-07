# [WEB] Transactions view

**Type:** Story
**Priority:** Medium
**Tracker:** none (local markdown)
**Size:** ~2 days (CSV export split into 07b)
**Depends on:** tickets 05–06 (shell, composition root, `/api/overview`)

## Goal

The Transações view: the prototype's searchable, filterable transaction list with the category-breakdown sidebar and row details with real category correction. CSV export was split out into ticket 07b.

## Context

The backend already serves everything the view needs: paged reads with keyset pagination (`TransactionFilter.after = {localDate, id}`, hard cap), category derivation in SQL, and `CategoryWriter.setCategory` for corrections. One gap exists:

- **Search.** The prototype filters by free text client-side. The web must search server-side, but the read path has no free-text parameter. This is the only change to `packages/` this ticket makes, and it is additive plumbing, not a feature: a `q` field on `TransactionFilter` matched against description and counterparty — with the repo's standing rule applied: a test proving the parameter reaches the SQL.

Category correction is real (the writer exists and Phase 3 acceptance covers it); the prototype's "nota" field on the detail modal has no storage and stays out of scope — the modal shows the real fields and the category editor only. The topbar's "Nova transação" button (ticket 05 deferred its demo modal here) stays disabled instead: this is a read-only Open Finance app, and a fake create-transaction affordance is a lie the product does not need.

Two decisions shape everything below. First, the tipo filter (receitas/despesas) follows ADR-0003 all the way: an internal transfer is never a receita and never a despesa — a sign-only filter would put a R$ 100k aplicação under "receitas", the exact confusion that produced the ADR (a −17.8% savings rate). Second, the handler reads the whole filtered window once and slices pages in JS — the same whole-window read the overview already does — which is what makes the breakdown, the honest count and the tipo filter fall out of one read with no second `packages/` change.

## Design

### Read-path plumbing (the only `packages/` change)

Add `q?: string` to `TransactionFilter` in `packages/core/src/contracts.ts` and to the storage query builder (`packages/storage/src/transactions.ts`), inside the CTE — a cheap filter over `t` columns, so the derived subqueries only touch rows that already survived it. The search text is normalized in JS — the query-side half of the `description_norm` contract: NFD accent-strip + uppercase, without the merchant stripping — and matched three ways:

```
UPPER(t.description) LIKE ? OR t.description_norm LIKE ? OR UPPER(t.counterparty_name) LIKE ?
```

with `%`, `_` and `\` escaped (`ESCAPE '\'`). Trim; empty after trim → no filter. SQLite's `UPPER`/`LOWER` fold ASCII only, so `description_norm` (normalized at insert) carries the accent-insensitive half and `counterparty_name` stays accent-sensitive — a documented limitation, since a norm column for it is a schema migration out of scope. `UPPER(description)` keeps raw-text matching (digits, acquirer prefixes, instalment markers) that `description_norm` deliberately strips. Core's pure modules do not change; the MCP tools are unaffected (they simply never pass `q`).

The tipo filter and the internal-transfer exclusion do **not** reach SQL: the handler filters in JS through core's `isSelfTransfer` (ADR-0003), so no derived `c_self` column is needed.

### API routes

- `GET /api/transactions?from&to&categoryIds&accountIds&q&type&limit&after`
  - `from`/`to` inclusive `YYYY-MM-DD`, required; `from > to` → 400 `from must not be after to`; `to` without `from` → 400 (the overview's rule). `categoryIds` top-level taxonomy ids plus `"none"` (Sem categoria); `accountIds` declared and tested but unused by the UI — ticket 08 (cards) consumes it, and the repo's rule is against declared-and-untested parameters, not declared-and-not-yet-used ones; `q` free text; `type ∈ {todas, receitas, despesas}` — the sign decision stays server-side (the client must never reason about the BANK/CREDIT inversion), and receitas/despesas exclude internal transfers; `limit` ≤ 100 (default 50); `after` = the opaque keyset token from the previous page, base64url of `{localDate, id}` (ids are opaque strings and may contain any character).
  - Handler pipeline: `collectAccounts` (the overview's pattern) → **one read** of the full filtered window (`reader.query` with `q` + `categories`, never `after` — the cursor is a wire-level token over the single read, and the storage keyset stays for the MCP) → tipo filter in JS (sign + `!isSelfTransfer`) → `breakdown` via `aggregate()` → page slice in JS → `totalInWindow` for free. The prototype's "N transações" subtitle stays honest because the count and the rows come from the same array.
  - Response: `{ ok, rows: [{ id, localDate, occurredAt, description, categoryId, categoryName, categorySrc, accountId, accountName, paymentMethod, internal, amountCents, status }], hasMore, nextAfter, totalInWindow, breakdown, unavailable }`.
  - `categorySrc` and `internal` travel because the modal and the "interna" tag need them. `paymentMethod` arrives fully derived server-side — `tipoOf` is extracted from the overview handler into a shared module so the two handlers cannot drift (PIX/Boleto/TED/Débito, "Cartão" on CREDIT, "—" when nothing is known). `status` is derived per request from `localDate` against today (Futuro/Pago, CONTEXT.md). `dataThrough` is left out — nothing renders it; the topbar owns freshness.
  - `breakdown` follows the list's filters **except `categoryIds`**: the sidebar is navigation, not a mirror — every category stays clickable with the active one marked, so switching categories is one click and clearing is clicking again. Its content follows `type`: despesas por categoria under `todas`/`despesas`, receitas por categoria under `receitas` (same `aggregate()`, the other sign). Internal transfers never appear (aggregate semantics); "Sem categoria" appears with `categoryId: null` and filters as `categoryIds=["none"]`.
  - Every connection unavailable is `ok: true` with `rows: []` and `unavailable` populated — readable content, never a configuration failure (recoverable-failure rule).
- `POST /api/transactions/category` — `{ ids: string[], categoryId }` → `CategoryWriter.setCategory`; Zod: `categoryId` one of the 22 top-level ids (closed list — free-form strings let an agent invent `alimentacao` and `alimentação` in one database), `ids` 1–100 (mirrors the MCP tool); response `{ updated, unknownIds }`. Unknown ids are readable content, not an error. There is no "clear" path — the writer has none; adding one is out of scope.
- `GET /api/categories` — the 22 top-level groups from the taxonomy (`core/taxonomy.ts`).

### View components (`components/views/transactions.tsx`)

Port the prototype's layout: category breakdown sidebar (click to filter the list, click again to clear — the prototype's toggle semantics), search field (debounced 300ms), tipo segment, category select (the 22 top-level groups from `/api/categories`), the table, "Mostrar mais" (append the next page via `after`, up to 100 at a time; the first page is 50). No export button — CSV is ticket 07b.

Detail modal: real fields (date; the `occurredAt` clock time only when the São Paulo-local time-of-day is not midnight — a pure, table-tested function; description; category with the derivation source shown when `categorySrc === "override"`, as "corrigida por você"; account; forma de pagamento; amount) and the category `<select>` with the 22 groups. Saving calls the category route, patches the edited row locally (the new category and `categorySrc: "override"` are known client-side) and refetches the first page in the background for a fresh `breakdown`/`totalInWindow` — scroll and pagination stay put.

Filter state (`q`, `type`, `categoryIds`) persists in `localStorage` under `fluxo.tx.*` (the shell's convention); pagination restarts at page 1 on reload.

### Frontend patterns (skill `frontend-patterns`; zero new dependencies)

- `lib/use-api.ts` — the fetch hook: `payload/error/loading`, the `cancelled` flag on cleanup, and the fetcher kept in a ref so `refetch` stays referentially stable (the infinite-loop trap with inline closures). The transactions view is born on it; the overview migrates to it.
- `lib/use-debounce.ts` — the skill's debounce hook, 300ms on the search field.
- `useReducer` local to the view — filters, pagination, modal and the saving flag form one state with coupled transitions (a filter change resets pagination; a save patches and refetches). No Context: nothing shares state across trees; the shell already hands down `range`/`anchor` as props.
- `components/ui/table.tsx` — the shared table this ticket anticipated: composition (not compound components), the row memoized with `React.memo` ("Mostrar mais" appends without re-rendering earlier rows; opening the modal does not re-render the list), and the keyboard/aria pattern the overview's `RecentRowItem` already has (`tabIndex`, `role="button"`, `aria-label`, Enter/Space). The overview migrates to it.
- `components/ui/modal.tsx` gains focus management: save `document.activeElement` on open, focus the dialog, restore on close. Its docblock already promises "focus on first control"; the code now keeps that promise.
- Memoization discipline: `useCallback` for handlers passed down to rows; copy before any `.sort()` (sort mutates in place). The breakdown arrives ready from the server; the client derives almost nothing heavy — and stays that way.

Rejected, with reasons: virtualization (`@tanstack/react-virtual` — pages of 50–100 rows, a new dependency against ADR §5, the prototype does not virtualize), React Query/SWR (the ~30-line hook covers it; single-user app), framer-motion (animations are the prototype's CSS, ported in ticket 05), class ErrorBoundary (failures already arrive as readable content; a crash boundary is a shell concern, not this view's).

## Files to touch

- `packages/core/src/contracts.ts` — `q` on `TransactionFilter`
- `packages/storage/src/transactions.ts` — `q` in the query builder (+ tests in `tests/storage/`)
- `apps/web/app/api/transactions/route.ts`, `…/transactions/category/route.ts` + `apps/web/lib/handlers/`
- `apps/web/app/api/categories/route.ts` — the 22 top-level groups from the taxonomy (`core/taxonomy.ts`)
- `apps/web/lib/use-api.ts`, `apps/web/lib/use-debounce.ts` — new hooks
- `apps/web/components/views/transactions.tsx`, `components/ui/table.tsx` (shared table, extracted from the overview)
- `apps/web/components/ui/modal.tsx` — focus management
- `apps/web/lib/handlers/overview.ts`, `components/views/overview.tsx` — migrate to the shared hook and table (behavior preserved; the existing overview suite is the net)
- `tests/web/transactions.test.ts`, `tests/web/transactions-handler.test.ts` (new)
- `tests/web/integration/transactions.test.ts` (new)
- `e2e/transactions.spec.ts` (new)

## Test plan

TDD, red before green. Table tests everywhere.

1. `q` reaches the query: a storage test with a synthetic store asserts rows are filtered by description and by counterparty, case-insensitively; that `q="farmacia"` matches "Farmácia" (accent-insensitive via `description_norm`); and that `%`/`_` in the search text do not act as wildcards (escaped).
2. Handler: each query parameter provably changes the result set — `from`/`to` bounds, the two 400s (`from > to`, `to` without `from`), `categoryIds` (including `"none"`), `accountIds`, `q`, `type` (a credit-card debit and a bank debit in the same fixture end up in the same `despesas` set; an internal transfer appears under `todas` but never under receitas/despesas), `limit` cap at 100, `after` pagination visits every row exactly once across pages.
3. Breakdown: respects `q` + `type`, ignores `categoryIds`, excludes internal transfers, includes "Sem categoria" — and equals `aggregate()` over the same window.
4. Category write: unknown ids come back in `unknownIds` with a 200 (recoverable content), a valid write persists and the next list call resolves the row through the override (COALESCE chain).
5. Client: the view renders empty states ("Nenhuma transação encontrada com esses filtros"), the count matches `totalInWindow`, the modal shows the `occurredAt` time only when the São Paulo-local time is not midnight, and a save patches the row and refreshes `breakdown`/`totalInWindow` without resetting scroll.
6. Integration (`tests/web/integration/transactions.test.ts`): against `fixture-db` — paging with `after` visits every seeded row exactly once for every filter combination; a category write through `POST /api/transactions/category` persists and the next list call resolves the row through the override (COALESCE chain).
7. E2E (`e2e/transactions.spec.ts`): search narrows the rows; tipo and category filters narrow; clicking a breakdown category filters the list and clicking again clears it; "Mostrar mais" appends without duplicate rows; the detail modal edits a category and the change survives a page reload.

`npm run mutation` does not apply: this ticket touches `packages/storage` only, and Stryker's scope is `src/core` + `src/pluggy`.

## Validation

`npm run typecheck` → `npm run lint` → `npm run deps` → `npm test`, in that order, plus `npm run build:web` and `npm run e2e`. Manual: `browser_preview` against a real cache; live acceptance against the real cache recording totals and counts only.

## Acceptance Criteria

* The view reproduces the prototype's layout and interactions: search, tipo and category filters, clickable breakdown sidebar, "Mostrar mais" pagination — with real rows and real counts. No export button (ticket 07b).
* Every declared query parameter reaches the storage query or the handler pipeline; each is proven by a test that changes it and observes the result set.
* Pagination visits every row exactly once for any filter combination, including windows where rows share a local date — asserted in unit, integration (real temp-dir DB) and e2e (browser "Mostrar mais").
* Receitas/despesas mean what ADR-0003 says: an internal transfer is never either — it appears only under `todas`, with the "interna" tag.
* The search matches accents the way pt-BR is typed: `farmacia` finds `Farmácia`.
* Category correction persists through `CategoryWriter` and the corrected category resolves on the next read; unknown ids are readable content. The e2e spec proves the edit survives a page reload.
* The detail modal shows real fields (derivation source included) and offers the 22 top-level categories; the prototype's "nota" field is not present.
* The shared fetch hook and table exist and the overview uses them; no new dependency was added.
