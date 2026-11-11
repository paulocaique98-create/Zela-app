-- Pendências de ponto por PERÍODO (de/até), em vez de um dia só.
-- Aditivo: list_pendencias_ponto(date) e list_saidas_pendentes(date) seguem
-- iguais. Mesma classificação (entrada x saída pelo limite da escola) e mesmas
-- permissões; devolve também o dia de cada pendência. Máximo de 31 dias.
-- Só dias já encerrados (até ontem). Sem tabela nova, sem mexer em RLS.

create or replace function public.list_pendencias_ponto_periodo(p_from date, p_to date)
returns table (
  dia date,
  kind text,
  student_id uuid,
  student_name text,
  turma text,
  log_id uuid,
  event_time timestamptz,
  recorded_by_name text,
  awaiting_approval boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce(public.get_my_role(), '');
  v_school uuid := public.get_my_school_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_school is null then
    raise exception 'Sem escola associada';
  end if;
  if v_role not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica')
     and not (v_role = 'teacher' and public.get_my_teacher_status() = 'ativo') then
    raise exception 'Sem permissão para ver pendências';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Período inválido';
  end if;
  if p_to >= v_today then
    raise exception 'Informe dias anteriores a hoje';
  end if;
  if p_to - p_from > 30 then
    raise exception 'O período pode ter no máximo 31 dias';
  end if;

  return query
  with dias as (
    select
      al.student_id as sid,
      (al.event_time at time zone 'America/Sao_Paulo')::date as d,
      count(*) as n,
      (array_agg(al.id order by al.event_time desc, al.id desc))[1] as last_id,
      (array_agg(al.event_type order by al.event_time desc, al.id desc))[1] as last_type,
      (array_agg(al.event_time order by al.event_time desc, al.id desc))[1] as last_time,
      (array_agg(al.performed_by_name order by al.event_time desc, al.id desc))[1] as by_name
    from attendance_logs al
    where al.student_id in (select st.id from students st where st.school_id = v_school)
      and al.deleted_at is null
      and (al.event_time at time zone 'America/Sao_Paulo')::date between p_from and p_to
    group by al.student_id, (al.event_time at time zone 'America/Sao_Paulo')::date
  )
  select
    x.d,
    case
      when x.n = 1
           and public._limite_entrada(v_school, s.contracted_entry_time) is not null
           and (x.last_time at time zone 'America/Sao_Paulo')::time
               >= public._limite_entrada(v_school, s.contracted_entry_time)
      then 'entrada'
      else 'saida'
    end,
    s.id,
    s.name,
    s.turma,
    x.last_id,
    x.last_time,
    x.by_name,
    exists (
      select 1 from attendance_corrections ac
      where ac.student_id = s.id
        and ac.school_id = v_school
        and ac.event_type = 'exit'
        and ac.status = 'pending'
        and (ac.new_event_time at time zone 'America/Sao_Paulo')::date = x.d
    )
  from dias x
  join students s on s.id = x.sid
  where x.last_type = 'entry'
    and s.school_id = v_school
    and (v_role <> 'teacher' or s.turma = any(coalesce(public.get_my_turmas(), '{}'::text[])))
  order by x.d, s.turma nulls last, s.name;
end;
$function$;

revoke all on function public.list_pendencias_ponto_periodo(date, date) from public, anon;
grant execute on function public.list_pendencias_ponto_periodo(date, date) to authenticated, service_role;
