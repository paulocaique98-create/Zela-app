-- Fase C4 · Recepção: 'admin' deixa de existir como papel em policies, funções e dados.
-- Pré-requisitos: C1 (dupla aceitação) e C2 (users.role já migrado). Aborta se sobrar usuário 'admin'.
-- Só remove o valor 'admin' das listas; nenhuma condição fica mais permissiva e o school_id é mantido.
do $$
begin
  if exists (select 1 from public.users where role = 'admin')
     or exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'C4 abortada: ainda existe usuário com role admin. Rode a C2 antes.';
  end if;
end $$;

-- Dados: catálogo e permissões por escola sem 'admin'.
update public.permission_catalog set default_roles = array_remove(default_roles, 'admin')
 where 'admin' = any(default_roles);
delete from public.school_role_permissions where role = 'admin';
alter table public.school_role_permissions drop constraint if exists school_role_permissions_role_check;
alter table public.school_role_permissions
  add constraint school_role_permissions_role_check check (role in ('recepcao', 'teacher'));

create or replace function public.has_permission(p_permission text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when coalesce(public.get_my_role(), '') in ('developer', 'gestao') then true
    when coalesce(public.get_my_role(), '') not in ('recepcao', 'teacher') then false
    else coalesce(
      (select srp.granted from public.school_role_permissions srp
        where srp.school_id = public.get_my_school_id()
          and srp.role = public.get_my_role()
          and srp.permission = p_permission),
      (select public.get_my_role() = any(pc.default_roles)
        from public.permission_catalog pc
        where pc.permission = p_permission),
      false)
  end;
$function$;

-- Casos que não são lista: o ramo 'admin' sai (o ramo 'recepcao' já existe e é idêntico).
create or replace function public.can_read_financeiro()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case coalesce(public.get_my_role(), '')
    when 'gestao' then true
    when 'recepcao' then public.has_permission('financeiro.baixa_manual')
                   or public.has_permission('relatorios.financeiro.ver')
                   or public.has_permission('contratos.gerenciar')
    else false
  end;
$function$;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.restrict_admin_student_updates'::regproc);
  v_def := replace(v_def, 'v_role is distinct from ''admin'' and v_role is distinct from ''recepcao''', 'v_role is distinct from ''recepcao''');
  execute v_def;
end $$;

-- Policies (inclui storage.objects): remove o elemento 'admin' dos ARRAY[...].
do $$
declare
  r record; v_using text; v_check text; v_sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
     where coalesce(qual, '') || coalesce(with_check, '') like '%''admin''%'
  loop
    v_using := regexp_replace(r.qual, '''admin''::text,\s*', '', 'g');
    v_check := regexp_replace(r.with_check, '''admin''::text,\s*', '', 'g');
    if coalesce(v_using, '') like '%''admin''%' or coalesce(v_check, '') like '%''admin''%' then
      raise exception 'Policy % em %.% tem admin fora de ARRAY; revisar à mão', r.policyname, r.schemaname, r.tablename;
    end if;
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_using is not null then v_sql := v_sql || ' using (' || v_using || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
  end loop;
end $$;

-- Funções: remove 'admin' de listas (IN, ARRAY). Casos que não são lista ficam para o bloco final.
do $$
declare
  r record; v_def text; v_new text;
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'storage', 'realtime') and p.prosrc ~ '''admin'''
       and p.proname not in ('has_permission', 'can_read_financeiro', 'restrict_admin_student_updates')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, '''admin''(::text)?\s*,\s*', '', 'g');
    v_new := regexp_replace(v_new, ',\s*''admin''(::text)?(\s*[\)\]])', '\2', 'g');
    if v_new is distinct from v_def then
      execute v_new;
    end if;
  end loop;
end $$;
