-- Control iD: token de dispositivo mais curto e digitável (16 caracteres, XXXX-XXXX-XXXX-XXXX).
-- Alfabeto de 31 símbolos sem ambiguidade (sem 0, 1, I, L, O): 16 x log2(31) ~ 79 bits.
-- Continua guardado só como hash (sha256 do texto exato, em maiúsculas). Tokens antigos de
-- 64 hex seguem válidos; só os novos usam o formato curto. Sem alteração de tabelas nem de RLS.
-- Segurança: sorteio sem viés (descarta bytes >= 248 antes do módulo 31). O formato curto é
-- aceito em qualquer caixa (autenticar converte para maiúsculas); o de 64 hex só como está.

create or replace function public.gerar_token_dispositivo_acesso()
returns text
language plpgsql
volatile
set search_path to 'public'
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';  -- 31 símbolos
  v_out text := '';
  v_bytes bytea;
  i int;
  b int;
begin
  while char_length(v_out) < 16 loop
    v_bytes := extensions.gen_random_bytes(32);
    i := 0;
    while i < 32 and char_length(v_out) < 16 loop
      b := get_byte(v_bytes, i);
      if b < 248 then  -- 248 = 31 * 8, sem viés
        v_out := v_out || substr(alfabeto, (b % 31) + 1, 1);
      end if;
      i := i + 1;
    end loop;
  end loop;
  return substr(v_out, 1, 4) || '-' || substr(v_out, 5, 4) || '-' || substr(v_out, 9, 4) || '-' || substr(v_out, 13, 4);
end;
$$;
revoke all on function public.gerar_token_dispositivo_acesso() from public, anon, authenticated;

create or replace function public.registrar_dispositivo_acesso(
  p_school_id uuid, p_name text, p_model text default null, p_location text default null
)
returns table (id uuid, token text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text := public.gerar_token_dispositivo_acesso();
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
  v_token text := public.gerar_token_dispositivo_acesso();
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

create or replace function public.autenticar_dispositivo_acesso(p_token text, p_device_id bigint default null)
returns table (id uuid, school_id uuid, status text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text;
  v_hash text;
  d public.access_devices%rowtype;
begin
  if p_token is null then
    return;
  end if;
  if char_length(p_token) = 64 then
    v_token := p_token;                    -- formato antigo (hex), como está
  elsif p_token ~* '^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$' then
    v_token := upper(p_token);             -- formato curto, em qualquer caixa
  else
    return;
  end if;
  v_hash := encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');
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
