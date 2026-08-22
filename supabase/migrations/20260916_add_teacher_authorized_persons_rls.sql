-- Permite ao professor LER (nunca editar) os responsáveis vinculados aos
-- alunos das próprias turmas — necessário pra exibir a foto de quem
-- solicitou entrada/saída no Monitor do Professor (TeacherMonitor.jsx).
-- Sem essa policy, authorized_persons ficaria invisível para o professor
-- (RLS nega por padrão) e nenhuma foto apareceria, mesmo com o dado salvo.
DROP POLICY IF EXISTS "Professores leem responsaveis dos alunos de suas turmas" ON authorized_persons;
CREATE POLICY "Professores leem responsaveis dos alunos de suas turmas"
ON authorized_persons FOR SELECT
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND family_id IN (
    SELECT family_id FROM students
    WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id() AND family_id IS NOT NULL
    UNION
    SELECT sg.guardian_id FROM student_guardians sg
    JOIN students s ON s.id = sg.student_id
    WHERE s.turma = ANY(public.get_my_turmas()) AND s.school_id = public.get_my_school_id()
  )
);
