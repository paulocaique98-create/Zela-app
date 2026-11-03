-- Bloqueio por inadimplência, parte 2: funções SECURITY DEFINER que o usuário da escola chama direto
-- e que ignoravam o bloqueio. Só entra um guarda no início de cada uma; o resto do corpo não muda.
-- (candidatos_unificar_responsaveis, chat_destinatarios, chat_pode_user e pesquisa_elegiveis não têm
-- EXECUTE para authenticated, então não são alcançáveis pelo usuário e ficam como estão.)

-- True para developer, usuário sem escola ou escola liberada. Só devolve o estado de quem chama.
create or replace function public.meu_acesso_liberado()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select u.role = 'developer' or u.school_id is null or public.escola_liberada(u.school_id)
      from public.users u where u.id = auth.uid()
  ), true);
$$;
revoke all on function public.meu_acesso_liberado() from public, anon;
grant execute on function public.meu_acesso_liberado() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_token_push_app(p_token text, p_platform text, p_device_info text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
begin
  if not public.meu_acesso_liberado() then
    raise exception 'Acesso suspenso por pendência financeira.' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then
    raise exception 'invalid token' using errcode = '22023';
  end if;

  select school_id into v_school from public.users where id = v_uid;
  if v_school is null then
    raise exception 'user without school' using errcode = '42501';
  end if;

  delete from public.push_subscriptions where token = p_token and user_id <> v_uid;

  insert into public.push_subscriptions
    (user_id, school_id, platform, token, device_info, last_seen_at, updated_at)
  values
    (v_uid, v_school, p_platform, p_token, left(p_device_info, 500), now(), now())
  on conflict (token) do update set
    school_id = excluded.school_id,
    platform = excluded.platform,
    device_info = excluded.device_info,
    last_seen_at = now(),
    updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_account_deletion(p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user record;
  v_id uuid;
begin
  if not public.meu_acesso_liberado() then
    raise exception 'Acesso suspenso por pendência financeira.' using errcode = '42501';
  end if;
  select id, name, email, role, school_id into v_user from users where id = auth.uid();
  if v_user.id is null or v_user.school_id is null then
    raise exception 'Conta não encontrada.';
  end if;
  if v_user.role not in ('family', 'teacher', 'admin') then
    raise exception 'A conta da Gestão só pode ser encerrada pelo suporte do Zela.';
  end if;
  if exists (select 1 from account_deletion_requests where user_id = v_user.id and status = 'pendente') then
    raise exception 'Você já tem um pedido de exclusão em andamento.';
  end if;

  insert into account_deletion_requests (school_id, user_id, user_name, user_email, user_role, reason)
  values (v_user.school_id, v_user.id, v_user.name, v_user.email, v_user.role, nullif(trim(coalesce(p_reason, '')), ''))
  returning id into v_id;

  insert into audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
  values (v_user.school_id, v_user.id, 'request_account_deletion', 'user', v_user.id, jsonb_build_object('request_id', v_id));

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_atualizacao_cadastral(p_solicitacao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_solicitacao record;
  v_resp jsonb;
  v_crianca jsonb;
  v_autorizado jsonb;
  v_student_id uuid;
  v_family_id uuid;
  v_max_order int;
  v_periodo text;
  v_entry time;
  v_exit time;
  v_updated_students uuid[] := array[]::uuid[];
begin
  if not public.meu_acesso_liberado() then
    raise exception 'Acesso suspenso por pendência financeira.' using errcode = '42501';
  end if;
  select * into v_solicitacao from matricula_solicitacoes where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação não encontrada';
  end if;
  if v_solicitacao.status <> 'pending' then
    raise exception 'Solicitação já foi % — nada a fazer', v_solicitacao.status;
  end if;
  if v_solicitacao.tipo <> 'atualizacao_cadastral' then
    raise exception 'Esta função só aprova solicitações do tipo atualizacao_cadastral';
  end if;

  if not exists (
    select 1 from users
    where id = auth.uid()
    and (role = 'developer' or (role in ('gestao', 'gestao_pedagogica') and school_id = v_solicitacao.school_id))
  ) then
    raise exception 'Permissão negada';
  end if;

  v_family_id := v_solicitacao.family_id;
  v_resp := v_solicitacao.responsavel_financeiro;

  update users set
    profession = coalesce(profession, nullif(v_resp->>'profissao', '')),
    civil_status = coalesce(civil_status, nullif(v_resp->>'estado_civil', '')),
    doc_type = coalesce(doc_type, case when nullif(v_resp->>'cpf', '') is not null then 'CPF' else null end),
    doc_number = coalesce(doc_number, nullif(v_resp->>'cpf', '')),
    documents = case when documents is null or documents = '{}'::jsonb then
      jsonb_build_object('rg_expedicao', nullif(v_resp->>'rg_expedicao', ''), 'rg_orgao', nullif(v_resp->>'rg_orgao', ''))
      else documents end,
    street = coalesce(street, nullif(v_resp->>'rua', '')),
    number = coalesce(number, nullif(v_resp->>'numero', '')),
    complement = coalesce(complement, nullif(v_resp->>'complemento', '')),
    neighborhood = coalesce(neighborhood, nullif(v_resp->>'bairro', '')),
    city = coalesce(city, nullif(v_resp->>'cidade', '')),
    state = coalesce(state, nullif(v_resp->>'uf', '')),
    zip_code = coalesce(zip_code, nullif(v_resp->>'cep', ''))
  where id = v_family_id;

  for v_crianca in select * from jsonb_array_elements(coalesce(v_solicitacao.criancas, '[]'::jsonb))
  loop
    v_student_id := (v_crianca->>'student_id')::uuid;
    if v_student_id is null then continue; end if;

    v_periodo := v_crianca->>'periodo_normalizado';
    v_entry := case v_periodo
      when '07:00 às 13:00' then time '07:00'
      when '07:00 às 15:00' then time '07:00'
      when '07:00 às 17:00' then time '07:00'
      when '09:00 às 19:00' then time '09:00'
      when '11:00 às 19:00' then time '11:00'
      when '13:00 às 19:00' then time '13:00'
      else null
    end;
    v_exit := case v_periodo
      when '07:00 às 13:00' then time '13:00'
      when '07:00 às 15:00' then time '15:00'
      when '07:00 às 17:00' then time '17:00'
      when '09:00 às 19:00' then time '19:00'
      when '11:00 às 19:00' then time '19:00'
      when '13:00 às 19:00' then time '19:00'
      else null
    end;

    update students set
      cidade_nascimento = coalesce(cidade_nascimento, nullif(v_crianca->>'cidade_nascimento', '')),
      autorizacao_imagem = coalesce(autorizacao_imagem, case v_resp->>'autorizacao_imagem' when 'sim' then true when 'nao' then false else null end),
      autorizacao_emergencia_medica = coalesce(autorizacao_emergencia_medica, case v_resp->>'autorizacao_emergencia' when 'sim' then true when 'nao' then false else null end),
      periodo = coalesce(periodo, nullif(v_periodo, '')),
      turno = coalesce(turno, nullif(v_crianca->>'turno', '')),
      contracted_hours = coalesce(contracted_hours, nullif(v_crianca->>'ciclo_numero', '')::numeric),
      contracted_entry_time = coalesce(contracted_entry_time, v_entry),
      contracted_exit_time = coalesce(contracted_exit_time, v_exit)
    where id = v_student_id;

    if not exists (select 1 from fichas_medicas where student_id = v_student_id) then
      insert into fichas_medicas (
        school_id, student_id,
        tem_restricao_alimentar, restricoes_alimentares,
        tem_restricao_saude, restricoes_saude,
        consultou_especialista, especialistas,
        faz_tratamento, tratamentos,
        usa_medicamento, medicamentos,
        tem_habito_importante, habitos_importantes
      ) values (
        v_solicitacao.school_id, v_student_id,
        coalesce((v_crianca->'restricoes_alimentares')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'restricoes_alimentares', '[]'::jsonb))), array[]::text[]),
        coalesce((v_crianca->'restricoes_saude')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'restricoes_saude', '[]'::jsonb))), array[]::text[]),
        coalesce((v_crianca->'especialistas')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'especialistas', '[]'::jsonb))), array[]::text[]),
        coalesce((v_crianca->'tratamentos')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'tratamentos', '[]'::jsonb))), array[]::text[]),
        false, array[]::text[],
        coalesce((v_crianca->'habitos_importantes')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'habitos_importantes', '[]'::jsonb))), array[]::text[])
      );
    end if;

    v_updated_students := array_append(v_updated_students, v_student_id);
  end loop;

  v_max_order := coalesce((select max(emergency_order) from authorized_persons where family_id = v_family_id), 1);
  for v_autorizado in select * from jsonb_array_elements(coalesce(v_solicitacao.autorizados, '[]'::jsonb))
  loop
    if coalesce(v_autorizado->>'nome', '') = '' then continue; end if;
    if not exists (
      select 1 from authorized_persons
      where family_id = v_family_id
      and lower(unaccent(name)) = lower(unaccent(v_autorizado->>'nome'))
    ) then
      v_max_order := v_max_order + 1;
      begin
        insert into authorized_persons (family_id, school_id, name, relation, has_photo, emergency_order)
        values (v_family_id, v_solicitacao.school_id, v_autorizado->>'nome', coalesce(nullif(v_autorizado->>'parentesco', ''), 'Autorizado'), false, v_max_order);
      exception when sqlstate 'P0001' then
        exit;
      end;
    end if;
  end loop;

  update matricula_solicitacoes
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_solicitacao_id;

  return jsonb_build_object('updated_student_ids', to_jsonb(v_updated_students));
