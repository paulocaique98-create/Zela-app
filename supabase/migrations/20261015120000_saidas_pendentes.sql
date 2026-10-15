-- Saídas pendentes: alunos com entrada registrada num dia passado e sem saída
-- (esqueceram o check-out). Duas funções novas, sem tabela nova e sem mexer
-- em RLS/policies. Nada é apagado.
--
--  * list_saidas_pendentes(p_date): lista os alunos do dia (padrão: ontem,
--    fuso de Brasília). Visível para admin (Recepção), gestao,
--    gestao_pedagogica e teacher ativo (professora só vê as turmas dela).
--    Sempre filtrada pela escola de quem chama.
--  * lancar_saida_pendente(...): lança a saída esquecida. admin e
--    gestao_pedagogica: se a saída gera cobrança (hora extra) fica 'pending'
--    até a Gestão aprovar; senão é aplicada na hora. gestao: aplica na hora
--    sempre (fica 'approved' quando gera cobrança). O "gera cobrança" é
--    calculado AQUI (attendance_charge_cents), nunca confiado ao navegador.
--    Trilha completa em attendance_corrections (mesma tabela das Correções).

create or replace function public.list_saidas_pendentes(p_date date default null)
returns table (
  student_id uuid,
  student_name text,
  turma text,
  entry_log_id uuid,
  entry_time timestamptz,
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
  v_day date := coalesce(p_date, (now() at time zone 'America/Sao_Paulo')::date - 1);
begin
  if v_school is null then
    raise exception 'Sem escola associada';
  end if;
  if v_role not in ('admin', 'gestao', 'gestao_pedagogica')
     and not (v_role = 'teacher' and public.get_my_teacher_status() = 'ativo') then
    raise exception 'Sem permissão para ver saídas pendentes';
  end if;
  -- Só dias já encerrados: hoje o aluno ainda pode estar na escola.
  if v_day >= v_today then
    raise exception 'Informe um dia anterior a hoje';
  end if;

  return query
  with ultimo as (
    select distinct on (al.student_id)
      al.student_id, al.id, al.event_type, al.event_time, al.performed_by_name
    from attendance_logs al
    where al.student_id in (select st.id from students st where st.school_id = v_school)
      and al.deleted_at is null
      and (al.event_time at time zone 'America/Sao_Paulo')::date = v_day
    order by al.student_id, al.event_time desc, al.id desc
  )
  select
    s.id,
    s.name,
    s.turma,
    u.id,
    u.event_time,
    u.performed_by_name,
    exists (
      select 1 from attendance_corrections ac
      where ac.student_id = s.id
        and ac.school_id = v_school
        and ac.event_type = 'exit'
        and ac.status = 'pending'
        and (ac.new_event_time at time zone 'America/Sao_Paulo')::date = v_day
    )
  from ultimo u
  join students s on s.id = u.student_id
  where u.event_type = 'entry'
    and s.school_id = v_school
    and (v_role <> 'teacher' or s.turma = any(coalesce(public.get_my_turmas(), '{}'::text[])))
  order by s.turma nulls last, s.name;
end;
$function$;

create or replace function public.lancar_saida_pendente(
  p_student_id uuid,
  p_exit_time timestamptz,
  p_reason_code text,
  p_reason_detail text default null,
  p_minutes_delta integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce(public.get_my_role(), '');
  v_school uuid := public.get_my_school_id();
  v_student record;
  v_day date;
  v_last record;
  v_increases boolean;
  v_status text;
  v_log_id uuid;
  v_correction_id uuid;
begin
  if v_role not in ('admin', 'gestao', 'gestao_pedagogica') then
    raise exception 'Sem permissão para lançar saída';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo é obrigatório';
  end if;
  if p_exit_time is null then
    raise exception 'Informe o horário';
  end if;

  -- Trava o aluno: duas pessoas lançando ao mesmo tempo não duplicam a saída.
  select * into v_student from students where id = p_student_id for update;
  if not found then
    raise exception 'Aluno não encontrado';
  end if;
  if v_student.school_id is distinct from v_school then
    raise exception 'Aluno não pertence à sua escola';
  end if;

  v_day := (p_exit_time at time zone 'America/Sao_Paulo')::date;
  if v_day >= (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A saída precisa ser de um dia anterior a hoje';
  end if;

  select al.event_type, al.event_time into v_last
  from attendance_logs al
  where al.student_id = p_student_id
    and al.deleted_at is null
    and (al.event_time at time zone 'America/Sao_Paulo')::date = v_day
  order by al.event_time desc, al.id desc
  limit 1;
  if not found or v_last.event_type <> 'entry' then
    raise exception 'Este aluno não tem entrada sem saída neste dia';
  end if;
  if p_exit_time <= v_last.event_time then
    raise exception 'A saída precisa ser depois da entrada';
  end if;
  if exists (
    select 1 from attendance_corrections ac
    where ac.student_id = p_student_id
      and ac.event_type = 'exit'
      and ac.status = 'pending'
      and (ac.new_event_time at time zone 'America/Sao_Paulo')::date = v_day
  ) then
    raise exception 'Já existe uma solicitação de saída aguardando aprovação para este dia';
  end if;

  v_increases := public.attendance_charge_cents(p_student_id, 'exit', p_exit_time) > 0;
  v_status := case
    when v_increases and v_role <> 'gestao' then 'pending'
    when v_increases then 'approved'
    else 'applied'
  end;

  if v_status <> 'pending' then
    v_log_id := public._apply_attendance_manual_entry(
      v_student.school_id, p_student_id, 'exit', p_exit_time,
      p_reason_code, p_reason_detail
    );
  end if;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status,
    reviewed_by, reviewed_at
  ) values (
    v_student.school_id, v_log_id, p_student_id, 'exit',
    null, p_exit_time, p_reason_code, p_reason_detail,
    coalesce(p_minutes_delta, 0), v_increases, auth.uid(), v_status,
    case when v_status = 'approved' then auth.uid() end,
    case when v_status = 'approved' then now() end
  )
  returning id into v_correction_id;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$;

revoke all on function public.list_saidas_pendentes(date) from public, anon;
grant execute on function public.list_saidas_pendentes(date) to authenticated, service_role;
revoke all on function public.lancar_saida_pendente(uuid, timestamptz, text, text, integer) from public, anon;
grant execute on function public.lancar_saida_pendente(uuid, timestamptz, text, text, integer) to authenticated, service_role;
