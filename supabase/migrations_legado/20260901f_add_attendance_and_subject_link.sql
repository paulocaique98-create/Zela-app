-- P3.2 (núcleo acadêmico) — Trilha A: frequência formal + vínculo de
-- pedagogical_records com subjects.
--
-- Achado antes de implementar: a proposta original pedia uma tabela
-- "assessments" (avaliações) separada, com nota numérica no tradicional
-- e registro descritivo no Montessori. `pedagogical_records` (Diário
-- Pedagógico) JÁ É essa peça — content jsonb, record_type extensível,
-- author_id/student_id/school_id, RLS já madura (professor cria/edita só
-- os próprios, restrito às turmas que leciona; admin só lê). Criar uma
-- tabela paralela duplicaria isso. TURMAS = Nido/Kids I/Kids II
-- (educação infantil) reforça a escolha: a LDB não prevê nota numérica
-- pra essa faixa etária, só avaliação descritiva -- exatamente o que já
-- existe. Em vez de uma tabela nova, isto aqui só adiciona subject_id
-- (opcional) em pedagogical_records, o "próximo passo natural" já
-- documentado em METODO_PEDAGOGICO.md.

ALTER TABLE public.pedagogical_records
  ADD COLUMN subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;
-- ON DELETE SET NULL, não CASCADE: apagar uma matéria não pode apagar
-- histórico pedagógico real de um aluno -- só desvincula.

CREATE INDEX idx_pedagogical_records_subject_id ON public.pedagogical_records (subject_id);

-- Frequência formal (chamada letiva) -- distinta do check-in/out de
-- segurança (attendance_logs/students.status), que já existe pra
-- controle de acesso/portaria. Esta é o registro pedagógico de presença
-- do dia, pro histórico/boletim.
CREATE TABLE public.class_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('presente', 'ausente', 'atrasado', 'justificado')),
  notes text,
  recorded_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);

CREATE INDEX idx_class_attendance_school_id ON public.class_attendance (school_id);
CREATE INDEX idx_class_attendance_student_id ON public.class_attendance (student_id);
CREATE INDEX idx_class_attendance_date ON public.class_attendance (date);

ALTER TABLE public.class_attendance ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de pedagogical_records: admin só lê (não edita registro
-- de frequência feito pelo professor); professor cria/lê/edita/apaga só
-- os próprios registros, restritos aos alunos das turmas que leciona.
CREATE POLICY "Admins leem frequencia da escola"
  ON public.class_attendance FOR SELECT
  USING (get_my_role() = 'admin' AND school_id = get_my_school_id());

CREATE POLICY "Professores criam frequencia dos alunos de suas turmas"
  ON public.class_attendance FOR INSERT
  WITH CHECK (
    get_my_role() = 'teacher' AND get_my_teacher_status() = 'ativo'
    AND recorded_by = auth.uid() AND school_id = get_my_school_id()
    AND student_id IN (SELECT id FROM public.students WHERE turma = ANY (get_my_turmas()) AND school_id = get_my_school_id())
  );

CREATE POLICY "Professores leem frequencia dos alunos de suas turmas"
  ON public.class_attendance FOR SELECT
  USING (
    get_my_role() = 'teacher' AND get_my_teacher_status() = 'ativo'
    AND school_id = get_my_school_id()
    AND student_id IN (SELECT id FROM public.students WHERE turma = ANY (get_my_turmas()) AND school_id = get_my_school_id())
  );

CREATE POLICY "Professores editam apenas seus proprios registros de frequencia"
  ON public.class_attendance FOR UPDATE
  USING (get_my_role() = 'teacher' AND get_my_teacher_status() = 'ativo' AND recorded_by = auth.uid())
  WITH CHECK (
    get_my_role() = 'teacher' AND get_my_teacher_status() = 'ativo'
    AND recorded_by = auth.uid() AND school_id = get_my_school_id()
    AND student_id IN (SELECT id FROM public.students WHERE turma = ANY (get_my_turmas()) AND school_id = get_my_school_id())
  );

CREATE POLICY "Professores excluem apenas seus proprios registros de frequencia"
  ON public.class_attendance FOR DELETE
  USING (get_my_role() = 'teacher' AND get_my_teacher_status() = 'ativo' AND recorded_by = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_class_attendance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_class_attendance_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER touch_class_attendance_updated_at_trigger
  BEFORE UPDATE ON public.class_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_class_attendance_updated_at();
