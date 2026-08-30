# RELATÓRIO FINAL — FASE 3

## AUDITORIA DO ASAAS

---

## 1. Objetivo

Avaliar tecnicamente a API oficial do Asaas (PIX, boleto, cartão, recorrência, webhooks, sandbox, idempotência) direto na documentação oficial, sem inventar endpoints, e sem integrar nada ainda.

## 2. Diagnóstico Inicial

Toda informação abaixo foi extraída diretamente de `docs.asaas.com` (documentação oficial pública) nesta sessão. Nenhum endpoint foi assumido ou adivinhado — onde a documentação não deixou claro um detalhe, isso está marcado explicitamente como "a confirmar".

## 3. Arquivos Auditados

Nenhum arquivo do projeto — esta fase é 100% pesquisa de documentação externa. Páginas consultadas: `docs.asaas.com/docs/autenticação-1`, `/reference/comece-por-aqui`, `/reference/criar-novo-cliente`, `/reference/criar-nova-cobranca`, `/reference/obter-qr-code-para-pagamentos-via-pix`, `/reference/obter-linha-digitavel-do-boleto`, `/reference/criar-nova-assinatura`, `/docs/cobrancas-via-cartao-de-credito`, `/docs/sobre-os-webhooks`, `/reference/criar-novo-webhook`.

## 4. Autenticação e Ambientes

| Item | Valor confirmado |
|---|---|
| URL base produção | `https://api.asaas.com/` |
| URL base sandbox | `https://api-sandbox.asaas.com/` |
| Header de autenticação da API | `access_token` (**não** é `Authorization: Bearer`) |
| Formato da chave — produção | prefixo `$aact_prod_...` |
| Formato da chave — sandbox | prefixo `$aact_hmlg_...` |
| `Content-Type` | `application/json` |
| `User-Agent` | obrigatório para contas root criadas após 13/06/2024 |
| Sandbox gratuito | Sim — criar conta em `sandbox.asaas.com/onboarding/createAccount`, gerar a chave lá |

**Nota de segurança da própria documentação**: "Never expose your API key in public code, frontend applications, images, logs or repositories" — reforça a regra já seguida no projeto (secret só em Edge Function/Vault, nunca em `VITE_*`).

## 5. Cliente (Customer)

`POST /v3/customers` — obrigatórios: `name`, `cpfCnpj`. Opcionais relevantes: `email`, `phone`, `mobilePhone`, endereço completo, `externalReference` (nosso próprio id, útil pra linkar sem depender só do id do Asaas), `notificationDisabled`. Resposta retorna `id` no formato `cus_XXXXXXXXXXXX` — esse é o valor que vai em `financial_contracts.gateway_customer_id` (campo já previsto na Fase 2).

## 6. Cobrança (Payment) — PIX / Boleto / Cartão / Link

`POST /v3/payments` — obrigatórios: `customer` (id do customer), `billingType` (`BOLETO`\|`PIX`\|`CREDIT_CARD`\|`UNDEFINED`), `value`, `dueDate`. Opcionais relevantes: `description`, `externalReference` (mapeável pra `financial_charges.id` nosso), `discount`/`interest`/`fine`, `installmentCount`/`installmentValue`, `callback` (redirecionamento pós-pagamento).

**`billingType = UNDEFINED`** é exatamente o "link de pagamento" pedido no escopo (seção 10): a cobrança não fixa o método, o pagador escolhe na `invoiceUrl` retornada.

Resposta relevante: `id` (`pay_XXXXXXXXXXXX` — vai em `financial_charges.gateway_payment_id`), `status` (`PENDING`\|`RECEIVED`\|`CONFIRMED`\|`OVERDUE`\|`REFUNDED`), `invoiceUrl` (mapeável pra `financial_charges.payment_link`), `bankSlipUrl` (mapeável pra `financial_charges.boleto_url`).

## 7. PIX — QR Code e Copia e Cola

