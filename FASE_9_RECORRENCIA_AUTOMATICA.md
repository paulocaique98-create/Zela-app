# Fase 9 — Recorrência Automática (contrato → assinatura Asaas → sincronização de cobranças)

## 1. Objetivo

Fechar o ciclo de recorrência: a partir de um contrato financeiro criado
pelo admin, gerar uma assinatura real no Asaas (que passa a emitir cada
cobrança individual no calendário certo) e sincronizar cada cobrança
recebida via webhook (Fase 8) para dentro de `financial_charges`, tornando-a
visível para o portal da família (fase futura).

## 2. Diagnóstico Inicial

- `financial_contracts` (Fase 2/5) já tinha as colunas `billing_cycle`,
  `base_monthly_amount_cents`, `discount_percent_applied`,
  `gateway_subscription_id` — prontas, nunca preenchidas por código algum.
- `financial_charges` já tinha `gateway_payment_id`, mas nada gravava nela
  fora de inserts manuais de QA.
- `payment_webhook_events` (Fase 8) grava o evento cru, mas nada o
  processava — o "elo perdido" entre "webhook recebido" e "cobrança
  visível" ainda não existia.
- Decisão da Fase 3 confirmada: recorrência é nativa do Asaas (não um motor
  próprio via pg_cron) — o Asaas decide quando gerar cada cobrança da
  assinatura, dispara `PAYMENT_CREATED`/`PAYMENT_CONFIRMED`/etc., e esta
  fase só precisa reagir a esses eventos.

## 3. Arquivos Auditados

- `supabase/functions/_shared/asaas.ts` (Fase 7) — `createSubscription` já
  existia, nunca tinha sido chamado em produção.
- `supabase/functions/payment-webhook/index.ts` (Fase 8) — só gravava o
  evento cru, sem sincronizar.
- `financial_contracts`/`financial_charges`/`financial_billing_discounts`
  (Fase 2/5) — schema já suportava tudo que esta fase precisava, zero
  migração de schema nova nesta fase.
- `is_financial_guardian()` / `student_guardians.is_financial` (Fase 6).
- `get_school_gateway_secret` (Fase 7) — reaproveitado sem alteração.

## 4. Arquivos Modificados/Criados

- **Novo** `supabase/functions/_shared/processPaymentEvent.ts` — lógica de
  sincronização compartilhada (webhook em tempo real e reprocessamento
  manual usam a mesma função, garantindo comportamento idêntico).
- **Novo** `supabase/functions/create-financial-contract/index.ts` —
  cria o contrato + assinatura Asaas, padrão reserva-antes-do-gateway.
- **Novo** `supabase/functions/process-payment-webhook/index.ts` —
  reprocessamento manual/backfill de eventos não sincronizados.
- **Modificado** `supabase/functions/payment-webhook/index.ts` — passou a
  chamar `processPaymentEvent` inline após gravar cada evento novo (não
  duplicado), sem deixar uma falha de sincronização derrubar a resposta 200
  ao Asaas.
- **Nova migration** `supabase/migrations/20260830b_fix_financial_charges_gateway_unique.sql`
  — correção de bug real encontrado em QA (ver seção 16).

## 5. Banco

Nenhuma tabela nova. Uma correção de constraint (ver seção 16): o índice
único parcial de `financial_charges (gateway, gateway_payment_id)` virou
uma `UNIQUE CONSTRAINT` normal — comportamento idêntico (NULLs continuam
nunca colidindo entre si por padrão do Postgres), só sem a cláusula `WHERE`
que impedia o `ON CONFLICT` do `supabase-js` de funcionar.

## 6. Segurança

- `create-financial-contract`: admin-only; nunca confia em `school_id`
  vindo do client (valida que o aluno pertence à escola do chamador);
  `amount_cents` sempre recalculado no servidor a partir do desconto
  configurado (nunca aceito do client — risco 6.10 da Fase 4).
