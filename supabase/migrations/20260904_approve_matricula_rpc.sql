-- Aprovação de matrícula: antes era feita em várias chamadas separadas do
-- client (update do responsável, insert de cada aluno, insert de vínculos,
-- insert de autorizados), sem atomicidade — se uma etapa falhasse no meio,
-- ficavam alunos "órfãos" já criados e o retry duplicava tudo de novo.
--
-- Essa função roda tudo numa única transação (uma chamada de função Postgres
-- É uma transação): se qualquer etapa falhar, TUDO é revertido, e a
-- solicitação continua 'pending' — retry seguro, sem duplicar nada. SECURITY
-- INVOKER (padrão) para continuar respeitando a RLS de quem chama (admin).
--
-- A criação de login do 2º responsável continua fora daqui (é uma chamada de
-- API do Auth, não dá pra rodar dentro de uma function SQL) — o client chama
-- essa function primeiro, depois (se houver 2º responsável) cria a conta dele
-- separadamente, já com os student_ids retornados aqui.
CREATE OR REPLACE FUNCTION public.approve_matricula(p_solicitacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_solicitacao record;
  v_resp jsonb;
  v_crianca jsonb;
  v_autorizado jsonb;
  v_transporte jsonb;
  v_student_id uuid;
  v_new_student_ids uuid[] := ARRAY[]::uuid[];
  v_periodo text;
  v_entry time;
  v_exit time;
  v_autorizado_order int;
BEGIN
  SELECT * INTO v_solicitacao FROM matricula_solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;
  IF v_solicitacao.status <> 'pending' THEN
    RAISE EXCEPTION 'Solicitação já foi % — nada a fazer', v_solicitacao.status;
  END IF;

  v_resp := v_solicitacao.responsavel_financeiro;

  -- 1. Enriquece o cadastro do responsável financeiro (já é o family_id logado)
  UPDATE users SET
    phone = NULLIF(v_resp->>'telefone', ''),
    doc_type = CASE WHEN v_resp->>'cpf' IS NOT NULL AND v_resp->>'cpf' <> '' THEN 'CPF' ELSE NULL END,
    doc_number = NULLIF(v_resp->>'cpf', ''),
    profession = NULLIF(v_resp->>'profissao', ''),
    civil_status = NULLIF(v_resp->>'estado_civil', ''),
    documents = jsonb_build_object(
      'cpf_doc', v_resp->'cpf_doc',
      'rg_doc', v_resp->'rg_doc',
      'comprovante_residencia_doc', v_resp->'comprovante_residencia_doc',
      'plano_saude_doc', v_resp->'plano_saude_doc',
      'cartao_vacina_doc', v_resp->'cartao_vacina_doc',
      'rg_expedicao', v_resp->'rg_expedicao',
      'rg_orgao', v_resp->'rg_orgao'
    )
  WHERE id = v_solicitacao.family_id;

  -- 2. Cria os alunos + vínculo do responsável financeiro
  FOR v_crianca IN SELECT * FROM jsonb_array_elements(COALESCE(v_solicitacao.criancas, '[]'::jsonb))
  LOOP
    v_periodo := v_crianca->>'periodo';
    v_entry := CASE v_periodo
      WHEN '07:00 às 13:00' THEN TIME '07:00'
      WHEN '07:00 às 15:00' THEN TIME '07:00'
      WHEN '07:00 às 17:00' THEN TIME '07:00'
      WHEN '09:00 às 19:00' THEN TIME '09:00'
      WHEN '11:00 às 19:00' THEN TIME '11:00'
      WHEN '13:00 às 19:00' THEN TIME '13:00'
      ELSE NULL
    END;
    v_exit := CASE v_periodo
      WHEN '07:00 às 13:00' THEN TIME '13:00'
      WHEN '07:00 às 15:00' THEN TIME '15:00'
      WHEN '07:00 às 17:00' THEN TIME '17:00'
      WHEN '09:00 às 19:00' THEN TIME '19:00'
      WHEN '11:00 às 19:00' THEN TIME '19:00'
      WHEN '13:00 às 19:00' THEN TIME '19:00'
      ELSE NULL
    END;

    INSERT INTO students (name, birth_date, contracted_hours, turno, periodo, contracted_entry_time, contracted_exit_time, family_id, school_id, status)
    VALUES (
      v_crianca->>'nome',
      NULLIF(v_crianca->>'nascimento', '')::date,
      NULLIF(v_crianca->>'ciclo', '')::numeric,
      NULLIF(v_crianca->>'turno', ''),
      NULLIF(v_periodo, ''),
      v_entry,
      v_exit,
      v_solicitacao.family_id,
      v_solicitacao.school_id,
      'idle'
    )
    RETURNING id INTO v_student_id;

    v_new_student_ids := array_append(v_new_student_ids, v_student_id);

    INSERT INTO student_guardians (student_id, guardian_id, school_id, is_primary, is_financial, relationship)
    VALUES (v_student_id, v_solicitacao.family_id, v_solicitacao.school_id, true, true, 'Responsável Financeiro');
  END LOOP;

  -- 3. Autorizados (retirada + transporte) — vinculados à conta do responsável financeiro
  v_autorizado_order := 2;
  FOR v_autorizado IN SELECT * FROM jsonb_array_elements(COALESCE(v_solicitacao.autorizados, '[]'::jsonb))
  LOOP
    IF COALESCE(v_autorizado->>'nome', '') <> '' THEN
      INSERT INTO authorized_persons (family_id, school_id, name, relation, has_photo, emergency_order)
      VALUES (v_solicitacao.family_id, v_solicitacao.school_id, v_autorizado->>'nome', COALESCE(NULLIF(v_autorizado->>'parentesco', ''), 'Autorizado'), false, v_autorizado_order);
      v_autorizado_order := v_autorizado_order + 1;
    END IF;
  END LOOP;

  FOR v_transporte IN SELECT * FROM jsonb_array_elements(COALESCE(v_solicitacao.transporte_autorizados, '[]'::jsonb))
  LOOP
    IF COALESCE(v_transporte->>'nome', '') <> '' THEN
      INSERT INTO authorized_persons (family_id, school_id, name, relation, has_photo, emergency_order)
      VALUES (v_solicitacao.family_id, v_solicitacao.school_id, v_transporte->>'nome', 'Transporte', false, v_autorizado_order);
      v_autorizado_order := v_autorizado_order + 1;
    END IF;
  END LOOP;

  -- 4. Marca a solicitação como aprovada — só chega aqui se TUDO acima deu certo
  UPDATE matricula_solicitacoes
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = NULL, updated_at = now()
  WHERE id = p_solicitacao_id;

  RETURN jsonb_build_object('new_student_ids', to_jsonb(v_new_student_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_matricula(uuid) TO authenticated;
