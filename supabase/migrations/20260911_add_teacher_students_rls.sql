-- Faltava a policy de RLS que permite ao Professor ler os alunos das suas
-- próprias turmas — sem ela, a tabela students ficava totalmente bloqueada pro
-- papel 'teacher' (só existiam policies pra admin e família), fazendo o Portal
-- do Professor mostrar "0 alunos" mesmo com alunos cadastrados na turma.
DROP POLICY IF EXISTS "Professores leem alunos de suas turmas" ON students;
CREATE POLICY "Professores leem alunos de suas turmas"
ON students FOR SELECT
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND turma = ANY(public.get_my_turmas())
);
