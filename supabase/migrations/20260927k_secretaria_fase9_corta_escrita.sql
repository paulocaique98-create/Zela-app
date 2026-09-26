-- Fase 9 (Permissões) do módulo Secretaria — ponto de corte, mesmo padrão
-- já aplicado no Financeiro/Correções (Fase 5 daquela migração): admin
-- perde ESCRITA no que é exclusivo das telas novas da Secretaria/Gestão,
-- mas nunca perde LEITURA (can_read_gestao/"Gestao le..." continuam
-- valendo pros dois).
--
-- Importante -- achado real ao revisar o que cada tabela/RPC também serve:
-- students (UPDATE/INSERT), users (UPDATE), student_guardians e
-- authorized_persons (ALL) e transfer_student_class() continuam em
-- PARALELO (admin + gestao), de propósito -- são usados também por telas do
-- Admin que NÃO fazem parte da Secretaria e não foram migradas
-- (AdminUserRegistration.jsx faz cadastro/edição manual de aluno usando as
-- 4 primeiras; AdminStudentList.jsx muda turma usando a RPC). Cortar essas
-- quebraria essas telas, violando a garantia de não interromper a escola.
--
-- O que é exclusivo da Secretaria/Gestão e pode ser cortado com segurança:
-- matricula_solicitacoes (decisão de aprovar/rejeitar/pedir ajuste),
-- approve_atualizacao_cadastral, transfer_student_to_external_school e
-- student_documents.

alter policy "Admins gerenciam solicitacoes da escola" on public.matricula_solicitacoes
  using (school_id = get_my_school_id() and get_my_role() = 'gestao')
  with check (school_id = get_my_school_id() and get_my_role() = 'gestao');

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
    and (role = 'developer' or (role = 'gestao' and school_id = v_solicitacao.school_id))
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

create or replace function public.transfer_student_to_external_school(p_student_id uuid, p_destination_school_name text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_turma text;
begin
  select school_id, turma into v_school_id, v_turma from public.students where id = p_student_id;
  if v_school_id is null then raise exception 'Aluno não encontrado.'; end if;
  if not (public.get_my_role() = 'developer' or (public.get_my_role() = 'gestao' and public.get_my_school_id() = v_school_id)) then
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

alter policy "Gestao e admin gerenciam documentos do aluno" on public.student_documents
  using (get_my_role() = 'gestao' and school_id = get_my_school_id())
  with check (get_my_role() = 'gestao' and school_id = get_my_school_id());

-- storage.objects não é nossa (não dá pra ALTER POLICY nela, só o dono) --
-- dropa e recria, mesmo padrão já usado nas migrations de bucket anteriores.
drop policy if exists "Gestao e admin gerenciam arquivos de documentos do aluno" on storage.objects;
create policy "Gestao e admin gerenciam arquivos de documentos do aluno"
on storage.objects for all
using (
  bucket_id = 'student-documents'
  and get_my_role() = 'gestao'
  and (storage.foldername(name))[1] = get_my_school_id()::text
)
with check (
  bucket_id = 'student-documents'
  and get_my_role() = 'gestao'
  and (storage.foldername(name))[1] = get_my_school_id()::text
);
