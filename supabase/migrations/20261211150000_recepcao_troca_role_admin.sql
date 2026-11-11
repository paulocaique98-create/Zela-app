-- Fase C2 · Recepção: users.role 'admin' vira 'recepcao'.
-- Pré-requisito: C1 (policies e funções já aceitam os dois valores).
-- Reversão: supabase/rollbacks/20261211150000_reverter_recepcao.sql (usa o backup abaixo).
-- Histórico (chat_messages.sender_role, error_logs, account_deletion_requests) NÃO é alterado.
-- O papel não vive nos metadados do JWT: get_my_role() lê public.users.

-- 1. Backup (só service_role/postgres: RLS ligada e sem policy).
create table if not exists public.recepcao_troca_backup (
  tabela text not null,
  chave text not null,
  school_id uuid,
  valor_antigo text,
  detalhe jsonb,
  criado_em timestamptz not null default now(),
  primary key (tabela, chave)
);
alter table public.recepcao_troca_backup enable row level security;
revoke all on public.recepcao_troca_backup from anon, authenticated;

insert into public.recepcao_troca_backup (tabela, chave, school_id, valor_antigo)
select 'users', id::text, school_id, role from public.users where role = 'admin'
on conflict do nothing;

insert into public.recepcao_troca_backup (tabela, chave, school_id, valor_antigo)
select 'profiles', id::text, null, role from public.profiles where role = 'admin'
on conflict do nothing;

insert into public.recepcao_troca_backup (tabela, chave, school_id, valor_antigo, detalhe)
select 'school_role_permissions', school_id::text||'|'||permission, school_id, role, jsonb_build_object('permission', permission, 'granted', granted)
from public.school_role_permissions where role = 'admin'
on conflict do nothing;

insert into public.recepcao_troca_backup (tabela, chave, valor_antigo, detalhe)
select 'permission_catalog', permission, 'admin', to_jsonb(default_roles)
from public.permission_catalog where 'admin' = any(default_roles)
on conflict do nothing;

-- 2. Permissões por escola: CHECK aceita 'recepcao' e as linhas migram.
alter table public.school_role_permissions drop constraint if exists school_role_permissions_role_check;
alter table public.school_role_permissions
  add constraint school_role_permissions_role_check check (role in ('admin', 'recepcao', 'teacher'));
-- Se já existir linha 'recepcao' para a mesma chave, ela prevalece e a de 'admin' é descartada.
delete from public.school_role_permissions a
 where a.role = 'admin'
   and exists (select 1 from public.school_role_permissions b
                where b.school_id = a.school_id and b.permission = a.permission and b.role = 'recepcao');
update public.school_role_permissions set role = 'recepcao' where role = 'admin';

-- Catálogo: quem tinha 'admin' por padrão passa a ter 'recepcao' (mantém 'admin' até a C4).
update public.permission_catalog
   set default_roles = array_append(default_roles, 'recepcao')
 where 'admin' = any(default_roles) and not ('recepcao' = any(default_roles));

-- has_permission: 'recepcao' agora usa as próprias linhas (sem tradução para 'admin').
create or replace function public.has_permission(p_permission text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when coalesce(public.get_my_role(), '') in ('developer', 'gestao') then true
    when coalesce(public.get_my_role(), '') not in ('admin', 'recepcao', 'teacher') then false
    else coalesce(
      (select srp.granted from public.school_role_permissions srp
        where srp.school_id = public.get_my_school_id()
          and srp.role = case when public.get_my_role() = 'admin' then 'recepcao' else public.get_my_role() end
          and srp.permission = p_permission),
      (select (case when public.get_my_role() = 'admin' then 'recepcao' else public.get_my_role() end) = any(pc.default_roles)
        from public.permission_catalog pc
        where pc.permission = p_permission),
      false)
  end;
$function$;

-- 3. Papel dos usuários (mesma escola, mesmo id; só o texto muda).
update public.users set role = 'recepcao' where role = 'admin';
update public.profiles set role = 'recepcao' where role = 'admin';
