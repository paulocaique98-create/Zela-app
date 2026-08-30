# Fase 15 — Testes de Carga

*Relatório escrito retroativamente na Fase 17 (Auditoria Final).*

## 1. Objetivo

Testar o módulo financeiro sob concorrência/rajada, e fechar o risco 6.11 do Plano de Segurança (Fase 4) — "DoS de baixo esforço" — que tinha ficado deliberadamente adiado.

## 2. Diagnóstico Inicial

Nenhuma Edge Function financeira tinha rate limit, apesar do risco já estar documentado desde a Fase 4. `create-financial-contract` (cria customer+subscription reais no Asaas) e `payment-webhook` (endpoint público) eram os dois pontos mais sensíveis.

## 3. Arquivos Auditados

`notify-families/index.ts` (padrão de rate limit já usado no projeto, via `check_rate_limit()`).

## 4. Arquivos Modificados/Criados

- `create-financial-contract/index.ts` — rate limit 20/5min por admin.
- `payment-webhook/index.ts` — rate limit 120/5min por escola.

## 5. Banco

Nenhuma migration — reaproveita `check_rate_limit()`/`rate_limit_attempts` já existentes.

## 6. Segurança

Fecha o risco 6.11 do Plano de Segurança da Fase 4 (estava documentado como aceito/adiado, não crítico — decidido implementar mesmo assim por segurança em profundidade).

## 7. Multi-Tenant

Rate limit de `payment-webhook` é por escola (`schoolId` resolvido pelo token, nunca por IP/global) — uma escola sob ataque nunca bloqueia as outras.

## 8. Gateway

N/A — rate limit não chama o Asaas.

## 9. Webhooks

Ver seção 6.

## 10. Recorrência

N/A.

## 11. PIX Copia e Cola

N/A.

## 12. Build

N/A — só Edge Functions.

## 13. Lint

`npm run lint` sem erros novos.

## 14. Testes

| Teste | Resultado |
|---|---|
| 10 requisições concorrentes ao `payment-webhook` (payloads distintos) | ✅ Todas gravaram, zero perda, zero duplicata |
| Mecanismo de rate limit isolado (chave de teste, limite 5) | ✅ Libera as 5 primeiras, bloqueia a partir da 6ª |
| `EXPLAIN ANALYZE` em `financial_charges` por `school_id` | ✅ Usa índice (`idx_financial_charges_school`), sem table scan |
| `EXPLAIN ANALYZE` em `financial_charges` por `gateway_payment_id` | ✅ Usa índice único, sub-milissegundo |

## 15. QA Sênior

Rajada concorrente real (10 processos `curl` simultâneos via `&`/`wait`), não simulada sequencialmente — validando de verdade que não há corrida na sincronização do webhook.

## 16. Problemas Encontrados

Nenhum bug — só a ausência de rate limit em si, que era o próprio objetivo da fase.

## 17. Riscos Restantes

Nenhum.

## 18. Git

Nenhum commit feito.

## 19. Regra de Parada

Nenhuma acionada.

## 20. Próxima Fase

Fase 16 (Validação em Sandbox).
