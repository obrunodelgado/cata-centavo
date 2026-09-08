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
How a movement happened, as the bank reported it — PIX, Boleto, TED, Débito — plus **Cartão** for any movement on a credit account, **Saque** and **Estorno** when the row is recognised as one (the recognition outranks the wire's silence), and "—" when nothing is known. What the prototype's "Tipo" column shows; not to be confused with the receita/despesa filter.
_Avoid_: tipo, tipo de transação

**Nota**:
An optional free-text annotation the user writes on a transaction. User-authored, never derived; empty means no nota, and it changes no number in the system.
_Avoid_: comentário, observação, descrição (that is the bank-reported description)

**Documento do titular**:
The holder's own CPF or CNPJ, used to recognise an internal transfer when the counterparty is the holder themself.
_Avoid_: documento pessoal

**Saque**:
A despesa that is a cash withdrawal — dinheiro vivo. The wire reports no withdrawal marker: this bank files withdrawals under the same-person CASH leaf, inside the internal-transfer exclusion, and that leaf is where the saque is recognised — by derivation, with the user's correction winning in both directions. The recognition pulls the row out of the exclusion: it becomes a despesa and enters the totals. An unsplit saque has no category — in the totals it sits in "Sem categoria" until its alocações attribute it.
_Avoid_: tipo de transação saque, retirada

**Estorno**:
The return of saque money to the account — the bank reports it on the same CASH leaf as the saque, sign positive. Its own type, counted as an entrada (receita): the saque is the saída, the estorno is the entry that undoes it. Like the saque it carries no category of its own, and it never shrinks the saque's alocações — the compensation happens in the totals, not in the division.
_Avoid_: devolução, reversão; Pix devolvido (the internal transfer's own return, not an estorno)

**Alocação**:
A share of a saque that the user assigns to one category. A saque's alocações sum to at most the saque's value; whatever they do not cover is the sobra não alocada. In category totals a split saque contributes through its alocações, never through the row's own category.
_Avoid_: split, rateio; divisão (the divisão is the whole set of a saque's alocações, not one of them)

**Sobra não alocada**:
The part of a saque that no alocação covers — including the whole value of a saque not yet detailed. It has no category: in the totals it sits in "Sem categoria", with the sidebar note telling how much of that slice is saque money. Informational by design — it never blocks saving and is never an error. It is still money out — it counts in despesas.
_Avoid_: restante, resto, pendente
