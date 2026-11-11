-- Dispositivos de reconhecimento facial (começa pela Control iD) — base de segurança.
--
-- MODELO DE AMEAÇA (resumo):
--   · O equipamento fica na escola e fala com o Zela por HTTP(S) a partir de um
--     endpoint público (Edge Function, verify_jwt = false). Não há login Supabase,
--     então a autenticidade vem de um TOKEN SECRETO POR DISPOSITIVO.
--   · O token é gerado no banco, mostrado UMA vez e guardado só como hash SHA-256
--     (token de 256 bits: hash simples basta). Vazou? Gira o token (rotacionar).
--   · O school_id NUNCA vem do equipamento: é derivado da linha do dispositivo
--     autenticado. Um dispositivo só grava eventos da própria escola.
--   · Eventos repetidos (replay, reenvio do equipamento) caem no índice único
--     (dispositivo + chave do evento) e são ignorados.
--   · Foto/biometria NÃO entra em device_events (só metadados). Foto vai para
--     Storage privado numa etapa própria.
--   · Ninguém lê nem grava as tabelas direto (RLS ligada, sem policy, sem grant):
--     só pelas funções abaixo. Funções do equipamento = só service_role.
--   · Risco aceito/pendente: se o equipamento só falar HTTP puro, o token trafega
--     sem criptografia na LAN/Internet. Validar HTTPS em bancada; senão, gateway local.

create table public.access_devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  brand text not null default 'controlid' check (brand in ('controlid')),
  model text,
  name text not null check (char_length(name) between 1 and 80),
  location text check (location is null or char_length(location) <= 120),
  device_id bigint,                          -- deviceId que o equipamento envia
  token_hash text not null unique,           -- sha256 hex; nunca o token
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  firmware text,
  last_seen_at timestamptz,
  token_rotated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
-- um deviceId de uma marca só pode pertencer a uma escola (evita ambiguidade entre tenants)
create unique index access_devices_brand_device_uidx
  on public.access_devices (brand, device_id) where device_id is not null;
create index access_devices_school_idx on public.access_devices (school_id);

create table public.device_events (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  device_ref uuid not null references public.access_devices(id) on delete cascade,
  event_type text not null check (event_type in ('access_log', 'alive', 'identification', 'door', 'push_result', 'other')),
  device_time timestamptz,
  external_user_id bigint,                   -- user_id interno do equipamento (sem biometria)
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 16384),
  received_at timestamptz not null default now(),
  unique (device_ref, dedupe_key)
);
create index device_events_school_time_idx on public.device_events (school_id, received_at desc);

