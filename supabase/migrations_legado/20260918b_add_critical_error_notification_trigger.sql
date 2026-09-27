-- Fase E do PLANO_LOGGING_ERROS_PORTAL_DEV.md — fecha o gap documentado em
-- OBSERVABILIDADE.md ("não há alerta automático"). Dispara só quando uma
-- linha NOVA entra em error_logs com severity='critical' (não a cada
-- incremento de occurrences via ON CONFLICT DO UPDATE -- isso é um UPDATE,
-- não dispara trigger de INSERT), com rate-limit de 10 minutos entre
-- notificações pra não virar tempestade de push se várias coisas
-- quebrarem ao mesmo tempo.
ALTER TABLE public.error_logs ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.notify_critical_error_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_notified timestamptz;
BEGIN
  IF NEW.severity <> 'critical' THEN
    RETURN NEW;
  END IF;

  SELECT max(notified_at) INTO v_last_notified FROM public.error_logs WHERE notified_at IS NOT NULL;
  IF v_last_notified IS NOT NULL AND now() - v_last_notified < interval '10 minutes' THEN
    RETURN NEW; -- rate limitado: a linha é gravada normalmente, só não notifica
  END IF;

  NEW.notified_at := now();

  PERFORM net.http_post(
    url := 'https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/notify-critical-error',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_secret('notify_critical_error_auth_key')
    ),
    body := jsonb_build_object(
      'id', NEW.id, 'source', NEW.source, 'category', NEW.category,
      'message', NEW.message, 'school_id', NEW.school_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_critical_error ON public.error_logs;
CREATE TRIGGER trg_notify_critical_error
BEFORE INSERT ON public.error_logs
FOR EACH ROW EXECUTE FUNCTION public.notify_critical_error_log();
