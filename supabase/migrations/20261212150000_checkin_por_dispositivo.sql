-- Fase 6 do PLANO_CONTROLID.md: rosto reconhecido no equipamento -> MESMA solicitação do totem.
-- A solicitação do totem é: students.status vira pending_entry/pending_exit (+ today_*_at e
-- pending_requester_id). Quem confirma e grava attendance_logs continua sendo a Recepção
-- (App.jsx > updateStudentStatus). Esta função NÃO grava attendance_logs e NÃO confirma nada.
-- Segurança: só service_role (Edge Function controlid-push). O school_id sai do vínculo/dispositivo,
-- nunca do chamador. Pessoa e aluno precisam ser da MESMA escola do dispositivo.
-- Conservador como o totem: só solicita sozinho quando há exatamente 1 filho elegível
-- (o rosto identifica o adulto, não diz quais filhos estão ali). Mais de 1 -> 'varios_filhos'
-- e a Recepção decide no balcão.

create or replace function public.solicitar_checkin_dispositivo(
  p_device_ref uuid,
  p_external_user_id bigint,
  p_device_time timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link record;
  v_family uuid;
  v_requester uuid := null;
  v_ids uuid[];
  v_student record;
  v_novo text;
  v_agora timestamptz := now();
  v_hora time := (now() at time zone 'America/Sao_Paulo')::time;
  v_linhas int;
begin
  -- Evento velho (equipamento voltou da queda e reenviou o histórico): não vira solicitação.
  if p_device_time is null or p_device_time < v_agora - interval '2 minutes'
     or p_device_time > v_agora + interval '2 minutes' then
    return jsonb_build_object('resultado', 'evento_antigo');
  end if;

  select l.school_id, l.authorized_person_id, l.guardian_user_id into v_link
    from public.device_person_links l
    join public.access_devices d on d.id = l.device_ref
   where l.device_ref = p_device_ref
     and l.external_user_id = p_external_user_id
     and d.status = 'active'
     and d.school_id = l.school_id;
  if not found then
    return jsonb_build_object('resultado', 'sem_vinculo');
  end if;

  if not public.escola_liberada(v_link.school_id) then
    return jsonb_build_object('resultado', 'escola_bloqueada');
  end if;

  if v_link.authorized_person_id is not null then
    select p.family_id, p.id into v_family, v_requester
      from public.authorized_persons p
     where p.id = v_link.authorized_person_id
       and p.school_id = v_link.school_id
       and p.status = 'approved'
       and (p.temporary_until is null or p.temporary_until >= (now() at time zone 'America/Sao_Paulo')::date);
  else
    select u.id into v_family
      from public.users u
     where u.id = v_link.guardian_user_id and u.school_id = v_link.school_id and u.role = 'family';
  end if;
  if v_family is null then
    return jsonb_build_object('resultado', 'pessoa_inativa');
  end if;

  if not public.check_rate_limit('device_checkin:' || p_device_ref::text, 60, 60) then
    return jsonb_build_object('resultado', 'limite');
  end if;

  select array_agg(distinct s.id) into v_ids
    from public.students s
   where s.school_id = v_link.school_id
     and s.enrollment_status = 'ativo'
     and (s.family_id = v_family
          or s.id in (select g.student_id from public.student_guardians g where g.guardian_id = v_family));

  if v_ids is null or array_length(v_ids, 1) = 0 then
    return jsonb_build_object('resultado', 'sem_filho');
  end if;
  if array_length(v_ids, 1) > 1 then
    return jsonb_build_object('resultado', 'varios_filhos');
  end if;

  select s.id, s.name, s.status into v_student
    from public.students s where s.id = v_ids[1] for update;

  if v_student.status in ('pending_entry', 'pending_exit') then
    return jsonb_build_object('resultado', 'ja_pendente', 'student_id', v_student.id, 'status', v_student.status);
  end if;

  if v_student.status is null or v_student.status in ('idle', 'left', 'absent') then
    v_novo := 'pending_entry';
    update public.students
       set status = v_novo, pending_requester_id = v_requester,
           today_entry = v_hora, today_entry_at = v_agora, today_exit = null, today_exit_at = null
     where id = v_student.id and status is not distinct from v_student.status;
  elsif v_student.status = 'in_school' then
    v_novo := 'pending_exit';
    update public.students
       set status = v_novo, pending_requester_id = v_requester,
           today_exit = v_hora, today_exit_at = v_agora
     where id = v_student.id and status = 'in_school';
  else
    return jsonb_build_object('resultado', 'status_invalido');
  end if;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    return jsonb_build_object('resultado', 'concorrencia');
  end if;

  return jsonb_build_object('resultado', 'solicitado', 'student_id', v_student.id,
    'student_name', v_student.name, 'status', v_novo, 'school_id', v_link.school_id);
end;
$$;
revoke all on function public.solicitar_checkin_dispositivo(uuid, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.solicitar_checkin_dispositivo(uuid, bigint, timestamptz) to service_role;
