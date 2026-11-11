-- Fila de comandos por dispositivo (sincronização de cadastro Zela → equipamento Control iD).
-- Fase 5 do PLANO_CONTROLID.md. Mesmo padrão das fases 1 e 4:
--   · RLS ligada, sem policy e sem grant: ninguém lê/grava a tabela direto.
--   · Enfileirar: developer ou gestao da escola (access_device_pode_gerir).
--   · Ler a fila (painel): developer, gestao, admin, recepcao (sempre da própria escola).
--   · Entregar/concluir (equipamento): só service_role (Edge Function controlid-push).
-- ISOLAMENTO: school_id vem do dispositivo, nunca do chamador. Pessoa de outra escola é recusada.
-- BIOMETRIA: a tabela NÃO guarda foto nem template. A foto sai do bucket privado person-photos
--   só no momento do envio (Edge Function) e só se biometric_consent_at estiver preenchido.
-- Um comando por vez em voo por dispositivo (a correlação do /result usa o comando em 'sent').

create table public.device_commands (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_ref uuid not null references public.access_devices(id) on delete cascade,
  command text not null check (command in ('create_user', 'update_user', 'delete_user', 'set_photo')),
  external_user_id bigint not null check (external_user_id > 0),
  user_name text check (user_name is null or char_length(user_name) <= 100),
  authorized_person_id uuid references public.authorized_persons(id) on delete set null, -- só set_photo
  status text not null default 'pending' check (status in ('pending', 'sent', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  done_at timestamptz
);
create index device_commands_fila_idx on public.device_commands (device_ref, status, created_at);
create index device_commands_school_idx on public.device_commands (school_id);
-- no máximo um comando aberto igual por dispositivo/usuário (evita duplicar na fila)
create unique index device_commands_aberto_uidx
  on public.device_commands (device_ref, command, external_user_id) where status in ('pending', 'sent');

alter table public.device_commands enable row level security;
revoke all on public.device_commands from anon, authenticated;

-- Defesa em profundidade: dispositivo e pessoa da mesma escola do comando.
create or replace function public.device_commands_checa_escola()
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
    if v_pessoa_school is null or v_pessoa_school <> new.school_id then
      raise exception 'Pessoa de outra escola.';
    end if;
  end if;
  return new;
end;
$$;
create trigger device_commands_checa_escola
  before insert or update on public.device_commands
  for each row execute function public.device_commands_checa_escola();

-- Enfileira um comando. create/update/set_photo exigem vínculo existente; delete_user não
-- (a pessoa pode já ter sido desvinculada). set_photo exige autorizado com consentimento e foto.
create or replace function public.enfileirar_comando_dispositivo(
  p_device_ref uuid, p_command text, p_external_user_id bigint
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_school uuid; v_status text; v_link public.device_person_links%rowtype;
  v_nome text; v_auth uuid; v_id uuid;
begin
  select d.school_id, d.status into v_school, v_status from public.access_devices d where d.id = p_device_ref;
  if v_school is null or not public.access_device_pode_gerir(v_school) then
    raise exception 'Sem permissão ou dispositivo inexistente.';
  end if;
  if v_status = 'disabled' then
    raise exception 'Dispositivo desativado.';
  end if;
  if p_command not in ('create_user', 'update_user', 'delete_user', 'set_photo') then
    raise exception 'Comando inválido.';
  end if;
  if p_external_user_id is null or p_external_user_id <= 0 then
    raise exception 'Identificador do equipamento inválido.';
  end if;

  if p_command <> 'delete_user' then
    select * into v_link from public.device_person_links l
     where l.device_ref = p_device_ref and l.external_user_id = p_external_user_id;
    if not found then
      raise exception 'Pessoa não vinculada a este dispositivo.';
    end if;
    if v_link.authorized_person_id is not null then
      select p.name into v_nome from public.authorized_persons p where p.id = v_link.authorized_person_id;
    else
      select u.name into v_nome from public.users u where u.id = v_link.guardian_user_id;
    end if;
    if p_command = 'set_photo' then
      if v_link.authorized_person_id is null then
        raise exception 'Foto só para pessoa autorizada (responsável pelo app: fase 8).';
      end if;
      if not exists (
        select 1 from public.authorized_persons p
         where p.id = v_link.authorized_person_id
           and p.biometric_consent_at is not null
           and p.photo_storage_path is not null
      ) then
        raise exception 'Sem consentimento biométrico ou sem foto no Storage.';
      end if;
      v_auth := v_link.authorized_person_id;
    end if;
  end if;

  insert into public.device_commands (school_id, device_ref, command, external_user_id, user_name, authorized_person_id, created_by)
  values (v_school, p_device_ref, p_command, p_external_user_id, left(v_nome, 100), v_auth, auth.uid())
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Já existe um comando igual pendente para este dispositivo.';
end;
$$;
revoke all on function public.enfileirar_comando_dispositivo(uuid, text, bigint) from public, anon;
grant execute on function public.enfileirar_comando_dispositivo(uuid, text, bigint) to authenticated;

-- Painel: lista os comandos recentes de um dispositivo (sem dado biométrico).
create or replace function public.listar_comandos_dispositivo(p_device_ref uuid)
returns table (
  id uuid, command text, external_user_id bigint, status text, attempts integer,
  last_error text, created_at timestamptz, sent_at timestamptz, done_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, c.command, c.external_user_id, c.status, c.attempts, c.last_error, c.created_at, c.sent_at, c.done_at
    from public.device_commands c
   where c.device_ref = p_device_ref
     and (
           public.get_my_role() = 'developer'
        or (public.get_my_role() in ('gestao', 'admin', 'recepcao') and c.school_id = public.get_my_school_id())
         )
   order by c.created_at desc
   limit 200;
$$;
revoke all on function public.listar_comandos_dispositivo(uuid) from public, anon;
grant execute on function public.listar_comandos_dispositivo(uuid) to authenticated;

-- Equipamento: entrega o próximo comando (só service_role). Um em voo por dispositivo:
-- se há 'sent' recente (< 2 min) não entrega outro; 'sent' vencido volta à fila até 5 tentativas.
-- set_photo é revalidado no envio (consentimento pode ter sido revogado) e devolve o caminho no Storage.
create or replace function public.proximo_comando_dispositivo(p_device_ref uuid)
returns table (
  id uuid, command text, external_user_id bigint, user_name text, photo_storage_path text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_cmd public.device_commands%rowtype; v_path text; v_ok boolean;
begin
  -- esgota tentativas
  update public.device_commands c
     set status = 'failed', last_error = 'Sem resposta do equipamento.', done_at = now()
   where c.device_ref = p_device_ref and c.status = 'sent'
     and c.sent_at < now() - interval '2 minutes' and c.attempts >= 5;

  if exists (
    select 1 from public.device_commands c
     where c.device_ref = p_device_ref and c.status = 'sent' and c.sent_at >= now() - interval '2 minutes'
  ) then
    return;
  end if;

  loop
    select * into v_cmd from public.device_commands c
     where c.device_ref = p_device_ref
       and (c.status = 'pending' or (c.status = 'sent' and c.sent_at < now() - interval '2 minutes'))
     order by c.created_at
     limit 1
     for update skip locked;
    if not found then return; end if;

    v_path := null; v_ok := true;
    if v_cmd.command = 'set_photo' then
      select p.photo_storage_path into v_path from public.authorized_persons p
       where p.id = v_cmd.authorized_person_id
         and p.school_id = v_cmd.school_id
         and p.biometric_consent_at is not null;
      if v_path is null then
        v_ok := false;
        update public.device_commands set status = 'failed', last_error = 'Sem consentimento ou sem foto.', done_at = now()
         where device_commands.id = v_cmd.id;
      end if;
    end if;

    if v_ok then
      update public.device_commands set status = 'sent', sent_at = now(), attempts = attempts + 1
       where device_commands.id = v_cmd.id;
      return query select v_cmd.id, v_cmd.command, v_cmd.external_user_id, v_cmd.user_name, v_path;
      return;
    end if;
  end loop;
end;
$$;
revoke all on function public.proximo_comando_dispositivo(uuid) from public, anon, authenticated;
grant execute on function public.proximo_comando_dispositivo(uuid) to service_role;

-- Equipamento: conclui o comando em voo do dispositivo (o /result não garante o id do comando).
-- Se p_command_id vier, só conclui aquele. Sem comando em voo: não faz nada.
create or replace function public.concluir_comando_dispositivo(
  p_device_ref uuid, p_ok boolean, p_error text default null, p_command_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  select c.id into v_id from public.device_commands c
   where c.device_ref = p_device_ref and c.status = 'sent'
     and (p_command_id is null or c.id = p_command_id)
   order by c.sent_at
   limit 1
   for update;
  if v_id is null then return; end if;
  update public.device_commands
     set status = case when p_ok then 'done' else 'failed' end,
         last_error = case when p_ok then null else left(coalesce(p_error, 'Erro do equipamento.'), 200) end,
         done_at = now()
   where id = v_id;
end;
$$;
revoke all on function public.concluir_comando_dispositivo(uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.concluir_comando_dispositivo(uuid, boolean, text, uuid) to service_role;
