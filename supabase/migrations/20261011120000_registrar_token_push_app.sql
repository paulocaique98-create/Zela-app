-- Push do app: o token do aparelho passa para a conta que acabou de logar.
-- Antes, se sobrasse linha de outra conta no mesmo aparelho (logout sem rede),
-- o upsert por token falhava na RLS (so o dono altera a linha). Esta funcao
-- troca o dono do token com seguranca: user_id e school_id vem da sessao e do
-- perfil, nunca do cliente.

create or replace function public.registrar_token_push_app(
  p_token text,
  p_platform text,
  p_device_info text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then
    raise exception 'invalid token' using errcode = '22023';
  end if;

  select school_id into v_school from public.users where id = v_uid;
  if v_school is null then
    raise exception 'user without school' using errcode = '42501';
  end if;

  delete from public.push_subscriptions where token = p_token and user_id <> v_uid;

  insert into public.push_subscriptions
    (user_id, school_id, platform, token, device_info, last_seen_at, updated_at)
  values
    (v_uid, v_school, p_platform, p_token, left(p_device_info, 500), now(), now())
  on conflict (token) do update set
    school_id = excluded.school_id,
    platform = excluded.platform,
    device_info = excluded.device_info,
    last_seen_at = now(),
    updated_at = now();
end;
$$;

revoke all on function public.registrar_token_push_app(text, text, text) from public, anon;
grant execute on function public.registrar_token_push_app(text, text, text) to authenticated;
