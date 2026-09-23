-- Novo tipo de solicitação: "atualizacao_cadastral" -- usado quando o aluno
-- JÁ está matriculado oficialmente no Zela e só precisa que dados históricos
-- (endereço, ficha médica, contatos de emergência) sejam conferidos e
-- incorporados ao cadastro que já existe. Diferente de 'matricula' e
-- 'rematricula', aprovar este tipo NUNCA cria um aluno novo -- só atualiza
-- o que já existe, casado pelo student_id gravado dentro de cada item de
-- "criancas". Passa pela MESMA tela de Pendentes/mesmo card de revisão já
-- usado pra matrícula e rematrícula.
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.matricula_solicitacoes DROP CONSTRAINT matricula_solicitacoes_tipo_check;
ALTER TABLE public.matricula_solicitacoes ADD CONSTRAINT matricula_solicitacoes_tipo_check
  CHECK (tipo = ANY (ARRAY['matricula'::text, 'rematricula'::text, 'atualizacao_cadastral'::text]));

CREATE OR REPLACE FUNCTION public.approve_atualizacao_cadastral(p_solicitacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
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
  v_updated_students uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT * INTO v_solicitacao FROM matricula_solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;
  IF v_solicitacao.status <> 'pending' THEN
    RAISE EXCEPTION 'Solicitação já foi % — nada a fazer', v_solicitacao.status;
  END IF;
  IF v_solicitacao.tipo <> 'atualizacao_cadastral' THEN
    RAISE EXCEPTION 'Esta função só aprova solicitações do tipo atualizacao_cadastral';
  END IF;

  -- SECURITY DEFINER bypassa o RLS que normalmente isolaria escolas entre
  -- si -- por isso a checagem de permissão precisa ser feita aqui dentro,
  -- na mão, senão um admin de outra escola poderia aprovar (e sobrescrever
  -- dados de) uma solicitação que não é da escola dele.
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('admin', 'developer')
    AND (role = 'developer' OR school_id = v_solicitacao.school_id)
  ) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  v_family_id := v_solicitacao.family_id;
  v_resp := v_solicitacao.responsavel_financeiro;

  -- 1. Responsável financeiro: CPF/RG/documentos/endereço estruturado/
  -- profissão/estado civil -- só preenche o que estiver vazio, nunca
  -- sobrescreve o que já existe por outra via.
  UPDATE users SET
    profession = COALESCE(profession, NULLIF(v_resp->>'profissao', '')),
    civil_status = COALESCE(civil_status, NULLIF(v_resp->>'estado_civil', '')),
    doc_type = COALESCE(doc_type, CASE WHEN NULLIF(v_resp->>'cpf', '') IS NOT NULL THEN 'CPF' ELSE NULL END),
    doc_number = COALESCE(doc_number, NULLIF(v_resp->>'cpf', '')),
    documents = CASE WHEN documents IS NULL OR documents = '{}'::jsonb THEN
      jsonb_build_object('rg_expedicao', NULLIF(v_resp->>'rg_expedicao', ''), 'rg_orgao', NULLIF(v_resp->>'rg_orgao', ''))
      ELSE documents END,
    street = COALESCE(street, NULLIF(v_resp->>'rua', '')),
    number = COALESCE(number, NULLIF(v_resp->>'numero', '')),
    complement = COALESCE(complement, NULLIF(v_resp->>'complemento', '')),
    neighborhood = COALESCE(neighborhood, NULLIF(v_resp->>'bairro', '')),
    city = COALESCE(city, NULLIF(v_resp->>'cidade', '')),
    state = COALESCE(state, NULLIF(v_resp->>'uf', '')),
    zip_code = COALESCE(zip_code, NULLIF(v_resp->>'cep', ''))
  WHERE id = v_family_id;

  -- 2. Cada criança dentro da solicitação já carrega o student_id do aluno
  -- JÁ matriculado -- cidade de nascimento, autorizações, período/ciclo
  -- (só o que estiver vazio) + ficha médica (só se ainda não existir
  -- nenhuma).
  FOR v_crianca IN SELECT * FROM jsonb_array_elements(COALESCE(v_solicitacao.criancas, '[]'::jsonb))
  LOOP
    v_student_id := (v_crianca->>'student_id')::uuid;
    IF v_student_id IS NULL THEN CONTINUE; END IF;

    v_periodo := v_crianca->>'periodo_normalizado';
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

    UPDATE students SET
      cidade_nascimento = COALESCE(cidade_nascimento, NULLIF(v_crianca->>'cidade_nascimento', '')),
      autorizacao_imagem = COALESCE(autorizacao_imagem, CASE v_resp->>'autorizacao_imagem' WHEN 'sim' THEN true WHEN 'nao' THEN false ELSE NULL END),
      autorizacao_emergencia_medica = COALESCE(autorizacao_emergencia_medica, CASE v_resp->>'autorizacao_emergencia' WHEN 'sim' THEN true WHEN 'nao' THEN false ELSE NULL END),
      periodo = COALESCE(periodo, NULLIF(v_periodo, '')),
      turno = COALESCE(turno, NULLIF(v_crianca->>'turno', '')),
      contracted_hours = COALESCE(contracted_hours, NULLIF(v_crianca->>'ciclo_numero', '')::numeric),
      contracted_entry_time = COALESCE(contracted_entry_time, v_entry),
      contracted_exit_time = COALESCE(contracted_exit_time, v_exit)
    WHERE id = v_student_id;

    IF NOT EXISTS (SELECT 1 FROM fichas_medicas WHERE student_id = v_student_id) THEN
      INSERT INTO fichas_medicas (
        school_id, student_id,
        tem_restricao_alimentar, restricoes_alimentares,
        tem_restricao_saude, restricoes_saude,
        consultou_especialista, especialistas,
        faz_tratamento, tratamentos,
        usa_medicamento, medicamentos,
        tem_habito_importante, habitos_importantes
      ) VALUES (
        v_solicitacao.school_id, v_student_id,
        COALESCE((v_crianca->'restricoes_alimentares')::jsonb <> '[]'::jsonb, false),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_crianca->'restricoes_alimentares', '[]'::jsonb))), ARRAY[]::text[]),
        COALESCE((v_crianca->'restricoes_saude')::jsonb <> '[]'::jsonb, false),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_crianca->'restricoes_saude', '[]'::jsonb))), ARRAY[]::text[]),
        COALESCE((v_crianca->'especialistas')::jsonb <> '[]'::jsonb, false),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_crianca->'especialistas', '[]'::jsonb))), ARRAY[]::text[]),
        COALESCE((v_crianca->'tratamentos')::jsonb <> '[]'::jsonb, false),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_crianca->'tratamentos', '[]'::jsonb))), ARRAY[]::text[]),
        false, ARRAY[]::text[],
        COALESCE((v_crianca->'habitos_importantes')::jsonb <> '[]'::jsonb, false),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_crianca->'habitos_importantes', '[]'::jsonb))), ARRAY[]::text[])
      );
    END IF;

    v_updated_students := array_append(v_updated_students, v_student_id);
  END LOOP;

  -- 3. Contatos de emergência -- só os que ainda não existem pra essa
  -- família (comparação por nome, sem acento/maiúscula). A escola tem um
  -- limite de autorizados por responsável (gatilho enforce_authorized_
  -- persons_limit) -- planilhas antigas às vezes trazem mais contatos do
  -- que o limite atual permite. Em vez de deixar isso derrubar a aprovação
  -- inteira (perderia ficha médica/endereço/etc junto), para de inserir
  -- autorizados assim que o limite for atingido e segue o resto normalmente.
  v_max_order := COALESCE((SELECT MAX(emergency_order) FROM authorized_persons WHERE family_id = v_family_id), 1);
  FOR v_autorizado IN SELECT * FROM jsonb_array_elements(COALESCE(v_solicitacao.autorizados, '[]'::jsonb))
  LOOP
    IF COALESCE(v_autorizado->>'nome', '') = '' THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM authorized_persons
      WHERE family_id = v_family_id
      AND lower(unaccent(name)) = lower(unaccent(v_autorizado->>'nome'))
    ) THEN
      v_max_order := v_max_order + 1;
      BEGIN
        INSERT INTO authorized_persons (family_id, school_id, name, relation, has_photo, emergency_order)
        VALUES (v_family_id, v_solicitacao.school_id, v_autorizado->>'nome', COALESCE(NULLIF(v_autorizado->>'parentesco', ''), 'Autorizado'), false, v_max_order);
      EXCEPTION WHEN SQLSTATE 'P0001' THEN
        EXIT; -- limite atingido -- os demais autorizados dessa lista ficam de fora, adicionar manualmente se precisar.
      END;
    END IF;
  END LOOP;

  UPDATE matricula_solicitacoes
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_solicitacao_id;

  RETURN jsonb_build_object('updated_student_ids', to_jsonb(v_updated_students));
END;
$function$;
