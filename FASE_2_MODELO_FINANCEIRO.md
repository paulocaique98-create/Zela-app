# RELATÓRIO FINAL — FASE 2

## DECISÃO DO MODELO FINANCEIRO

---

## 1. Objetivo

Definir o modelo de dados completo (tabelas, relações, índices, RLS, estratégia de recorrência) que conecta `Escola → Aluno → Responsável Financeiro → Contrato Financeiro → Plano/Mensalidade → Recorrência → Cobranças → Pagamentos`, sem criar ou executar nenhuma migration.

## 2. Diagnóstico Inicial

Herdado da Fase 1: **nenhuma estrutura financeira existe hoje.** O único ponto reaproveitável é `student_guardians.is_financial boolean`, que já identifica o responsável financeiro coletado na matrícula. Tudo o resto (contrato, valor, recorrência, cobrança) precisa ser desenhado do zero, seguindo o padrão RLS/multi-tenant já validado em produção (`school_id = get_my_school_id()`).

## 3. Diagrama (visão geral)

```
schools
   │ 1
   │
   │ N
financial_contracts ──────────────┐
   │ N            │ N              │
   │               │                │ (financial_guardian_id)
   │ 1             │ 1               │
students      recurrence_model:      users (role=family,
               'fixed_day' | 'interval'   is_financial=true)
   │
   │ 1
   │ N
financial_charges ──────── financial_charge_events
   │                              │
   │ (gateway_payment_id)         │ (webhook_event_id, opcional)
   │                              │
   ▼                              ▼
  [Asaas — Fase 7]      payment_webhook_events (já existe, Fase "infra")
```

## 4. Tabelas Propostas (design — nenhuma criada ainda)

### 4.1 `financial_contracts` — o "contrato financeiro" por aluno

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `school_id` | uuid NOT NULL | isolamento multi-tenant |
| `student_id` | uuid NOT NULL | FK `students(id)` |
| `financial_guardian_id` | uuid NOT NULL | FK `users(id)` — quem paga. Preenchido a partir de `student_guardians.is_financial=true` no momento da criação, mas guardado explícito aqui (não como lookup toda vez) |
| `amount_cents` | integer NOT NULL | valor da mensalidade em **centavos** — nunca `numeric`/`float` pra dinheiro, evita erro de arredondamento |
| `recurrence_model` | text NOT NULL | `'fixed_day'` (Modelo A) ou `'interval'` (Modelo B) — nunca ambíguo |
| `billing_day` | integer | só preenchido se `recurrence_model='fixed_day'` (1-31) |
| `billing_interval_days` | integer | só preenchido se `recurrence_model='interval'` |
| `first_due_date` | date NOT NULL | primeiro vencimento |
| `status` | text NOT NULL DEFAULT `'active'` | `'active'` \| `'paused'` \| `'cancelled'` |
| `gateway_customer_id` | text | id do "customer" no gateway (Fase 7) |
| `created_by` | uuid | FK `users(id)` |
| `created_at`, `updated_at` | timestamptz | |

**Constraint de não-ambiguidade** (seção 5 do escopo):
```sql
CHECK (
  (recurrence_model = 'fixed_day' AND billing_day IS NOT NULL AND billing_interval_days IS NULL)
  OR
  (recurrence_model = 'interval' AND billing_interval_days IS NOT NULL AND billing_day IS NULL)
)
```

