# Saques and estornos exit the internal-transfer exclusion through CASH-leaf recognition

Banks report a cash withdrawal without naming it. This one files it under the
same-person CASH leaf (`04010000`), which the internal-transfer exclusion (ADR-0003)
swallows — so real money leaving the holder counted in nothing. The recognition is
therefore derived from that leaf and the sign: negative is a **saque** (a despesa),
positive is an **estorno** (an entrada). The user's mark corrects the recognition in
both directions and outranks it; a stored denial keeps a row excluded.

This is the reverse of the extension ADR-0003 anticipated: instead of a manual override
pulling a row *into* an exclusion, the recognition pulls rows *out* of one. The rule
"internal transfers never count" is untouched — a recognised saque is not an internal
transfer, it is cash leaving the tracked universe, and the estorno is it coming back.

Consequences: the category derivation gains a gate below the explicit override — a
recognised row resolves to no category ("Sem categoria") until the user splits it into
alocações, which feed the category totals in its place. The estorno is counted as income
and never shrinks the saque's alocações; the compensation happens in the totals. The
savings rate sees both sides of a saque/estorno pair, which is honest about money that
left and returned.

The alternatives were rejected on cost: detecting by description repeats the fragility
ADR-0003 rejected for transfers (bank wording varies); a dedicated "Saques" category
amends the closed taxonomy for a state the user is trying to *leave*; a parallel
"Não alocado" pseudo-group special-cases the aggregate, the filter and the MCP boundary
where the existing `"none"` machinery already answers.
