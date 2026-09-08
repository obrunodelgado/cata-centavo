import { transactionValueLabel, transactionValueTone } from "../../lib/labels.ts";
import { centsToSignedBRL } from "../../lib/money.ts";

/**
 * The design's value box (`split-summary`): what the movement did on the left,
 * the signed amount on the right — a receita in green, a despesa in the
 * foreground. Shared by the transactions view's modal and the overview's
 * read-only detail, so the two cannot drift apart again.
 */
export function ValueBox({
  amountCents,
  recognised,
}: {
  readonly amountCents: number;
  readonly recognised: "saque" | "estorno" | null;
}) {
  return (
    <div className="split-summary">
      <span className="lbl">{transactionValueLabel({ amountCents, recognised })}</span>
      <span className={`amt num ${transactionValueTone(amountCents)}`}>{centsToSignedBRL(amountCents)}</span>
    </div>
  );
}
