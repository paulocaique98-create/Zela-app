-- Auditoria de segurança (27/09/2026) · item 12. Provado em teste
-- (src/test/errorLogAbuse.test.js).
--
-- log_error é chamável sem login (o app registra erro antes do login
-- também), mas aceitava qualquer severidade e qualquer escola/usuário:
-- sem login dava pra gravar 'critical' (dispara push pros
-- desenvolvedores via notify_critical_error_log) e "sujar" o Portal do Dev
-- de qualquer escola.
--
-- Agora, pra quem não é o servidor (service_role):
--   - 'critical' só vale pra equipe da escola (admin/gestao/developer) --
--     uso real: falha ao gravar presença no check-in (App.jsx);
--   - escola, usuário e perfil vêm da SESSÃO, não da chamada;
--   - sem login: limite de 60 registros por minuto por IP.

create or replace function public.log_error(
  p_source text, p_category text, p_message text, p_severity text default 'error',
  p_stack text default null, p_context jsonb default null, p_school_id uuid default null,
  p_user_id uuid default null, p_role text default null, p_url text default null,
  p_user_agent text default null, p_screen text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source text := lower(coalesce(p_source, ''));
  v_severity text := lower(coalesce(p_severity, 'error'));
  v_message text := left(coalesce(p_message, '(sem mensagem)'), 2000);
  v_stack text := left(p_stack, 8000);
  v_category text := left(coalesce(p_category, 'unknown'), 200);
  v_school_id uuid := p_school_id;
  v_user_id uuid := p_user_id;
  v_role text := p_role;
  v_is_server boolean := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role';
  v_ip text;
  v_fingerprint text;
  v_id uuid;
begin
  if v_source not in ('client', 'edge_function', 'cron', 'business', 'face_recognition') then
    v_source := 'client';
  end if;
  if v_severity not in ('warn', 'error', 'critical') then
    v_severity := 'error';
  end if;

  if not v_is_server then
    v_user_id := auth.uid();
    v_role := public.get_my_role();
    v_school_id := public.get_my_school_id();

    if v_severity = 'critical' and coalesce(v_role, '') not in ('admin', 'gestao', 'developer') then
      v_severity := 'error';
    end if;

    if auth.uid() is null then
      v_ip := split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', 'desconhecido'), ',', 1);
      if not public.check_rate_limit('log_error:anon:' || trim(v_ip), 60, 60) then
        return null;
      end if;
    end if;
  end if;

  v_fingerprint := md5(v_source || '|' || v_category || '|' || left(v_message, 300));

  insert into public.error_logs (
    source, category, severity, message, stack, context,
    school_id, user_id, role, url, user_agent, screen, fingerprint
  )
  values (
    v_source, v_category, v_severity, v_message, v_stack, p_context,
    v_school_id, v_user_id, v_role, p_url, p_user_agent, p_screen, v_fingerprint
  )
  on conflict (fingerprint) where not resolved
  do update set
    occurrences = public.error_logs.occurrences + 1,
    last_seen_at = now(),
    context = coalesce(excluded.context, public.error_logs.context),
    school_id = coalesce(excluded.school_id, public.error_logs.school_id),
    screen = coalesce(excluded.screen, public.error_logs.screen)
  returning id into v_id;

  return v_id;
end;
$function$;
