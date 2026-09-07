# Visão do Produto — Fluxo

> **Produto:** Fluxo — dashboard de finanças pessoais
> **Status:** documento vivo (v1)
> **Proposer:** Bruno Delgado
> **Última atualização:** 30/08

---

## 1. Resumo executivo

O **Fluxo** é um painel financeiro pessoal que transforma dados bancários espalhados
em clareza: em um só lugar, o usuário vê saldo, fluxo de caixa, gastos por categoria,
orçamentos, metas de economia e reserva de emergência — sem planilhas e sem abrir
cinco aplicativos de banco.

A aposta central: **dar a uma pessoa comum o controle financeiro que antes exigia
um contador**. Em vez de exibir números crus, o Fluxo organiza, explica e orienta —
elegante por dentro, útil por fora, e sempre a partir dos dados do próprio usuário.

---

## 2. Problema e propósito

### O problema
- O dinheiro de uma pessoa está fragmentado em **várias contas e cartões** (Nubank, Inter, outros).
- Aplicativos de banco mostram **o banco isolado**, não o quadro completo da vida financeira.
- Planilhas dão controle mas exigem disciplina e tempo que a maioria não tem.
- Sem visão agregada, é impossível responder rápido a perguntas simples:
  *"Quanto gastei com alimentação este mês?"*, *"Estou gastando mais do que ganho?"*,
  *"Consigo formar uma reserva de emergência?"*.

### O propósito
Devolver à pessoa a **percepção de para onde seu dinheiro vai** e a capacidade de
**decidir com intenção**, reduzindo a ansiedade financeira e transformando o controle
de contas em um hábito leve e recorrente.

---

## 3. Missão e visão

**Missão.** Organizar a vida financeira das pessoas em um só lugar, com clareza,
simplicidade e confiança.

**Visão de longo prazo.** Ser a **fonte de verdade** de saúde financeira pessoal:
o ponto de partida de qualquer decisão de dinheiro — do controle mensal ao
planejamento de investimentos —, conhecido por transformar dados em entendimento
e entendimento em ação.

---

## 4. Público-alvo e personas

**Segmento principal.** Pessoas assalariadas / autônomas de 25–45 anos, digitalmente
fluentes, que usam mais de uma conta ou cartão e querem mais controle mas não têm
tempo para planilhas.

**Personas de referência (v1):**

| Persona | Perfil | Objetivo principal | Frustração |
|---|---|---|---|
| **Marina** | CLT, 32, dois cartões + Nubank | Enxergar para onde vai o salário | Não sabe quanto sobra de fato |
| **Dudu** | Autônomo, 38, receitas irregulares | Estabilizar fluxo de caixa | Receitas instáveis, sem previsão |
| **Ana** | Freelancer, 27, em formação de reserva | Criar e acompanhar reserva de emergência | Nunca sobra dinheiro de forma visível |

---

## 5. Proposta de valor

- **Visão agregada:** saldo, receitas e despesas de todas as contas em um só painel.
- **Entendimento imediato:** categorização automática e insights que explicam o que mudou.
- **Orientação, não julgamento:** orçamentos, metas e reserva que ajudam a decidir, sem culpa.
- **Controle do usuário:** dados exportáveis (CSV), transparência e privacidade local-first.
- **Elegância técnica:** interface rápida, clara e agradável — confiança vem também do design.

---

## 6. Princípios de produto

1. **Clareza sobre complexidade.** Cada tela responde a uma pergunta; nada de ruído.
2. **Dados do usuário primeiro.** Local-first, exportável e sem vender dados a terceiros.
3. **Orientar, nunca julgar.** O produto apoia decisões; não expõe falhas.
4. **Consistência visual.** Um acento, hierarquia tipográfica, zero drama.
5. **Iteração contínua.** Pequenos lançamentos frequentes com feedback real.
6. **Acessibilidade desde o início.** Contraste, teclado e leitores de tela não são opcionais.

