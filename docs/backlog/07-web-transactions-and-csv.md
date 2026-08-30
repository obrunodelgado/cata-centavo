# [WEB] Transactions view and CSV export

**Type:** Story
**Priority:** Medium
**Tracker:** none (local markdown)
**Size:** 2–3 days
**Depends on:** tickets 05–06 (shell, composition root, `/api/overview`)

## Goal

The Transações view: the prototype's searchable, filterable transaction list with the category-breakdown sidebar, row details with real category correction, and a working CSV export.

## Context

The backend already serves everything the view needs: paged reads with keyset pagination (`TransactionFilter.after = {localDate, id}`, hard cap), category derivation in SQL, and `CategoryWriter.setCategory` for corrections. Two gaps exist:

- **Search.** The prototype filters by free text client-side. The web must search server-side (pagination + client-side filtering would silently undercount), but the read path has no free-text parameter. This is the only change to `packages/` this ticket makes, and it is additive plumbing, not a feature: a `q` field on `TransactionFilter` matched against description and counterparty, case-insensitively, in the existing query builder — with the repo's standing rule applied: a test proving the parameter reaches the SQL.
- **CSV.** Nothing generates CSV today. The PRD lists export as v1 scope; Brazilian Excel expects `;` as separator and a UTF-8 BOM.

Category correction is real (the writer exists and Phase 3 acceptance covers it); the prototype's "nota" field on the detail modal has no storage and stays out of scope — the modal shows the real fields and the category editor only.

## Design

### Read-path plumbing (the only `packages/` change)

Add `q?: string` to `TransactionFilter` in `packages/core/src/contracts.ts` and to the storage query builder (`packages/storage/src/transactions.ts`): `LOWER(description) LIKE '%' || LOWER(:q) || '%'` (and counterparty when present), escaped for the SQL wildcards `%`/`_`. Default absent → no filter. Core's pure modules do not change; the MCP tools are unaffected (they simply never pass `q`).

### API routes

- `GET /api/transactions?from&to&categoryIds&accountIds&q&type&limit&after`
  - `from`/`to` inclusive `YYYY-MM-DD` (required); `categoryIds` top-level taxonomy ids; `accountIds`; `q` free text; `type ∈ {todas, receitas, despesas}` — the sign decision stays server-side (the client must never reason about the BANK/CREDIT inversion); `limit` ≤ 100 (default 50); `after` = the opaque keyset token from the previous page.
  - Response: `{ rows: [{ id, localDate, occurredAt, description, categoryId, categoryName, accountId, accountName, type, amountCents, status }], hasMore, nextAfter, totalInWindow, dataThrough, unavailable }`.
  - `totalInWindow` is computed by the same filter without the cursor — the prototype's "N transações" subtitle stays honest.
- `POST /api/transactions/category` — `{ ids: string[], categoryId }` → `CategoryWriter.setCategory`; response `{ updated, unknownIds }`. Unknown ids are readable content, not an error (recoverable-failure rule).
- `GET /api/transactions/export?from&to` — full-range CSV for the range: header `Data;Descrição;Categoria;Tipo;Status;Valor`, `;` separator, UTF-8 BOM, amounts as pt-BR decimal strings (`-1.234,56`), rows streamed (the handler writes incrementally; no unbounded in-memory string). Content-Type `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="fluxo-transacoes-2026-01-01-2026-08-30.csv"`.

### View components (`components/views/transactions.tsx`)

