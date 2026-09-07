# [WEB] CSV export for the transactions view

**Type:** Story
**Priority:** Medium
**Tracker:** none (local markdown)
**Size:** ~1 day
**Depends on:** ticket 07 (the transactions view and its handler)

## Goal

The "Exportar CSV" button on the Transações view, backed by a streamed export route that produces a file Brazilian Excel opens correctly.

## Context

Ticket 07 shipped the view without export. The decisions below were closed in the same grilling session that shaped ticket 07 and are recorded here so they do not have to be re-derived. The PRD lists export as v1 scope.

## Design

- `GET /api/transactions/export?from&to&q&type&categoryIds` — **honors the active filters** (WYSIWYG: the button sits beside the filters; exporting everything while the screen shows a subset is the surprise). The filename keeps the range: `fluxo-transacoes-<from>-<to>.csv`.
- Format: header `Data;Descrição;Categoria;Tipo;Status;Valor`; `;` separator; UTF-8 BOM; minimal RFC 4180 quoting (quote a field containing `;`, `"` or a newline; double the quotes — a description like `PIX; teste` must not break the columns); CRLF line endings; amounts as pt-BR decimal strings (`-1.234,56`) with an **ASCII hyphen-minus** — never the U+2212 display minus from `lib/money.ts`, and no `R$` prefix (a dedicated export formatter, not a reuse of the display one); dates as `dd/MM/yyyy` (pt-BR Excel recognizes them); `Tipo` is the forma de pagamento label (PIX/Boleto/Cartão/—) — the sign of `Valor` carries the direction; `Status` is Futuro/Pago; `Categoria` is the pt name, "Sem categoria" when null.
- One read of the full filtered window (the same pipeline the list handler uses), rows streamed — the handler writes incrementally; no unbounded in-memory string. Row order: `localDate DESC`, the same as the view.
- `Content-Type: text/csv; charset=utf-8`; `Content-Disposition: attachment; filename="fluxo-transacoes-<from>-<to>.csv"`.
- The view gains the "Exportar CSV" button; it does not exist until this ticket lands.

## Files to touch

- `apps/web/app/api/transactions/export/route.ts` + `apps/web/lib/handlers/` (new)
- `apps/web/lib/csv.ts` (new — quoting, BOM, CRLF, the row writer)
- `apps/web/lib/money.ts` (extended: the pt-BR decimal string for export, ASCII minus)
- `apps/web/components/views/transactions.tsx` — the export button
- `tests/web/csv.test.ts`, `tests/web/transactions-handler.test.ts` (export cases), `tests/web/integration/transactions.test.ts` (export streaming)
- `e2e/transactions.spec.ts` (download assertions)

## Test plan

1. Format: BOM present, `;` separator, CRLF, pt-BR amounts with ASCII minus, `dd/MM/yyyy` dates, quoting — a description containing `;`, `"` and a newline survives the round-trip.
2. Filters: the export respects `q`/`type`/`categoryIds` — each provably changes the file's row set.
3. Streaming: a large synthetic range produces a valid file with the handler yielding rows rather than building one string.
4. Integration (`tests/web/integration/`): against `fixture-db`, the export route streams the fixture window's rows with BOM + `;` and exactly the right count.
5. E2E: the download contains the BOM, `;` separators and exactly the fixture window's row count.
6. Manual: open the exported CSV in Numbers/Excel — column split on `;`, accents intact, amounts negative where the row is a debit.

## Acceptance Criteria

* The CSV opens correctly in Brazilian Excel (BOM, `;`, accents, pt-BR amounts) and is streamed, never built as one in-memory string.
* The export honors the view's active filters; the filename carries the range.
* The button exists on the Transações view and downloads the file.
