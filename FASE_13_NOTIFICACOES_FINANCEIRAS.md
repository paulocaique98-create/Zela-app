# Fase 13 — Notificações Financeiras

*Relatório escrito retroativamente na Fase 17 (Auditoria Final).*

## 1. Objetivo

Avisar a família (in-app + push) quando uma cobrança é criada, quando é paga, e lembrar 2 dias antes do vencimento — conforme pedido no escopo original.

## 2. Diagnóstico Inicial

Antes desta fase, nada notificava a família de eventos financeiros — só entrando na tela manualmente. `VAPID_PUBLIC_KEY` (secret necessário pra envio de push) estava ausente havia tempo (achado numa investigação anterior de push notifications, corrigido no início desta mesma sessão, antes de iniciar a Fase 13).

## 3. Arquivos Auditados

`processPaymentEvent.ts` (Fase 9), `notify-chat-message/index.ts` (padrão de envio de push já usado no projeto), schema de `notifications` e `push_subscriptions`.

## 4. Arquivos Modificados/Criados

- **Novo** `supabase/functions/_shared/sendFamilyNotification.ts` — helper compartilhado (in-app + push), extraído do padrão já usado no chat.
- `processPaymentEvent.ts` — notifica quando a cobrança é sincronizada pela 1ª vez ou quando o status vira `PAID` (nunca em outra transição).
- **Novo** `supabase/functions/send-financial-reminders/index.ts` — lembrete de vencimento em 2 dias, rodando via pg_cron diário.
- Migration: `financial_charges.reminder_sent_at` (evita lembrete duplicado) + tabela genérica `cron_secrets` (Vault-backed, mesmo padrão de `school_gateway_accounts`, pra qualquer cron futuro).

## 5. Banco

`ALTER TABLE financial_charges ADD COLUMN reminder_sent_at`; nova tabela `cron_secrets` + funções `set_cron_secret`/`get_cron_secret` (`SECURITY DEFINER`, só `service_role`).

## 6. Segurança

`send-financial-reminders` não usa nenhum segredo customizado guardado em Vault lido via SQL direto (achado desta mesma sessão: leitura de Vault via SQL solto degrada com o tempo nesse projeto — ver Fase 17, achado de infraestrutura). Em vez disso, decodifica o JWT recebido e confere `role === 'service_role'` — a assinatura já foi validada pelo gateway antes do código rodar, então confiar no claim decodificado é seguro.

## 7. Multi-Tenant

Notificações sempre escopadas por `school_id`/`family_id` resolvidos a partir do próprio banco (contrato/cobrança), nunca do payload do webhook.

## 8. Gateway

Sem chamada nova ao Asaas nesta fase — só reage a eventos já sincronizados.

## 9. Webhooks

Sem alteração no fluxo de recebimento — só o que acontece *depois* da sincronização.

## 10. Recorrência

N/A nesta fase.

## 11. PIX Copia e Cola

N/A nesta fase.

## 12. Build

Sem alteração de frontend nesta fase — só Edge Functions (Deno), não passa pelo build do Vite.

## 13. Lint

`npm run lint` sem erros novos.

## 14. Testes

| Teste | Resultado |
|---|---|
| Contrato novo → notificação "nova cobrança" real, disparada pelo webhook real do Asaas | ✅ |
| Pagamento confirmado → notificação "pagamento confirmado", sem duplicar em reenvios | ✅ |
| `send-financial-reminders`: cobrança com vencimento em exatamente 2 dias → lembrete disparado, `reminder_sent_at` marcado | ✅ |
| Rodar de novo no mesmo dia → não duplica (idempotência via `reminder_sent_at`) | ✅ |
| Sem `Authorization` → 401 (bloqueado pelo próprio gateway) | ✅ |
| Com `anon key` no lugar de `service_role` → 401 (bloqueado pela checagem de `role`) | ✅ |

## 15. QA Sênior

Testes com contrato real criado em ZL002, webhook real do Asaas sandbox disparando os eventos — não simulado via curl nos casos de "nova cobrança"/"pagamento confirmado" (só o teste do lembrete usou uma cobrança inserida diretamente, já que não dá pra forçar o Asaas a gerar um vencimento em 2 dias sob demanda).

## 16. Problemas Encontrados

Nenhum bug de código — o achado real desta fase foi de infraestrutura (Vault degradando leitura via SQL direto), tratado como pendência separada, não bloqueou a entrega da fase (a solução adotada, decodificar o JWT, nem depende de Vault).

## 17. Riscos Restantes

O cron diário do lembrete (`send-financial-reminders-job`) precisou ser registrado manualmente pelo usuário via SQL Editor do painel Supabase (o Bash do Claude Code foi bloqueado pelo classificador de segurança ao tentar `cron.schedule` com um JWT embutido) — registrado com sucesso, confirmado ativo.

## 18. Git

Nenhum commit feito.

## 19. Regra de Parada

Nenhuma acionada.

## 20. Próxima Fase

Fase 14 (QA Sênior Completo).