- Padrão reserva-antes-do-gateway (risco 6.6 da Fase 4): a linha em
  `financial_contracts` é inserida ANTES de qualquer chamada ao Asaas,
  usando o índice único parcial (1 contrato `active` por aluno) como trava
  atômica. Se o Asaas falhar depois, o contrato vira `cancelled` — nunca é
  apagado (seção 18 do escopo mestre).
- `processPaymentEvent` nunca confia no payload do webhook para decidir a
  qual escola a cobrança pertence (isso já foi resolvido pelo token do
  webhook na Fase 8) — só resolve o contrato via `gateway_subscription_id`
  com um JOIN contra o próprio banco, sempre filtrado por `school_id`.
- `process-payment-webhook`: admin só reprocessa eventos da própria escola;
  developer pode mirar qualquer escola via `school_id` explícito no corpo.

## 7. Multi-Tenant

Testado com 2 escolas reais (`ZLF9` com chave Asaas configurada, `ZLF9B`
sem nenhuma) — ver seção 15.

## 8. Gateway

`createSubscription` chamado de verdade contra o Asaas sandbox: criou
customer real (`cus_000008934968`) e assinatura real
(`sub_qvpqep8hmxl9fdl2`), `externalReference` apontando para o id do nosso
contrato. Esses dois registros ficam no sandbox do Asaas (não são apagáveis
por nós, sem risco — é dinheiro fake), não fazem parte da limpeza do nosso
banco.

## 9. Webhooks

Reaproveitado 100% o mecanismo multi-tenant da Fase 8
(`find_school_by_webhook_token`). Nenhuma alteração nesse fluxo, só a
adição do passo de sincronização após a gravação do evento.

## 10. Recorrência

Confirmada a decisão da Fase 3: não existe motor de recorrência próprio.
O Asaas gera cada cobrança da assinatura e dispara o webhook — esta fase
só reage. Testado com um evento sintético `PAYMENT_CREATED` seguido de um
`PAYMENT_CONFIRMED` para o mesmo `payment.id`: a segunda chamada fez
`UPDATE` na mesma linha de `financial_charges` (via `upsert` com
`onConflict`), não criou uma segunda — confirmado por
`SELECT count(*) ... GROUP BY status` retornando 1 linha com
`status='PAID'`.

## 11. PIX Copia e Cola

Não alterado nesta fase (já validado na Fase 7). Fora de escopo — esta
fase tratou de assinatura/recorrência, não do detalhe de cada método de
pagamento.

## 12. Build

`npm run build` — sem erros (frontend não foi tocado nesta fase; só Edge
Functions Deno, que não passam pelo build do Vite).

## 13. Lint

`npm run lint` — sem erros novos.

## 14. Testes

| Cenário | Resultado |
|---|---|
| Criar contrato com escola configurada (PIX/BOLETO válidos) | ✅ Customer + Subscription reais criados no Asaas, contrato gravado `active` |
| Duplicar contrato para o mesmo aluno | ✅ Bloqueado com erro amigável, nenhuma 2ª assinatura criada |
| Criar contrato em escola sem chave Asaas configurada | ✅ Erro claro, contrato reservado corretamente revertido para `cancelled` (nunca apagado) |
| Webhook `PAYMENT_CREATED` sintético (assinatura real) | ✅ Evento gravado; 1ª tentativa de sincronização falhou silenciosamente (bug, ver seção 16) |
| Reprocessamento manual via `process-payment-webhook` (após fix) | ✅ Sincronizou com sucesso, `financial_charges` populada corretamente |
| Webhook `PAYMENT_CONFIRMED` para o mesmo `payment.id` | ✅ Atualizou a mesma linha (`PENDING`→`PAID`), não duplicou |
| Verificação de `financial_charge_events` | ✅ 1 evento gravado com `source='webhook'`, `event_type` correto |
| Verificação de `payment_webhook_events.processed_at` | ✅ Marcado após sincronização bem-sucedida |

## 15. QA Sênior

