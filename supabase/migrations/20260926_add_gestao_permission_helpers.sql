-- Fase 1 do plano de migração Admin -> Portal da Gestão (ver
-- PLANO_MIGRACAO_PORTAL_GESTAO na conversa/roadmap): cria as funções de
-- permissão reutilizáveis que as policies vão passar a consultar em vez de
-- checar `role = 'admin'` direto. Nesta fase as duas aceitam admin OU
-- gestao (nenhuma policy foi alterada ainda -- zero mudança de
-- comportamento). Quando a Fase 5 apertar o acesso de escrita por grupo
-- (Financeiro, Correções de Presença...), só a definição de
-- can_write_gestao() muda -- não é preciso tocar em cada policy de novo.
create function public.can_read_gestao()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.get_my_role() in ('admin', 'gestao');
$$;

create function public.can_write_gestao()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.get_my_role() in ('admin', 'gestao');
$$;
