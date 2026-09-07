# Cata Centavo

The domain of a personal-finance dashboard that reads Brazilian Open Finance data through Pluggy: connections, accounts, transactions, and the derived truths — categories, internal transfers — that turn raw statements into understanding.

## Language

**Transferência interna**:
A transaction that moves money between accounts of the same holder — including between a checking account and the holder's own investments. Never counted in income, expense, category totals or the savings rate, and never a receita or a despesa: the transaction list shows it only under "todas", with the "interna" tag (ADR-0003).
_Avoid_: self-transfer (code name), transferência entre contas próprias

**Receita / Despesa**:
The direction of a movement — receita brings money in, despesa takes it out — decided server-side from the normalized sign of the amount, never by the client. An internal transfer is neither.
_Avoid_: tipo (the prototype overloads it — see Forma de pagamento), entrada/saída

**Transferência mesma titularidade**:
The Pluggy category (`04000000`) for transfers between accounts of the same holder; also its pt-BR label.
_Avoid_: Same person transfer (the taxonomy's English label)

**Contraparte**:
The other party of a transaction, direction-dependent: the receiver on an outbound transfer, the payer on an inbound one. Not to be confused with the wire's literal `receiver`, which is the user themself on inbound rows.
_Avoid_: receiver (literal wire field)

**Status da transação**:
Derived at read time, never stored: **Futuro** while the row's `localDate` is after today, **Pago** from that day on. "Pago" means the movement happened — a card purchase is Pago when purchased, even though settling the bill is a separate transaction (and an internal transfer, ADR-0003). An unpaid boleto never reaches the cache at all; future-dated rows are forecast instalments, not pending payments.
_Avoid_: Pendente (the prototype's status for unpaid boletos — the cache never holds one)

**Forma de pagamento**:
How a movement happened, as the bank reported it — PIX, Boleto, TED, Débito — plus **Cartão** for any movement on a credit account and "—" when nothing is known. What the prototype's "Tipo" column shows; not to be confused with the receita/despesa filter.
_Avoid_: tipo, tipo de transação

**Nota**:
An optional free-text annotation the user writes on a transaction. User-authored, never derived; empty means no nota, and it changes no number in the system.
_Avoid_: comentário, observação, descrição (that is the bank-reported description)

**Documento do titular**:
The holder's own CPF or CNPJ, used to recognise an internal transfer when the counterparty is the holder themself.
_Avoid_: documento pessoal
