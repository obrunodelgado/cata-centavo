/**
 * The text fold every free-text search column shares: NFD accent-strip,
 * uppercase, whitespace collapse. Not `normalizeDescription` — free text the
 * user writes (notes, queries) carries no acquirer prefixes or legal suffixes
 * to strip.
 */
export function normalizeFreeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toUpperCase()
    .replace(/\s+/gu, " ")
    .trim();
}
