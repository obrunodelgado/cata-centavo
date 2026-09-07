/**
 * The project's closed category list: Pluggy's 22 top-level categories, taken
 * verbatim from `GET /categories` (ADR §12.4 step 2 — copy a taxonomy already
 * validated in production rather than invent one), plus a small local block.
 * Every child category rolls up to its top-level ancestor; the full tree and
 * that roll-up live in `taxonomy-tree.ts`.
 *
 * **The 00-prefix ids are ours, not Pluggy's.** Pluggy's sequence starts at
 * `01`, so their next real top-level category would plausibly claim
 * `22000000` — a local id there would one day collide with it. Nothing derives
 * a 00-prefix category: no Pluggy transaction carries the id and the MCC table
 * is derived from data, so a row reaches one only through a user override
 * (ADR §12.4's amendment of 2026-09-07).
 *
 * A `const` object plus a derived union, not an `enum` (ADR §13): `enum` is not
 * erasable syntax, and a string `enum` is nominal, so a category arriving as
 * JSON could not be assigned without a cast — exactly where validation belongs.
 *
 * **Pluggy's id is the value, not the key.** Two reasons. Named keys make the
 * MCC table in `mcc.ts` readable and typo-proof at compile time. And `"10000000"`
 * is a canonical array index as a JavaScript property name, so as a key it would
 * enumerate *before* `"01000000"` in every `Object.keys`; as a value the
 * declaration order survives.
 *
 * **The ids are not uniform width.** All 25 top-level ids are 8 digits, but the
 * taxonomy underneath them is not: Insurance's four children use 9, starting at
 * `"200100000"` (Life insurance). Anything deriving a parent by slicing an id at
 * a fixed offset works on 126 of the 130 Pluggy entries and breaks on those four.
 */
export const CATEGORIES = {
  income:             { id: "01000000", en: "Income", pt: "Renda" },
  loansAndFinancing:  { id: "02000000", en: "Loans and financing", pt: "Empréstimos e financiamento" },
  investments:        { id: "03000000", en: "Investments", pt: "Investimentos" },
  samePersonTransfer: { id: "04000000", en: "Same person transfer", pt: "Transferência mesma titularidade" },
  transfers:          { id: "05000000", en: "Transfers", pt: "Transferências" },
  legalObligations:   { id: "06000000", en: "Legal obligations", pt: "Obrigações legais" },
  services:           { id: "07000000", en: "Services", pt: "Serviços" },
  shopping:           { id: "08000000", en: "Shopping", pt: "Compras" },
  digitalServices:    { id: "09000000", en: "Digital services", pt: "Serviços digitais" },
  groceries:          { id: "10000000", en: "Groceries", pt: "Supermercado" },
  foodAndDrinks:      { id: "11000000", en: "Food and drinks", pt: "Alimentos e bebidas" },
  travel:             { id: "12000000", en: "Travel", pt: "Viagens" },
  donations:          { id: "13000000", en: "Donations", pt: "Doações" },
  gambling:           { id: "14000000", en: "Gambling", pt: "Apostas" },
  taxes:              { id: "15000000", en: "Taxes", pt: "Impostos" },
  bankFees:           { id: "16000000", en: "Bank fees", pt: "Taxas bancárias" },
  housing:            { id: "17000000", en: "Housing", pt: "Moradia" },
  healthcare:         { id: "18000000", en: "Healthcare", pt: "Saúde" },
  transportation:     { id: "19000000", en: "Transportation", pt: "Transporte" },
  insurance:          { id: "20000000", en: "Insurance", pt: "Seguros" },
  leisure:            { id: "21000000", en: "Leisure", pt: "Lazer" },
  pet:                { id: "00000000", en: "Pet", pt: "Pet" },
  restaurants:        { id: "00000001", en: "Restaurants", pt: "Restaurantes" },
  study:              { id: "00000002", en: "Study", pt: "Estudo" },
  other:              { id: "99999999", en: "Other", pt: "Outros" },
} as const;

/** One category: its id plus its two labels. The user reads Portuguese. */
export type Category = (typeof CATEGORIES)[keyof typeof CATEGORIES];

/** The closed list as a type. Free-form category strings are rejected (ADR §12.4). */
export type CategoryId = Category["id"];

const BY_ID: ReadonlyMap<string, Category> = new Map(
  Object.values(CATEGORIES).map((category) => [category.id, category]),
);

/** Every valid category id, in declaration order — Pluggy's, with Pet before the escape hatch. */
export const CATEGORY_IDS: readonly CategoryId[] = Object.values(CATEGORIES).map((category) => category.id);

/**
 * The guard a tool boundary validates with. An agent that invents
 * `alimentacao` and `alimentação` in one database breaks every aggregate.
 */
export function isCategoryId(value: string): value is CategoryId {
  return BY_ID.has(value);
}

/**
 * What a read tool's `categories` filter accepts: one of the 22, or `"none"`
 * for the rows the derivation could not categorize.
 *
 * `"none"` exists because after the enrichment stops, "show me what has no
 * category so I can fix it" is the workflow, and the aggregate's null group
 * samples ten ids rather than listing them (design D6).
 */
export function isCategoryFilterValue(value: string): value is CategoryId | "none" {
  return value === "none" || isCategoryId(value);
}

/** The category behind an id, or `undefined` when the id is not one of ours. */
export function categoryById(id: string): Category | undefined {
  return BY_ID.get(id);
}
