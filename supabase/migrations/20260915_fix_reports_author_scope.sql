-- Correção: a policy "Professores gerenciam relatorios dos alunos de suas
-- turmas" (FOR ALL) só restringia por turma no USING, sem exigir
-- author_id = auth.uid() — um professor podia editar, publicar ou até
-- excluir o relatório de um colega da mesma turma. Mesmo bug já corrigido em
-- pedagogical_records (20260910_fix_pedagogical_records_author_scope.sql):
-- separa em SELECT (aberto aos professores da turma, útil pra co-docência)
-- e INSERT/UPDATE/DELETE (restritos ao autor).
DROP POLICY IF EXISTS "Professores gerenciam relatorios dos alunos de suas turmas" ON reports;

CREATE POLICY "Professores leem relatorios dos alunos de suas turmas"
ON reports FOR SELECT
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

CREATE POLICY "Professores criam relatorios dos alunos de suas turmas"
ON reports FOR INSERT
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

CREATE POLICY "Professores atualizam seus proprios relatorios"
ON reports FOR UPDATE
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND school_id = public.get_my_school_id()
)
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

CREATE POLICY "Professores excluem seus proprios relatorios"
ON reports FOR DELETE
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND school_id = public.get_my_school_id()
);
