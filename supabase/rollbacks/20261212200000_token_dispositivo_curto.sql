-- Volta registrar/girar/autenticar ao formato de 64 hex. ATENÇÃO: tokens curtos já emitidos deixam
-- de autenticar; gire o token desses dispositivos depois do rollback.
create or replace function public.registrar_dispositivo_acesso(
  p_school_id uuid, p_name text, p_model text default null, p_location text default null
)
returns table (id uuid, token text)
language plpgsql security definer set search_path to 'public'
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

create or replace function public.girar_token_dispositivo_acesso(p_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
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

create or replace function public.autenticar_dispositivo_acesso(p_token text, p_device_id bigint default null)
returns table (id uuid, school_id uuid, status text)
language plpgsql security definer set search_path to 'public'
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
        return;
      end;
    elsif d.device_id <> p_device_id then
      return;
    end if;
  end if;
  update public.access_devices set last_seen_at = now() where access_devices.id = d.id;
  return query select d.id, d.school_id, d.status;
end;
$$;

drop function if exists public.gerar_token_dispositivo_acesso();
