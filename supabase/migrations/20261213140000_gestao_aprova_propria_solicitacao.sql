-- Gestão (dona da escola) pode aprovar solicitação de correção feita por ela
-- mesma. Antes, approve_attendance_correction bloqueava qualquer auto-aprovação
-- ("Quem solicitou a correção não pode aprovar a própria solicitação"), o que
-- deixava pendentes as solicitações da Gestão feitas ANTES da migration
-- 20261213130000 (que já aprova na hora as novas).
-- ÚNICA mudança em relação à versão do baseline: a trava de auto-aprovação
-- passa a valer só para quem NÃO é 'gestao' (developer segue bloqueado).
-- Continuam: só developer/gestao revisam, isolamento por escola, status
-- 'pending' obrigatório, e reviewed_by/reviewed_at gravados.
CREATE OR REPLACE FUNCTION public.approve_attendance_correction(p_correction_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correction record;
  v_new_log_id uuid;
  v_role text := coalesce(public.get_my_role(), '');
begin
  if v_role not in ('developer', 'gestao') then
    raise exception 'Sem permissão para revisar correções de presença';
  end if;

  select * into v_correction from attendance_corrections where id = p_correction_id for update;
  if not found then
    raise exception 'Solicitação de correção não encontrada';
  end if;
  if v_role <> 'developer' and v_correction.school_id is distinct from public.get_my_school_id() then
    raise exception 'Solicitação não pertence à sua escola';
  end if;
  if v_correction.status <> 'pending' then
    raise exception 'Solicitação já foi % — nada a fazer', v_correction.status;
  end if;
  if v_correction.requested_by = auth.uid() and v_role <> 'gestao' then
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
$function$
;
