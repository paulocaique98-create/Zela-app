# Plano — Emissão Automática de NFS-e via Asaas

**Status:** análise concluída, arquitetura da API já validada contra a documentação oficial do Asaas. Aguardando só as decisões de negócio abertas (seção 3) antes de qualquer implementação.
**Investigação-base:** leitura completa de `_shared/asaas.ts`, `_shared/processPaymentEvent.ts`, `payment-webhook`, `create-financial-contract`, `create-avulsa-charge`, `create-payment`, `set-school-gateway-key`, todas as migrações `2026082x`/`2026083x`/`20260918x` relacionadas a financeiro/webhook/logging, e a documentação oficial do Asaas (`docs.asaas.com`): páginas de assinaturas, notas fiscais, emissão automática para assinaturas, webhooks de nota fiscal, e a referência de `POST /v3/subscriptions`, `POST /v3/payments`, `POST /v3/invoices` e `POST /v3/subscriptions/{id}/invoiceSettings`.

---

## 1. Validação do que foi pedido

### 1.1 Correto e direto de implementar
- Guardar `access_token` por escola já existe e é seguro (`school_gateway_accounts` + Supabase Vault, nunca em texto puro). Não precisa mudar nada aqui — só reaproveitar `get_school_gateway_secret('asaas')`.
- Disparar a nota **direto na conta Asaas da escola** (não numa conta central nossa) já é exatamente como o resto do módulo financeiro funciona hoje (token por escola, cliente Asaas por escola). Sem mudança de arquitetura necessária.
- Tratar erro fiscal salvando o motivo no banco e sinalizando pro admin é a abordagem certa — é exatamente o padrão que o sistema já usa pra erro real que precisa de ação humana. (O nome exato do evento mudou depois de checar a documentação — ver seção 2, item 6.)
- Pedir tipagem e tratamento de erro "nas melhores práticas do projeto" é totalmente viável — o projeto já tem um padrão bem definido (`logEdgeError` → `error_logs`, RLS por `get_my_school_id()`, `financial_charge_events` como trilha de auditoria) que dá pra seguir à risca.

### 1.2 Precisa de correção — a premissa está errada

**O ponto mais importante de toda a análise:** a regra de periodicidade descrita ("não enviar invoice nas cobranças mensais comuns de aluno trimestral/semestral, só no mês de competência, acumulando o valor") **parte de um pressuposto que não existe no sistema atual.**

Hoje, **não existe cobrança mensal pra aluno trimestral/semestral**. A recorrência inteira é delegada ao Asaas via `POST /v3/subscriptions`, com `cycle: 'QUARTERLY'` ou `'SEMIANNUALLY'`. O Asaas em si só gera **uma cobrança a cada 3 ou 6 meses**, já no valor cheio multiplicado (`base_monthly_amount_cents × 3` ou `× 6`, menos desconto). Não existe, em lugar nenhum do código, uma rotina que cobra 1/3 ou 1/6 todo mês, nem uma cobrança "vazia" que precisa ser filtrada.

**Consequência prática, boa pra você**: como cada cobrança que o Asaas gera para um contrato trimestral/semestral **já é**, por definição, a cobrança de vencimento (nunca uma cobrança "de passagem"), a regra de negócio simplifica pra:

> Configurar emissão automática de nota **uma vez por contrato/assinatura ativa** (mensal, trimestral, semestral ou anual) — Asaas então emite automaticamente 1 nota por cobrança gerada dentro do ciclo, seja ele mensal, trimestral ou semestral. Nenhuma lógica de "suprimir nos meses que não são de competência" é necessária, porque essa cobrança intermediária simplesmente não existe.

Isso elimina a parte mais arriscada e complexa do pedido original (a "rotina ou parâmetro para injetar o bloco de invoice apenas no mês de competência"). Essa conclusão foi **confirmada diretamente na documentação oficial** (seção 2, item 5): a Asaas já garante "uma nota por cobrança do ciclo" nativamente, é só configurar uma vez por assinatura.

