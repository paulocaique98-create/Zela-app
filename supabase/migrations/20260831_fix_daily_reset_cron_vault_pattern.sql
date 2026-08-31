-- P0.1 (Prompt Mestre de Evolução) — Corrige daily-reset-job (jobid=2).
--
-- Problema: o comando do cron lia `vault.decrypted_secrets` direto numa
-- sessão de SQL solta (mesmo padrão que corrompe leitura de Vault, já
-- documentado na Fase 13 — ver 20260830d_add_cron_secrets_and_financial_reminders.sql).
-- O job nunca foi migrado para o padrão seguro (get_cron_secret via RPC),
-- mesmo depois da função `daily-reset` ter sido corrigida e testada.
--
-- Correção: troca a leitura direta de `vault.decrypted_secrets` por
-- `public.get_cron_secret('daily_reset_auth_key')` — mesma função
-- SECURITY DEFINER já usada com sucesso comprovado no fluxo de
-- school_gateway_accounts, chamada como função (não como leitura de tabela
-- solta). O valor do segredo foi rotacionado (novo DAILY_RESET_AUTH_KEY
-- gerado e gravado tanto no secret da Edge Function quanto em
-- `cron_secrets` via RPC autenticado, o único caminho comprovadamente
-- confiável para grava/ler Vault neste projeto).
--
-- Testado manualmente em produção após a alteração: chamada real do
-- net.http_post com este comando retornou 200
-- {"success":true,"studentsUpdated":53} — confirma que a leitura via
-- get_cron_secret() funciona onde a leitura direta de vault.decrypted_secrets
-- era instável.
--
-- Nota (achado durante esta correção, fora do escopo do P0.1): o job
-- send-financial-reminders-job (jobid=4) está com o placeholder literal
-- "<SUA_SERVICE_ROLE_KEY_AQUI>" no lugar do Authorization — nunca foi
-- preenchido de fato, então o job está rodando e sempre falhando com 401
-- silenciosamente desde que foi criado. Não corrigido nesta migration
-- (fora do escopo do P0.1, mas registrado aqui para não se perder).

SELECT cron.alter_job(
  job_id := 2,
  command := $cmd$
    SELECT net.http_post(
      url:='https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/daily-reset',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_cron_secret('daily_reset_auth_key')
      )
    );
  $cmd$
);
