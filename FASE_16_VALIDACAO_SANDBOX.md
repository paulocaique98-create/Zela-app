# Fase 16 — Validação em Sandbox

*Relatório escrito retroativamente na Fase 17 (Auditoria Final).*

## 1. Objetivo

Validar cenários ainda não cobertos de ponta a ponta contra o Asaas sandbox real, e decidir sobre uma lacuna encontrada: cobrança avulsa nunca virou funcionalidade de verdade.

## 2. Diagnóstico Inicial

`create-payment` (Fase 7) permanecia como prova técnica isolada — nunca gravava em `financial_charges`, nunca aparecia em nenhuma tela. O escopo mestre original previa "cobranças individuais e recorrentes"; só a recorrente tinha sido entregue.

## 3. Arquivos Auditados

`create-payment/index.ts`, `_shared/asaas.ts`, `processPaymentEvent.ts`.

## 4. Arquivos Modificados/Criados

- **Novo** `supabase/functions/create-avulsa-charge/index.ts` — cria customer + payment reais no Asaas, grava em `financial_charges` com `contract_id = NULL`, notifica a família, com rate limit.
- `processPaymentEvent.ts` — estendido pra sincronizar cobrança avulsa via webhook (antes, qualquer pagamento sem `subscription` era simplesmente ignorado).
- `AdminFinanceiro.jsx` — botão "Cobrança avulsa" na aba Cobranças + modal de criação.
- Migration `20260830e_avulsa_charges.sql` — `financial_charges.contract_id` passa a aceitar `NULL`.

## 5. Banco

`ALTER TABLE financial_charges ALTER COLUMN contract_id DROP NOT NULL`. `UNIQUE(contract_id, due_date)` continua correto — `NULL` nunca colide com `NULL` em constraint `UNIQUE` por padrão do Postgres.

## 6. Segurança

Mesmo padrão de validação de posse já usado em `create-financial-contract` (aluno validado contra `school_id` do caller, responsável financeiro resolvido via `is_financial=true`, nunca aceita `amount_cents` calculado do client — aqui o valor É digitado pelo admin, já que é o próprio propósito da cobrança avulsa, mas sempre um inteiro validado no servidor).

## 7. Multi-Tenant

Reaproveita a mesma validação de `create-financial-contract` — sem risco novo.

## 8. Gateway

PIX real (QR code + Copia e Cola) e Boleto real (linha digitável + código de barras) confirmados funcionando sem regressão desde a Fase 7.

## 9. Webhooks

`processPaymentEvent` agora resolve cobrança avulsa por `gateway_payment_id` direto (quando não há `subscription` no payload) — só atualiza uma linha que já existia (criada por `create-avulsa-charge`), nunca cria uma nova às cegas a partir só do webhook.

## 10. Recorrência

N/A nesta fase — cobrança avulsa é, por definição, não-recorrente.

## 11. PIX Copia e Cola

Cobrança avulsa grava `pix_copy_paste`/`pix_qr_code` desde a criação (diferente da recorrência, que ainda não tem isso — risco documentado na Fase 11, ainda não fechado).

## 12. Build

`npm run build` sem erros.

## 13. Lint

`npm run lint` sem erros novos.

## 14. Testes

| Teste | Resultado |
|---|---|
| PIX avulso via `create-payment` (prova técnica original) | ✅ QR code + Copia e Cola reais |
| Boleto avulso via `create-payment` | ✅ Linha digitável + código de barras reais |
| `create-avulsa-charge` PIX real, aluno/responsável descartáveis | ✅ Cobrança gravada com `contract_id=NULL`, PIX copia-e-cola presente |
| Notificação "nova cobrança" disparada na criação | ✅ |
| Webhook de pagamento pra cobrança avulsa (sem subscription) | ✅ Status atualizado pra PAID corretamente |
| Webhook pra `payment_id` nunca criado pelo backend | ✅ Rejeitado ("cobrança avulsa não encontrada"), nada criado às cegas |

## 15. QA Sênior

QA real em ZL002 com aluno/responsável/admin descartáveis, cobrança avulsa PIX real criada e paga de ponta a ponta via webhook real, mais o teste negativo de segurança (payment_id desconhecido).

## 16. Problemas Encontrados

Nenhum bug — a lacuna em si (cobrança avulsa nunca virar produto real) foi o achado, corrigido nesta mesma fase mediante confirmação do usuário.

## 17. Riscos Restantes

`pix_copy_paste` ainda não preenchido pra cobranças de **recorrência** (só avulsa tem desde já) — melhoria registrada, não implementada.

## 18. Git

Nenhum commit feito.

## 19. Regra de Parada

Nenhuma acionada.

## 20. Próxima Fase

Fase 17 (Auditoria Final).
