-- A policy original de professor usava FOR ALL sem restringir UPDATE/DELETE ao
-- próprio autor — qualquer professor da turma conseguiria editar/excluir a
-- observação registrada por outro professor via chamada direta à API (a tela só
-- escondia o botão, o que não é proteção real). Divide em policies por operação:
-- SELECT/INSERT continuam abertos pra todos os professores da turma (colaboração
-- normal — ver o que os colegas registraram), mas UPDATE/DELETE ficam restritos a
-- quem criou o registro.
DROP POLICY IF EXISTS "Professores gerenciam registros dos alunos de suas turmas" ON pedagogical_records;

CREATE POLICY "Professores leem registros dos alunos de suas turmas"
ON pedagogical_records FOR SELECT
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students
    WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

CREATE POLICY "Professores criam registros dos alunos de suas turmas"
ON pedagogical_records FOR INSERT
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students
    WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

CREATE POLICY "Professores editam apenas seus proprios registros"
ON pedagogical_records FOR UPDATE
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
)
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students
    WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

CREATE POLICY "Professores excluem apenas seus proprios registros"
ON pedagogical_records FOR DELETE
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
);
