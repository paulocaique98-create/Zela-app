-- Trilha B (normalização de turmas) — FASE 1, escopo deliberadamente
-- reduzido. A normalização completa (students.turma, users.turmas,
-- mural_fotos.turmas, comunicados.turmas + ~8 componentes de frontend)
-- é um projeto grande demais pra uma passada só, com risco real de
-- regressão em fluxos críticos (students.turma alimenta
-- get_my_turmas()/RLS de professor, e é usada no reconhecimento facial
-- do Totem via matching por turma). Fase 1 resolve só a dívida que ESTA
-- sessão introduziu (class_subjects, class_attendance) sem tocar em
-- nada pré-existente nem em nenhum componente de frontend.
--
-- Estratégia: `classes` (tabela normalizada de verdade) é alimentada
-- AUTOMATICAMENTE por uma trigger em class_subjects/class_attendance --
-- o frontend continua escrevendo class_name (texto) exatamente como já
-- fazia, sem nenhuma mudança; a trigger resolve (ou cria, se for turma
-- nova) a linha correspondente em `classes` e preenche class_id por
-- trás. Zero risco pro que já funciona, e classes vira dado real desde
-- já -- fundação pronta pra quando (e se) a normalização completa for
-- decidida.

CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE INDEX idx_classes_school_id ON public.classes (school_id);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Só leitura pra admin/professor da própria escola -- sem nenhuma
-- policy de escrita: a única forma de popular `classes` é via a trigger
-- SECURITY DEFINER abaixo (roda como o dono/postgres, que ignora RLS
-- por ser superuser -- mesmo mecanismo já usado em outras triggers do
-- projeto).
CREATE POLICY "Admins leem turmas normalizadas da escola"
  ON public.classes FOR SELECT
  USING (get_my_role() = 'admin' AND school_id = get_my_school_id());

CREATE POLICY "Professores leem turmas normalizadas da escola"
  ON public.classes FOR SELECT
  USING (get_my_role() = 'teacher' AND get_my_teacher_status() = 'ativo' AND school_id = get_my_school_id());

-- Backfill: toda turma REAL já usada em qualquer lugar do sistema (não
-- só o que schools.turmas tem configurado -- muitas escolas nunca
-- configuraram isso explicitamente e usam o fallback global, mas os
-- dados reais de students/users/etc já têm os nomes de verdade).
INSERT INTO public.classes (school_id, name)
SELECT DISTINCT school_id, class_name FROM (
  SELECT school_id, turma AS class_name FROM public.students WHERE turma IS NOT NULL
  UNION
  SELECT school_id, unnest(turmas) FROM public.users WHERE turmas IS NOT NULL
  UNION
  SELECT school_id, class_name FROM public.class_subjects
  UNION
  SELECT school_id, class_name FROM public.class_attendance
  UNION
  SELECT school_id, unnest(turmas) FROM public.mural_fotos WHERE turmas IS NOT NULL
  UNION
  SELECT school_id, unnest(turmas) FROM public.comunicados WHERE turmas IS NOT NULL
) all_class_names
WHERE class_name IS NOT NULL AND class_name <> ''
ON CONFLICT (school_id, name) DO NOTHING;

-- class_id nas 2 tabelas que criei nesta sessão (a dívida que eu mesmo
-- introduzi). Nullable de propósito -- nunca bloqueia um insert/update
-- que já funcionava, a trigger preenche sozinha.
ALTER TABLE public.class_subjects ADD COLUMN class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.class_attendance ADD COLUMN class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;

CREATE INDEX idx_class_subjects_class_id ON public.class_subjects (class_id);
CREATE INDEX idx_class_attendance_class_id ON public.class_attendance (class_id);

-- Backfill das linhas existentes.
UPDATE public.class_subjects cs SET class_id = c.id
FROM public.classes c WHERE c.school_id = cs.school_id AND c.name = cs.class_name AND cs.class_id IS NULL;

UPDATE public.class_attendance ca SET class_id = c.id
FROM public.classes c WHERE c.school_id = ca.school_id AND c.name = ca.class_name AND ca.class_id IS NULL;

-- Trigger: resolve (ou cria) a turma normalizada e preenche class_id
-- automaticamente, toda vez que class_name é gravado -- não exige NENHUMA
-- mudança nos componentes de frontend que já escrevem essas tabelas.
CREATE OR REPLACE FUNCTION public.resolve_class_id_from_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_id uuid;
BEGIN
  IF NEW.class_name IS NULL OR NEW.class_name = '' THEN
    NEW.class_id := NULL;
    RETURN NEW;
  END IF;

  SELECT id INTO v_class_id FROM public.classes WHERE school_id = NEW.school_id AND name = NEW.class_name;
  IF v_class_id IS NULL THEN
    INSERT INTO public.classes (school_id, name) VALUES (NEW.school_id, NEW.class_name)
      ON CONFLICT (school_id, name) DO UPDATE SET name = EXCLUDED.name -- no-op, só pra devolver o id em corrida concorrente
      RETURNING id INTO v_class_id;
  END IF;

  NEW.class_id := v_class_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_class_id_from_name() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER resolve_class_id_from_name_trigger
  BEFORE INSERT OR UPDATE OF class_name ON public.class_subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_class_id_from_name();

CREATE TRIGGER resolve_class_id_from_name_trigger
  BEFORE INSERT OR UPDATE OF class_name ON public.class_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_class_id_from_name();
