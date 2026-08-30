# RELATÓRIO FINAL — FASE 4

## PLANO DE SEGURANÇA (THREAT MODEL)

---

## 1. Objetivo

Produzir o Threat Model completo do módulo financeiro — cada risco listado no escopo mestre, mais os riscos específicos identificados na arquitetura já desenhada (Fases 1-3), com Risco/Impacto/Probabilidade/Mitigação/Teste para cada um. **Nenhuma alteração de código, banco ou config nesta fase.**

## 2. Diagnóstico Inicial

Base de análise: o esqueleto de webhook já implementado (`payment-webhook`, Fase infra) e o modelo de dados desenhado (Fases 2-3, com os adendos de recorrência via Asaas + desconto configurável pelo Admin).

## 3. Arquivos Auditados

`supabase/functions/payment-webhook/index.ts`, `supabase/migrations/20260828_add_payment_webhook_events.sql`, `supabase/migrations/20260720_fix_rls_recursion.sql` (padrão RLS existente), os relatórios das Fases 1-3 (incluindo adendos).

## 4. Arquivos Modificados

Nenhum — fase de análise pura.

## 5. Banco

```text
Schema alterado? NÃO
Migration criada? NÃO
Migration executada? NÃO
Dados alterados? NÃO
```

## 6. Threat Model Completo

### 6.1 — API Key vazada (Asaas `access_token` ou `PAYMENT_WEBHOOK_SECRET`)

| Campo | Conteúdo |
|---|---|
| **Risco** | Chave de API do Asaas (produção, prefixo `$aact_prod_...`) ou o `authToken`/secret do webhook exposto em código, log, git ou frontend |
| **Impacto** | 🔴 Crítico — com a `access_token` de produção vazada, um atacante cria/cancela/consulta cobranças e dados de clientes de qualquer aluno da escola; com o secret do webhook vazado, pode forjar eventos de pagamento confirmado |
| **Probabilidade** | Baixa, se o padrão já seguido no projeto for mantido (nenhuma chave em `VITE_*`, todas via `supabase secrets set`) — mas não-zero, é erro humano recorrente em qualquer equipe |
| **Mitigação** | (1) chave só em Edge Function secret/Vault, nunca em `src/`; (2) `.env` local sempre no `.gitignore` (já confirmado nesta sessão); (3) usar a chave de **sandbox** durante todo o desenvolvimento/QA, nunca produção fora do ambiente real; (4) considerar a restrição de IP autorizado do lado do Asaas (mencionada na doc oficial) quando a infraestrutura de produção tiver IP estável |
| **Teste** | `grep -rn "aact_prod\|aact_hmlg\|ASAAS_API_KEY\|access_token" src/ dist/` antes de cada deploy — mesmo hábito já usado nesta sessão pra VAPID/Service Role Key. Rodar como parte do QA de toda fase de implementação futura (Fase 14). |

### 6.2 — Webhook falso (alguém chama `payment-webhook` fingindo ser o Asaas)

| Campo | Conteúdo |
|---|---|
| **Risco** | Requisição POST pro endpoint público de webhook, forjada por terceiros, tentando inserir um evento de "pagamento confirmado" que nunca aconteceu de verdade |
| **Impacto** | 🔴 Crítico se não bloqueado — abriria caminho pra marcar mensalidade como paga sem pagamento real (calote com fraude ativa) |
| **Probabilidade** | Alta tentativa (o endpoint é necessariamente público, `verify_jwt=false`), mas mitigada com efetividade alta |
| **Mitigação** | Já implementado (fase de infra): comparação em tempo constante do header contra `PAYMENT_WEBHOOK_SECRET`; sem o token correto, retorna 401 **antes de gravar qualquer coisa** no banco |
| **Teste** | Já executado e confirmado nesta sessão: chamada sem token → 401; chamada com token errado → 401; nenhuma linha gravada em nenhum dos dois casos (validado por consulta direta ao banco). **Reforço pra Fase 8**: o processamento de negócio (marcar `financial_charges.status='PAID'`) só pode ler de `payment_webhook_events` (que só existe com token válido), nunca aceitar um "status de pagamento" vindo de outro caminho. |

### 6.3 — Webhook duplicado (Asaas reenvia o mesmo evento)

| Campo | Conteúdo |
|---|---|
| **Risco** | Modelo de entrega do Asaas é *at-least-once* (confirmado na Fase 3) — o mesmo evento pode chegar 2+ vezes |
| **Impacto** | 🟡 Médio se não idempotente — processar 2x poderia, por exemplo, disparar 2 notificações push de "pagamento confirmado" pra mesma cobrança |
| **Probabilidade** | Alta (é o comportamento normal e esperado do gateway, não uma falha) |
| **Mitigação** | Já implementado: `UNIQUE (gateway, gateway_event_id)` + `upsert(..., { ignoreDuplicates: true })` — a constraint do Postgres é **atômica**, protege mesmo sob concorrência (2 requisições simultâneas), não depende de lock de aplicação |
| **Teste** | Já executado e confirmado: mesmo `event_id` enviado 2x → 2ª chamada retorna `duplicate:true`, só 1 linha existe no banco (confirmado por `SELECT`). |