end;
$function$;

CREATE OR REPLACE FUNCTION public.listar_contas_vinculadas()
 RETURNS TABLE(user_id uuid, name text, role text, departamento text, escola text, alunos text[], nao_lidas integer, atual boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with meu as (
    select grupo from public.contas_vinculadas where user_id = auth.uid()
  )
  select u.id, u.name, u.role, u.departamento, s.name,
         coalesce((
           select array_agg(distinct split_part(st.name, ' ', 1) order by split_part(st.name, ' ', 1))
           from public.students st
           where coalesce(st.enrollment_status, 'ativo') = 'ativo'
             and (st.family_id = u.id or exists (
               select 1 from public.student_guardians sg where sg.student_id = st.id and sg.guardian_id = u.id))
         ), array[]::text[]),
         case when u.role = 'family' and u.id <> auth.uid() then (
           select count(*)::int from public.notifications n where n.family_id = u.id and n.read_at is null
         ) else 0 end,
         u.id = auth.uid()
  from meu
  join public.contas_vinculadas c on c.grupo = meu.grupo
  join public.users u on u.id = c.user_id
  left join public.schools s on s.id = u.school_id
  where public.meu_acesso_liberado()
    and not exists (select 1 from public.users o where o.id = auth.uid() and o.role = 'admin')
    and (u.id = auth.uid() or public.conta_pode_ser_vinculada(u.id))
  order by (u.id = auth.uid()) desc, u.role, s.name;
$function$;
