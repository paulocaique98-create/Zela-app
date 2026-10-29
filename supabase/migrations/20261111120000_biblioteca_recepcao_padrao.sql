-- Biblioteca: a Recepção (admin) passa a ter biblioteca.gerenciar por padrão
-- (cadastrar livros e exemplares, emprestar, receber devoluções). A Gestão
-- continua podendo retirar em Perfis e Permissões (school_role_permissions com
-- granted = false vale mais que o padrão). Professora segue sem o padrão.
-- Só muda o padrão do catálogo; nenhuma policy, tabela ou dado é alterado.
update public.permission_catalog
   set default_roles = array['admin']
 where permission = 'biblioteca.gerenciar';
