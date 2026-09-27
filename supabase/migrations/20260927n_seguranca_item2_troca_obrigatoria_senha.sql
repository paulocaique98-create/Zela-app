-- Auditoria de segurança (27/09/2026) · item 2 (crítico).
--
-- Contas criadas pela escola (2º responsável aprovado na matrícula,
-- importação em lote) passam a nascer com senha provisória aleatória e com
-- must_change_password = true: o app bloqueia tudo até a pessoa criar a
-- própria senha (ver ForcePasswordChange.jsx). Antes era 123456 pra todo
-- mundo, anunciado na página pública de matrícula.
--
-- O flag só desliga quando a senha muda DE VERDADE (trigger em auth.users,
-- abaixo). O próprio usuário não consegue desligar direto por UPDATE em
-- public.users (trava em protect_admin_privilege_columns) -- senão bastaria
-- chamar a API e pular a troca.

alter table public.users add column if not exists must_change_password boolean not null default false;

create or replace function public.protect_admin_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_role text;
  v_caller_primary boolean;
begin
  -- auth.uid() é nulo em contexto de service_role (edge functions/scripts
  -- administrativos) e no trigger de troca de senha do Auth -- esses já
  -- passam por fora da RLS, então não há o que proteger aqui.
  if auth.uid() is null then
    return new;
  end if;

  -- role e school_id definem quem o usuário É e a QUE ESCOLA ele pertence —
  -- só o suporte (developer) pode alterar isso, nunca um admin de escola,
  -- nem mesmo o admin principal.
  if (new.role is distinct from old.role)
     or (new.school_id is distinct from old.school_id) then
    select role into v_caller_role from users where id = auth.uid();

    if v_caller_role is distinct from 'developer' then
      raise exception 'Apenas o suporte pode alterar o cargo ou a escola de um usuário';
    end if;
  end if;

  if (new.chat_visibilidade_total is distinct from old.chat_visibilidade_total)
     or (new.is_primary_admin is distinct from old.is_primary_admin) then
    select role, is_primary_admin into v_caller_role, v_caller_primary
    from users where id = auth.uid();

    if v_caller_role is distinct from 'developer' and not coalesce(v_caller_primary, false) then
      raise exception 'Apenas o admin principal da escola pode alterar essas permissões';
    end if;
  end if;

  -- Ninguém desliga a própria troca obrigatória de senha por conta própria;
  -- ela só desliga quando a senha é trocada de verdade.
  if old.must_change_password = true
     and new.must_change_password = false
     and new.id = auth.uid() then
    raise exception 'Defina uma nova senha para continuar';
  end if;

  return new;
end;
$function$;

create or replace function public.clear_must_change_password_on_password_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.users set must_change_password = false
    where id = new.id and must_change_password = true;
  end if;
  return new;
end;
$function$;

revoke execute on function public.clear_must_change_password_on_password_update() from public, anon, authenticated;

drop trigger if exists on_auth_password_changed_clear_flag on auth.users;
create trigger on_auth_password_changed_clear_flag
after update of encrypted_password on auth.users
for each row
execute function public.clear_must_change_password_on_password_update();
