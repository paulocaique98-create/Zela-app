-- Histórico dos módulos contratados de cada escola (Portal do Dev · Módulos,
-- Modelo 3, 28/09/2026): toda vez que schools.features_enabled muda, uma
-- linha por chave que mudou (ligou ou desligou), com quem e quando. Serve de
-- base para saber desde quando a escola usa cada módulo (e, no futuro,
-- desde quando cobrar). Gravado por trigger: pega qualquer caminho de
-- alteração, não só a tela.

create table if not exists public.school_feature_changes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null,
  -- Sem chave estrangeira de propósito: o histórico nunca pode impedir a
  -- escola de ser salva (ex.: alteração feita por service role, sem usuário).
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now()
);
create index if not exists idx_school_feature_changes_school
  on public.school_feature_changes (school_id, changed_at desc);

alter table public.school_feature_changes enable row level security;

-- Só o time Zela (developer) lê; ninguém escreve direto (só a trigger).
create policy "Developer le o historico de modulos"
on public.school_feature_changes for select
using (public.get_my_role() = 'developer');

revoke insert, update, delete on public.school_feature_changes from anon, authenticated;

create or replace function public.log_school_feature_changes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else coalesce(old.features_enabled, '{}'::jsonb) end;
  v_new jsonb := coalesce(new.features_enabled, '{}'::jsonb);
  v_uid uuid := auth.uid();
  v_name text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;
  begin
    select name into v_name from public.users where id = v_uid;
    insert into public.school_feature_changes (school_id, feature_key, enabled, changed_by, changed_by_name)
    select new.id, k.key, coalesce(v_new -> k.key = 'true'::jsonb, false), v_uid, v_name
    from (select jsonb_object_keys(v_old) as key union select jsonb_object_keys(v_new)) k
    where coalesce(v_old -> k.key = 'true'::jsonb, false)
          is distinct from coalesce(v_new -> k.key = 'true'::jsonb, false);
  exception when others then
    -- O histórico é um registro auxiliar: se falhar, a escola salva mesmo assim.
    raise warning 'log_school_feature_changes: %', sqlerrm;
  end;
  return new;
end;
$function$;
revoke execute on function public.log_school_feature_changes() from public, anon, authenticated;

drop trigger if exists log_school_feature_changes_trigger on public.schools;
create trigger log_school_feature_changes_trigger
after insert or update of features_enabled on public.schools
for each row execute function public.log_school_feature_changes();