---

## 7. Objetivos do produto

### Curto prazo (v1 — agora)
- Conectar bancos e agregar transações com categorização automática.
- Entregar visão geral, transações, análises e orçamentos funcionais.
- Gerar insights e permitir exportação CSV.
- Estabelecer o padrão visual e de interação do sistema de design.

### Médio prazo (6–12 meses)
- Metas de economia e reserva de emergência com acompanhamento ativo.
- Gestão de cartões, faturas e planejamento de fluxo de caixa (previsão).
- Regras e categorização configuráveis pelo usuário.
- Painel de investimentos integrado à visão patrimonial.

### Longo prazo (12+ meses)
- Ajuda proativa: alertas, previsões e recomendações personalizadas.
- App para iOS e Android com sincronização segura.
- Posicionar-se como fonte de verdade de saúde financeira pessoal.
- Possibilidade de multi-usuário / família e oferta colaborativa.

---

## 8. Objetivos mensuráveis (exemplos de OKR)

**Objetivo trimestral de referência — "Controle que vira hábito":**

- **Key Result 1:** ≥ 60% dos usuários ativos retornam ao painel na 2ª semana.
- **Key Result 2:** ≥ 70% das transações importadas são categorizadas automaticamente com acerto.
- **Key Result 3:** ≥ 40% dos usuários configuram ao menos um orçamento ou meta.
- **Key Result 4:** tempo médio para responder "quanto gastei em X este mês" < 30s.

**Métrica norte (north star):** número de decisões financeiras informadas por semana
(proxy: usuários ativos que consultam insights + registram/alcançam uma meta).

---

## 9. Escopo e não-escopo

**Dentro (v1):** agregação de contas, categorização, visão geral, transações, análises,
orçamentos, insights, exportação CSV, gestão de cartões.

**Fora (agora):** pagamentos e transferências (o Fluxo observa e orienta, não move dinheiro),
cartão próprio, crédito em parcelas complexo, contabilidade para empresas (PF primeiro),
inteligência preditiva avançada (fase futura).

---

## 10. Pilares de experiência

1. **Visão geral** — o "semáforo" da saúde financeira no primeiro olhar.
2. **Fluxo de caixa** — entender entradas e saídas, não só o saldo.
3. **Orçamentos e metas** — converter percepção em intenção.
4. **Insights** — a camada que explica, conecta e sugere próximo passo.
5. **Bancos e cartões** — integração confiável e transparente.

---

## 11. Riscos e premissas

| Risco | Premissa / mitigação |
|---|---|
| Integração bancária depende de APIs (Open Banking / web scraping) | Começar com Nubank + Inter; abstrair provedores |
| Confiança do usuário com dados financeiros | Local-first, transparência, exportação, sem venda de dados |
| Categorização imprecisa frustra | Feedback de correção fácil; aprendizado incremental |
| Escopo amplo dispersa o foco | Roadmap em fases; métrica norte guia prioridade |

---

## 12. Diferenciação

- **Um painel, todas as contas** (bancos, cartões) com **visual agregado**.
- **Ênfase em orientação** (insights, metas, reserva) e não apenas em leitura de dados.
- **Design disciplinado** que torna o controle financeiro agradável e confiável.
- **Local-first** como diferencial de privacidade em um mercado cloud-first.

---

## 13. O que o sucesso parece em 3 anos

Uma pessoa abre o Fluxo **antes** de decidir qualquer gasto relevante, confia nele
como sua fonte de verdade financeira e o usa para atingir reserva, metas e
estabilidade de caixa. O produto é referência de clareza em finanças pessoais —
com reputação de quem **nunca monetiza os dados do usuário**.

---

## 14. Revisão

Este documento é vivo: deve ser revisado a cada grande marco de produto ou quando
houver mudança de direção estratégica. Decisões de escopo e roadmap sempre
rastreadas de volta à visão e à métrica norte.
