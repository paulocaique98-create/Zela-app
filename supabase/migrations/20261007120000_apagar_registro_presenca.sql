-- Apagar registro de entrada/saída (remoção lógica) pela Gestão e pela Gestão
-- Pedagógica, com motivo obrigatório e trilha em attendance_corrections.
--
-- Segurança:
--  * O registro NÃO é deletado: ganha deleted_at/deleted_by/deleted_reason.
--  * Uma policy RESTRICTIVE de SELECT esconde os removidos de todo cliente
--    (família, relatórios, horas extras, Realtime), sem mexer nas consultas.
--    service_role e as funções SECURITY DEFINER continuam enxergando.
--  * A função confere perfil, escola e motivo; não gera cobrança.

alter table public.attendance_logs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id) on delete set null,
  add column if not exists deleted_reason_code text,
  add column if not exists deleted_reason_detail text;

drop policy if exists "Registros removidos ficam ocultos" on public.attendance_logs;
create policy "Registros removidos ficam ocultos" on public.attendance_logs
  as restrictive for select to authenticated
  using (deleted_at is null);

create or replace function public.delete_attendance_log(
  p_log_id uuid, p_reason_code text, p_reason_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_log record;
  v_correction_id uuid;
  v_today boolean;
  v_latest record;
begin
  if coalesce(public.get_my_role(), '') not in ('gestao', 'gestao_pedagogica') then
    raise exception 'Só a Gestão ou a Coordenação podem apagar registros de presença';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo é obrigatório';
  end if;

  select * into v_log from attendance_logs where id = p_log_id for update;
  if not found or v_log.deleted_at is not null then
    raise exception 'Registro de presença não encontrado';
  end if;
  if v_log.school_id is distinct from public.get_my_school_id() then
    raise exception 'Registro não pertence à sua escola';
  end if;

  update attendance_logs set
    deleted_at = now(),
    deleted_by = auth.uid(),
    deleted_reason_code = p_reason_code,
    deleted_reason_detail = p_reason_detail
  where id = p_log_id;

  -- Correções pendentes desse registro perdem o sentido.
  update attendance_corrections set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where attendance_log_id = p_log_id and status = 'pending';

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, action_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) values (
    v_log.school_id, p_log_id, v_log.student_id, v_log.event_type, 'delete',
    v_log.event_time, null, p_reason_code, p_reason_detail,
    0, false, auth.uid(), 'applied'
  )
  returning id into v_correction_id;

  -- Se era do dia de hoje, reajusta o painel do aluno com o que sobrou.
  v_today := (v_log.event_time at time zone 'America/Sao_Paulo')::date
           = (now() at time zone 'America/Sao_Paulo')::date;
  if v_today then
    select event_time into v_latest from attendance_logs
    where student_id = v_log.student_id and event_type = v_log.event_type
      and deleted_at is null
      and (event_time at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
    order by event_time desc limit 1;

    if v_log.event_type = 'entry' then
      update students set
        today_entry_at = v_latest.event_time,
        today_entry = (v_latest.event_time at time zone 'America/Sao_Paulo')::time
      where id = v_log.student_id;
    else
      update students set
        today_exit_at = v_latest.event_time,
        today_exit = (v_latest.event_time at time zone 'America/Sao_Paulo')::time
      where id = v_log.student_id;
    end if;
  end if;

  return jsonb_build_object('correction_id', v_correction_id, 'status', 'applied');
end;
$function$;

revoke execute on function public.delete_attendance_log(uuid, text, text) from public, anon;
grant execute on function public.delete_attendance_log(uuid, text, text) to authenticated;

-- As funções antigas passam a ignorar registros apagados (decidir "último do
-- dia", travar remoção de marcação, recusar correção de registro apagado).
-- Troca só o trecho necessário; se algum trecho não existir, a migration
-- inteira falha e nada é aplicado.
create or replace function pg_temp.trocar_trecho(p_fn regprocedure, p_de text, p_para text)
returns void
language plpgsql
as $function$
declare
  v_def text := pg_get_functiondef(p_fn);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'Trecho não encontrado em %: %', p_fn, p_de;
  end if;
  execute replace(v_def, p_de, p_para);
end;
$function$;

select pg_temp.trocar_trecho(
  'public._apply_attendance_correction(uuid, timestamp with time zone, text)'::regprocedure,
  'WHERE id = p_log_id FOR UPDATE;', 'WHERE id = p_log_id AND deleted_at IS NULL FOR UPDATE;');
select pg_temp.trocar_trecho(
  'public._apply_attendance_correction(uuid, timestamp with time zone, text)'::regprocedure,
  'WHERE al.student_id = v_log.student_id', 'WHERE al.deleted_at IS NULL AND al.student_id = v_log.student_id');
select pg_temp.trocar_trecho(
  'public._apply_attendance_manual_entry(uuid, uuid, text, timestamp with time zone, text, text)'::regprocedure,
  'WHERE al.student_id = p_student_id', 'WHERE al.deleted_at IS NULL AND al.student_id = p_student_id');
select pg_temp.trocar_trecho(
  'public.delete_stale_attendance_marking(uuid, text, text, text)'::regprocedure,
  'WHERE al.student_id = p_student_id', 'WHERE al.deleted_at IS NULL AND al.student_id = p_student_id');
select pg_temp.trocar_trecho(
  'public.request_attendance_correction(uuid, timestamp with time zone, text, text, integer, boolean, text)'::regprocedure,
  'from attendance_logs where id = p_log_id;', 'from attendance_logs where id = p_log_id and deleted_at is null;');
