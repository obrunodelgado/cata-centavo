import { BRANCHES, CASH_LEAF } from "@cata-centavo/core";

/**
 * The six branches as six columns, plus the durable leaf — and, riding along,
 * the user's note, the cash-movement recognition (ADR-0004), the saque's stored
 * alocações and the description rename (Q9). None of these are category
 * branches and none take part in the derivation; the columns are selected here
 * because every transaction read must carry them, and this is the one place `t`
 * is already in scope to correlate against.
 *
 * `c_leaf` is the finest category we still know for the row: what Pluggy sends
 * today, and what the snapshot remembers once it stops sending anything. It is
 * not a seventh branch — it is not rolled up and never competes for the derived
 * category. It exists because the self-transfer exclusion in `core/aggregate.ts`
 * distinguishes a credit card payment from an ordinary transfer, and only the
 * leaf carries that distinction. Reading `transactions.category_id` directly
 * there would let every card bill payment re-enter `spent` the day the plan
 * drops to free.
 *
 * `c_recognised` mirrors `core/saque.ts`'s `recogniseSaque` — mark first, then
 * the CASH leaf and the sign; the two encodings name each other. `c_allocations`
 * rides as JSON because a correlated subquery returns one row; the codec in
 * `transaction-row.ts` parses it.
 *
 * Resolution happens in `core/category-source.ts`, driven by the same array
 * that builds this — including the saque gate between the override and the
 * chain, which `DERIVED_CATEGORY` mirrors below.
 *
 * There is deliberately no `CREATE VIEW`. A view living in the droppable file
 * and referencing `userdata.` would couple `cache.db`'s schema to a schema name
 * that has to be attached already — including during the migration run at
 * startup, before any attach has happened.
 */
export const DERIVED_COLUMNS = `
  (SELECT o.category FROM userdata.category_overrides o
     WHERE o.transaction_id = t.id)                                AS c_override,
  (SELECT c.category FROM userdata.counterparty_categories c
     WHERE t.document IS NOT NULL AND c.document = t.document AND c.origin = 'manual')        AS c_counterparty,
  t.top_category_id                                                AS c_pluggy,
  (SELECT s.top_category_id FROM userdata.category_snapshot s
     WHERE s.transaction_id = t.id)                                AS c_snapshot,
  (SELECT c.category FROM userdata.counterparty_categories c
     WHERE t.document IS NOT NULL AND c.document = t.document AND c.origin = 'learned')       AS c_learned,
  (SELECT m.category FROM mcc_categories m WHERE m.mcc = t.mcc)    AS c_mcc,
  COALESCE(t.category_id, (SELECT s.category_id FROM userdata.category_snapshot s
     WHERE s.transaction_id = t.id))                               AS c_leaf,
  (SELECT n.note FROM userdata.transaction_notes n
     WHERE n.transaction_id = t.id)                                AS note,
  CASE
    WHEN (SELECT m.recognised FROM userdata.saque_marks m WHERE m.transaction_id = t.id) = 'saque'
      THEN 'saque'
    WHEN (SELECT m.recognised FROM userdata.saque_marks m WHERE m.transaction_id = t.id) = 'estorno'
      THEN 'estorno'
    WHEN (SELECT m.recognised FROM userdata.saque_marks m WHERE m.transaction_id = t.id) = 'none'
      THEN NULL
    WHEN t.category_id = '${CASH_LEAF}' AND t.amount_cents < 0 THEN 'saque'
    WHEN t.category_id = '${CASH_LEAF}' AND t.amount_cents > 0 THEN 'estorno'
    ELSE NULL
  END                                                              AS c_recognised,
  (SELECT json_group_array(json_object('categoryId', a.category, 'amountCents', a.amount_cents))
     FROM userdata.transaction_allocations a WHERE a.transaction_id = t.id)                    AS c_allocations,
  (SELECT d.description FROM userdata.description_overrides d
     WHERE d.transaction_id = t.id)                                AS c_description
`;

/**
 * The derivation, with the saque gate of ADR-0004 between the override and the
 * chain: an override categorises even a recognised saque; a recognised saque or
 * estorno resolves to no category; everything else walks the branches in
 * precedence order. `core/category-source.ts`'s `resolveCategory` is the other
 * half of this shape.
 */
export const DERIVED_CATEGORY = `COALESCE(
  c_override,
  CASE WHEN c_recognised IS NOT NULL THEN NULL
    ELSE COALESCE(${BRANCHES.filter((branch) => branch !== "override").map((branch) => `c_${branch}`).join(", ")})
  END)`;