`GET /v3/payments/{id}/pixQrCode` — **confirma exatamente os 2 requisitos obrigatórios do escopo (seção 7)**:
- `encodedImage` — imagem do QR Code em base64 → `financial_charges` não precisa de coluna nova, dá pra gerar sob demanda a partir do `gateway_payment_id` sem persistir a imagem.
- **`payload`** — o "Pix Copia e Cola" (obrigatório, seção 7.2) → mapeia direto pra `financial_charges.pix_copy_paste`.
- `expirationDate` — data de expiração do QR (formato `"2022-06-24 23:59:59"`).

Requisição precisa de corpo vazio (`GET` com body retorna 403).

## 8. Boleto

`GET /v3/payments/{id}/identificationField` — retorna `identificationField` (linha digitável, mapeável pra `financial_charges.boleto_barcode` — **nome de campo a ajustar no schema**: eu previ `boleto_barcode` na Fase 2 pro código de barras, mas o Asaas separa `identificationField` (linha digitável) de `barCode` (código de barras) — os dois existem e são diferentes; ver ação recomendada na seção 16) e `barCode`. `bankSlipUrl` (retornado já na criação da cobrança) é a URL do PDF do boleto.

⚠️ **A linha digitável pode mudar se a cobrança for atualizada** — nunca cachear permanentemente sem revalidar.

## 9. Cartão de Crédito — Segurança

Três caminhos confirmados pela documentação, do mais seguro (recomendado) ao que exige mais cuidado:

1. **Checkout hospedado (recomendado)**: cria a cobrança sem dado de cartão nenhum, redireciona o responsável pra `invoiceUrl` — a interface do próprio Asaas captura o cartão. **O Zela nunca vê nem um dígito do cartão.** Esse é o caminho que respeita 100% a regra da seção 9 do escopo ("nunca armazenar/logar/enviar cartão sem necessidade").
2. **Tokenização**: `POST /v3/creditCard/tokenizeCreditCard` retorna um `creditCardToken` reutilizável — funciona em sandbox, mas **em produção exige habilitação manual pelo gerente de conta do Asaas** (não é self-service).
3. **Envio direto do cartão pra criar a cobrança**: a API aceita, mas exige HTTPS e o IP real do pagador (`remoteIp`, não o IP do nosso servidor) — **NÃO recomendado pro Zela**: mesmo que o Asaas processe, isso significa que os dados brutos do cartão passariam pelo nosso frontend/backend antes de chegar no Asaas, ampliando desnecessariamente o escopo de responsabilidade sobre dado sensível. **Recomendação**: usar só o caminho 1 (checkout hospedado) — decisão a confirmar com você antes da Fase 7, mas tecnicamente é o único caminho consistente com a seção 9 do escopo sem exceção.

## 10. Link de Pagamento

Não é só o `billingType=UNDEFINED` de uma cobrança avulsa — o Asaas também tem um recurso dedicado "Link de Pagamentos" (`docs.asaas.com/docs/link-de-pagamentos`), um link reutilizável não vinculado a uma cobrança específica (mais pra loja/produto avulso). **Pro caso do Zela (mensalidade vinculada a um aluno específico), o padrão certo é `billingType=UNDEFINED` numa cobrança normal (seção 6), não o recurso de "Link de Pagamentos" genérico** — só documentando pra não confundir os dois na Fase 7.

## 11. Recorrência — Assinaturas (⚠️ decisão em aberto, ver seção 16)

`POST /v3/subscriptions` — obrigatórios: `customer`, `billingType`, `value`, `nextDueDate`, `cycle` (`WEEKLY`\|`BIWEEKLY`\|`MONTHLY`\|`BIMONTHLY`\|`QUARTERLY`\|`SEMIANNUALLY`\|`YEARLY`). Opcionais: `endDate`, `maxPayments`, `externalReference`.

