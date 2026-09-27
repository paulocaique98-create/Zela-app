-- Hierarquia de contas, Fase 1 (decisão de 27/09/2026): a Gestão passa a
-- ter os poderes que eram só do "admin principal" -- gerenciar/renomear
-- turmas, horário personalizado por dia do aluno, imagem de login,
-- configuração de cobrança da escola e as permissões especiais de usuário
-- (visibilidade total do chat / admin principal).
--
-- Fase PARALELA: o admin principal continua podendo (o corte é a Fase 3,
-- depois da validação). A regra fica numa função só,
-- can_manage_school_settings(), em vez de repetida em 5 lugares.

create or replace function public.can_manage_school_settings()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.get_my_role(), '') in ('developer', 'gestao')
      or (public.get_my_role() = 'admin'
          and coalesce((select is_primary_admin from public.users where id = auth.uid()), false));
$function$;

revoke execute on function public.can_manage_school_settings() from public, anon;
grant execute on function public.can_manage_school_settings() to authenticated;

-- update_school_turmas roda com a permissão de quem chama: a Gestão
-- precisa poder alterar a própria escola (os campos sensíveis continuam
-- protegidos por protect_school_pedagogical_columns).
alter policy "Admins editam a propria escola" on public.schools
  using (id = public.get_my_school_id() and coalesce(public.get_my_role(), '') in ('admin', 'gestao', 'developer'));


CREATE OR REPLACE FUNCTION "public"."update_school_turmas"("p_turmas" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql"
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
  IF NOT public.can_manage_school_settings() THEN
    RAISE EXCEPTION 'Só a Gestão ou o admin principal da escola (ou o suporte) podem gerenciar as turmas.';
  END IF;

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

CREATE OR REPLACE FUNCTION "public"."rename_school_turma"("p_old_name" "text", "p_new_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  IF NOT public.can_manage_school_settings() THEN
    RAISE EXCEPTION 'Só a Gestão ou o admin principal da escola (ou o suporte) podem gerenciar as turmas.';
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

CREATE OR REPLACE FUNCTION "public"."protect_student_weekly_schedule"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_primary_admin boolean;
  v_changed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role -- não restringido
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.weekly_schedule IS DISTINCT FROM '{}'::jsonb;
  ELSE
    v_changed := NEW.weekly_schedule IS DISTINCT FROM OLD.weekly_schedule;
  END IF;

  IF v_changed AND NOT public.can_manage_school_settings() THEN
    RAISE EXCEPTION 'Só a Gestão ou o admin principal da escola (ou o suporte) podem configurar horários personalizados por dia.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."protect_school_pedagogical_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  IF ((NEW.turmas IS DISTINCT FROM OLD.turmas)
     OR (NEW.login_image_url IS DISTINCT FROM OLD.login_image_url)
     OR (NEW.billing_config IS DISTINCT FROM OLD.billing_config))
     AND NOT public.can_manage_school_settings() THEN
    RAISE EXCEPTION 'Só a Gestão ou o admin principal da escola (ou o suporte) podem gerenciar as turmas, a imagem de login ou a configuração de cobrança.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."protect_admin_privilege_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_role text;
  v_caller_primary boolean;
begin
  -- auth.uid() é nulo em contexto de service_role (edge functions/scripts
  -- administrativos) e no trigger de troca de senha do Auth -- esses já
  -- passam por fora da RLS, então não há o que proteger aqui.
  if auth.uid() is null then
    return new;
  end if;

  -- role e school_id definem quem o usuário É e a QUE ESCOLA ele pertence —
  -- só o suporte (developer) pode alterar isso, nunca um admin de escola,
  -- nem mesmo o admin principal.
  if (new.role is distinct from old.role)
     or (new.school_id is distinct from old.school_id) then
    select role into v_caller_role from users where id = auth.uid();

    if v_caller_role is distinct from 'developer' then
      raise exception 'Apenas o suporte pode alterar o cargo ou a escola de um usuário';
    end if;
  end if;

  if ((new.chat_visibilidade_total is distinct from old.chat_visibilidade_total)
      or (new.is_primary_admin is distinct from old.is_primary_admin))
     and not public.can_manage_school_settings() then
    raise exception 'Apenas a Gestão ou o admin principal da escola podem alterar essas permissões';
  end if;

  -- Ninguém desliga a própria troca obrigatória de senha por conta própria;
  -- ela só desliga quando a senha é trocada de verdade.
  if old.must_change_password = true
     and new.must_change_password = false
     and new.id = auth.uid() then
    raise exception 'Defina uma nova senha para continuar';
  end if;

  -- Colunas que definem ACESSO: professor/família não alteram no próprio
  -- cadastro (a escola continua alterando normalmente).
  if new.id = auth.uid()
     and coalesce(public.get_my_role(), '') not in ('admin', 'gestao', 'developer')
     and (new.turmas is distinct from old.turmas
          or new.teacher_status is distinct from old.teacher_status
          or new.status is distinct from old.status
          or new.departamento is distinct from old.departamento) then
    raise exception 'Esses dados do seu cadastro só podem ser alterados pela escola.';
  end if;

  return new;
end;
$$;