Port the prototype's layout: category breakdown sidebar (click to filter the list, click again to clear — the prototype's toggle semantics), search field, tipo segment, category select (the 22 top-level groups from `/api/categories`), the table, "Mostrar mais" (append the next page via `after`), "Exportar CSV" (downloads the export route). Detail modal: real fields (date, occurredAt when the bank sent a clock time, description, category with the derivation source shown when the row's category came from an override, account, type, amount) and the category `<select>`; saving calls the category route and re-renders the row.

Pagination keeps the prototype's feel: the first page is 50 rows, "Mostrar mais" appends up to 100 at a time, and the count reflects `totalInWindow` for the active filters.

## Files to touch

- `packages/core/src/contracts.ts` — `q` on `TransactionFilter`
- `packages/storage/src/transactions.ts` — `q` in the query builder (+ tests in `tests/storage/`)
- `apps/web/app/api/transactions/route.ts`, `…/transactions/export/route.ts`, `…/transactions/category/route.ts` + `apps/web/lib/handlers/`
- `apps/web/app/api/categories/route.ts` — the 22 top-level groups from the taxonomy (`core/taxonomy.ts`)
- `apps/web/components/views/transactions.tsx`, `components/ui/table.tsx` (shared row renderer if not already extracted in ticket 06)
- `apps/web/lib/csv.ts`, `apps/web/lib/money.ts` (extended: pt-BR decimal string for export)
- `tests/web/transactions.test.ts`, `tests/web/csv.test.ts`, `tests/web/transactions-handler.test.ts` (new)
- `tests/web/integration/transactions.test.ts` (new)
- `e2e/transactions.spec.ts` (new)

## Test plan

TDD, red before green. Table tests everywhere.

1. `q` reaches the query: a storage test with a synthetic store asserts rows are filtered by description and by counterparty, case-insensitively, and that `%`/`_` in the search text do not act as wildcards (escaped).
2. Handler: each query parameter provably changes the result set — `from`/`to` bounds, `categoryIds`, `accountIds`, `q`, `type` (a credit-card debit and a bank debit in the same fixture end up in the same `despesas` set), `limit` cap at 100, `after` pagination visits every row exactly once across pages.
3. Category write: unknown ids come back in `unknownIds` with a 200 (recoverable content), a valid write persists and the next list call resolves the row through the override (COALESCE chain).
4. CSV: BOM present, `;` separator, pt-BR amounts, streaming — a large synthetic range produces a valid file with bounded memory (assert the handler yields rows rather than building one string).
5. Client: the view renders empty states ("Nenhuma transação encontrada com esses filtros"), the count matches `totalInWindow`, and the network tab (manual) shows only `/api/*`.
6. Integration (`tests/web/integration/transactions.test.ts`): against `fixture-db` — paging with `after` visits every seeded row exactly once for every filter combination; a category write through `POST /api/transactions/category` persists and the next list call resolves the row through the override (COALESCE chain); the export route streams the fixture window's rows with BOM + `;`.
7. E2E (`e2e/transactions.spec.ts`): search narrows the rows; tipo and category filters narrow; clicking a breakdown category filters the list and clicking again clears it; "Mostrar mais" appends without duplicate rows; the detail modal edits a category and the change survives a page reload; the CSV download contains the BOM, `;` separators and exactly the fixture window's row count.

## Validation

`npm run typecheck` → `npm run lint` → `npm run deps` → `npm test`, in that order, plus `npm run build:web` and `npm run e2e`. Manual: open the exported CSV in Numbers/Excel — column split on `;`, accents intact, amounts negative where the row is a debit; live acceptance against the real cache recording totals and counts only.

## Acceptance Criteria

* The view reproduces the prototype's layout and interactions: search, tipo and category filters, clickable breakdown sidebar, "Mostrar mais" pagination, export button — with real rows and real counts.
* Every declared query parameter reaches the storage query; each is proven by a test that changes it and observes the result set.
* Pagination visits every row exactly once for any filter combination, including windows where rows share a local date — asserted in unit, integration (real temp-dir DB) and e2e (browser "Mostrar mais").
* Category correction persists through `CategoryWriter` and the corrected category resolves on the next read; unknown ids are readable content. The e2e spec proves the edit survives a page reload.
* The CSV opens correctly in Brazilian Excel (BOM, `;`, accents, pt-BR amounts) and is streamed, never built as one in-memory string.
* The detail modal shows real fields (derivation source included) and offers the 22 top-level categories; the prototype's "nota" field is not present.