### 6.4 — Usuário altera `payment_id` / Frontend falsifica pagamento

| Campo | Conteúdo |
|---|---|
| **Risco** | Um responsável financeiro manipula uma requisição (via DevTools, app modificado etc.) tentando fazer o sistema acreditar que uma cobrança foi paga |
| **Impacto** | 🔴 Crítico se existisse um caminho de escrita — mensalidade marcada como paga sem pagamento real |
| **Probabilidade** | Média (é um vetor óbvio que qualquer usuário mal-intencionado tentaria) |
| **Mitigação** | **Regra de arquitetura, não de código específico**: nenhuma policy de `UPDATE`/`INSERT` em `financial_charges` é concedida pra role `family` (só `SELECT` — ver desenho RLS da Fase 2). O único caminho de escrita de status é: (a) o webhook autenticado (6.2), processado com `service_role` (bypassa RLS por design, mas só acessível via Edge Function, nunca do client), ou (b) uma ação explícita de admin, também via Edge Function com validação de role. **O frontend nunca tem, em nenhum caminho, uma chamada tipo `supabase.from('financial_charges').update({status:'PAID'})` direto do client.** |
| **Teste** | A executar na Fase 6 (RLS): logar como `family`, tentar `UPDATE financial_charges SET status='PAID' WHERE id=<própria cobrança>` diretamente via client Supabase → deve falhar por ausência de policy de `UPDATE` pra esse role. |

### 6.5 — Escola A acessa Escola B (cross-tenant)

| Campo | Conteúdo |
|---|---|
| **Risco** | Admin ou família de uma escola consulta/altera dado financeiro de outra escola |
| **Impacto** | 🔴 Crítico — vazamento de dado financeiro sensível entre clientes (escolas) do próprio Zela, quebra de confiança/LGPD |
| **Probabilidade** | Baixa, dado que o padrão `school_id = get_my_school_id()` já está validado em produção há dezenas de tabelas — mas é o risco #1 a testar em qualquer tabela nova |
| **Mitigação** | Já desenhado na Fase 2: toda tabela financeira (`financial_contracts`, `financial_charges`, `financial_billing_discounts`) segue exatamente esse padrão. `financial_charges.family_id`/`student_id` desnormalizados não escapam do filtro de `school_id`, que é a âncora de isolamento |
| **Teste** | A executar na Fase 6: criar contrato/cobrança na Escola A, logar como admin da Escola B, tentar `SELECT`/`UPDATE` por id direto → deve retornar vazio/negado. |

### 6.6 — Pagamento duplicado

| Campo | Conteúdo |
|---|---|
| **Risco** | (a) 2 cobranças criadas pro mesmo vencimento do mesmo contrato; (b) 2 requisições concorrentes de criação de cobrança avulsa geram 2 cobranças reais no Asaas pro mesmo evento |
| **Impacto** | 🟡 Médio-alto — cobrar a família 2x, ou criar confusão de "qual é a cobrança certa" |
| **Probabilidade** | Baixa por design, mas exige ordem de operação correta no código da Fase 7/8 |
| **Mitigação** | `UNIQUE (contract_id, due_date)` protege (a) atomicamente. Pra (b), a regra de implementação (a seguir na Fase 7) é: **sempre tentar reservar a linha em `financial_charges` no nosso banco PRIMEIRO** (com status inicial, sem `gateway_payment_id` ainda); só chamar a API do Asaas **depois** de confirmar que a reserva teve sucesso; se a reserva falhar por conflito de `UNIQUE`, abortar **sem nunca chamar o Asaas** — evita criar uma cobrança órfã do lado do gateway |
| **Teste** | A executar na Fase 16 (sandbox): disparar 2 requisições de criação de cobrança avulsa em paralelo pro mesmo contrato/vencimento → só 1 deve ter sucesso, a outra deve falhar de forma previsível sem ter chamado o Asaas. |

### 6.7 — Race condition

Coberta em conjunto com 6.3 e 6.6 — a defesa em ambos os casos é **constraint `UNIQUE` do Postgres**, não lock de aplicação nem verificação "check-then-act" no código (que sempre tem uma janela de corrida). Constraint de banco é atômica por definição — é a mitigação correta e já está no desenho desde a Fase 2.

### 6.8 — Replay attack

