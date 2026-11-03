-- Bloqueio por inadimplência (plano de faturamento, seção 7, item 3).
-- Reaproveita schools.is_active (já derrubado pela rotina de atraso e pela suspensão manual).
-- Muda só leitura de acesso: nenhum dado é apagado, nenhuma escola atual é alterada.
--  1) escola_liberada(school_id): fonte única para as Edge Functions (service_role). Fechada para o app.
--  2) get_my_school_id(): só o developer é isento. A Gestão passa a ser bloqueada como os demais perfis
--     e só enxerga a tela de bloqueio, pela RPC meu_estado_bloqueio().
--  3) meu_estado_bloqueio(): estado do bloqueio e cobrança em aberto SÓ da escola de quem chama.
--     Valor, vencimento e link de pagamento só vão para a Gestão.
--  4) Duas policies liam users.school_id direto e escapavam do bloqueio; passam a usar get_my_school_id().
--  5) Toda mudança de schools.is_active grava quem fez e quando (trigger), seja manual, rotina ou webhook.
-- Reversível: reativar a escola restaura tudo.

-- 1) fonte única para o servidor
create or replace function public.escola_liberada(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select s.is_active from public.schools s where s.id = p_school_id), true);
$$;
revoke all on function public.escola_liberada(uuid) from public, anon, authenticated;
grant execute on function public.escola_liberada(uuid) to service_role;

-- 2) get_my_school_id: só developer isento (antes também a Gestão)
create or replace function public.get_my_school_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.school_id
  from public.users u
  where u.id = auth.uid()
    and (
      u.role = 'developer'
      or public.escola_liberada(u.school_id)
    );
$$;

-- 3) estado do bloqueio para a tela de bloqueio
create or replace function public.meu_estado_bloqueio()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_role text;
  v_school uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_carencia integer;
  v_cob record;
begin
  select u.role, u.school_id into v_role, v_school from public.users u where u.id = auth.uid();
  if v_role is null or v_role = 'developer' or v_school is null or public.escola_liberada(v_school) then
    return jsonb_build_object('suspensa', false);
  end if;

  select c.carencia_dias into v_carencia from public.zela_config_comercial c where c.id;

  select b.numero, b.tipo, b.valor, b.vencimento, b.invoice_url into v_cob
    from public.zela_cobrancas b
   where b.school_id = v_school and b.status = 'vencida'
   order by b.vencimento asc
   limit 1;

  return jsonb_build_object(
    'suspensa', true,
    'role', v_role,
    'cobranca', case when v_cob.vencimento is null or v_role <> 'gestao' then null else jsonb_build_object(
      'numero', v_cob.numero,
      'tipo', v_cob.tipo,
      'valor', v_cob.valor,
      'vencimento', v_cob.vencimento,
      'dias_atraso', greatest(v_hoje - v_cob.vencimento, 0),
      'bloqueio_em', v_cob.vencimento + coalesce(v_carencia, 15),
      'invoice_url', v_cob.invoice_url
    ) end
  );
end;
$$;
revoke all on function public.meu_estado_bloqueio() from public, anon;
grant execute on function public.meu_estado_bloqueio() to authenticated, service_role;

-- minha_escola_suspensa(): a Gestão agora também é bloqueada, mas o app NÃO a desloga
-- (ela vê a tela de bloqueio). Por isso a função segue devolvendo false para a Gestão.

-- 4) policies que escapavam do bloqueio (mesma regra, agora passando por get_my_school_id)
alter policy "Admins veem status diario da escola" on public.daily_attendance_status
  using (public.get_my_role() = 'admin' and school_id = public.get_my_school_id());
alter policy "Admins veem notificacoes da escola" on public.notifications
  using (public.get_my_role() = 'admin' and school_id = public.get_my_school_id());

-- 5) trilha de suspensão e reativação
create table if not exists public.zela_bloqueios_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  acao text not null check (acao in ('suspensa', 'reativada')),
  origem text not null check (origem in ('developer', 'sistema')),
  feito_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists zela_bloqueios_log_school_idx on public.zela_bloqueios_log (school_id, created_at desc);
alter table public.zela_bloqueios_log enable row level security;
revoke all on public.zela_bloqueios_log from anon, authenticated;
grant select on public.zela_bloqueios_log to authenticated;
drop policy if exists "Developer le bloqueios" on public.zela_bloqueios_log;
create policy "Developer le bloqueios" on public.zela_bloqueios_log
  for select to authenticated using (public.get_my_role() = 'developer');

create or replace function public.zela_bloqueio_registrar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.is_active is distinct from old.is_active then
    insert into public.zela_bloqueios_log (school_id, acao, origem, feito_por)
    values (new.id, case when new.is_active then 'reativada' else 'suspensa' end,
            case when auth.uid() is null then 'sistema' else 'developer' end, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.zela_bloqueio_registrar() from public, anon, authenticated;
drop trigger if exists zela_bloqueio_registrar_trg on public.schools;
create trigger zela_bloqueio_registrar_trg after update of is_active on public.schools
  for each row execute function public.zela_bloqueio_registrar();
