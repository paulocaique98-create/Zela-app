# Observabilidade — como consultar os logs (P1.5)

## O que existe hoje

Não há painel visual nem alerta automático (fora do escopo mínimo do
P1.5) — a observabilidade é feita por **consulta direta** a 3 tabelas,
todas restritas a `developer` via RLS:

| Tabela | O que registra | Quem grava |
|---|---|---|
| `client_error_logs` | Erros do frontend (React Error Boundary) | `src/lib/errorLogger.js`, client-side |
| `cron_job_logs` | Execução dos jobs agendados (`daily-reset-job` por enquanto) | `log_cron_job_run()`, via RPC pela própria Edge Function |
| `edge_function_logs` | Erros das Edge Functions financeiras críticas | `log_edge_function_error()`, via RPC pela própria Edge Function |

## Como consultar (SQL Editor do painel Supabase, ou `supabase db query --linked`)

### Erros recentes de Edge Functions (últimas 24h)
```sql
SELECT function_name, level, message, context, school_id, created_at
FROM edge_function_logs
WHERE created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```

### Erros por função (pra ver se algum ponto específico está concentrando falha)
```sql
SELECT function_name, count(*) AS total_erros, max(created_at) AS ultimo
FROM edge_function_logs
WHERE created_at > now() - interval '7 days'
GROUP BY function_name
ORDER BY total_erros DESC;
```

### O `daily-reset-job` rodou hoje?
```sql
SELECT * FROM cron_job_logs
WHERE job_name = 'daily-reset-job'
ORDER BY ran_at DESC LIMIT 1;
-- Se ran_at não for de hoje, ou success=false, o reset não rodou/falhou.
```

### Erros do frontend recentes
```sql
SELECT message, url, user_id, created_at
FROM client_error_logs
ORDER BY created_at DESC LIMIT 20;
```

## Cobertura atual — o que NÃO está instrumentado ainda

As Edge Functions financeiras mais críticas (`payment-webhook`,
`create-avulsa-charge`, `create-financial-contract`,
`send-financial-reminders`) logam erro em `edge_function_logs`. As
demais Edge Functions do projeto (cadastro de usuário, chat, IA de
cardápio/calendário, etc.) ainda não — se algum dia isso virar recorrente
o suficiente pra doer, é só reaproveitar
`supabase/functions/_shared/logEdgeError.ts` no `catch` de cada uma
(mesmo padrão usado nas 4 já cobertas).

## Alerta automático

Não existe (fora do escopo mínimo do P1.5 — nenhuma integração de
e-mail/Slack/etc.). A rotina recomendada, por enquanto, é manual: rodar a
query "Erros recentes de Edge Functions" periodicamente, ou sempre que um
usuário reportar um comportamento estranho no fluxo financeiro.
