-- Correção de presença: o servidor decide se a correção aumenta a cobrança.
--
-- Antes, request_attendance_correction/request_attendance_manual_entry
-- confiavam em p_increases_billing, que vinha da TELA: quem pedia a
-- correção decidia se ela ia pra aprovação da Gestão ou era aplicada na
-- hora. Provado em teste (src/test/correctionBillingServerSide.test.js):
-- correção que aumentava a cobrança era aplicada na hora.
--
-- Agora o servidor calcula o valor ANTES e DEPOIS com
-- attendance_charge_cents(), cópia fiel de calcularHorasExtras/
-- calcularEntradaAntecipada (src/utils/attendanceUtils.js) -- paridade
-- conferida em teste. A informação da tela só pode deixar mais rígido
-- (OR), nunca afrouxar. Troca de tipo (entrada <-> saída) sempre vai pra
-- aprovação. Qualquer ajuste na regra de cobrança precisa ser espelhado
-- aqui, em attendanceUtils.js e em supabase/functions/_shared/extraHours.ts.

create or replace function public.attendance_charge_cents(p_student_id uuid, p_event_type text, p_event_time timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_student record;
  v_cfg jsonb;
  v_tolerance integer;
  v_rate integer;
  v_charge_early boolean;
  v_local_date date;
  v_day_key text;
  v_override jsonb;
  v_contracted text;
  v_contracted_at timestamptz;
  v_diff_min integer;
begin
  if p_event_time is null then
    return 0;
  end if;

  select s.contracted_entry_time, s.contracted_exit_time, s.weekly_schedule, s.isento_hora_extra, sc.billing_config
  into v_student
  from students s join schools sc on sc.id = s.school_id
  where s.id = p_student_id;
  if not found or coalesce(v_student.isento_hora_extra, false) then
    return 0;
  end if;

  v_cfg := jsonb_build_object(
    'early_checkin_tolerance_min', 5, 'late_checkout_tolerance_min', 15,
    'hourly_rate_cents', 3000, 'charge_early_checkin', true
  ) || coalesce(v_student.billing_config, '{}'::jsonb);
  v_rate := (v_cfg->>'hourly_rate_cents')::integer;

  v_local_date := (p_event_time at time zone 'America/Sao_Paulo')::date;
  v_day_key := (array['domingo','segunda','terca','quarta','quinta','sexta','sabado'])[extract(dow from v_local_date)::int + 1];
  v_override := case when jsonb_typeof(v_student.weekly_schedule) = 'object' then v_student.weekly_schedule -> v_day_key end;

  if p_event_type = 'exit' then
    v_tolerance := (v_cfg->>'late_checkout_tolerance_min')::integer;
    if v_override is not null and coalesce(v_override->>'entry', '') <> '' and coalesce(v_override->>'exit', '') <> '' then
      v_contracted := left(v_override->>'exit', 5);
    else
      v_contracted := left(v_student.contracted_exit_time::text, 5);
    end if;
    if v_contracted is null then
      return 0;
    end if;
    v_contracted_at := (v_local_date::text || ' ' || v_contracted || ':00-03:00')::timestamptz;
    v_diff_min := floor(extract(epoch from (p_event_time - v_contracted_at)) / 60);
  elsif p_event_type = 'entry' then
    if not coalesce((v_cfg->>'charge_early_checkin')::boolean, true) then
      return 0;
    end if;
    v_tolerance := (v_cfg->>'early_checkin_tolerance_min')::integer;
    if v_override is not null and coalesce(v_override->>'entry', '') <> '' and coalesce(v_override->>'exit', '') <> '' then
      v_contracted := left(v_override->>'entry', 5);
    else
      v_contracted := left(v_student.contracted_entry_time::text, 5);
    end if;
    if v_contracted is null then
      return 0;
    end if;
    v_contracted_at := (v_local_date::text || ' ' || v_contracted || ':00-03:00')::timestamptz;
    v_diff_min := floor(extract(epoch from (v_contracted_at - p_event_time)) / 60);
  else
    return 0;
  end if;

  if v_diff_min <= v_tolerance then
    return 0;
  end if;
  return ceil(v_diff_min / 60.0)::integer * v_rate;
end;
$function$;

revoke execute on function public.attendance_charge_cents(uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.request_attendance_correction(
  p_log_id uuid, p_new_event_time timestamptz, p_reason_code text, p_reason_detail text,
  p_minutes_delta integer, p_increases_billing boolean, p_new_event_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_log record;
  v_correction_id uuid;
  v_status text;
  v_role text := coalesce(public.get_my_role(), '');
  v_final_type text;
  v_increases boolean;
begin
  if v_role not in ('admin', 'gestao') then
    raise exception 'Só administradores podem corrigir presença';
  end if;

  select * into v_log from attendance_logs where id = p_log_id;
  if not found then
    raise exception 'Registro de presença não encontrado';
  end if;
  if v_log.school_id is distinct from public.get_my_school_id() then
    raise exception 'Registro não pertence à sua escola';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo da correção é obrigatório';
  end if;
  if p_new_event_type is not null and p_new_event_type not in ('entry', 'exit') then
    raise exception 'Tipo de evento inválido';
  end if;
  if p_new_event_time is null then
    raise exception 'Informe o novo horário';
  end if;

  v_final_type := coalesce(p_new_event_type, v_log.event_type);
  v_increases := coalesce(p_increases_billing, true)
    or v_final_type <> v_log.event_type
    or public.attendance_charge_cents(v_log.student_id, v_final_type, p_new_event_time)
       > public.attendance_charge_cents(v_log.student_id, v_log.event_type, v_log.event_time);
  v_status := case when v_increases then 'pending' else 'applied' end;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, new_event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) values (
    v_log.school_id, p_log_id, v_log.student_id, v_log.event_type, p_new_event_type,
    v_log.event_time, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, v_increases, auth.uid(), v_status
  )
  returning id into v_correction_id;

  if v_status = 'applied' then
    perform public._apply_attendance_correction(p_log_id, p_new_event_time, p_new_event_type);
  end if;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$;

create or replace function public.request_attendance_manual_entry(
  p_student_id uuid, p_event_type text, p_new_event_time timestamptz, p_reason_code text,
  p_reason_detail text, p_minutes_delta integer, p_increases_billing boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student record;
  v_correction_id uuid;
  v_log_id uuid;
  v_status text;
  v_increases boolean;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' then
    raise exception 'Só administradores podem lançar presença manualmente';
  end if;
  if p_event_type is null or p_event_type not in ('entry', 'exit') then
    raise exception 'Tipo de evento inválido';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo é obrigatório';
  end if;
  if p_new_event_time is null then
    raise exception 'Informe o horário';
  end if;

  select * into v_student from students where id = p_student_id;
  if not found then
    raise exception 'Aluno não encontrado';
  end if;
  if v_student.school_id is distinct from public.get_my_school_id() then
    raise exception 'Aluno não pertence à sua escola';
  end if;

  -- Lançamento novo: "antes" não havia cobrança por esse registro.
  v_increases := coalesce(p_increases_billing, true)
    or public.attendance_charge_cents(p_student_id, p_event_type, p_new_event_time) > 0;
  v_status := case when v_increases then 'pending' else 'applied' end;

  if v_status = 'applied' then
    v_log_id := public._apply_attendance_manual_entry(
      v_student.school_id, p_student_id, p_event_type, p_new_event_time,
      p_reason_code, p_reason_detail
    );
  end if;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) values (
    v_student.school_id, v_log_id, p_student_id, p_event_type,
    null, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, v_increases, auth.uid(), v_status
  )
  returning id into v_correction_id;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$;
