-- Corrige lacunas achadas testando a Fase 3 (Grupo 2) na prática com a
-- conta gestao real da ZL001:
--
-- 1. approve_attendance_correction/request_attendance_correction tinham uma
--    checagem de role CODIFICADA dentro da função (`IF role <> 'admin'`),
--    separada da RLS -- mudar a policy não bastava, essas duas RPCs
--    continuavam barrando qualquer role que não fosse 'admin'/'developer'.
-- 2. A leitura de attendance_logs (SELECT) continuava restrita a admin --
--    sem isso, Horas Extras (que lê essa tabela pra montar o relatório)
--    ficava sempre vazio pra quem é gestao.
--
-- CUIDADO: a policy de INSERT em attendance_logs ("Admins inserem
-- historico da escola") NÃO é tocada aqui de propósito -- ela é o check-in
-- de verdade do totem (App.jsx), sempre vai ser trabalho da Recepção, nunca
-- deveria migrar pra Gestão. Por isso _apply_attendance_manual_entry (usada
-- só dentro da aprovação de um lançamento manual pendente) vira SECURITY
-- DEFINER: a permissão de quem pode aprovar já é checada explicitamente
-- dentro de approve_attendance_correction, então essa função interna não
-- precisa (e não deve) depender da policy de INSERT do check-in ao vivo.

alter policy "Admins veem logs da escola" on public.attendance_logs
  using (school_id = get_my_school_id() and can_read_gestao());

create or replace function public.approve_attendance_correction(p_correction_id uuid, p_approve boolean)
returns jsonb
language plpgsql
as $function$
declare
  v_correction record;
  v_new_log_id uuid;
begin
  if not (public.get_my_role() = 'developer' or public.can_write_gestao()) then
    raise exception 'Sem permissão para revisar correções de presença';
  end if;

  select * into v_correction from attendance_corrections where id = p_correction_id for update;
  if not found then
    raise exception 'Solicitação de correção não encontrada';
  end if;
  if public.get_my_role() <> 'developer' and v_correction.school_id <> public.get_my_school_id() then
    raise exception 'Solicitação não pertence à sua escola';
  end if;
  if v_correction.status <> 'pending' then
    raise exception 'Solicitação já foi % — nada a fazer', v_correction.status;
  end if;
  if v_correction.requested_by = auth.uid() then
    raise exception 'Quem solicitou a correção não pode aprovar a própria solicitação';
  end if;

  if p_approve then
    if v_correction.attendance_log_id is null then
      v_new_log_id := public._apply_attendance_manual_entry(
        v_correction.school_id, v_correction.student_id, v_correction.event_type,
        v_correction.new_event_time, v_correction.reason_code, v_correction.reason_detail
      );
      update attendance_corrections
      set attendance_log_id = v_new_log_id, status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_correction_id;
    else
      perform public._apply_attendance_correction(v_correction.attendance_log_id, v_correction.new_event_time, v_correction.new_event_type);
      update attendance_corrections
      set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_correction_id;
    end if;
  else
    update attendance_corrections
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_correction_id;
  end if;

  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end;
$function$;

create or replace function public.request_attendance_correction(
  p_log_id uuid, p_new_event_time timestamp with time zone, p_reason_code text,
  p_reason_detail text, p_minutes_delta integer, p_increases_billing boolean,
  p_new_event_type text default null::text
)
returns jsonb
language plpgsql
as $function$
declare
  v_log record;
  v_correction_id uuid;
  v_status text;
begin
  if not public.can_write_gestao() then
    raise exception 'Só administradores podem corrigir presença';
  end if;

  select * into v_log from attendance_logs where id = p_log_id;
  if not found then
    raise exception 'Registro de presença não encontrado';
  end if;
  if v_log.school_id <> public.get_my_school_id() then
    raise exception 'Registro não pertence à sua escola';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo da correção é obrigatório';
  end if;
  if p_new_event_type is not null and p_new_event_type not in ('entry', 'exit') then
    raise exception 'Tipo de evento inválido';
  end if;

  v_status := case when p_increases_billing then 'pending' else 'applied' end;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, new_event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) values (
    v_log.school_id, p_log_id, v_log.student_id, v_log.event_type, p_new_event_type,
    v_log.event_time, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, p_increases_billing, auth.uid(), v_status
  )
  returning id into v_correction_id;

  if not p_increases_billing then
    perform public._apply_attendance_correction(p_log_id, p_new_event_time, p_new_event_type);
  end if;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$;

alter function public._apply_attendance_manual_entry(uuid, uuid, text, timestamptz, text, text) security definer set search_path to 'public';
