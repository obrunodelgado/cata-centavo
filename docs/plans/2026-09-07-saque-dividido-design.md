# Saque dividido e a padronização das modais de detalhes

Date: 2026-09-07
Status: approved (grilling session, 4 rounds — every branch visited)
Prototype: `open-design/.od/projects/d5359238-…/fluxo-saque-dividido.html`
Glossary: `CONTEXT.md` — **Saque**, **Estorno**, **Alocação**, **Sobra não alocada**, **Forma de pagamento** (amended)
ADR: `docs/adr/0004-saques-exit-the-internal-transfer-exclusion.md`

## The problem

Cash withdrawals are invisible. The bank files them under the same-person CASH leaf
(`04010000`), which `isSelfTransfer` excludes — so 49 withdrawals (−R$ 33.560 in the
current cache) count in nothing, appear only under "todas" with the "interna" tag, and
cannot be attributed to what the cash was actually spent on. The prototype's answer: a
saque is detailable — the user splits it across categories, and the split feeds the
category totals.

The same prototype standardizes the two detail modals: one title, one value box, one
description field with a cascade rename, and the split editor where the category select
would be.

## Decisions (from the grilling session)

1. **Recognition is derived, not asserted.** Leaf `04010000` + sign decides: negative is
   a **saque**, positive is an **estorno**. The user's mark corrects it in both
   directions and outranks the derivation. No backfill: existing cache rows recognise on
   the next read.
2. **Recognition pulls the row out of the internal-transfer exclusion.** A recognised row
   is never a self-transfer (ADR-0003's anticipated manual override, in the inverse
   direction): it becomes a despesa (or an entrada, for the estorno) and enters every
   total. The estorno is counted as an entrada — the pair nets to zero in the savings
   rate, honestly.
3. **An unsplit saque has no category.** The recognition suppresses the whole category
   chain below an explicit override, so unsplit saque money and split leftovers sit in
   the existing "Sem categoria" slice — reusing the `none` machinery end to end (SQL
   filter, sidebar slice, MCP boundary) instead of inventing a category or a pseudo-group.
   The sidebar note says how much of that slice is saque money.
4. **Alocação** is a stored split: one row per (transaction, category) in `data.db`,
   positive integer cents, summing to at most the saque's value. Read time joins them
   onto the row like the note does — "derive, don't store" holds: nothing materializes
   into a category column.
5. **Editor rules.** Sum ≤ saque value (over blocks save, red hint); the sobra is
   informational and saves fine; minimum 1 cent per line; duplicate categories merge on
   save; empty draft + save = undo (the saque returns to "Sem categoria"); hard cap of
   20 lines; zero/empty lines are dropped silently.
6. **The estorno is an entrada** (receita) and is never splittable; it never shrinks the
   saque's alocações — the compensation happens in the totals, never in the division.
   Known limitation, recorded.
7. **The rename is a bulk write keyed by the wire.** Saving a description writes a
   per-row override in `data.db` for every cached row whose *wire* `description_norm`
   matches the edited row's — never written into the droppable cache, always keyed by the
   wire text so two families renamed to the same name never drag each other. Future rows
   keep the bank's wording (that is what "escrita em massa" bought).
8. **The Tipo column shows the recognition.** `Saque` and `Estorno` join PIX/Boleto/
   Cartão as values of the forma de pagamento display chain: recognition first, then the
   wire's report, then the Cartão fallback, then "—".
9. **The modals share one shell.** Title "Detalhes da Transação", sub
   `data · descrição · tipo · status`, the value box, the metadata block (Data/Conta/
   Tipo/Status) and the Nota stay in **both**; the saque variant swaps the category
   select for the split editor; the category select is visible only while no split is
   saved (it is the bucket the totals use until then).
10. **MCP payloads are untouched this round.** The period tools' numbers change through
    the shared `aggregate()` — deliberately, so the donut, the sidebar and the MCP can
    never disagree. Listing allocations over MCP is later work.

## The recognition rule

One function in `core/saque.ts`, mirrored by one SQL `CASE` in `storage/category-sql.ts`
(the same arrangement `BRANCHES` uses for the category chain — each side names the other
in a comment):

```
recognise(row, mark):
  mark = 'saque'   → 'saque'                      (the user's word outranks everything)
  mark = 'estorno' → 'estorno'
  mark = 'none'    → null                         (a stored denial — the derivation stays denied)
  leaf = 04010000 and amount < 0 → 'saque'
  leaf = 04010000 and amount > 0 → 'estorno'
  otherwise        → null
```

`isSelfTransfer` returns `false` before every other check when the recognition is
non-null: a recognised row is a despesa or an entrada, never an internal transfer.

The category resolution gains a gate between the override and the rest of the chain:
`override` wins; a recognised row resolves to `null` ("Sem categoria"); otherwise the
chain runs as before. The SQL shape:

```sql
COALESCE(c_override,
  CASE WHEN c_recognised IS NOT NULL THEN NULL
       ELSE COALESCE(c_counterparty, c_pluggy, c_snapshot, c_learned, c_mcc) END)
```

## Storage — `data.db` migration to v4

Three tables, all under `userdata`, never dropped:

```sql
CREATE TABLE saque_marks (
  transaction_id TEXT PRIMARY KEY,
  recognised TEXT NOT NULL CHECK (recognised IN ('saque', 'estorno', 'none')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE transaction_allocations (
  transaction_id TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (transaction_id, category)
);

CREATE TABLE description_overrides (
  transaction_id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  description_norm TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`transaction_allocations` is keyed `(transaction_id, category)` because duplicates merge
on save — one row per category, the sum carries the amount.

### The read

`DERIVED_COLUMNS` gains three correlated subqueries:

- `c_recognised` — the recognition CASE above (mark first, then leaf+sign).
- `c_description` — the row's `description_overrides.description`, if any; the displayed
  description is the override's, else the wire's.
- `c_allocations` — `json_group_array(json_object('category', …, 'amountCents', …))`
  over the row's allocations; `NULL` parses to `[]`.

`rowToDerived` maps them onto `DerivedTransaction`, which grows `recognised` and
`allocations` (and displays the overridden description). The search filter gains one
more `EXISTS`: the rename's `description_norm` matches the same escaped needle the wire
description does.

### The stores

All three follow the `transaction-notes.ts` shape — known-check first, trim, one
synchronous write, stale ids reported never written:

- **`SaqueMarkStore.set(transactionId, recognised)`** — validates the mark against the
  row's direction (`saque` needs a negative row, `estorno` a positive one; anything else
  is a `sign` problem), upserts, and returns the *effective* recognition recomputed from
  the stored row.
- **`TransactionSplitStore.set(transactionId, allocations)`** — merges duplicates by
  category, rejects a sum above the saque's value (`problem: "over"`) and rows that are
  not recognised saques (`not-saque`), replaces the stored split in one transaction; an
  empty array deletes every row (the undo).
- **`DescriptionOverrideStore.set(transactionId, description)`** — reads the row's wire
  `description_norm`, upserts the override for every cached row carrying it, returns the
  count for the toast. Empty after trim is a rejected write.

## The web API

- `POST /api/transactions/saque` — `{ transactionId, recognised }` → the fresh
  `TransactionRow` (the UI patches the row in place; the category may have been
  suppressed, the Tipo label changed).
- `POST /api/transactions/split` — `{ transactionId, allocations }`; the store's
  `problem` becomes a 400 with a readable message; a stale id is 200 + `known: false`.
  Returns the fresh `TransactionRow`.
- `POST /api/transactions/description` — `{ transactionId, description }` →
  `{ transactionId, updated }`. The UI patches every loaded row whose displayed
  description matched the old text and refetches the head for the sidebar.

`TransactionRow` gains `recognised` (`"saque" | "estorno" | null`) and `allocations`;
`TransactionsResponse` gains `unallocatedSaqueCents` — the saque money the sidebar's
note names.

## The UI

- One `Modal` shell; the body switches on `row.recognised`. Both variants: value box,
  metadata `dl`, description field with the rename note, Nota. The saque variant swaps
  the category select for the split editor; the common variant keeps the select and
  gains "Marcar como saque" (eligible: `amountCents < 0`, not recognised).
- The split editor: text inputs (`inputMode="decimal"`), pt-BR parsing — dots are
  thousands and stripped, the comma is the decimal separator, and the parse is string
  arithmetic over integer cents; no money ever passes through a float. Progress bar with
  `alocado X de Y`, the leftover in green, the overage in red disabling save. "Desfazer
  divisão" clears the draft; saving an empty draft is the undo. "Remover marcação" is
  disabled while a saved split exists (Q8a: nothing disappears silently).
- The list: `SAQUE`/`ESTORNO` chips (terracota for the saque), the split badge
  (`não detalhado` / `dividida · N` / `dividida parcialmente · N cat.`) and the
  allocation summary line on saque rows.
- The sidebar: the "Sem categoria" slice gains the saque note when
  `unallocatedSaqueCents > 0`.

## What deliberately did not change

- The MCP tool payloads (Q7) — the period totals move because `aggregate()` is shared.
- The bill derivation and the instalment machinery (card-only paths; saques are BANK).
- The internal-transfer rule itself (ADR-0003): the 41 genuine same-person PIX rows keep
  their exclusion; only the recognised cash movements leave it.
- The estorno: counted as an entrada, never splittable, and it never shrinks the saque's
  alocações — the compensation happens in the totals. Matching an estorno to its saque
  by ATM serial is recorded as future work, not built.
