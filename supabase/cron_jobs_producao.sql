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

-- Biblioteca: aviso diário às 11h UTC (8h em Brasília). Agendado em produção em 29/10/2026.
SELECT cron.schedule('notify-biblioteca-prazos-job', '0 11 * * *', '
    SELECT net.http_post(
      url:=''https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/notify-biblioteca-prazos'',
      headers:=jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || public.get_cron_secret(''financial_reminders_auth_key'')
      )
    );
  ');

-- Captação (LGPD): anonimiza lead perdido há mais de 12 meses, todo dia às 6h UTC (3h em Brasília).
-- Chama a função SQL direto (sem HTTP). Mantém etapa, origem e datas para o funil.
SELECT cron.schedule('leads-anonimizar-perdidos-job', '0 6 * * *', '
    SELECT public.leads_anonimizar_perdidos();
  ');

-- Bolsas (LGPD, D11): apaga documentos de renda 12 meses depois do fim da bolsa, todo dia às 6h30 UTC.
SELECT cron.schedule('purge-scholarship-documents-job', '30 6 * * *', '
    SELECT net.http_post(
      url:=''https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/purge-scholarship-documents'',
      headers:=jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || public.get_cron_secret(''financial_reminders_auth_key'')
      )
    );
  ');

-- Régua de cobrança (item 14): de hora em hora; a função confere o horário permitido de cada escola (Brasília).
SELECT cron.schedule('run-billing-rules-job', '0 * * * *', '
    SELECT net.http_post(
      url:=''https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/run-billing-rules'',
      headers:=jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || public.get_cron_secret(''financial_reminders_auth_key'')
      )
    );
  ');