Fluxo completo com 2 escolas de teste reais (`ZLF9` e `ZLF9B`), cada uma
com admin, aluno e responsável financeiro (CPF gerado com dígito
verificador válido) próprios. Toda validação foi feita com chamadas HTTP
reais (`curl`) usando JWTs reais obtidos via
`/auth/v1/token?grant_type=password`, contra as Edge Functions já
implantadas — nunca só leitura de código. Estado do banco conferido
diretamente via `supabase db query --linked` antes e depois de cada etapa,
incluindo o teste negativo do rollback de contrato reservado.

## 16. Problemas Encontrados

**Bug real, encontrado só por QA de ponta a ponta (não pego por build nem
lint):** o `upsert(..., {onConflict:'gateway,gateway_payment_id'})` do
`processPaymentEvent` falhava com
`"there is no unique or exclusion constraint matching the ON CONFLICT
specification"`. Causa raiz: o índice único de
`financial_charges(gateway, gateway_payment_id)` (criado na Fase 5) era
**parcial** (`WHERE gateway_payment_id IS NOT NULL`) — o Postgres não
aceita um `ON CONFLICT (col1, col2)` simples mirando um índice parcial sem
repetir a mesma cláusula `WHERE` no próprio `ON CONFLICT`, o que o upsert
do `supabase-js` não suporta.

A falha era silenciosa no fluxo em tempo real (`payment-webhook` captura o
erro em `try/catch` e só loga — decisão deliberada da Fase 8/9 para nunca
derrubar a resposta 200 ao Asaas por um erro nosso). Só foi descoberta
chamando manualmente `process-payment-webhook`, que propaga o erro de
verdade.

**Correção:** a parcialidade nunca foi necessária — o Postgres já trata
cada `NULL` como nunca-igual-a-outro-NULL em constraints `UNIQUE` por
padrão, então uma constraint normal (não-parcial) já permite várias linhas
com `gateway_payment_id NULL` sem colisão falsa, e ainda bloqueia
duplicidade real quando o valor existe — comportamento idêntico ao
pretendido. Migration `20260830b_fix_financial_charges_gateway_unique.sql`
trocou o índice parcial por uma `UNIQUE CONSTRAINT` normal. Verificado que
`financial_charges` estava vazia antes de aplicar (zero risco de dado
perdido). Reprocessamento manual do evento que tinha falhado confirmou o
fix e validou, de brinde, o próprio design de reprocessamento (o evento
cru nunca se perde — fica disponível via `processed_at IS NULL` até ser
sincronizado com sucesso).

## 17. Riscos Restantes

- A assinatura/customer reais criados no sandbox do Asaas durante o QA
  (`cus_000008934968`, `sub_qvpqep8hmxl9fdl2`) continuam existindo na conta
  sandbox do usuário — sem risco (sandbox, dinheiro fake), mas não foram
  (nem podem ser, por nós) apagados.
- `VAPID_PUBLIC_KEY` continua ausente dos segredos de Edge Function
  (achado durante a investigação de Push Notifications, ainda não
  corrigido — não relacionado a esta fase, mas segue pendente).
- Ainda não existe UI nenhuma para: cadastrar a chave Asaas de uma escola
  (só via `curl` — documentado em `ONBOARDING_FINANCEIRO_ESCOLA.md`),
  configurar descontos por ciclo, ou criar contratos (só via API direta) —
  previsto para Fase 12.
- Reprocessamento manual (`process-payment-webhook`) hoje é só uma Edge
  Function chamável — não há botão/tela no Admin ainda.

## 18. Git

Nenhum commit/push feito (regra do escopo mestre: nunca commitar sem
autorização explícita). Arquivos criados/modificados estão no working tree.

## 19. Regra de Parada

Nenhuma condição de STOP foi acionada. Todos os testes passaram (o bug
encontrado foi corrigido dentro da própria fase, com o fix validado por
reprocessamento real antes de considerar a fase concluída).

## 20. Próxima Fase

Fase 10 — Criação em Massa (ainda não autorizada).
