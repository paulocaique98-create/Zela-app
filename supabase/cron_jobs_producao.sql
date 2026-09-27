-- Jobs agendados (pg_cron) de PRODUÇÃO, só pra referência. NÃO é migração.
-- Ficam fora da linha de base porque apontam pro endereço de produção:
-- rodar isso num ambiente de testes faria ele chamar a produção.
-- Os tokens vêm do Vault via get_cron_secret(); nenhum segredo aqui.

SELECT cron.schedule('daily-reset-job', '0 3 * * *', '
    SELECT net.http_post(
      url:=''https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/daily-reset'',
      headers:=jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || public.get_cron_secret(''daily_reset_auth_key'')
      )
    );
  ');

SELECT cron.schedule('send-financial-reminders-job', '0 12 * * *', '
    SELECT net.http_post(
      url:=''https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/send-financial-reminders'',
      headers:=jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || public.get_cron_secret(''financial_reminders_auth_key'')
      )
    );
  ');

SELECT cron.schedule('check-attendance-delays-job', '*/5 * * * *', '
    SELECT net.http_post(
      url:=''https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/check-attendance-delays'',
      headers:=jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || public.get_cron_secret(''check_attendance_delays_auth_key'')
      )
    );
  ');
