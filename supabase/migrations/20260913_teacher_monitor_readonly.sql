-- Correção: o Monitor do Professor é só visualização — o professor não deve
-- confirmar/cancelar check-in/out (isso é responsabilidade da Recepção/Admin).
-- Remove as permissões de escrita concedidas por engano em
-- 20260912_add_teacher_monitor_rls.sql. A policy de SELECT em students
-- (20260911_add_teacher_students_rls.sql) permanece — o professor continua
-- vendo as solicitações pendentes das próprias turmas, só não pode agir sobre elas.
DROP POLICY IF EXISTS "Professores atualizam status dos alunos de suas turmas" ON students;
DROP POLICY IF EXISTS "Professores inserem historico dos alunos de suas turmas" ON attendance_logs;