### 4.2 `financial_charges` — cada cobrança individual (fusão de "cobrança" + "pagamento", já que uma cobrança PIX/boleto É o registro rastreado)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | = `payment_id` da seção 17 do escopo |
| `school_id` | uuid NOT NULL | |
| `contract_id` | uuid NOT NULL | FK `financial_contracts(id)` |
| `student_id` | uuid NOT NULL | desnormalizado de propósito — rastreabilidade histórica não deve depender do contrato atual |
| `family_id` | uuid NOT NULL | responsável financeiro **no momento da cobrança** — idem, se o responsável mudar depois, cobranças antigas não "trocam de dono" silenciosamente |
| `due_date` | date NOT NULL | |
| `available_from` | date NOT NULL | = `due_date - PAYMENT_AVAILABILITY_DAYS`, calculado na criação |
| `amount_cents` | integer NOT NULL | |
| `status` | text NOT NULL DEFAULT `'PENDING'` | `PENDING` \| `AWAITING_PAYMENT` \| `PAID` \| `OVERDUE` \| `CANCELLED` \| `REFUNDED` \| `FAILED` (nomes normalizados da seção 16 — mapeamento pro vocabulário real do Asaas fica numa camada de tradução na Fase 7, nunca strings soltas do gateway espalhadas pelo código) |
| `gateway` | text | ex.: `'asaas'` — nulo até ser criada no gateway |
| `gateway_payment_id` | text | id da cobrança no gateway |
| `payment_method` | text | `'pix'` \| `'boleto'` \| `'credit_card'` \| `'link'` \| NULL |
| `pix_qr_code`, `pix_copy_paste` | text | só o que o gateway realmente retornar — nunca inventado |
| `boleto_url`, `boleto_barcode` | text | idem |
| `payment_link` | text | idem |
| `paid_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

**Constraints anti-duplicidade** (seção 15):
```sql
UNIQUE (contract_id, due_date)                                    -- nunca 2 cobranças pro mesmo vencimento do mesmo contrato
UNIQUE (gateway, gateway_payment_id) WHERE gateway_payment_id IS NOT NULL  -- nunca 2 linhas pro mesmo pagamento no gateway
```

### 4.3 `financial_charge_events` — trilha de auditoria da cobrança

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `charge_id` | uuid NOT NULL | FK `financial_charges(id)` |
| `event_type` | text NOT NULL | `'created'`, `'pix_generated'`, `'webhook_received'`, `'payment_confirmed'`, `'overdue'`, `'cancelled'` etc. |
| `source` | text | `'system'` \| `'webhook'` \| `'admin_manual'` |
| `webhook_event_id` | uuid | FK `payment_webhook_events(id)`, nullable — linka de volta ao evento cru já capturado na infra da fase anterior |
| `metadata` | jsonb | **nunca** dado de cartão, token ou segredo — só contexto de negócio (ex.: `{"previous_status":"PENDING","new_status":"PAID"}`) |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Materializa exatamente o fluxo pedido na seção 17: `COBRANÇA CRIADA → PIX GERADO → WEBHOOK RECEBIDO → PAGAMENTO CONFIRMADO`, um evento por linha, imutável (nunca UPDATE/DELETE nesta tabela — só INSERT).

### 4.4 Reaproveitamento de `payment_webhook_events` (já existe, criada na fase de infra)

Fica como a fonte crua/idempotente de tudo que chega do gateway. `financial_charge_events.webhook_event_id` conecta o evento de negócio ("pagamento confirmado dessa cobrança") de volta ao evento bruto que o originou — dá pra auditar/reprocessar sem perder o payload original.

## 5. Relações

```
schools            (1) ── (N) financial_contracts
students           (1) ── (N) financial_contracts   [histórico — só 1 'active' por vez é regra de negócio, não constraint de banco]
users (financeiro)  (1) ── (N) financial_contracts
financial_contracts (1) ── (N) financial_charges
financial_charges   (1) ── (N) financial_charge_events
payment_webhook_events (1) ── (0..N) financial_charge_events   [via webhook_event_id, opcional]
```

## 6. Índices Propostos

```sql
-- financial_contracts
CREATE INDEX idx_financial_contracts_school ON financial_contracts(school_id);
CREATE INDEX idx_financial_contracts_student ON financial_contracts(student_id);
CREATE INDEX idx_financial_contracts_guardian ON financial_contracts(financial_guardian_id);
CREATE INDEX idx_financial_contracts_active ON financial_contracts(school_id) WHERE status = 'active';  -- parcial, acelera o job de recorrência

-- financial_charges
CREATE INDEX idx_financial_charges_school ON financial_charges(school_id);
CREATE INDEX idx_financial_charges_contract ON financial_charges(contract_id);
CREATE INDEX idx_financial_charges_family ON financial_charges(family_id);
CREATE INDEX idx_financial_charges_due_date ON financial_charges(due_date);
CREATE INDEX idx_financial_charges_status ON financial_charges(status);
CREATE INDEX idx_financial_charges_pending_availability ON financial_charges(available_from) WHERE status = 'PENDING';  -- acelera "liberar cobrança que entrou na janela"

