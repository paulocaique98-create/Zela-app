-- Fase 4 (Matrículas) do módulo Secretaria. Mesmo padrão da Fase 3
-- (Alunos): admin E gestao escrevem em paralelo por enquanto -- usa
-- checagem direta (get_my_role() IN ('admin','gestao')), NUNCA
-- can_write_gestao() (essa já foi cortada pra só 'gestao' no Financeiro/
-- Correções, em fase diferente da migração).
--
-- approve_matricula é SECURITY INVOKER (depende da RLS de quem chama) --
-- por isso libera escrita em paralelo em TODAS as tabelas que ela toca:
-- matricula_solicitacoes, users, student_guardians, authorized_persons
-- (students já foi liberado na Fase 3).

alter policy "Admins gerenciam solicitacoes da escola" on public.matricula_solicitacoes
  using (school_id = get_my_school_id() and get_my_role() in ('admin', 'gestao'))
  with check (school_id = get_my_school_id() and get_my_role() in ('admin', 'gestao'));

alter policy "Atualizacao de perfis de usuario" on public.users
  using (
    (get_my_role() = 'developer')
    or (get_my_role() in ('admin', 'gestao') and school_id = get_my_school_id())
    or (id = auth.uid())
  );

alter policy "Admins acessam autorizados da escola" on public.authorized_persons
  using (school_id = get_my_school_id() and get_my_role() in ('admin', 'gestao'))
  with check (school_id = get_my_school_id() and get_my_role() in ('admin', 'gestao'));

alter policy "Admin acessa vínculos da escola" on public.student_guardians
  using (get_my_role() in ('admin', 'gestao') and school_id = get_my_school_id())
  with check (get_my_role() in ('admin', 'gestao') and school_id = get_my_school_id());

-- approve_atualizacao_cadastral tinha a mesma checagem de role travada
-- dentro da função (mesmo bug já visto duas vezes em outros lugares).
create or replace function public.approve_atualizacao_cadastral(p_solicitacao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    and role in ('admin', 'developer', 'gestao')
    and (role = 'developer' or school_id = v_solicitacao.school_id)
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