| Campo | Conteúdo |
|---|---|
| **Risco** | Uma chamada de webhook legítima antiga é capturada e reenviada mais tarde por um terceiro |
| **Impacto** | 🟢 Baixo — se for exatamente o mesmo evento (mesmo `gateway_event_id`), a idempotência (6.3) já neutraliza qualquer efeito duplicado |
| **Probabilidade** | Baixa (exige que o atacante já tenha capturado uma chamada legítima, cenário de rede comprometida) |
| **Mitigação** | Idempotência (6.3) já cobre o caso relevante. Reforço opcional (não crítico, registrado como melhoria futura): rejeitar eventos cujo timestamp declarado (`dateCreated`) seja mais antigo que uma janela razoável (ex.: 24h) — evita reprocessar um evento genuíno mas muito velho sendo reenviado fora de contexto. Não implementar agora — a autenticação por secret (6.2) já é a defesa primária contra forjamento, e o replay do evento genuíno não causa dano dado 6.3. |
| **Teste** | Coberto pelo mesmo teste de 6.3 (reenvio do mesmo evento não duplica). |

### 6.9 — SQL / RLS bypass

| Campo | Conteúdo |
|---|---|
| **Risco** | Uma Edge Function usando `SERVICE_ROLE_KEY` (que sempre ignora RLS, por design do Supabase) processa um dado sem revalidar o `school_id` correto, permitindo vazamento cross-tenant através de um bug de lógica, não de RLS em si |
| **Impacto** | 🔴 Crítico se acontecer — RLS não protege nada quando o caller já usa a chave que a ignora de propósito |
| **Probabilidade** | Baixa, seguindo o padrão já usado em todas as Edge Functions existentes (JWT do caller revalidado contra `users.school_id` antes de agir) |
| **Mitigação** | **Regra de implementação pra Fase 8**: ao processar um evento de `payment_webhook_events`, o `school_id` da cobrança afetada **nunca** vem do payload do webhook (o Asaas não manda isso e não deveria) — sempre é derivado via `JOIN`/lookup a partir do `gateway_payment_id` já existente em `financial_charges.gateway_payment_id`, que por sua vez já carrega o `school_id` correto gravado no momento da criação da cobrança. Nenhuma escrita financeira deve confiar em um identificador de escola vindo de fora do nosso próprio banco. |
| **Teste** | Revisão de código dedicada na Fase 8 (QA 2 / auditor independente) — checar literalmente se algum `school_id` usado numa escrita vem do `body`/payload em vez de um `SELECT` prévio. |

### 6.10 — Valor manipulado no client (risco adicional identificado, não estava na lista original)

| Campo | Conteúdo |
|---|---|
| **Risco** | Um admin (ou um client comprometido logado como admin) envia um `amount_cents` já calculado (com desconto) direto pro backend, em vez de o backend recalcular a partir de `financial_billing_discounts` |
| **Impacto** | 🟡 Médio — desconto indevido aplicado a um contrato, prejuízo financeiro pra escola |
| **Probabilidade** | Baixa (exige comprometimento de uma conta admin), mas fácil de mitigar por design |
| **Mitigação** | **Regra de implementação pra Fase 7**: a Edge Function de criação de contrato (`create-payment`/equivalente) sempre recalcula `amount_cents` no servidor a partir de `base_monthly_amount_cents` × `financial_billing_discounts` vigente — nunca aceita um `amount_cents` vindo direto do request. O client só manda `student_id`, `billing_cycle`, `base_monthly_amount_cents` (ou nem isso, se vier de um cadastro de plano padrão da escola). |
| **Teste** | A executar na Fase 7 — enviar um `amount_cents` manipulado no corpo da requisição e confirmar que o servidor ignora esse campo e recalcula por conta própria. |

### 6.11 — Disponibilidade do endpoint de webhook (DoS de baixo esforço)

| Campo | Conteúdo |
|---|---|
| **Risco** | O endpoint `payment-webhook` é público (`verify_jwt=false`) — qualquer um pode chamá-lo repetidamente, mesmo sem o token correto, consumindo recursos da Edge Function |
| **Impacto** | 🟢 Baixo — cada chamada sem token correto já retorna 401 rapidamente, sem tocar o banco; custo computacional mínimo por chamada |
| **Probabilidade** | Baixa a médio, mas o endpoint sempre vai estar exposto por natureza |
| **Mitigação** | Não crítico pra implementar agora — se necessário no futuro, reaproveitar `check_rate_limit()` (já existente no projeto) com uma chave fixa (ex.: `edge:payment-webhook:global`), aceitando que webhooks legítimos em rajada (ex.: muitos pagamentos confirmados de uma vez, tipo início de mês) não sejam bloqueados por um limite baixo demais — ajustar o número com folga generosa se/quando implementado |
| **Teste** | Não aplicável agora — registrado como melhoria de P2 pra Fase 8 ou além, não bloqueia o avanço das fases. |