alter table public.access_devices enable row level security;
alter table public.device_events enable row level security;
revoke all on public.access_devices from anon, authenticated;
revoke all on public.device_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Painel (usuário logado). Registrar/girar/desativar: developer ou gestao da escola.
-- ---------------------------------------------------------------------------
create or replace function public.access_device_pode_gerir(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case public.get_my_role()
    when 'developer' then true
    when 'gestao' then p_school_id is not null and p_school_id = public.get_my_school_id()
    else false
  end;
$$;
revoke all on function public.access_device_pode_gerir(uuid) from public, anon;
grant execute on function public.access_device_pode_gerir(uuid) to authenticated;

-- Devolve o token em texto UMA única vez.
create or replace function public.registrar_dispositivo_acesso(
  p_school_id uuid, p_name text, p_model text default null, p_location text default null
)
returns table (id uuid, token text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id uuid;
begin
  if not public.access_device_pode_gerir(p_school_id) then
    raise exception 'Sem permissão para registrar dispositivos.';
  end if;
  insert into public.access_devices (school_id, model, name, location, token_hash, created_by)
  values (p_school_id, nullif(btrim(p_model), ''), btrim(p_name), nullif(btrim(p_location), ''),
          encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), auth.uid())
  returning access_devices.id into v_id;
  return query select v_id, v_token;
end;
$$;
revoke all on function public.registrar_dispositivo_acesso(uuid, text, text, text) from public, anon;
grant execute on function public.registrar_dispositivo_acesso(uuid, text, text, text) to authenticated;

create or replace function public.girar_token_dispositivo_acesso(p_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_school uuid;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select d.school_id into v_school from public.access_devices d where d.id = p_id;
  if v_school is null or not public.access_device_pode_gerir(v_school) then
    raise exception 'Sem permissão ou dispositivo inexistente.';
  end if;
  update public.access_devices
     set token_hash = encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
         token_rotated_at = now(),
         status = case when status = 'disabled' then status else 'pending' end
   where id = p_id;
  return v_token;
end;
$$;
revoke all on function public.girar_token_dispositivo_acesso(uuid) from public, anon;
grant execute on function public.girar_token_dispositivo_acesso(uuid) to authenticated;

create or replace function public.definir_status_dispositivo_acesso(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_school uuid;
begin
  if p_status not in ('active', 'disabled') then
    raise exception 'Status inválido.';
  end if;
  select d.school_id into v_school from public.access_devices d where d.id = p_id;
  if v_school is null or not public.access_device_pode_gerir(v_school) then
    raise exception 'Sem permissão ou dispositivo inexistente.';
  end if;
  update public.access_devices set status = p_status where id = p_id;
end;
$$;
revoke all on function public.definir_status_dispositivo_acesso(uuid, text) from public, anon;
grant execute on function public.definir_status_dispositivo_acesso(uuid, text) to authenticated;

-- Lista para o painel: nunca devolve token_hash. Leitura: developer, gestao, admin, recepcao.
create or replace function public.listar_dispositivos_acesso(p_school_id uuid default null)
returns table (
  id uuid, school_id uuid, brand text, model text, name text, location text,
  device_id bigint, status text, firmware text, last_seen_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select d.id, d.school_id, d.brand, d.model, d.name, d.location,
         d.device_id, d.status, d.firmware, d.last_seen_at, d.created_at
    from public.access_devices d
   where (
           public.get_my_role() = 'developer'
           and (p_school_id is null or d.school_id = p_school_id)
         )
      or (
           public.get_my_role() in ('gestao', 'admin', 'recepcao')
           and d.school_id = public.get_my_school_id()
         )
   order by d.name
   limit 200;
$$;
revoke all on function public.listar_dispositivos_acesso(uuid) from public, anon;
grant execute on function public.listar_dispositivos_acesso(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Equipamento (só Edge Function com service_role).
-- ---------------------------------------------------------------------------
-- Autentica pelo token. Só dispositivos 'pending'/'active' de escola liberada.
-- O primeiro contato fixa o device_id; depois, um device_id diferente é recusado.
create or replace function public.autenticar_dispositivo_acesso(p_token text, p_device_id bigint default null)
returns table (id uuid, school_id uuid, status text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hash text;
  d public.access_devices%rowtype;
begin
  if p_token is null or char_length(p_token) <> 64 then
    return;
  end if;
  v_hash := encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
  select * into d from public.access_devices x where x.token_hash = v_hash;
  if not found or d.status = 'disabled' or not public.escola_liberada(d.school_id) then
    return;
  end if;
  if p_device_id is not null then
    if d.device_id is null then
      begin
        update public.access_devices set device_id = p_device_id where access_devices.id = d.id;
      exception when unique_violation then
        return;  -- esse deviceId já pertence a outro dispositivo
      end;
    elsif d.device_id <> p_device_id then
      return;
    end if;
  end if;
  update public.access_devices set last_seen_at = now() where access_devices.id = d.id;
  return query select d.id, d.school_id, d.status;
end;
$$;
revoke all on function public.autenticar_dispositivo_acesso(text, bigint) from public, anon, authenticated;
grant execute on function public.autenticar_dispositivo_acesso(text, bigint) to service_role;

-- Grava evento. O school_id vem do dispositivo, nunca do chamador. Repetido = ignorado.
create or replace function public.registrar_evento_dispositivo(
  p_device_ref uuid, p_event_type text, p_dedupe_key text,
  p_device_time timestamptz default null, p_external_user_id bigint default null,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_school uuid; v_linhas int;
begin
  select d.school_id into v_school
    from public.access_devices d
   where d.id = p_device_ref and d.status <> 'disabled';
  if v_school is null then
    return false;
  end if;
  insert into public.device_events (school_id, device_ref, event_type, device_time, external_user_id, dedupe_key, payload)
  values (v_school, p_device_ref, p_event_type, p_device_time, p_external_user_id, p_dedupe_key, coalesce(p_payload, '{}'::jsonb))
  on conflict (device_ref, dedupe_key) do nothing;
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$$;
revoke all on function public.registrar_evento_dispositivo(uuid, text, text, timestamptz, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_evento_dispositivo(uuid, text, text, timestamptz, bigint, jsonb) to service_role;
