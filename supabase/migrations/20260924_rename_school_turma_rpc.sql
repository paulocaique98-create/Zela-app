-- Renomear turma com propagação -- até aqui, update_school_turmas tratava
-- "sumiu da lista" como remoção e bloqueava se estivesse em uso, mesmo
-- quando era só um erro de digitação (ex.: "Kids I" -> "Kids l"). Isso
-- travava o admin sem saída pra um caso comum e sem gravidade nenhuma.
--
-- rename_school_turma troca o nome em TODA tabela que referencia turma
-- por texto, numa única transação (a própria função já é uma transação):
-- students.turma, users.turmas (array), mural_fotos.turmas (array),
-- comunicados.turmas (array), class_subjects.class_name,
-- class_attendance.class_name, classes.name (tabela normalizada, ver
-- 20260901g_normalize_classes_phase1.sql) e schools.turmas por último.
-- Mesma checagem de permissão explícita de update_school_turmas (não
-- confia só em RLS -- é exatamente o bug silencioso achado e corrigido
-- lá: pra role sem policy de UPDATE, um UPDATE afeta 0 linhas sem erro
-- nenhum).
--
-- Ordem importa: `classes` é renomeada ANTES de class_subjects/
-- class_attendance de propósito. Essas duas tabelas têm uma trigger
-- (resolve_class_id_from_name) que roda em UPDATE OF class_name e
-- resolve (ou CRIA, se não achar) a linha correspondente em `classes`.
-- Se a gente renomeasse classes por último, a trigger acharia
-- `classes.name = v_new` inexistente ainda e criaria uma linha NOVA
-- duplicada -- daí a renomeação de `classes` (linha antiga name=v_old)
-- bateria de frente com essa linha nova (UNIQUE (school_id, name)) e
-- toda a transação falharia com um erro de banco cru, não a mensagem
-- amigável. Renomeando `classes` primeiro, a trigger já encontra a
-- linha (agora com name=v_new) e só reaproveita o id -- sem inserir
-- nada novo.
--
-- SECURITY DEFINER: achado ao testar ao vivo -- `class_attendance` não
-- tem NENHUMA policy de UPDATE pra admin (só SELECT, pra "Admins leem
-- frequencia da escola"). Com a função em SECURITY INVOKER (padrão),
-- a UPDATE nessa tabela afetava 0 linhas SILENCIOSAMENTE por RLS --
-- mesma classe de bug já achada e corrigida em update_school_turmas,
-- só que dessa vez numa tabela que nem tem policy de escrita nenhuma
-- pra admin (não dava pra resolver só com checagem de row-count runtime
-- pré-permissão como lá; teria bloqueado a propagação de verdade).
-- Seguro porque a checagem de permissão explícita (developer ou admin
-- principal) roda ANTES de qualquer escrita, igual ao padrão já usado
-- em protect_school_pedagogical_columns/resolve_class_id_from_name.
CREATE OR REPLACE FUNCTION public.rename_school_turma(p_old_name text, p_new_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_role text;
  v_is_primary_admin boolean;
  v_old text := trim(p_old_name);
  v_new text := trim(p_new_name);
  v_turmas text[];
  v_rows_updated int;
BEGIN
  v_school_id := public.get_my_school_id();
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem escola vinculada.';
  END IF;

  v_role := public.get_my_role();
  IF v_role = 'developer' THEN
    NULL;
  ELSIF v_role = 'admin' THEN
    SELECT is_primary_admin INTO v_is_primary_admin FROM public.users WHERE id = auth.uid();
    IF v_is_primary_admin IS NOT TRUE THEN
      RAISE EXCEPTION 'Só o admin principal da escola pode gerenciar as turmas.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Só o admin principal da escola (ou o suporte) pode gerenciar as turmas.';
  END IF;

  IF v_old = '' OR v_new = '' THEN
    RAISE EXCEPTION 'Nome de turma não pode ser vazio.';
  END IF;
  IF v_old = v_new THEN
    RAISE EXCEPTION 'O novo nome é igual ao atual.';
  END IF;

  SELECT turmas INTO v_turmas FROM public.schools WHERE id = v_school_id;
  v_turmas := COALESCE(v_turmas, ARRAY[]::text[]);

  IF NOT (v_old = ANY(v_turmas)) THEN
    RAISE EXCEPTION 'A turma "%" não existe na lista de turmas desta escola.', v_old;
  END IF;
  IF v_new = ANY(v_turmas) THEN
    RAISE EXCEPTION 'Já existe uma turma chamada "%".', v_new;
  END IF;

  -- Defesa extra: `classes` é alimentada por uso real (class_subjects/
  -- class_attendance), então pode ter um nome que nunca foi adicionado
  -- em schools.turmas (dado legado/órfão). Checa aqui pra devolver uma
  -- mensagem amigável em vez de deixar a UPDATE abaixo estourar
  -- unique_violation cru.
  IF EXISTS (SELECT 1 FROM public.classes WHERE school_id = v_school_id AND name = v_new) THEN
    RAISE EXCEPTION 'Já existe uma turma chamada "%" nos registros da escola.', v_new;
  END IF;

  -- Propagação -- `classes` primeiro (ver comentário no topo do arquivo
  -- sobre a ordem), depois todas as tabelas que referenciam turma por
  -- texto, e schools.turmas por último.
  UPDATE public.classes SET name = v_new WHERE school_id = v_school_id AND name = v_old;

  UPDATE public.students SET turma = v_new WHERE school_id = v_school_id AND turma = v_old;

  UPDATE public.users SET turmas = array_replace(turmas, v_old, v_new)
    WHERE school_id = v_school_id AND role = 'teacher' AND v_old = ANY(turmas);

  UPDATE public.mural_fotos SET turmas = array_replace(turmas, v_old, v_new)
    WHERE school_id = v_school_id AND v_old = ANY(turmas);

  UPDATE public.comunicados SET turmas = array_replace(turmas, v_old, v_new)
    WHERE school_id = v_school_id AND v_old = ANY(turmas);

  UPDATE public.class_subjects SET class_name = v_new WHERE school_id = v_school_id AND class_name = v_old;

  UPDATE public.class_attendance SET class_name = v_new WHERE school_id = v_school_id AND class_name = v_old;

  UPDATE public.schools SET turmas = array_replace(turmas, v_old, v_new) WHERE id = v_school_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Não foi possível renomear a turma -- escola não encontrada ou sem permissão.';
  END IF;

  RETURN jsonb_build_object('turmas', to_jsonb(array_replace(v_turmas, v_old, v_new)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_school_turma(text, text) TO authenticated;
