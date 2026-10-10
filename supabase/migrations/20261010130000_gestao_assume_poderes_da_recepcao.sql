-- A Gestão assume poderes que eram só da Recepção (role admin).
-- Nenhuma tabela, coluna ou dado é alterado; só 1 policy e 1 default.

-- 1) Excluir aluno: a tela de edição de família (reaproveitada pela Gestão)
--    remove aluno e a policy só aceitava developer e admin. Gestão da própria
--    escola passa a poder; o admin continua como estava.
alter policy "Exclusao de estudantes" on public.students
  using (
    (get_my_role() = 'developer')
    or ((get_my_role() in ('admin', 'gestao')) and (school_id = get_my_school_id()))
  );

-- 2) Ver contratos: deixa de ser liberado por padrão para a Recepção. Quem
--    decide é a Gestão, por escola, em Permissões (school_role_permissions,
--    que não é alterada aqui: escolhas já salvas continuam valendo).
update public.permission_catalog
   set default_roles = array[]::text[]
 where permission = 'contratos.ver';
