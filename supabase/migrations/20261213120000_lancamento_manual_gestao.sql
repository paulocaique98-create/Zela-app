-- Lançamento manual de presença: inclui o perfil 'gestao' (Gestão) entre quem
-- pode lançar. Coordenação e Direção já eram cobertas ('gestao_pedagogica').
-- ÚNICA mudança em relação à versão anterior (20261211140000): a lista de
-- perfis na primeira checagem. Continuam valendo: motivo obrigatório, aluno da
-- MESMA escola (get_my_school_id), cobrança no servidor e registro em
-- attendance_corrections. Não altera RLS, tabelas nem grants.
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
begin
  if coalesce(public.get_my_role(), '') not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica') then
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
$function$
;