-- financial_charge_events
CREATE INDEX idx_financial_charge_events_charge ON financial_charge_events(charge_id, created_at DESC);
```

Com a projeção de carga da Fase 15 (70 alunos × 12 meses = 840 cobranças/ano por escola), esses índices são mais que suficientes — nenhuma tabela financeira passa de alguns milhares de linhas mesmo com múltiplas escolas por vários anos.

## 7. RLS (desenho — nenhuma policy criada ainda)

Seguindo exatamente o padrão já validado em produção (`school_id = get_my_school_id()` + `get_my_role()`):

```sql
-- financial_contracts
-- Admin: CRUD completo da própria escola
USING (school_id = get_my_school_id() AND get_my_role() = 'admin')

-- Família: só leitura do PRÓPRIO contrato (não da escola toda)
USING (get_my_role() = 'family' AND financial_guardian_id = auth.uid())

-- financial_charges
-- Admin: CRUD completo da própria escola
USING (school_id = get_my_school_id() AND get_my_role() = 'admin')

-- Família: só leitura das PRÓPRIAS cobranças
USING (get_my_role() = 'family' AND family_id = auth.uid())

-- financial_charge_events e payment_webhook_events
-- Só developer lê (dado técnico de auditoria) — mesmo padrão já usado em client_error_logs
USING (get_my_role() = 'developer')
```

**Testes obrigatórios de isolamento (a executar na Fase 6, não agora):**
1. Escola A tenta ler `financial_charges` de aluno da Escola B → deve retornar vazio (não erro — RLS filtra silenciosamente, é o comportamento padrão do Postgres/Supabase).
2. Família A tenta ler `financial_charges.family_id` = Família B → vazio.
3. Admin da Escola A tenta ler contrato de aluno da Escola B → vazio.

## 8. Gateway

Não avaliado nesta fase — é escopo da Fase 3. As colunas `gateway`, `gateway_customer_id`, `gateway_payment_id` são deliberadamente genéricas (texto livre pro nome do gateway) pra não prender o modelo de dados a um fornecedor específico antes da decisão formal da Fase 3.

## 9. Webhooks

Nenhuma mudança na infraestrutura de webhook desta fase — `payment_webhook_events` (já criada) permanece como está; `financial_charge_events.webhook_event_id` é o único ponto novo de conexão, e é opcional/nullable (eventos criados pelo sistema, tipo `'created'`, não têm webhook nenhum por trás).

## 10. Recorrência

**Estratégia decidida — dois modelos explícitos, nunca ambíguos** (seção 5):

- **Modelo A (`fixed_day`)**: próxima cobrança = mesmo dia do mês seguinte (`billing_day`). Tratamento de borda: se o mês não tem esse dia (ex.: dia 31 em fevereiro), cai no **último dia do mês** — regra a confirmar/documentar explicitamente no código da Fase 9, nunca deixar implícito.
- **Modelo B (`interval`)**: próxima cobrança = última `due_date` existente + `billing_interval_days`.

**Gatilho de geração** (Fase 9, não implementado agora): job diário via `pg_cron` (mecanismo já existente, reaproveitado da fase de infra) que, para cada `financial_contracts` com `status='active'`, verifica se já existe uma `financial_charges` para o próximo vencimento calculado; se não existir E a data calculada estiver dentro da janela (`hoje >= due_date - PAYMENT_AVAILABILITY_DAYS`), cria a cobrança. A constraint `UNIQUE (contract_id, due_date)` é a última linha de defesa contra duplicidade mesmo se o job rodar 2x por engano.

**`PAYMENT_AVAILABILITY_DAYS`**: proposta é uma constante única de sistema (não por escola, por simplicidade inicial), documentada em UM lugar só (a function de geração da Fase 9) — não espalhada. Se no futuro precisar variar por escola, vira uma coluna nova em `schools` ou em `financial_contracts`; decisão adiada até haver necessidade real.

## 11. PIX Copia e Cola

Campo `financial_charges.pix_copy_paste` reservado no modelo — obrigatório conforme seção 7.2 do escopo. Nenhuma geração real ainda (Fase 7).

---

## ADENDO — Decisões pós-relatório (após Fase 3, antes da Fase 4)

Revisão do modelo à luz de 3 decisões tomadas depois deste relatório original: **(a)** recorrência via `Asaas /v3/subscriptions` (não motor próprio), **(b)** calendário do ano inteiro visível no portal da família como **previsão calculada**, não como linhas reais de cobrança, **(c)** desconto de plano anual/semestral **configurável pelo Admin** (não hardcoded, não decidido pelo Asaas).

### A.1 — `financial_contracts` revisado

O campo `recurrence_model` (`fixed_day`/`interval`) e os campos `billing_day`/`billing_interval_days` do desenho original **ficam superados** — a geração de cada cobrança passa a ser responsabilidade do Asaas (`/v3/subscriptions`), não de um job `pg_cron` nosso. Novo desenho:

| Coluna | Tipo | Notas |
|---|---|---|
| `billing_cycle` | text NOT NULL | vocabulário do próprio Asaas: `MONTHLY`\|`QUARTERLY`\|`SEMIANNUALLY`\|`YEARLY` (subconjunto relevante pro Zela dos 7 valores que o Asaas aceita) |
| `base_monthly_amount_cents` | integer NOT NULL | valor "cheio" da mensalidade, sem desconto — usado como referência de exibição ("de R$ X por R$ Y") e como base de cálculo |
| `discount_percent_applied` | numeric(5,2) NOT NULL DEFAULT 0 | **snapshot** do desconto vigente no momento em que o contrato foi criado — nunca recalculado retroativamente se o admin mudar a config depois (ver A.2); protege o histórico financeiro |
| `amount_cents` | integer NOT NULL | valor efetivo cobrado por ciclo, já com desconto aplicado — é o valor que vai literalmente no campo `value` da subscription do Asaas |
| `gateway_subscription_id` | text | id da subscription no Asaas (`sub_XXXXXXXXXXXX`) — novo campo, não existia no desenho original |

Removido do desenho original: `recurrence_model`, `billing_day`, `billing_interval_days` (motor próprio, superado pela decisão de usar Asaas).

### A.2 — Nova tabela: `financial_billing_discounts` (config do Admin)

Resolve a exigência de que o desconto anual/semestral seja **gerado pelo portal do Admin**, não fixo no código:

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `school_id` | uuid NOT NULL | isolamento multi-tenant, mesmo padrão de sempre |
| `billing_cycle` | text NOT NULL | `MONTHLY`\|`QUARTERLY`\|`SEMIANNUALLY`\|`YEARLY` |
| `discount_percent` | numeric(5,2) NOT NULL DEFAULT 0 | `CHECK (discount_percent >= 0 AND discount_percent < 100)` |
| `updated_by` | uuid | FK `users(id)` |
| `updated_at` | timestamptz | |

`UNIQUE (school_id, billing_cycle)` — 1 configuração de desconto por ciclo por escola. Editável na Fase 12 (Admin Financeiro): uma tela simples com os 4 ciclos e um campo de % por linha. Quando um contrato novo é criado, o backend lê essa tabela **no momento da criação** e grava o resultado em `financial_contracts.discount_percent_applied`/`amount_cents` — mudar a config depois não altera contratos já existentes, só os próximos.

RLS: mesmo padrão — `FOR ALL USING (school_id = get_my_school_id() AND get_my_role() = 'admin')`; família não precisa acessar essa tabela diretamente (só vê o resultado já aplicado no seu próprio contrato).

### A.3 — Calendário do ano inteiro: **projeção calculada, não tabela nova**

Resolve o pedido de "família vê o ano inteiro" sem inventar uma capacidade que o Asaas não tem (confirmado na Fase 3: cobranças reais só são geradas até 40 dias antes do vencimento). A tela da família (Fase 11) calcula essa lista **em memória**, a partir de `financial_contracts` (`first_due_date` + `billing_cycle`, projetado por 12 ocorrências), **sem gravar nada no banco**. Cada linha da lista:
- Se já existe uma `financial_charges` real pra aquela data (Asaas já gerou) → mostra status real + PIX/boleto/link pagável.
- Se ainda não existe (fora da janela de 40 dias) → mostra só "previsto", valor e data, sem opção de pagar ainda.

Nenhuma tabela nova necessária pra isso — é 100% cálculo de exibição.

### A.4 — Notificação de vencimento próximo (2 dias antes)

Incorporado ao escopo da Fase 13 (não implementado agora): job diário via `pg_cron` (mesmo mecanismo já existente e reaproveitado desde a fase de infra) — `SELECT` em `financial_charges` com `due_date = CURRENT_DATE + 2` e `status NOT IN ('PAID','CANCELLED')`, disparando push pela infraestrutura de notificação já existente (`notify-families` ou uma function financeira dedicada, a decidir na própria Fase 13).

### A.5 — Configuração da antecedência de geração no Asaas

A ser configurada na conta Asaas (Fase 7, fora do nosso banco) para **40 dias** — a maior antecedência disponível entre as 3 opções do Asaas (40/14/7), maximizando o tempo que cada cobrança fica disponível pra pagamento antes do vencimento.

---

## 12. Build

Não aplicável — nenhum código foi escrito nesta fase.

## 13. Lint

Não aplicável — mesmo motivo.

## 14. Testes

| Teste | Resultado | Evidência |
|---|---|---|
| Nenhuma migration criada | PASS | `git status --short` mostra só este relatório como novo |
| Nenhuma tabela criada no banco | PASS | Nenhum comando `CREATE TABLE` executado |
| Modelo cobre os 2 modelos de recorrência sem ambiguidade | PASS (por design) | Constraint cruzada `recurrence_model` × campos de recorrência |
| Modelo previne cobrança duplicada por vencimento | PASS (por design) | `UNIQUE (contract_id, due_date)` |
| Modelo previne pagamento duplicado do mesmo evento de gateway | PASS (por design) | `UNIQUE (gateway, gateway_payment_id)` + reaproveitamento de `payment_webhook_events` já idempotente |

## 15. QA Sênior

**QA 1 (implementador)**: revisei se todas as colunas exigidas pela seção 17 do escopo (`payment_id, school_id, student_id, family_id, amount, due_date, gateway, gateway_customer_id, gateway_payment_id, status, created_at, updated_at, paid_at`) estão cobertas — sim, todas presentes (com `payment_id` = `financial_charges.id`, `amount` = `amount_cents`, `gateway_customer_id` vivendo em `financial_contracts` por ser um dado do contrato/responsável, não da cobrança individual).

**QA 2 (auditor independente, assumindo erro)**: verifiquei se `financial_charges.family_id` desnormalizado poderia causar inconsistência — não, porque é **intencionalmente** um retrato do responsável no momento da cobrança, igual ao padrão já usado em `attendance_logs.family_id` do sistema de check-in (desnormalização deliberada por rastreabilidade histórica, não um bug). Verifiquei também se dado de cartão poderia vazar pro `metadata jsonb` de `financial_charge_events` por descuido — a seção 9 do escopo (tokenização, nunca armazenar cartão) precisa ser reforçada como regra de código na Fase 7 (nenhum campo do schema aceita PAN/CVV, mas o `jsonb` livre é um vetor de risco se alguém colar um payload cru do gateway sem filtrar — **recomendação**: a function que grava `metadata` deve fazer allowlist explícita de campos, nunca um `...rest` genérico do payload do webhook de cartão).

## 16. Problemas Encontrados

Nenhum problema — é uma fase de design puro, sem código pra ter bugs. O único ponto de atenção é a recomendação de allowlist de `metadata` acima (registrado como diretriz pra Fase 7/8, não uma correção agora).

## 17. Riscos Restantes

1. `financial_contracts.status='active'` único por aluno é regra de negócio, não constraint de banco — se a Fase 5 não adicionar um índice único parcial (`UNIQUE (student_id) WHERE status='active'`), é possível criar 2 contratos ativos pro mesmo aluno por erro operacional. **Recomendo incluir essa constraint na migration real da Fase 5.**
2. O tratamento de borda do Modelo A (dia 31 em mês sem dia 31) precisa de teste unitário dedicado na Fase 9 — é uma fonte clássica de bug financeiro.
3. `PAYMENT_AVAILABILITY_DAYS` como constante única de sistema pode não servir todas as escolas no futuro — decisão consciente de simplicidade agora, documentada pra reavaliar se necessário.

## 18. Git

```text
Commit? NÃO
Push? NÃO
Deploy? NÃO
```

Nenhum arquivo de código ou migration foi criado nesta fase — só este relatório.

## 19. Regra de Parada

```text
ATIVADA? NÃO
```

Nenhuma migration foi criada nem executada; nenhuma dúvida sobre gateway (fora de escopo desta fase); nenhum risco de perda de dado, já que nada foi escrito no banco.

## 20. Próxima Fase

```text
PODE AVANÇAR? SIM (modelo suficientemente definido pra prosseguir)
REQUER AUTORIZAÇÃO? SIM
```

Aguardando sua instrução explícita para iniciar a **FASE 3 — Auditoria do Asaas**.
