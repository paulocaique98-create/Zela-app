-- Pendências inteligentes: entrada pendente x saída pendente.
--
-- Problema: um aluno com UM único registro no dia, feito à tarde (ex.: 18h09),
-- aparecia como "saída pendente" porque o registro foi gravado como 'entry'.
-- Na prática falta a ENTRADA (o registro das 18h09 é a saída).
--
-- Solução (aditiva, nada é apagado, RLS existente intocada):
--  * school_attendance_rules: regra da escola (1 linha por escola) com o
--    "horário limite de entrada". RLS: lê quem é da escola e da equipe;
--    altera só quem gerencia as configurações da escola.
--  * _limite_entrada(): limite do aluno = horário de entrada contratado +
--    N horas; sem horário contratado usa o horário fixo da escola; sem regra
--    nenhuma devolve null (comportamento antigo: tudo vira saída pendente).
--  * list_pendencias_ponto(p_date): devolve kind = 'saida' | 'entrada'.
--    'entrada' = só um registro no dia, 'entry', feito a partir do limite.
--  * list_saidas_pendentes(): mesma assinatura de antes, agora só kind='saida'.
--  * lancar_entrada_pendente(): lança a entrada que faltou e corrige o tipo do
--    registro único para 'exit', com trilha em attendance_corrections. Se gerar
--    cobrança, só a Gestão lança (o cálculo é feito aqui, no servidor).

