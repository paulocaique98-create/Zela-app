-- Ao apagar um registro de hoje, o status do aluno (in_school / left / idle)
-- também precisa voltar ao que os registros restantes dizem. Antes só os
-- horários eram recalculados e o aluno ficava em "Já saiu".
--
-- Regra: último registro não apagado de hoje define o status (entrada =
-- in_school, saída = left); sem registro nenhum = idle.

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
  'public.delete_attendance_log(uuid, text, text)'::regprocedure,
  $$  return jsonb_build_object('correction_id', v_correction_id, 'status', 'applied');$$,
  $$  if v_today then
    update students set status = coalesce((
      select case al.event_type when 'entry' then 'in_school' else 'left' end
      from attendance_logs al
      where al.student_id = v_log.student_id and al.deleted_at is null
        and (al.event_time at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
      order by al.event_time desc limit 1
    ), 'idle') where id = v_log.student_id;
  end if;

  return jsonb_build_object('correction_id', v_correction_id, 'status', 'applied');$$);

-- Conserta quem já teve registro apagado hoje (antes desta correção).
update students s set status = coalesce((
  select case al.event_type when 'entry' then 'in_school' else 'left' end
  from attendance_logs al
  where al.student_id = s.id and al.deleted_at is null
    and (al.event_time at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
  order by al.event_time desc limit 1
), 'idle')
where s.id in (
  select student_id from attendance_logs
  where deleted_at is not null
    and (deleted_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
    and (event_time at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
);