**O Asaas já resolve recorrência nativamente do lado deles** — cria uma `subscription`, e ele mesmo gera cada `payment` individual no calendário certo, dispara webhook por cobrança gerada. Isso é **funcionalmente equivalente** ao mecanismo de `financial_contracts` + job `pg_cron` desenhado na Fase 2. Ver decisão pendente na seção 16 — não decidi isso sozinho.

## 12. Webhooks

`POST /v3/webhooks` — cria a configuração via API: `name`, `url`, `email`, `enabled`, `interrupted`, `apiVersion` (3), **`authToken`** (32-255 caracteres — **esse é o segredo que confirma o header, não a API key**), `sendType` (`SEQUENTIALLY`\|`NON_SEQUENTIALLY`), `events` (array — mais de 130 tipos possíveis; pro nosso caso inicial: eventos de `PAYMENT_*` como `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`).

**Autenticação da chamada de entrada** (o Asaas → nosso servidor): header **`asaas-access-token`**, valor = o `authToken` que a gente define ao criar o webhook — **confirma exatamente o desenho já implementado no esqueleto genérico da fase de infraestrutura** (`payment-webhook`, hoje usando o nome de header placeholder `x-webhook-token`). **Ação recomendada (não executada ainda)**: trocar o nome do header esperado de `x-webhook-token` pra `asaas-access-token` quando integrarmos de verdade (Fase 7) — mudança trivial de uma linha, documentada aqui pra não esquecer.

**Retry**: modelo *at-least-once* — o Asaas re-tenta se não receber 200; após 15 falhas consecutivas a fila pode ser pausada (mas novos eventos continuam sendo gerados, só não entregues até reativar). Isso reforça que responder rápido com 200 (como o esqueleto já faz) é importante — não fazer processamento pesado síncrono dentro da resposta do webhook.

**Idempotência**: a própria documentação recomenda "persistir o `id` recebido e não executar a regra de negócio de novo se já processado" — **exatamente o mecanismo já implementado** (`payment_webhook_events.gateway_event_id` com `UNIQUE`). O `id` do evento webhook do Asaas é o valor a usar nesse campo.

## 13. Idempotência (fora de webhooks)

A documentação não mencionou um mecanismo de `Idempotency-Key` genérico pra requisições de criação (`POST /v3/payments`, `POST /v3/subscriptions`) — a proteção contra duplo-clique/retry do nosso lado precisa ser nossa própria (ex.: checar se já existe `financial_charges` pro `(contract_id, due_date)` antes de chamar a API, como já previsto na constraint `UNIQUE` da Fase 2).

## 14. Segurança

Nenhuma chamada real foi feita ao Asaas (nem sandbox) nesta fase — só leitura de documentação pública. Nenhuma API key foi criada, usada ou armazenada.

## 15. Multi-Tenant

Não aplicável nesta fase (é auditoria de API externa, não de código do Zela) — mas fica confirmado que `customer.externalReference` e `payment.externalReference` existem e podem carregar nosso `student_id`/`charge_id`, o que ajuda a nunca depender só do id interno do Asaas pra rastrear de volta qual escola/aluno é dono de cada registro.

## 16. Problemas Encontrados / Decisões em Aberto

1. **[DECISÃO PENDENTE]** Recorrência nativa (`/v3/subscriptions`) vs. motor próprio (`financial_contracts` + `pg_cron`, desenhado na Fase 2). Ambos resolvem o problema, com trade-offs opostos:
   - **Subscriptions do Asaas**: menos código nosso, o Asaas cuida do calendário e da geração; mas menos controle sobre a regra "cobrança disponível ≥7 dias antes" (precisa confirmar na Fase 7 se dá pra configurar essa antecedência do lado do Asaas, ou se ele já gera a cobrança com folga suficiente antes do vencimento por padrão).
   - **Motor próprio**: controle total da regra de disponibilidade e do fluxo de aprovação/preview (Fase 10, "criação em massa com preview"), mas duplica uma funcionalidade que o Asaas já oferece pronta.
   - **Não decidi isso sozinho** — recomendo resolver antes da Fase 5 (migration), porque afeta se `financial_contracts.billing_day`/`billing_interval_days` são só metadado nosso (motor próprio) ou também precisam espelhar uma `subscription_id` do Asaas.
