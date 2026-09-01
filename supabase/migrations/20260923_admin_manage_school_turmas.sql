-- Gestão de turmas pela própria escola — até aqui, `schools.turmas` só
-- podia ser alterado pelo developer (protect_school_pedagogical_columns),
-- forçando toda escola a depender de suporte manual pra adicionar/remover
-- uma turma. Isso contraria a autonomia que a escola deve ter sobre o
-- próprio quadro de turmas.
--
-- Abre uma exceção pontual, restrita à coluna `turmas` e só para o admin
-- PRINCIPAL da escola (is_primary_admin = true) — evita que admins comuns
-- (ex.: um admin de departamento financeiro) mudem a estrutura acadêmica
-- sem coordenação. As outras colunas protegidas pela mesma trigger
-- (pedagogical_method, custom_config, is_active, features_enabled,
-- limits, plan) continuam exclusivas do developer, sem nenhuma mudança.
--
-- A escrita em si só é permitida através da RPC update_school_turmas
-- abaixo (não é um UPDATE direto do client em schools.turmas) porque
-- remover ou renomear uma turma que já está em uso (aluno matriculado,
-- professor vinculado, mural/comunicado segmentado, matéria ou
-- frequência lançada) deixaria essas linhas "órfãs" — apontando pra uma
-- turma que não existe mais na lista oficial da escola. A RPC valida
-- isso antes de gravar; um UPDATE direto não teria como.

-- 1. Trigger: abre exceção só pra `turmas`, só pro admin principal.
CREATE OR REPLACE FUNCTION public.protect_school_pedagogical_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_primary_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role -- não restringido
  END IF;

  IF (NEW.pedagogical_method IS DISTINCT FROM OLD.pedagogical_method)
     OR (NEW.custom_config IS DISTINCT FROM OLD.custom_config)
     OR (NEW.is_active IS DISTINCT FROM OLD.is_active)
     OR (NEW.features_enabled IS DISTINCT FROM OLD.features_enabled)
     OR (NEW.limits IS DISTINCT FROM OLD.limits)
     OR (NEW.plan IS DISTINCT FROM OLD.plan) THEN
    IF public.get_my_role() IS DISTINCT FROM 'developer' THEN
      RAISE EXCEPTION 'Apenas o suporte (developer) pode alterar essas configurações da escola (método pedagógico, status, módulos contratados, limites ou plano).';
    END IF;
  END IF;

  IF (NEW.turmas IS DISTINCT FROM OLD.turmas) THEN
    IF public.get_my_role() = 'developer' THEN
      -- ok, developer sempre pode
      NULL;
    ELSIF public.get_my_role() = 'admin' THEN
      SELECT is_primary_admin INTO v_is_primary_admin FROM public.users WHERE id = auth.uid();
      IF v_is_primary_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Só o admin principal da escola pode gerenciar as turmas.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Só o admin principal da escola (ou o suporte) pode gerenciar as turmas.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. RPC: única forma legítima de alterar schools.turmas fora do
-- developer -- valida uso antes de permitir remover/renomear uma turma.
-- SECURITY INVOKER (padrão): roda com as permissões de quem chama, então
-- a RLS de schools ("Admins editam a propria escola") e a trigger acima
-- continuam valendo normalmente -- essa função só adiciona a validação
-- de uso, não abre nenhum privilégio novo.
CREATE OR REPLACE FUNCTION public.update_school_turmas(p_turmas text[])
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_school_id uuid;
  v_old_turmas text[];
  v_new_turmas text[];
  v_removed text;
  v_usage jsonb;
  v_count int;
  v_role text;
  v_is_primary_admin boolean;
  v_rows_updated int;
BEGIN
  v_school_id := public.get_my_school_id();
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem escola vinculada.';
  END IF;

  -- Checagem explícita de permissão -- não basta confiar só na RLS/trigger
  -- de schools: pra role sem policy de UPDATE (teacher, family), o UPDATE
  -- abaixo afetaria 0 linhas SILENCIOSAMENTE (sem erro nenhum), e a função
  -- devolveria sucesso mesmo sem ter gravado nada. Acontece só com essa
  -- checagem aqui que teacher/family recebem o erro de verdade.
  v_role := public.get_my_role();
  IF v_role = 'developer' THEN
    NULL; -- ok
  ELSIF v_role = 'admin' THEN
    SELECT is_primary_admin INTO v_is_primary_admin FROM public.users WHERE id = auth.uid();
    IF v_is_primary_admin IS NOT TRUE THEN
      RAISE EXCEPTION 'Só o admin principal da escola pode gerenciar as turmas.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Só o admin principal da escola (ou o suporte) pode gerenciar as turmas.';
  END IF;

  -- Normaliza: apara espaços, remove vazios, remove duplicatas mantendo
  -- a primeira ocorrência (ordem importa pra exibição na tela).
  SELECT array_agg(t ORDER BY min_ord) INTO v_new_turmas
  FROM (
    SELECT trim(t) AS t, min(ord) AS min_ord
    FROM unnest(p_turmas) WITH ORDINALITY AS u(t, ord)
    WHERE trim(t) <> ''
    GROUP BY trim(t)
  ) dedup;
  v_new_turmas := COALESCE(v_new_turmas, ARRAY[]::text[]);

  SELECT turmas INTO v_old_turmas FROM public.schools WHERE id = v_school_id;
  v_old_turmas := COALESCE(v_old_turmas, ARRAY[]::text[]);

  -- Turmas que existiam e não estão mais na lista nova (removidas ou
  -- renomeadas -- do ponto de vista de validação de uso, é o mesmo caso:
  -- o texto antigo deixaria de existir na lista oficial da escola).
  FOR v_removed IN SELECT unnest(v_old_turmas) EXCEPT SELECT unnest(v_new_turmas)
  LOOP
    v_usage := '[]'::jsonb;

    SELECT count(*) INTO v_count FROM public.students WHERE school_id = v_school_id AND turma = v_removed;
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Alunos', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.users WHERE school_id = v_school_id AND role = 'teacher' AND v_removed = ANY(turmas);
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Professores', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.mural_fotos WHERE school_id = v_school_id AND v_removed = ANY(turmas);
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Mural de fotos', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.comunicados WHERE school_id = v_school_id AND v_removed = ANY(turmas);
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Comunicados', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.class_subjects WHERE school_id = v_school_id AND class_name = v_removed;
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Matérias', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.class_attendance WHERE school_id = v_school_id AND class_name = v_removed;
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Frequência', 'quantidade', v_count); END IF;

    IF jsonb_array_length(v_usage) > 0 THEN
      RAISE EXCEPTION 'A turma "%" não pode ser removida ou renomeada: ainda está em uso (%).', v_removed, v_usage
        USING ERRCODE = 'raise_exception';
    END IF;
  END LOOP;

  UPDATE public.schools SET turmas = v_new_turmas WHERE id = v_school_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Não foi possível salvar as turmas -- escola não encontrada ou sem permissão.';
  END IF;

  RETURN jsonb_build_object('turmas', to_jsonb(v_new_turmas));
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_school_turmas(text[]) TO authenticated;
