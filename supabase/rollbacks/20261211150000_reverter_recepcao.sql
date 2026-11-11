-- Reverte a C2 usando public.recepcao_troca_backup. Rodar só como postgres/service_role.
-- Só volta quem estava no backup (contas criadas depois como 'recepcao' ficam como estão).
update public.users u set role = b.valor_antigo
  from public.recepcao_troca_backup b
 where b.tabela = 'users' and b.chave = u.id::text and u.role = 'recepcao';
update public.profiles p set role = b.valor_antigo
  from public.recepcao_troca_backup b
 where b.tabela = 'profiles' and b.chave = p.id::text and p.role = 'recepcao';
update public.school_role_permissions s set role = b.valor_antigo
  from public.recepcao_troca_backup b
 where b.tabela = 'school_role_permissions' and b.school_id = s.school_id
   and b.detalhe->>'permission' = s.permission and s.role = 'recepcao';
update public.permission_catalog pc set default_roles = array(select jsonb_array_elements_text(b.detalhe))
  from public.recepcao_troca_backup b
 where b.tabela = 'permission_catalog' and b.chave = pc.permission;
-- has_permission volta à versão da C1 (tradução recepcao -> admin) reaplicando a migration 20261211140000, trecho da função.
