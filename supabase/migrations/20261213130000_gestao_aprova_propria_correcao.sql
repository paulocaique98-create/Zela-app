-- Gestão aprova a própria alteração que gera hora extra / cobrança adicional.
-- Antes: toda correção ou lançamento manual que aumenta a cobrança ficava
-- 'pending' até OUTRO perfil aprovar (approve_attendance_correction proíbe
-- auto-aprovação). Agora, quando quem pede é a Gestão ('gestao', perfil que já
-- controla o financeiro e é o único que aprova), a alteração é aplicada na hora
-- e fica registrada como 'approved' com reviewed_by = quem fez e reviewed_at,
-- mantendo a rastreabilidade (mesmo padrão já usado em 20261213110000 para
-- saída pendente). Os demais perfis (admin, recepcao, gestao_pedagogica)
-- continuam gerando 'pending'. approve_attendance_correction NÃO muda.
-- Só a decisão de status muda; permissões, isolamento por escola, motivo
-- obrigatório e cálculo de cobrança no servidor seguem iguais. Sem mudança de
-- RLS, tabelas ou grants.

CREATE OR REPLACE FUNCTION public.request_attendance_correction(p_log_id uuid, p_new_event_time timestamp with time zone, p_reason_code text, p_reason_detail text, p_minutes_delta integer, p_increases_billing boolean, p_new_event_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_log record;
  v_correction_id uuid;
  v_status text;
  v_role text := coalesce(public.get_my_role(), '');
  v_final_type text;
  v_increases boolean;
begin
  if v_role not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica') then
    raise exception 'Só administradores podem corrigir presença';
  end if;

  select * into v_log from attendance_logs where id = p_log_id and deleted_at is null;
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
  v_status := case
    when v_increases and v_role <> 'gestao' then 'pending'
    when v_increases then 'approved'
    else 'applied'
  end;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, new_event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status,
    reviewed_by, reviewed_at
  ) values (
    v_log.school_id, p_log_id, v_log.student_id, v_log.event_type, p_new_event_type,
    v_log.event_time, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, v_increases, auth.uid(), v_status,
    case when v_status = 'approved' then auth.uid() end,
    case when v_status = 'approved' then now() end
  )
  returning id into v_correction_id;

  if v_status <> 'pending' then
    perform public._apply_attendance_correction(p_log_id, p_new_event_time, p_new_event_type);
  end if;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_attendance_manual_entry(p_student_id uuid, p_event_type text, p_new_event_time timestamp with time zone, p_reason_code text, p_reason_detail text, p_minutes_delta integer, p_increases_billing boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student record;
  v_correction_id uuid;
  v_log_id uuid;
  v_status text;
  v_increases boolean;
  v_role text := coalesce(public.get_my_role(), '');
begin
  if v_role not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica') then
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
  v_status := case
    when v_increases and v_role <> 'gestao' then 'pending'
    when v_increases then 'approved'
    else 'applied'
  end;

  if v_status <> 'pending' then
    v_log_id := public._apply_attendance_manual_entry(
      v_student.school_id, p_student_id, p_event_type, p_new_event_time,
      p_reason_code, p_reason_detail
    );
  end if;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status,
    reviewed_by, reviewed_at
  ) values (
    v_student.school_id, v_log_id, p_student_id, p_event_type,
    null, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, v_increases, auth.uid(), v_status,
    case when v_status = 'approved' then auth.uid() end,
    case when v_status = 'approved' then now() end
  )
  returning id into v_correction_id;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$
;
