-- P0.5 (Prompt Mestre de Evolução) — Corrige send-financial-reminders-job
-- (jobid=4).
--
-- Problema encontrado durante o P0.1: o comando do cron tinha o placeholder
-- literal "<SUA_SERVICE_ROLE_KEY_AQUI>" no Authorization — nunca foi
-- preenchido de fato. O job rodava todo dia às 9h UTC (6h BRT) e falhava
-- com 401 silenciosamente desde que foi criado (Fase 13); nenhum lembrete
-- de cobrança "vence em 2 dias" jamais foi enviado de verdade em produção
-- por este caminho.
--
-- A função send-financial-reminders foi desenhada (Fase 13) pra NÃO
-- depender de um segredo customizado lido do Vault dentro do cron — ela
-- confia na verificação de assinatura de JWT do próprio gateway do
-- Supabase (verify_jwt=true) e só checa se o `role` do token é
-- 'service_role'. Ou seja, o Authorization precisa ser a service_role key
-- REAL, não um segredo qualquer.
--
-- Correção: a service_role key real foi gravada em `cron_secrets` (nome
-- 'financial_reminders_auth_key') via RPC autenticado (set_cron_secret) —
-- nunca em texto puro no comando do cron — e o comando passou a ler via
-- public.get_cron_secret('financial_reminders_auth_key'), mesmo padrão já
-- usado no daily-reset-job.
--
-- Também corrigido: schedule estava '0 9 * * *' (6h da manhã no Brasil,
-- fora de horário comercial pra um lembrete financeiro) — trocado para
-- '0 12 * * *' (9h BRT).
--
-- Testado: chamada direta à função (mesma auth) retornou
-- 200 {"success":true,"total":0,"reminded":0} — sem efeito colateral real,
-- porque não havia nenhuma cobrança com vencimento em 2 dias no momento do
-- teste (confirmado por query antes de disparar). Não foi possível testar
-- via net.http_post dentro do SQL do cron (bloqueado pelo classificador de
-- ações do Claude Code, por ser um envio potencialmente irreversível a
-- famílias reais) — o teste via chamada HTTP direta à Edge Function cobre
-- o mesmo caminho de autenticação.

SELECT cron.alter_job(
  job_id := 4,
  schedule := '0 12 * * *',
  command := $cmd$
    SELECT net.http_post(
      url:='https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/send-financial-reminders',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_cron_secret('financial_reminders_auth_key')
      )
    );
  $cmd$
);
