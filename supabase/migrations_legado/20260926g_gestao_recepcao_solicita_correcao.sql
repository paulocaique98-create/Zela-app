-- Refinamento pedido depois da Fase 5: a Recepção (admin) está na linha de
-- frente e continua podendo SOLICITAR uma correção de presença -- só a
-- APROVAÇÃO/REJEIÇÃO (approve_attendance_correction, já ajustada na Fase
-- 3/5) fica exclusiva da Gestão. "Solicitar" e "aprovar" já eram operações
-- separadas no desenho original (maker-checker); esse ajuste só devolve o
-- "maker" pra Recepção, mantendo o "checker" só com a Gestão.

alter policy "Admins inserem correcoes da propria escola" on public.attendance_corrections
  with check (get_my_role() in ('admin', 'gestao') and school_id = get_my_school_id() and requested_by = auth.uid());

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
  if public.get_my_role() not in ('admin', 'gestao') then
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

-- Correção que NÃO aumenta cobrança aplica na hora, direto da solicitação
-- (sem passar por aprovação) -- ver IF acima. Isso escreve em
-- attendance_logs, que agora só aceita escrita de 'gestao' (Fase 5). Como a
-- permissão de quem pode solicitar já foi checada acima, essa função
-- interna vira SECURITY DEFINER (mesmo raciocínio de
-- _apply_attendance_manual_entry): não deve depender da policy de escrita
-- de attendance_logs pra decidir se a Recepção pode aplicar a própria
-- correção de baixo risco.
alter function public._apply_attendance_correction(uuid, timestamptz, text) security definer set search_path to 'public';