### 1.3 O JSON de exemplo que você mandou não corresponde a nenhum endpoint real
Conferi a especificação oficial (`POST /v3/payments` e `POST /v3/subscriptions`): **nenhum dos dois aceita um bloco `invoice` no corpo da requisição**, nem existe um campo `effectiveDate` com o valor `"WHEN_PAID"`. O mecanismo real é outro, e mais simples de implementar — está inteiramente detalhado, com endpoint e nomes de campo exatos, na seção 2 (itens 5 e 6). O `municipalServiceId`/`municipalServiceName` que você mandou continuam corretos como conceito, só entram em outro lugar da API.

---

## 2. Descobertas críticas da investigação

1. **Nada de fiscal existe hoje.** Não há coluna de CNPJ/inscrição municipal em `schools`, não há tabela de configuração fiscal, não há nenhuma menção a NFS-e no código ou nas migrações. Tudo precisa ser criado do zero.
2. **`createCustomer` não envia endereço.** Hoje o cliente Asaas de cada responsável é criado só com `name`, `cpfCnpj`, `email` (`_shared/asaas.ts:81`, usado em `create-financial-contract.ts:169-173`). NFS-e normalmente exige endereço completo do tomador do serviço. Isso é uma lacuna de dado real, não só de código — ver seção 3.3.
3. **O webhook hoje não distingue tipo de evento.** `payment-webhook/index.ts` não faz `switch` no campo `event` do payload — toda a lógica de `_shared/processPaymentEvent.ts` é guiada pelo `payload.payment.status`, e a função **retorna cedo se não existir `payload.payment.id`** (linha 54-56). Confirmado na documentação: o payload de um evento fiscal traz um objeto `invoice` no lugar de `payment` (ver item 6) — isso significa que a lógica de eventos fiscais precisa ser **um branch novo e paralelo**, não uma extensão do fluxo de pagamento existente.
4. **Idempotência já resolvida, é só reaproveitar.** `payment_webhook_events` com `UNIQUE(school_id, gateway, gateway_event_id)` e `upsert(...).ignoreDuplicates: true` já garante que o mesmo evento nunca processa duas vezes — os eventos fiscais entram nessa mesma tabela, sem mudança de schema ali.
5. **[CONFIRMADO NA DOCUMENTAÇÃO] O mecanismo real é "configuração de emissão automática por assinatura", não um bloco embutido na criação.** A API tem um endpoint dedicado:
   `POST /v3/subscriptions/{id}/invoiceSettings` — chamado **uma vez**, logo depois de criar a assinatura (não no mesmo corpo da criação). A partir daí, **toda cobrança futura gerada por aquela assinatura** (mensal, trimestral, semestral, o ciclo que for) já emite nota automaticamente, sem precisar repetir a configuração. Existem também `GET`/`PUT`/`DELETE` para consultar, atualizar e remover essa configuração depois.

   Campos reais do corpo dessa chamada (bem diferente do JSON que você mandou):
   ```json
   {
     "municipalServiceId": "1.01",
     "municipalServiceName": "Ensino regular pré-escolar, fundamental ou médio",
     "updatePayment": true,
     "effectiveDatePeriod": "ON_PAYMENT_CONFIRMATION",
     "observations": "Mensalidade escolar",
     "deductions": 0,
     "taxes": {
       "retainIss": false,
       "iss": 0,
       "pis": 0,
       "cofins": 0,
       "csll": 0,
       "inss": 0,
       "ir": 0
     }
   }
   ```
   O campo que faz o papel do seu `effectiveDate: "WHEN_PAID"` é **`effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION"`** — emite a nota só depois que o Asaas confirma o recebimento, exatamente a regra que você descreveu para os alunos mensais (e que agora sabemos que vale igual pra trimestral/semestral, pelo motivo explicado em 1.2). Outros valores existem (`ON_PAYMENT_DUE_DATE`, `BEFORE_PAYMENT_DUE_DATE`, `ON_DUE_DATE_MONTH`, `ON_NEXT_MONTH`), mas não são o que você pediu.

   **Achado novo e importante**: o objeto `taxes` é **obrigatório**, com `retainIss`, `iss`, `pis`, `cofins`, `csll`, `inss` e `ir` todos exigidos numericamente. Isso significa que a escola (ou nós, em nome dela) precisa saber as alíquotas reais aplicáveis ao serviço educacional em Vitória/ES antes de ligar essa feature — não é só "código do serviço", é a configuração tributária completa. Isso vira uma pergunta em aberto nova (seção 3.3).

   Para **cobranças avulsas** (`create-avulsa-charge`, que não passam por assinatura), o mecanismo é diferente: existe um endpoint próprio `POST /v3/invoices`, que agenda uma nota vinculada a um `payment`/`installment`/`customer` específico, com `effectiveDate` sendo uma **data literal** (`YYYY-MM-DD`), não o enum acima. Ou seja, mensalidade e avulsa usam dois mecanismos de API diferentes — ver seção 3.5.
