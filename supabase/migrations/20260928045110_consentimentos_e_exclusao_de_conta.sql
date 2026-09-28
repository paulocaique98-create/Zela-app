-- Consentimentos com data e pedido de exclusão de conta (28/09/2026).
-- Adianta itens do PLANO_APPS_MOBILE.md que já valem na web (LGPD) e que a
-- Apple exige no app: exclusão de conta iniciada pelo próprio usuário.
--
--   1. users.image_usage_accepted: a tela Configurações da Família gravava
--      nessa coluna, mas ela não existia na produção -- a resposta sobre uso
--      de imagem se perdia em silêncio. Criada agora, com a data da resposta.
--   2. Data do aceite da LGPD (antes só um booleano, sem prova de quando).
--      As datas são carimbadas pelo servidor, nunca pelo aparelho.
--   3. Pedido de exclusão de conta: o usuário pede, a Gestão conclui.

-- ═══ 1 e 2. Consentimentos ═══════════════════════════════════════════════
alter table public.users add column if not exists image_usage_accepted boolean;
alter table public.users add column if not exists image_usage_answered_at timestamptz;
alter table public.users add column if not exists lgpd_accepted_at timestamptz;

create or replace function public.stamp_user_consents()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.lgpd_accepted is distinct from old.lgpd_accepted then
    new.lgpd_accepted_at := case when new.lgpd_accepted then now() else null end;
  else
    new.lgpd_accepted_at := old.lgpd_accepted_at;
  end if;
  if new.image_usage_accepted is distinct from old.image_usage_accepted then
    new.image_usage_answered_at := case when new.image_usage_accepted is null then null else now() end;
  else
    new.image_usage_answered_at := old.image_usage_answered_at;
  end if;
  return new;
end;
$function$;

drop trigger if exists stamp_user_consents_trigger on public.users;
create trigger stamp_user_consents_trigger
before update on public.users
for each row execute function public.stamp_user_consents();

-- ═══ 3. Pedido de exclusão de conta ═══════════════════════════════════════
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  -- Fica nulo quando a conta é de fato excluída; nome/e-mail guardam quem pediu.
  user_id uuid references public.users(id) on delete set null,
  user_name text not null,
  user_email text,
  user_role text not null,
  reason text,
  status text not null default 'pendente' check (status in ('pendente', 'concluida', 'recusada', 'cancelada')),
  requested_at timestamptz not null default now(),
  handled_by uuid references public.users(id) on delete set null,
  handled_at timestamptz,
  response text
);
create index if not exists idx_account_deletion_requests_school on public.account_deletion_requests(school_id, status);
create unique index if not exists uq_account_deletion_one_pending on public.account_deletion_requests(user_id) where status = 'pendente';

alter table public.account_deletion_requests enable row level security;

create policy "Usuario ve os proprios pedidos de exclusao"
on public.account_deletion_requests for select
using (user_id = auth.uid());

create policy "Gestao ve os pedidos de exclusao da escola"
on public.account_deletion_requests for select
using (school_id = get_my_school_id() and coalesce(get_my_role(), '') = 'gestao');

create policy "Gestao responde os pedidos de exclusao da escola"
on public.account_deletion_requests for update
using (school_id = get_my_school_id() and coalesce(get_my_role(), '') = 'gestao')
with check (school_id = get_my_school_id() and coalesce(get_my_role(), '') = 'gestao');

-- Pedir (ou cancelar o próprio pedido) só pelas funções abaixo: elas fixam
-- quem pede, a escola e o papel, sem confiar no que vem do aparelho.
create or replace function public.request_account_deletion(p_reason text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user record;
  v_id uuid;
begin
  select id, name, email, role, school_id into v_user from users where id = auth.uid();
  if v_user.id is null or v_user.school_id is null then
    raise exception 'Conta não encontrada.';
  end if;
  if v_user.role not in ('family', 'teacher', 'admin') then
    raise exception 'A conta da Gestão só pode ser encerrada pelo suporte do Zela.';
  end if;
  if exists (select 1 from account_deletion_requests where user_id = v_user.id and status = 'pendente') then
    raise exception 'Você já tem um pedido de exclusão em andamento.';
  end if;

  insert into account_deletion_requests (school_id, user_id, user_name, user_email, user_role, reason)
  values (v_user.school_id, v_user.id, v_user.name, v_user.email, v_user.role, nullif(trim(coalesce(p_reason, '')), ''))
  returning id into v_id;

  insert into audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
  values (v_user.school_id, v_user.id, 'request_account_deletion', 'user', v_user.id, jsonb_build_object('request_id', v_id));

  return v_id;
end;
$function$;
revoke execute on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

create or replace function public.cancel_account_deletion_request()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update account_deletion_requests set status = 'cancelada', handled_at = now()
  where user_id = auth.uid() and status = 'pendente';
  if not found then
    raise exception 'Nenhum pedido de exclusão em andamento.';
  end if;
end;
$function$;
revoke execute on function public.cancel_account_deletion_request() from public, anon;
grant execute on function public.cancel_account_deletion_request() to authenticated;
