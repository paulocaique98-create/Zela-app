-- Cobrança de hora extra geral no servidor: attendance_charge_cents passa a
-- respeitar billing_config.billing_mode. No modo 'general' devolve o valor
-- fechado do DIA (entrada antecipada + saída tardia acima da faixa única);
-- no 'individual' (padrão) o comportamento é idêntico ao anterior. Segue
-- sem execute para anon/authenticated (só as RPCs security definer chamam).
-- Depende de 20261014130000_billing_config_modo_geral.sql.

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
  v_entry_c text;
  v_exit_c text;
  v_entry_at timestamptz;
  v_exit_at timestamptz;
  v_total_min integer;
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
    'hourly_rate_cents', 3000, 'charge_early_checkin', true,
    'billing_mode', 'individual', 'general_tolerance_min', 30, 'general_charge_cents', 0
  ) || coalesce(v_student.billing_config, '{}'::jsonb);
  v_rate := (v_cfg->>'hourly_rate_cents')::integer;

  v_local_date := (p_event_time at time zone 'America/Sao_Paulo')::date;
  v_day_key := (array['domingo','segunda','terca','quarta','quinta','sexta','sabado'])[extract(dow from v_local_date)::int + 1];
  v_override := case when jsonb_typeof(v_student.weekly_schedule) = 'object' then v_student.weekly_schedule -> v_day_key end;

  -- Modo geral: o valor é do DIA. Soma minutos de entrada antecipada e de
  -- saída tardia (sem tolerância individual); se passar de
  -- general_tolerance_min, cobra general_charge_cents uma vez. O outro
  -- horário do dia vem de attendance_logs (primeira entrada / última saída,
  -- como agruparEventosPorDia no front). Espelha calcularCobrancaDoDia.
  if v_cfg->>'billing_mode' = 'general' then
    if p_event_type not in ('entry', 'exit') then
      return 0;
    end if;
    if v_override is not null and coalesce(v_override->>'entry', '') <> '' and coalesce(v_override->>'exit', '') <> '' then
      v_entry_c := left(v_override->>'entry', 5);
      v_exit_c := left(v_override->>'exit', 5);
    else
      v_entry_c := left(v_student.contracted_entry_time::text, 5);
      v_exit_c := left(v_student.contracted_exit_time::text, 5);
    end if;

    if p_event_type = 'entry' then
      v_entry_at := p_event_time;
      select max(l.event_time) into v_exit_at from attendance_logs l
      where l.student_id = p_student_id and l.event_type = 'exit' and l.deleted_at is null
        and (l.event_time at time zone 'America/Sao_Paulo')::date = v_local_date;
    else
      v_exit_at := p_event_time;
      select min(l.event_time) into v_entry_at from attendance_logs l
      where l.student_id = p_student_id and l.event_type = 'entry' and l.deleted_at is null
        and (l.event_time at time zone 'America/Sao_Paulo')::date = v_local_date;
    end if;

    v_total_min := 0;
    if v_entry_at is not null and v_entry_c is not null then
      v_total_min := v_total_min + greatest(0, floor(extract(epoch from ((v_local_date::text || ' ' || v_entry_c || ':00-03:00')::timestamptz - v_entry_at)) / 60)::integer);
    end if;
    if v_exit_at is not null and v_exit_c is not null then
      v_total_min := v_total_min + greatest(0, floor(extract(epoch from (v_exit_at - (v_local_date::text || ' ' || v_exit_c || ':00-03:00')::timestamptz)) / 60)::integer);
    end if;

    if v_total_min <= (v_cfg->>'general_tolerance_min')::integer then
      return 0;
    end if;
    return (v_cfg->>'general_charge_cents')::integer;
  end if;

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