6. **[CORRIGIDO] Os nomes reais dos eventos de webhook fiscal são diferentes do que foi pedido.** A lista oficial é: `INVOICE_CREATED`, `INVOICE_UPDATED`, `INVOICE_SYNCHRONIZED`, `INVOICE_AUTHORIZED`, `INVOICE_PROCESSING_CANCELLATION`, `INVOICE_CANCELED`, `INVOICE_CANCELLATION_DENIED` e **`INVOICE_ERROR`** — não existe um evento chamado `INVOICE_REJECTED`. O payload traz `{ event, invoice: { id, status, number, pdfUrl, xmlUrl, validationCode, value, deductions, customer, payment, taxes } }`. A documentação pública não deixa claro em qual campo exato vem a mensagem de erro/motivo da rejeição dentro do evento `INVOICE_ERROR` — isso precisa ser confirmado com um teste real no sandbox (forçando um erro proposital) antes de escrever o código de persistência do motivo, pra não adivinhar o nome do campo.

---

## 3. Perguntas em aberto (preciso da sua decisão ou de uma checagem na documentação/conta Asaas antes de codar)

### 3.1 [RESOLVIDO] Onde exatamente a emissão automática é configurada na API do Asaas?
Confirmado na documentação oficial (seção 2, item 5): `POST /v3/subscriptions/{id}/invoiceSettings`, chamado uma vez logo após criar a assinatura. Não é mais uma decisão em aberto — só falta implementar.

### 3.2 Toda escola vai emitir nota, ou é opt-in?
O Certificado A1 e o cadastro municipal no Asaas são configurados **manualmente, por fora do nosso sistema**, na conta Asaas de cada escola. Se ligarmos isso globalmente, uma escola que ainda não configurou o certificado vai gerar `INVOICE_ERROR` em toda cobrança. Recomendo: **novo flag por escola** (`schools.features_enabled.nfse_emissao`, mesmo padrão já usado pra Liveness/QR Check-in), desligado por padrão, ligado pelo Portal do Dev só depois de confirmar com a escola que o certificado já está ativo do lado do Asaas.

### 3.3 [NOVO, IMPORTANTE] De onde vêm as alíquotas tributárias (`taxes`)?
A configuração de emissão automática exige um objeto `taxes` completo (`retainIss`, `iss`, `pis`, `cofins`, `csll`, `inss`, `ir`) — não é opcional. Isso é informação **contábil/fiscal real da escola**, não um detalhe técnico que dá pra inventar. Preciso saber: essas alíquotas já são conhecidas (ex: a contabilidade das escolas parceiras já informou isso em algum lugar), ou isso precisa virar um novo campo de configuração que o admin/desenvolvedor preenche manualmente por escola antes de ligar o flag? Um valor errado aqui gera nota fiscal com imposto calculado errado — isso não é algo pra usar um "valor padrão chutado".

