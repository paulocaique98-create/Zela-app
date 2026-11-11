-- Vínculo entre o usuário interno do equipamento (user_id da Control iD) e a pessoa no Zela.
-- Fase 4 do PLANO_CONTROLID.md. Mesmo padrão da fase 1 (20261212120000):
--   · RLS ligada, sem policy e sem grant: ninguém lê/grava a tabela direto.
--   · Gerir vínculo: developer ou gestao da escola (access_device_pode_gerir).
--   · Ler: developer, gestao, admin, recepcao (sempre da própria escola).
--   · Resolver (equipamento → pessoa): só service_role (Edge Function).
-- ISOLAMENTO: o school_id do vínculo é o do dispositivo, e a pessoa vinculada
-- precisa ser da MESMA escola (checado na função e por trigger).
-- Sem dado biométrico aqui: só ids.

create table public.device_person_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_ref uuid not null references public.access_devices(id) on delete cascade,
  external_user_id bigint not null,                       -- user_id interno do equipamento
  authorized_person_id uuid references public.authorized_persons(id) on delete cascade,
  guardian_user_id uuid references public.users(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- exatamente um alvo
  constraint device_person_links_um_alvo check (
    (authorized_person_id is not null)::int + (guardian_user_id is not null)::int = 1
  ),
  unique (device_ref, external_user_id)
);
create unique index device_person_links_autorizado_uidx
  on public.device_person_links (device_ref, authorized_person_id) where authorized_person_id is not null;
create unique index device_person_links_responsavel_uidx
  on public.device_person_links (device_ref, guardian_user_id) where guardian_user_id is not null;
create index device_person_links_school_idx on public.device_person_links (school_id);
create index device_person_links_autorizado_idx on public.device_person_links (authorized_person_id) where authorized_person_id is not null;
create index device_person_links_responsavel_idx on public.device_person_links (guardian_user_id) where guardian_user_id is not null;

alter table public.device_person_links enable row level security;
revoke all on public.device_person_links from anon, authenticated;

-- Defesa em profundidade: mesmo que alguém chame por outro caminho (service_role,
-- função futura), school_id, dispositivo e pessoa têm de ser da mesma escola.
create or replace function public.device_person_links_checa_escola()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_dev_school uuid; v_pessoa_school uuid;
begin
  select d.school_id into v_dev_school from public.access_devices d where d.id = new.device_ref;
  if v_dev_school is null or v_dev_school <> new.school_id then
    raise exception 'Dispositivo de outra escola.';
  end if;
  if new.authorized_person_id is not null then
    select p.school_id into v_pessoa_school from public.authorized_persons p where p.id = new.authorized_person_id;
  else
    select u.school_id into v_pessoa_school from public.users u where u.id = new.guardian_user_id;
  end if;
  if v_pessoa_school is null or v_pessoa_school <> new.school_id then
    raise exception 'Pessoa de outra escola.';
  end if;
  return new;
end;
$$;
create trigger device_person_links_checa_escola
  before insert or update on public.device_person_links
  for each row execute function public.device_person_links_checa_escola();

-- Cria o vínculo. Informe exatamente um entre p_authorized_person_id e p_guardian_user_id.
create or replace function public.vincular_pessoa_dispositivo(
  p_device_ref uuid, p_external_user_id bigint,
  p_authorized_person_id uuid default null, p_guardian_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_school uuid; v_id uuid;
begin
  select d.school_id into v_school from public.access_devices d where d.id = p_device_ref;
  if v_school is null or not public.access_device_pode_gerir(v_school) then
    raise exception 'Sem permissão ou dispositivo inexistente.';
  end if;
  if p_external_user_id is null or p_external_user_id <= 0 then
    raise exception 'Identificador do equipamento inválido.';
  end if;
  insert into public.device_person_links (school_id, device_ref, external_user_id, authorized_person_id, guardian_user_id, created_by)
  values (v_school, p_device_ref, p_external_user_id, p_authorized_person_id, p_guardian_user_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.vincular_pessoa_dispositivo(uuid, bigint, uuid, uuid) from public, anon;
grant execute on function public.vincular_pessoa_dispositivo(uuid, bigint, uuid, uuid) to authenticated;

create or replace function public.desvincular_pessoa_dispositivo(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_school uuid;
begin
  select l.school_id into v_school from public.device_person_links l where l.id = p_link_id;
  if v_school is null or not public.access_device_pode_gerir(v_school) then
    raise exception 'Sem permissão ou vínculo inexistente.';
  end if;
  delete from public.device_person_links where id = p_link_id;
end;
$$;
revoke all on function public.desvincular_pessoa_dispositivo(uuid) from public, anon;
grant execute on function public.desvincular_pessoa_dispositivo(uuid) to authenticated;

-- Lista vínculos de um dispositivo (painel). Escola derivada do dispositivo.
create or replace function public.listar_vinculos_dispositivo(p_device_ref uuid)
returns table (
  id uuid, device_ref uuid, external_user_id bigint,
  authorized_person_id uuid, guardian_user_id uuid, created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select l.id, l.device_ref, l.external_user_id, l.authorized_person_id, l.guardian_user_id, l.created_at
    from public.device_person_links l
   where l.device_ref = p_device_ref
     and (
           public.get_my_role() = 'developer'
        or (public.get_my_role() in ('gestao', 'admin', 'recepcao') and l.school_id = public.get_my_school_id())
         )
   order by l.external_user_id
   limit 500;
$$;
revoke all on function public.listar_vinculos_dispositivo(uuid) from public, anon;
grant execute on function public.listar_vinculos_dispositivo(uuid) to authenticated;

-- Equipamento → pessoa (só Edge Function). Devolve só ids; o school_id sai do vínculo.
create or replace function public.resolver_pessoa_dispositivo(p_device_ref uuid, p_external_user_id bigint)
returns table (school_id uuid, authorized_person_id uuid, guardian_user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select l.school_id, l.authorized_person_id, l.guardian_user_id
    from public.device_person_links l
    join public.access_devices d on d.id = l.device_ref
   where l.device_ref = p_device_ref
     and l.external_user_id = p_external_user_id
     and d.status <> 'disabled'
   limit 1;
$$;
revoke all on function public.resolver_pessoa_dispositivo(uuid, bigint) from public, anon, authenticated;
grant execute on function public.resolver_pessoa_dispositivo(uuid, bigint) to service_role;
