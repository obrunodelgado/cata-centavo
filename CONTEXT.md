# Cata Centavo

The domain of a personal-finance dashboard that reads Brazilian Open Finance data through Pluggy: connections, accounts, transactions, and the derived truths — categories, internal transfers — that turn raw statements into understanding.

## Language

**Transferência interna**:
A transaction that moves money between accounts of the same holder — including between a checking account and the holder's own investments. Never counted in income, expense, category totals or the savings rate (ADR-0003).
_Avoid_: self-transfer (code name), transferência entre contas próprias

**Transferência mesma titularidade**:
The Pluggy category (`04000000`) for transfers between accounts of the same holder; also its pt-BR label.
_Avoid_: Same person transfer (the taxonomy's English label)

**Contraparte**:
The other party of a transaction, direction-dependent: the receiver on an outbound transfer, the payer on an inbound one. Not to be confused with the wire's literal `receiver`, which is the user themself on inbound rows.
_Avoid_: receiver (literal wire field)

**Documento do titular**:
The holder's own CPF or CNPJ, used to recognise an internal transfer when the counterparty is the holder themself.
_Avoid_: documento pessoal