### 3.4 Dado de endereço do responsável — falta ou já existe em algum lugar?
NFS-e normalmente exige endereço completo do tomador. Hoje `createCustomer` não envia isso (só `name`, `cpfCnpj`, `email`). Preciso saber: os cadastros de responsável (`users`/família) já têm endereço estruturado (rua, número, CEP, cidade) em algum lugar do banco que eu não vi, ou isso também precisa ser cadastrado? Se não existe, é um requisito de UI adicional (formulário de endereço) antes da Fase 2 fazer sentido. *(A documentação do endpoint de configuração em si não pede endereço — mas isso pode ser exigido em outro ponto do cadastro fiscal do cliente Asaas; vale confirmar num teste real no sandbox antes de descartar a possibilidade.)*

### 3.5 `municipalServiceId`/`municipalServiceName` — fixo ou configurável por escola?
Hoje todas as escolas cadastradas são de Vitória/ES, então `"1.01"` funcionaria como valor único. Mas é mais seguro (e mais barato de manter no futuro, se o SaaS crescer pra outros municípios) guardar isso como **configuração por escola** desde já, com `"1.01"` como valor padrão pré-preenchido, do que fixar como constante no código. Confirma se concorda com isso?

### 3.6 Cobranças avulsas (matrícula, eventos) também precisam de nota?
O pedido fala só de mensalidade. Agora que sabemos que avulsa usa um mecanismo de API diferente (`POST /v3/invoices`, item 5 da seção 2, `effectiveDate` como data literal em vez do enum), essa é uma decisão de escopo mais clara: incluir `create-avulsa-charge` custa uma segunda integração (menor, mas separada), não "reaproveitar o mesmo bloco". Confirma se entra no escopo já nesta primeira entrega ou fica pra depois?

### 3.7 O que a escola/família veem quando a nota tem erro (`INVOICE_ERROR`)?
Erro fiscal (CNAE errado, cadastro municipal incompleto, etc.) normalmente exige uma correção manual **na conta Asaas da escola**, fora do nosso sistema. Nosso papel é só: guardar o motivo (assim que confirmarmos o nome exato do campo — ver seção 2, item 6), avisar o admin de forma clara, e permitir tentar de novo depois da correção (reemissão manual)? Confirma esse escopo.

### 3.8 Contratos já existentes (antes da feature existir)
Contratos/assinaturas já criados no Asaas antes de ligarmos essa feature não terão a configuração de `invoiceSettings` retroativamente (a menos que façamos uma chamada de configuração por assinatura já existente — o endpoint permite isso, `PUT`/criação a qualquer momento, não precisa ser só na criação da assinatura). Isso é aceitável (só contratos novos emitem nota, os antigos continuam sem, até alguém rodar uma configuração retroativa manualmente), ou precisa de uma rotina de backfill nas assinaturas ativas já no lançamento?

---

## 4. Plano de implementação em fases (a executar só depois das decisões acima)

### Fase 0 — Spike técnico no sandbox (só o que ainda não foi confirmado por documentação)
A arquitetura em si já está resolvida (seção 3.1). O que falta validar empiricamente, criando uma assinatura de teste real no sandbox Asaas, é só:
- O formato exato do campo de erro dentro do payload de `INVOICE_ERROR` (não documentado publicamente).
- Se o cadastro do `customer`/configuração fiscal exige endereço em algum ponto não coberto pela doc pública (item 3.4).
- Confirmar as alíquotas de exemplo do sandbox antes de assumir qualquer valor "zerado" como seguro pra produção.

### Fase 1 — Schema
- `schools`: adicionar configuração fiscal (nova tabela `school_fiscal_config` ou coluna `fiscal_config jsonb`: `municipal_service_id`, `municipal_service_name`, `taxes` completo conforme 3.3, `ativo`) — a decidir conforme 3.3/3.5.
- Nova tabela `financial_invoices`: `id`, `school_id`, `contract_id` (FK `financial_contracts`, já que a config é por assinatura), `charge_id` (FK `financial_charges`, nullable — só preenchido quando a nota corresponde a uma cobrança específica), `gateway_invoice_id`, `status` (`SCHEDULED`/`SYNCHRONIZED`/`AUTHORIZED`/`ERROR`/`CANCELED`/`CANCELLATION_DENIED`, batendo com os eventos reais da seção 2.6), `invoice_number`, `validation_code`, `pdf_url`, `xml_url`, `error_reason`, timestamps. RLS: admin só SELECT da própria escola (nunca INSERT/UPDATE direto — só via webhook/service role), mesmo padrão de `financial_charges`.
- Índice em `financial_invoices.contract_id` e `financial_invoices.charge_id` (toda FK nova precisa, convenção já estabelecida no projeto).
- Flag `nfse_emissao` em `features_enabled` (mesmo padrão já usado em Liveness/QR).

