-- P3.2 destravado (decisão revogada pelo usuário 2026-09-01, ver
-- RELATORIO_MESTRE_ESTADO_ATUAL_ZELA.md seção 47) — Módulo de
-- Matérias/Disciplinas, primeiro passo do núcleo acadêmico.
--
-- Associação com turma via texto (class_name), não uma tabela de turmas
-- normalizada -- schools.turmas ainda é text[] (Fase 1/2 da flexibilidade
-- de método pedagógico), decisão deliberada de não aumentar escopo agora.
-- Se/quando turmas forem normalizadas numa tabela própria, migrar
-- class_subjects.class_name -> class_subjects.class_id.

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE public.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, subject_id, class_name)
);

CREATE INDEX idx_subjects_school_id ON public.subjects (school_id);
CREATE INDEX idx_class_subjects_school_id ON public.class_subjects (school_id);
CREATE INDEX idx_class_subjects_subject_id ON public.class_subjects (subject_id);
CREATE INDEX idx_class_subjects_class_name ON public.class_subjects (class_name);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

-- subjects: admin gerencia (CRUD) as matérias da própria escola;
-- professor ativo só lê (nunca cria/edita matéria).
CREATE POLICY "Admins gerenciam materias da escola"
  ON public.subjects FOR ALL
  USING (get_my_role() = 'admin' AND school_id = get_my_school_id())
  WITH CHECK (get_my_role() = 'admin' AND school_id = get_my_school_id());

CREATE POLICY "Professores leem materias da escola"
  ON public.subjects FOR SELECT
  USING (get_my_role() = 'teacher' AND get_my_teacher_status() = 'ativo' AND school_id = get_my_school_id());

-- class_subjects: admin gerencia (associa/desassocia matéria x turma);
-- professor só lê as associações das turmas que ele leciona
-- (get_my_turmas(), mesmo padrão já usado em outras policies de
-- professor no projeto).
CREATE POLICY "Admins gerenciam associacoes materia-turma da escola"
  ON public.class_subjects FOR ALL
  USING (get_my_role() = 'admin' AND school_id = get_my_school_id())
  WITH CHECK (get_my_role() = 'admin' AND school_id = get_my_school_id());

CREATE POLICY "Professores leem associacoes das proprias turmas"
  ON public.class_subjects FOR SELECT
  USING (
    get_my_role() = 'teacher' AND get_my_teacher_status() = 'ativo'
    AND school_id = get_my_school_id()
    AND class_name = ANY (get_my_turmas())
  );

-- updated_at automático em subjects (mesmo padrão simples já usado em
-- outras tabelas do projeto, sem trigger genérica compartilhada).
CREATE OR REPLACE FUNCTION public.touch_subjects_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_subjects_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER touch_subjects_updated_at_trigger
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_subjects_updated_at();