-- ─── Regra da escola ───────────────────────────────────────────────────────
create table if not exists public.school_attendance_rules (
  school_id uuid primary key references public.schools(id) on delete cascade,
  entry_limit_hours numeric(4,2)
    check (entry_limit_hours is null or (entry_limit_hours >= 0 and entry_limit_hours <= 24)),
  entry_limit_fixed time without time zone,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.school_attendance_rules enable row level security;

drop policy if exists school_attendance_rules_select on public.school_attendance_rules;
create policy school_attendance_rules_select on public.school_attendance_rules
  for select to authenticated
  using (
    school_id = public.get_my_school_id()
    and coalesce(public.get_my_role(), '') in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica')
  );

drop policy if exists school_attendance_rules_insert on public.school_attendance_rules;
create policy school_attendance_rules_insert on public.school_attendance_rules
  for insert to authenticated
  with check (school_id = public.get_my_school_id() and public.can_manage_school_settings());

drop policy if exists school_attendance_rules_update on public.school_attendance_rules;
create policy school_attendance_rules_update on public.school_attendance_rules
  for update to authenticated
  using (school_id = public.get_my_school_id() and public.can_manage_school_settings())
  with check (school_id = public.get_my_school_id() and public.can_manage_school_settings());

revoke all on public.school_attendance_rules from anon;
grant select, insert, update on public.school_attendance_rules to authenticated;
grant all on public.school_attendance_rules to service_role;

-- ─── Limite de entrada do aluno ────────────────────────────────────────────
create or replace function public._limite_entrada(p_school uuid, p_contracted time without time zone)
returns time without time zone
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_min numeric;
begin
  select entry_limit_hours, entry_limit_fixed into r
  from school_attendance_rules where school_id = p_school;
  if not found then
    return null;
  end if;
  if r.entry_limit_hours is not null and p_contracted is not null then
    v_min := extract(epoch from p_contracted) / 60 + r.entry_limit_hours * 60;
    if v_min >= 1440 then
      return time '23:59:59';
    end if;
    return (make_interval(mins => round(v_min)::int))::time;
  end if;
  return r.entry_limit_fixed;
end;
$function$;

revoke all on function public._limite_entrada(uuid, time without time zone) from public, anon, authenticated;
grant execute on function public._limite_entrada(uuid, time without time zone) to service_role;

-- ─── Lista unificada de pendências do dia ──────────────────────────────────
create or replace function public.list_pendencias_ponto(p_date date default null)
returns table (
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
  v_day date := coalesce(p_date, (now() at time zone 'America/Sao_Paulo')::date - 1);
begin
  if v_school is null then
    raise exception 'Sem escola associada';
  end if;
  if v_role not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica')
     and not (v_role = 'teacher' and public.get_my_teacher_status() = 'ativo') then
    raise exception 'Sem permissão para ver pendências';
  end if;
  if v_day >= v_today then
    raise exception 'Informe um dia anterior a hoje';
  end if;

  return query
  with dia as (
    select
      al.student_id as sid,
      count(*) as n,
      (array_agg(al.id order by al.event_time desc, al.id desc))[1] as last_id,
      (array_agg(al.event_type order by al.event_time desc, al.id desc))[1] as last_type,
      (array_agg(al.event_time order by al.event_time desc, al.id desc))[1] as last_time,
      (array_agg(al.performed_by_name order by al.event_time desc, al.id desc))[1] as by_name
    from attendance_logs al
    where al.student_id in (select st.id from students st where st.school_id = v_school)
      and al.deleted_at is null
      and (al.event_time at time zone 'America/Sao_Paulo')::date = v_day
    group by al.student_id
  )
  select
    case
      when d.n = 1
           and public._limite_entrada(v_school, s.contracted_entry_time) is not null
           and (d.last_time at time zone 'America/Sao_Paulo')::time
               >= public._limite_entrada(v_school, s.contracted_entry_time)
      then 'entrada'
      else 'saida'
    end,
    s.id,
    s.name,
    s.turma,
    d.last_id,
    d.last_time,
    d.by_name,
    exists (
      select 1 from attendance_corrections ac
      where ac.student_id = s.id
        and ac.school_id = v_school
        and ac.event_type = 'exit'
        and ac.status = 'pending'
        and (ac.new_event_time at time zone 'America/Sao_Paulo')::date = v_day
    )
  from dia d
  join students s on s.id = d.sid
  where d.last_type = 'entry'
    and s.school_id = v_school
    and (v_role <> 'teacher' or s.turma = any(coalesce(public.get_my_turmas(), '{}'::text[])))
  order by s.turma nulls last, s.name;
end;
$function$;

revoke all on function public.list_pendencias_ponto(date) from public, anon;
grant execute on function public.list_pendencias_ponto(date) to authenticated, service_role;

-- ─── Saídas pendentes: mesma assinatura, agora só as de verdade ───────────
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
begin
  return query
  select p.student_id, p.student_name, p.turma, p.log_id, p.event_time,
         p.recorded_by_name, p.awaiting_approval
  from public.list_pendencias_ponto(p_date) p
  where p.kind = 'saida';
end;
$function$;

revoke all on function public.list_saidas_pendentes(date) from public, anon;
grant execute on function public.list_saidas_pendentes(date) to authenticated, service_role;

-- ─── Lançar a entrada que faltou ───────────────────────────────────────────
create or replace function public.lancar_entrada_pendente(
  p_student_id uuid,
  p_entry_time timestamptz,
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
  v_n integer;
  v_log record;
  v_limite time;
  v_increases boolean;
  v_status text;
  v_new_log_id uuid;
begin
  if v_role not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica') then
    raise exception 'Sem permissão para lançar entrada';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo é obrigatório';
  end if;
  if p_entry_time is null then
    raise exception 'Informe o horário';
  end if;

  select * into v_student from students where id = p_student_id for update;
  if not found then
    raise exception 'Aluno não encontrado';
  end if;
  if v_student.school_id is distinct from v_school then
    raise exception 'Aluno não pertence à sua escola';
  end if;

  v_day := (p_entry_time at time zone 'America/Sao_Paulo')::date;
  if v_day >= (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A entrada precisa ser de um dia anterior a hoje';
  end if;

  select count(*) into v_n
  from attendance_logs al
  where al.student_id = p_student_id
    and al.deleted_at is null
    and (al.event_time at time zone 'America/Sao_Paulo')::date = v_day;

  select al.id, al.event_type, al.event_time into v_log
  from attendance_logs al
  where al.student_id = p_student_id
    and al.deleted_at is null
    and (al.event_time at time zone 'America/Sao_Paulo')::date = v_day
  order by al.event_time desc, al.id desc
  limit 1;

  -- Reconfere no servidor: único registro do dia, 'entry', a partir do limite.
  v_limite := public._limite_entrada(v_school, v_student.contracted_entry_time);
  if v_n <> 1 or v_log.id is null or v_log.event_type <> 'entry'
     or v_limite is null
     or (v_log.event_time at time zone 'America/Sao_Paulo')::time < v_limite then
    raise exception 'Este aluno não tem entrada pendente neste dia';
  end if;
  if p_entry_time >= v_log.event_time then
    raise exception 'A entrada precisa ser antes do registro das %',
      to_char(v_log.event_time at time zone 'America/Sao_Paulo', 'HH24:MI');
  end if;

  -- Cobrança calculada aqui, nunca confiada ao navegador. Só a Gestão aprova
  -- o que gera hora extra (a saída passa a ser o registro existente).
  v_increases := (
    public.attendance_charge_cents(p_student_id, 'entry', p_entry_time)
    + public.attendance_charge_cents(p_student_id, 'exit', v_log.event_time)
  ) > 0;
  if v_increases and v_role <> 'gestao' then
    raise exception 'Este lançamento gera cobrança de hora extra. Peça para a Gestão lançar.';
  end if;
  v_status := case when v_increases then 'approved' else 'applied' end;

  v_new_log_id := public._apply_attendance_manual_entry(
    v_school, p_student_id, 'entry', p_entry_time, p_reason_code, p_reason_detail
  );

  -- O registro único do dia era, de fato, a saída: corrige o tipo (hora mantida).
  update attendance_logs
  set event_type = 'exit',
      corrected = true,
      correction_reason_code = p_reason_code,
      correction_reason_detail = p_reason_detail,
      corrected_by = auth.uid(),
      corrected_at = now()
  where id = v_log.id;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status,
    reviewed_by, reviewed_at
  ) values (
    v_school, v_new_log_id, p_student_id, 'entry',
    null, p_entry_time, p_reason_code, p_reason_detail,
    coalesce(p_minutes_delta, 0), v_increases, auth.uid(), v_status,
    case when v_status = 'approved' then auth.uid() end,
    case when v_status = 'approved' then now() end
  );

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, new_event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status,
    reviewed_by, reviewed_at, action_type
  ) values (
    v_school, v_log.id, p_student_id, 'entry', 'exit',
    v_log.event_time, v_log.event_time, p_reason_code, p_reason_detail,
    0, false, auth.uid(), v_status,
    case when v_status = 'approved' then auth.uid() end,
    case when v_status = 'approved' then now() end,
    'edit'
  );

  return jsonb_build_object('status', v_status, 'entry_log_id', v_new_log_id);
end;
$function$;

revoke all on function public.lancar_entrada_pendente(uuid, timestamptz, text, text, integer) from public, anon;
grant execute on function public.lancar_entrada_pendente(uuid, timestamptz, text, text, integer) to authenticated, service_role;
