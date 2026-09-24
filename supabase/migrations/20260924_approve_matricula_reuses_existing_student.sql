-- Corrige approve_matricula: até aqui, TODO item de "criancas" virava um
-- INSERT novo em students, mesmo numa rematrícula de um aluno que já
-- existia. Isso duplicou uma família de verdade em produção: um
-- responsável secundário (não o titular financeiro) fez a rematrícula da
-- própria filha, o formulário buscou e mostrou o aluno certo, mas o id
-- dele era descartado antes de enviar o pedido (ver fix em
-- FamilyMatriculas.jsx) -- sem essa referência, a aprovação não tinha como
-- saber que era pra ATUALIZAR o cadastro existente, e criou um aluno novo
-- vinculado à conta de quem submeteu, em vez de atualizar o real.
--
-- Agora, quando o item de "criancas" trouxer um "student_id" (rematrícula
-- de alguém que já está com o aluno pré-carregado no formulário), a função
-- faz UPDATE no aluno existente -- sem tocar no family_id dele, preservando
-- quem já é o responsável financeiro/titular -- e só garante que quem
-- submeteu o pedido também fique vinculado como responsável (sem virar o
-- titular, a menos que já fosse). Sem "student_id" (matrícula nova de
-- verdade), o comportamento continua o mesmo de sempre: INSERT.
create or replace function public.approve_matricula(p_solicitacao_id uuid)
returns jsonb
language plpgsql
as $function$
declare
  v_solicitacao record;
  v_resp jsonb;
  v_crianca jsonb;
  v_autorizado jsonb;
  v_transporte jsonb;
  v_student_id uuid;
  v_existing_student_id uuid;
  v_new_student_ids uuid[] := ARRAY[]::uuid[];
  v_periodo text;
  v_entry time;
  v_exit time;
  v_autorizado_order int;
begin
  select * into v_solicitacao from matricula_solicitacoes where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação não encontrada';
  end if;
  if v_solicitacao.status <> 'pending' then
    raise exception 'Solicitação já foi % — nada a fazer', v_solicitacao.status;
  end if;

  v_resp := v_solicitacao.responsavel_financeiro;

  update users set
    status = 'active',
    phone = nullif(v_resp->>'telefone', ''),
    doc_type = case when v_resp->>'cpf' is not null and v_resp->>'cpf' <> '' then 'CPF' else null end,
    doc_number = nullif(v_resp->>'cpf', ''),
    profession = nullif(v_resp->>'profissao', ''),
    civil_status = nullif(v_resp->>'estado_civil', ''),
    documents = jsonb_build_object(
      'cpf_doc', v_resp->'cpf_doc',
      'rg_doc', v_resp->'rg_doc',
      'comprovante_residencia_doc', v_resp->'comprovante_residencia_doc',
      'plano_saude_doc', v_resp->'plano_saude_doc',
      'cartao_vacina_doc', v_resp->'cartao_vacina_doc',
      'rg_expedicao', v_resp->'rg_expedicao',
      'rg_orgao', v_resp->'rg_orgao'
    )
  where id = v_solicitacao.family_id;

  for v_crianca in select * from jsonb_array_elements(coalesce(v_solicitacao.criancas, '[]'::jsonb))
  loop
    v_periodo := v_crianca->>'periodo';
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

    -- Só reaproveita o student_id se ele realmente existir e for da mesma
    -- escola -- nunca confia cegamente num id vindo do payload.
    v_existing_student_id := null;
    if v_crianca->>'student_id' is not null then
      select id into v_existing_student_id
      from students
      where id = (v_crianca->>'student_id')::uuid
        and school_id = v_solicitacao.school_id;
    end if;

    if v_existing_student_id is not null then
      update students set
        name = v_crianca->>'nome',
        birth_date = nullif(v_crianca->>'nascimento', '')::date,
        contracted_hours = nullif(v_crianca->>'ciclo', '')::numeric,
        turno = nullif(v_crianca->>'turno', ''),
        periodo = nullif(v_periodo, ''),
        contracted_entry_time = v_entry,
        contracted_exit_time = v_exit,
        cidade_nascimento = nullif(v_crianca->>'cidade_nascimento', ''),
        autorizacao_imagem = case v_resp->>'autorizacao_imagem' when 'sim' then true when 'nao' then false else autorizacao_imagem end,
        autorizacao_emergencia_medica = case v_resp->>'autorizacao_emergencia' when 'sim' then true when 'nao' then false else autorizacao_emergencia_medica end
      where id = v_existing_student_id;

      v_student_id := v_existing_student_id;

      -- Garante que quem submeteu o pedido fique vinculado ao aluno --
      -- sem mexer em quem já é o responsável principal/financeiro.
      insert into student_guardians (student_id, guardian_id, school_id, is_primary, is_financial, relationship)
      values (v_student_id, v_solicitacao.family_id, v_solicitacao.school_id, false, false, 'Responsável')
      on conflict (student_id, guardian_id) do nothing;
    else
      insert into students (name, birth_date, contracted_hours, turno, periodo, contracted_entry_time, contracted_exit_time, family_id, school_id, status, cidade_nascimento, autorizacao_imagem, autorizacao_emergencia_medica)
      values (
        v_crianca->>'nome',
        nullif(v_crianca->>'nascimento', '')::date,
        nullif(v_crianca->>'ciclo', '')::numeric,
        nullif(v_crianca->>'turno', ''),
        nullif(v_periodo, ''),
        v_entry,
        v_exit,
        v_solicitacao.family_id,
        v_solicitacao.school_id,
        'idle',
        nullif(v_crianca->>'cidade_nascimento', ''),
        case v_resp->>'autorizacao_imagem' when 'sim' then true when 'nao' then false else null end,
        case v_resp->>'autorizacao_emergencia' when 'sim' then true when 'nao' then false else null end
      )
      returning id into v_student_id;

      v_new_student_ids := array_append(v_new_student_ids, v_student_id);

      insert into student_guardians (student_id, guardian_id, school_id, is_primary, is_financial, relationship)
      values (v_student_id, v_solicitacao.family_id, v_solicitacao.school_id, true, true, 'Responsável Financeiro');
    end if;
  end loop;

  v_autorizado_order := 2;
  for v_autorizado in select * from jsonb_array_elements(coalesce(v_solicitacao.autorizados, '[]'::jsonb))
  loop
    if coalesce(v_autorizado->>'nome', '') <> '' then
      insert into authorized_persons (family_id, school_id, name, relation, has_photo, emergency_order)
      values (v_solicitacao.family_id, v_solicitacao.school_id, v_autorizado->>'nome', coalesce(nullif(v_autorizado->>'parentesco', ''), 'Autorizado'), false, v_autorizado_order);
      v_autorizado_order := v_autorizado_order + 1;
    end if;
  end loop;

  for v_transporte in select * from jsonb_array_elements(coalesce(v_solicitacao.transporte_autorizados, '[]'::jsonb))
  loop
    if coalesce(v_transporte->>'nome', '') <> '' then
      insert into authorized_persons (family_id, school_id, name, relation, has_photo, emergency_order)
      values (v_solicitacao.family_id, v_solicitacao.school_id, v_transporte->>'nome', 'Transporte', false, v_autorizado_order);
      v_autorizado_order := v_autorizado_order + 1;
    end if;
  end loop;

  update matricula_solicitacoes
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null, updated_at = now()
  where id = p_solicitacao_id;

  return jsonb_build_object('new_student_ids', to_jsonb(v_new_student_ids));
end;
$function$;
