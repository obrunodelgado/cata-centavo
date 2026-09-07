/**
 * pt-BR money formatting over integer cents. Every number a human reads in the
 * web app comes through this module — never through a JS `number` holding
 * reais. `chartNumber` is the single documented exception: cents → float at
 * the SVG geometry boundary, presentation-only, no arithmetic ever happens on
 * the float it returns.
 */

const MINUS = "−"; // U+2212, the prototype's minus sign

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `R$ 1.234,56` from integer cents. Zero renders, never blanks. */
export function centsToBRL(cents: number): string {
  if (cents < 0) {
    return MINUS + BRL.format(-cents / 100);
  }
  return BRL.format(cents / 100);
}

/** Signed variant: `+R$ 9.840,00` / `−R$ 7.214,35`. */
export function centsToSignedBRL(cents: number): string {
  if (cents < 0) {
    return MINUS + BRL.format(-cents / 100);
  }
  return "+" + BRL.format(cents / 100);
}

/** `26,7%` pt-BR, one decimal; `null` (no income, no baseline) renders as an em dash. */
export function percentBRL(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const rounded = value.toFixed(1).replace(".", ",");
  if (value < 0) {
    return MINUS + rounded.replace("-", "") + "%";
  }
  return rounded + "%";
}

const MIL_REAIS = 100_000_000; // cents
const MILHAR_REAIS = 100_000; // cents

const SHORT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Compact figure for hbar labels: `R$ 29,9 mil`, `R$ 4,8 mi`, full below R$ 1.000. */
export function centsToBRLShort(cents: number): string {
  if (cents >= MIL_REAIS) {
    return `R$ ${SHORT.format(cents / MIL_REAIS)} mi`;
  }
  if (cents >= MILHAR_REAIS) {
    return `R$ ${SHORT.format(cents / MILHAR_REAIS)} mil`;
  }
  return centsToBRL(cents);
}

/**
 * Cents → float, for chart geometry only (axis scales, point positions).
 * Documented as presentation-only: nothing may ever compute with the result.
 */
export function chartNumber(cents: number): number {
  return cents / 100;
}