## 7. Segurança (resumo)

Nenhum item 🔴 Crítico ficou sem mitigação já desenhada ou já implementada e testada. Os únicos itens sem mitigação de código ainda são os que dependem de fases futuras específicas (Fase 7 criação de contrato, Fase 8 processamento de webhook) — corretamente adiados, não é escopo desta fase de threat model.

## 8. Multi-Tenant

Risco 6.5 é o item central desta seção — coberto pelo padrão RLS já validado, com teste explícito planejado pra Fase 6.

## 9. Gateway

Nenhuma chamada real ao Asaas nesta fase.

## 10. Webhooks

Riscos 6.2, 6.3, 6.8 cobrem exaustivamente a superfície de ataque do webhook — todos com mitigação já implementada (6.2, 6.3) ou de baixo risco residual (6.8).

## 11. Recorrência

Nenhum risco novo específico de recorrência identificado além dos já cobertos (6.6, duplicidade de cobrança) — a recorrência em si é responsabilidade do Asaas (decisão da Fase 3), reduzindo a superfície de risco do nosso lado nesse ponto especificamente.

## 12. Build

Não aplicável — nenhum código escrito nesta fase.

## 13. Lint

Não aplicável — mesmo motivo.

## 14. Testes

| Teste | Resultado | Evidência |
|---|---|---|
| Webhook sem token → 401, nada gravado | PASS (já executado na fase de infra) | `curl` real + `SELECT` confirmando 0 linhas |
| Webhook com token errado → 401, nada gravado | PASS (já executado) | idem |
| Webhook com token certo, evento novo → 200, 1 linha gravada | PASS (já executado) | idem |
| Webhook com mesmo evento 2x → 2ª chamada `duplicate:true`, só 1 linha | PASS (já executado) | idem |
| RLS família não escreve em `financial_charges` | PENDENTE | Fase 6 — tabela ainda não existe |
| Cross-tenant escola A/B | PENDENTE | Fase 6 — tabela ainda não existe |
| Reserva-antes-de-chamar-gateway (6.6) | PENDENTE | Fase 7 — function ainda não existe |

## 15. QA Sênior

**QA 1 (implementador)**: os 4 riscos com mitigação já implementada (6.2, 6.3) foram os únicos que já tinham código pra testar nesta fase — os demais são recomendações de design pras fases de implementação (5, 7, 8), corretamente não antecipadas.

**QA 2 (auditor independente, assumindo erro)**: revisei se a lista de 10 riscos do escopo mestre foi 100% coberta — sim, todos os 10 itens da seção 4 do prompt mestre (API Key vazada, Webhook falso, Webhook duplicado, payment_id alterado, cross-school, pagamento duplicado, race condition, frontend falsifica pagamento, replay attack, SQL/RLS bypass) têm uma entrada correspondente acima (6.1 a 6.9, com 6.4 cobrindo tanto "altera payment_id" quanto "frontend falsifica pagamento" por serem a mesma classe de risco). Adicionei 2 riscos fora da lista original (6.10 valor manipulado, 6.11 DoS de baixo esforço) por serem específicos da arquitetura já desenhada — melhor documentar agora do que descobrir na Fase 7/8.

## 16. Problemas Encontrados

Nenhum problema novo — esta fase é de planejamento. O achado real (endpoint de webhook público por natureza, 6.11) já estava implícito no desenho da fase de infra, só formalizado aqui como risco documentado com mitigação adiada conscientemente.

## 17. Riscos Restantes

Ver seção 14 ("PENDENTE") — 3 testes de segurança só podem ser executados quando as respectivas tabelas/functions existirem (Fases 6 e 7). Nenhum risco crítico sem plano de mitigação.

## 18. Git

```text
Commit? NÃO
Push? NÃO
Deploy? NÃO
```

## 19. Regra de Parada

```text
ATIVADA? NÃO
```

Nenhuma das 15 condições de parada foi encontrada — esta fase não alterou nada, e todos os riscos identificados já têm mitigação desenhada (implementada e testada, ou planejada pra fase específica futura).

## 20. Próxima Fase

```text
PODE AVANÇAR? SIM
REQUER AUTORIZAÇÃO? SIM
```

Aguardando instrução explícita para iniciar a **FASE 5 — Migration do Modelo Financeiro** (criação real das tabelas `financial_contracts`, `financial_charges`, `financial_charge_events`, `financial_billing_discounts`, com os campos já revisados nos adendos das Fases 2/3 — só executada mediante sua aprovação explícita, conforme regra do escopo mestre).
