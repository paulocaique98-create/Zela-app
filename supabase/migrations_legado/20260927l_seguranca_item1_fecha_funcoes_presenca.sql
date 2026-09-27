-- Auditoria de segurança (27/09/2026) · item 1 (crítico).
--
-- _apply_attendance_correction e _apply_attendance_manual_entry viraram
-- SECURITY DEFINER nas migrations 20260926d/20260926g sem revogar a execução
-- pública: qualquer pessoa (até sem login, só com a chave anon do site)
-- reescrevia ou inseria presença em qualquer escola. Provado em teste com
-- dados de uma escola de teste (src/test/securityHardening.test.js).
--
-- Correção:
-- 1) os helpers internos ficam sem EXECUTE pra anon/authenticated/PUBLIC --
--    só o dono (e as funções SECURITY DEFINER abaixo, que rodam como dono)
--    chamam;
-- 2) as 3 RPCs públicas que usam os helpers viram SECURITY DEFINER (antes
--    eram INVOKER e dependiam do RLS pra barrar quem não podia);
-- 3) todas as checagens de permissão ficam à prova de NULL: sem login,
--    get_my_role() é NULL, e "NULL not in (...)" / "NULL <> x" vale NULL,
--    que o IF trata como falso -- ou seja, a checagem NÃO disparava. Achado
--    real também em transfer_student_to_external_school (provado em teste).

revoke execute on function public._apply_attendance_correction(uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public._apply_attendance_manual_entry(uuid, uuid, text, timestamptz, text, text) from public, anon, authenticated;

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

  v_status := case when coalesce(p_increases_billing, true) then 'pending' else 'applied' end;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, new_event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) values (
    v_log.school_id, p_log_id, v_log.student_id, v_log.event_type, p_new_event_type,
    v_log.event_time, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, coalesce(p_increases_billing, true), auth.uid(), v_status
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

  v_status := case when coalesce(p_increases_billing, true) then 'pending' else 'applied' end;

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
    p_minutes_delta, coalesce(p_increases_billing, true), auth.uid(), v_status
  )
  returning id into v_correction_id;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$;

create or replace function public.approve_attendance_correction(p_correction_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

create or replace function public.transfer_student_to_external_school(p_student_id uuid, p_destination_school_name text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_turma text;
  v_role text := coalesce(public.get_my_role(), '');
begin
  if v_role not in ('developer', 'gestao') then
    raise exception 'Permissão negada.';
  end if;
  select school_id, turma into v_school_id, v_turma from public.students where id = p_student_id;
  if v_school_id is null then raise exception 'Aluno não encontrado.'; end if;
  if v_role <> 'developer' and v_school_id is distinct from public.get_my_school_id() then
    raise exception 'Permissão negada.';
  end if;
  if p_destination_school_name is null or trim(p_destination_school_name) = '' then
    raise exception 'Informe o nome da escola de destino.';
  end if;

  update public.students set enrollment_status = 'transferido' where id = p_student_id;

  insert into public.student_transfers (school_id, student_id, from_class_name, to_class_name, transfer_type, destination_school_name, reason, transferred_by)
  values (v_school_id, p_student_id, v_turma, null, 'saida_externa', trim(p_destination_school_name), nullif(trim(coalesce(p_reason, '')), ''), auth.uid());
end;
$$;

-- Nenhuma dessas RPCs faz sentido sem login.
revoke execute on function public.request_attendance_correction(uuid, timestamptz, text, text, integer, boolean, text) from public, anon;
revoke execute on function public.request_attendance_manual_entry(uuid, text, timestamptz, text, text, integer, boolean) from public, anon;
revoke execute on function public.approve_attendance_correction(uuid, boolean) from public, anon;
revoke execute on function public.transfer_student_to_external_school(uuid, text, text) from public, anon;
revoke execute on function public.approve_atualizacao_cadastral(uuid) from public, anon;
grant execute on function public.request_attendance_correction(uuid, timestamptz, text, text, integer, boolean, text) to authenticated;
grant execute on function public.request_attendance_manual_entry(uuid, text, timestamptz, text, text, integer, boolean) to authenticated;
grant execute on function public.approve_attendance_correction(uuid, boolean) to authenticated;
grant execute on function public.transfer_student_to_external_school(uuid, text, text) to authenticated;
grant execute on function public.approve_atualizacao_cadastral(uuid) to authenticated;
