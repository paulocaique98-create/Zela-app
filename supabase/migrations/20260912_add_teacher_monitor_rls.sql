-- Monitor do Professor: precisa confirmar/cancelar check-in e check-out dos
-- alunos das próprias turmas — hoje o professor só tinha SELECT em students
-- (Fase 1, só leitura pra Observação Diária). Faltam UPDATE em students e
-- INSERT em attendance_logs, ambos escopados à(s) turma(s) do professor.

DROP POLICY IF EXISTS "Professores atualizam status dos alunos de suas turmas" ON students;
CREATE POLICY "Professores atualizam status dos alunos de suas turmas"
ON students FOR UPDATE
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND turma = ANY(public.get_my_turmas())
)
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND turma = ANY(public.get_my_turmas())
);

-- Mesmo padrão de "Admins inserem historico da escola"
-- (20260820_fix_attendance_logs_insert.sql), mas restrito às turmas do professor.
DROP POLICY IF EXISTS "Professores inserem historico dos alunos de suas turmas" ON attendance_logs;
CREATE POLICY "Professores inserem historico dos alunos de suas turmas"
ON attendance_logs FOR INSERT
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND recorded_by = auth.uid()
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students
    WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);
