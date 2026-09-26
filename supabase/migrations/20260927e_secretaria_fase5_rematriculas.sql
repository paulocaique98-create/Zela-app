-- Fase 5 (Rematrículas) do módulo Secretaria.
--
-- AdminMatriculas.jsx já é genérico por tipo (matricula/rematricula/
-- atualizacao_cadastral) e já está reaproveitado em GestaoPortal.jsx desde a
-- Fase 4 -- não precisa de UI nova. approve_matricula() é SECURITY INVOKER
-- (nenhum hardcoded role check dentro da função, confirmado via
-- pg_get_functiondef), então basta a RLS das tabelas que ela toca aceitar
-- gestao em paralelo com admin.
--
-- Lacuna encontrada: matricula_solicitacoes/users/student_guardians/
-- authorized_persons já foram liberados na Fase 4 (20260927d) e students
-- UPDATE já foi liberado na Fase 3 (20260927c) -- mas o INSERT de students
-- (usado quando a rematrícula traz um irmão novo, sem student_id existente)
-- ainda só aceitava admin/developer. Sem isso, gestao aprovar uma
-- rematrícula com aluno novo falharia silenciosamente na RPC.
alter policy "Criacao de estudantes por admin ou developer" on public.students
  with check (
    (get_my_role() = 'developer')
    or (get_my_role() in ('admin', 'gestao') and school_id = get_my_school_id())
  );