### Fase 2 — Emissão
Depois que `create-financial-contract/index.ts` cria a assinatura com sucesso (fluxo já existente, sem mudança), adicionar **uma chamada nova**: `POST /v3/subscriptions/{id}/invoiceSettings`, condicionada ao flag da escola — **sem** nenhuma lógica de periodicidade especial (ver seção 1.2, já não é necessária: o mesmo `effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION"` vale pra qualquer `billing_cycle`). Se essa chamada falhar, o contrato/assinatura em si **não deve ser desfeito** — a mensalidade continua funcionando normalmente mesmo sem nota fiscal automática configurada; só logamos o erro e deixamos claro pro admin que a nota não ficou configurada, sem travar a cobrança.
Cobranças avulsas ficam de fora desta fase (dependem da decisão em 3.6) — se entrarem, é uma Fase 2b separada usando `POST /v3/invoices`.

### Fase 3 — Webhook fiscal
Novo branch no `payment-webhook` (ou um handler dedicado) pra tratar `event` começando com `INVOICE_` — hoje a função nem olha pro campo `event`, então isso é uma ramificação nova logo no início do processamento, antes de qualquer lógica que espera `payload.payment`. Segue o mesmíssimo padrão de idempotência (`payment_webhook_events`) e autenticação por token (`find_school_by_webhook_token`) já existente — nenhuma mudança na segurança do endpoint, só na lógica de processamento pós-dedup.

### Fase 4 — Persistência e trilha de auditoria
Upsert em `financial_invoices` a cada evento fiscal (usando `invoice.payment` do payload pra achar a `financial_charges` correspondente, quando existir) + linha em `financial_charge_events` (reaproveitando a tabela de auditoria já existente, mesmo padrão do fluxo de pagamento).

### Fase 5 — UI
- Admin: coluna/badge de status fiscal em `AdminFinanceiro.jsx`, com link pro PDF/XML quando `AUTHORIZED`, e o motivo visível quando `ERROR` (com opção de reemitir).
- Notificação ao admin em caso de `INVOICE_ERROR` (reaproveitar `notifyAdmins`, mesmo padrão do Alerta de Ausência Prolongada).
- Tela/campo de configuração fiscal por escola (município, código de serviço, alíquotas) — provavelmente no Portal do Dev junto do flag, já que envolve dado contábil sensível.

### Fase 6 — Testes
- Testes automatizados da função pura "monta o corpo de `invoiceSettings` a partir da configuração fiscal da escola" (validação de campos obrigatórios, formato).
- Teste manual ponta a ponta no sandbox Asaas: contrato → assinatura → `invoiceSettings` configurado → cobrança gerada → pagamento simulado → nota emitida → webhook `INVOICE_AUTHORIZED` recebido → status refletido na UI. Repetir forçando um cenário de erro pra confirmar o tratamento de `INVOICE_ERROR`.

### Fase 7 — Rollout
Igual ao padrão já validado nas últimas features: flag desligado por padrão, piloto em 1 escola (idealmente a mesma que já tem Certificado A1 configurado), aval explícito antes de expandir.

---

## 5. Fora de escopo (por enquanto)
- Emissão de NFS-e pra qualquer cidade além de Vitória/ES (arquitetura já deixa isso configurável, mas não será testado agora).
- Cancelamento de nota já autorizada (Asaas suporta, mas não foi pedido).
- Qualquer cobrança do custo da nota pra escola — já definido que fica com a Zela por ora, não impacta código.
