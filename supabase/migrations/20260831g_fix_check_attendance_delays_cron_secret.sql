-- P1.4 (Prompt Mestre de Evolução) — check-attendance-delays-job (jobid=1)
-- tinha a service_role key REAL em texto puro dentro de cron.job.command
-- desde a criação (visível pra qualquer um com acesso de leitura ao
-- banco, ex.: via `supabase db query` ou o SQL Editor do painel).
--
-- A function em si já esperava exatamente esse valor como Authorization
-- (comparação direta contra SUPABASE_SERVICE_ROLE_KEY, não um segredo
-- customizado) — não foi alterada. Só o CAMINHO de como o cron entrega
-- esse valor mudou: a mesma service_role key foi gravada em
-- `cron_secrets` (nome `check_attendance_delays_auth_key`) via RPC
-- autenticado (set_cron_secret, o único caminho comprovadamente confiável
-- neste projeto pra Vault), e o comando do cron passou a ler via
-- `public.get_cron_secret(...)` — nenhum segredo em texto puro no comando
-- a partir de agora.
--
-- Testado ao vivo: a execução natural seguinte do job (roda a cada 5 min)
-- retornou 200, confirmando que a nova leitura funciona igual à antiga.

SELECT cron.alter_job(
  job_id := 1,
  command := $cmd$
    SELECT net.http_post(
      url:='https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/check-attendance-delays',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_cron_secret('check_attendance_delays_auth_key')
      )
    );
  $cmd$
);