2. Ajuste de nomenclatura pendente pra Fase 7: header do webhook real é `asaas-access-token`, não `x-webhook-token` (placeholder atual do esqueleto).
3. Ajuste de nomenclatura pendente pro schema da Fase 5: o Asaas separa `identificationField` (linha digitável) de `barCode` (código de barras) — o desenho da Fase 2 previu só `boleto_barcode`; recomendo adicionar `boleto_identification_field` como coluna própria também.
4. Cartão de crédito: recomendo formalmente restringir a Fase 7 ao **checkout hospedado** (`invoiceUrl`), nunca o envio direto de dados de cartão — ver seção 9.

---

## ADENDO — Decisão tomada + esclarecimento de desconto

**Decisão da seção 16.1 (recorrência nativa vs. motor próprio): resolvida — recorrência via `Asaas /v3/subscriptions`.** O item 1 da seção 16 deixa de ser uma pendência. Consequências já incorporadas no adendo do relatório da Fase 2 (`FASE_2_MODELO_FINANCEIRO.md`):
- `financial_contracts` ganha `billing_cycle` (vocabulário Asaas), `gateway_subscription_id`, `base_monthly_amount_cents`, `discount_percent_applied`; perde `recurrence_model`/`billing_day`/`billing_interval_days` (motor próprio, superado).
- Antecedência de geração configurada no Asaas para **40 dias** (a maior das 3 opções disponíveis: 40/14/7).
- Calendário anual no portal da família = **projeção calculada** (não uma tabela de cobranças reais) até o Asaas efetivamente gerar cada uma.

**Esclarecimento sobre desconto anual/semestral (dúvida original do usuário):** confirmado que o Asaas não tem conceito de "desconto por escolher plano anual" — ele só cobra o `value` que a gente envia, qualquer que seja o `cycle`. Essa regra de negócio é 100% nossa. **Requisito adicional definido**: o desconto deve ser **configurável pelo Admin da escola** (não fixo em código) — nova tabela `financial_billing_discounts` (school_id × billing_cycle × discount_percent), editável numa tela simples da Fase 12 (Admin Financeiro). Ver detalhe completo no adendo A.2 do relatório da Fase 2.

---

## 17. Riscos Restantes

- Tokenização de cartão em produção exige aprovação manual do gerente de conta Asaas — se decidirmos por um fluxo que dependa disso no futuro, é preciso contatar o Asaas com antecedência (não é self-service, pode levar dias).
- Mais de 130 tipos de evento de webhook existem — a Fase 7 precisa decidir explicitamente uma lista mínima de eventos a assinar (recomendo começar só com os de `PAYMENT_*` relevantes: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`) — assinar tudo sem necessidade aumenta ruído e superfície de eventos a tratar.

## 18. Git

```text
Commit? NÃO
Push? NÃO
Deploy? NÃO
```

Nenhum arquivo de código foi criado ou alterado nesta fase — só este relatório.

## 19. Regra de Parada

```text
ATIVADA? NÃO
```

Nenhuma chamada real à API foi feita; nenhum dado foi criado no Asaas.

## 20. Próxima Fase

```text
PODE AVANÇAR? SIM — decisão da seção 16.1 já resolvida (ver ADENDO)
REQUER AUTORIZAÇÃO? SIM
```

Aguardando instrução explícita para iniciar a **FASE 4 — Plano de Segurança**.

**Pergunta pra você antes da Fase 4 (Plano de Segurança):** prefere que a recorrência seja gerada pelo **Asaas** (`/v3/subscriptions`, menos código nosso) ou pelo **nosso próprio motor** (`pg_cron` + `financial_contracts`, desenhado na Fase 2, mais controle sobre a regra de "disponível 7 dias antes")? Aguardando essa decisão + sua instrução explícita pra iniciar a **FASE 4 — Plano de Segurança**.
