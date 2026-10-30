-- Régua de cobrança multicanal (PLANO_EXPANSAO_GESTAO.md, item 14). Só tabelas, funções e
-- policies novas mais uma linha de preço: nada existente é alterado ou apagado.
--  * Módulo `regua_cobranca` (adicional, desligado): schools.features_enabled->>'regua_cobranca'.
--  * Regras e modelos: só a Gestão (a Recepção e a Coordenação não editam cobrança).
--  * Envios (`billing_dispatches`): a Gestão só lê; quem grava é a Edge Function run-billing-rules
--    (service_role). A chave única (charge_id, dias, canal) impede mandar duas vezes.
--  * Preferência de canal: cada responsável liga e desliga o próprio (push, e-mail).
--  * Canais desta versão: push e e-mail. WhatsApp fica para depois (decisão D12: notificações
--    nativas do Asaas primeiro), por isso o CHECK de canal aceita só os dois.
--  * O `send-financial-reminders` continua valendo; ele passa a pular a escola com a régua ligada.

-- ═══ 1. Tabelas ═══
create table if not exists public.billing_rules (
  school_id uuid primary key references public.schools(id) on delete cascade,
  ativa boolean not null default false,
  -- [{ "dias": -3, "canais": ["push", "email"] }, ...] (dias < 0 antes do vencimento, > 0 depois)
  passos jsonb not null default '[]'::jsonb,
  hora_inicio smallint not null default 8 check (hora_inicio between 0 and 23),
  hora_fim smallint not null default 20 check (hora_fim between 1 and 24),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hora_fim > hora_inicio)
);

create table if not exists public.billing_message_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  canal text not null check (canal in ('push', 'email')),
  dias smallint not null check (dias between -30 and 60),
  assunto text check (assunto is null or length(btrim(assunto)) between 1 and 120),
  texto text not null check (length(btrim(texto)) between 1 and 800),
  updated_at timestamptz not null default now(),
  unique (school_id, canal, dias)
);

create table if not exists public.billing_dispatches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  charge_id uuid not null references public.financial_charges(id) on delete cascade,
  dias smallint not null,
  canal text not null check (canal in ('push', 'email')),
  status text not null check (status in ('enviado', 'falhou', 'ignorado')),
  tentativas smallint not null default 1,
  enviado_em timestamptz not null default now(),
  erro text check (erro is null or length(erro) <= 500),
  unique (charge_id, dias, canal)
);
create index if not exists idx_billing_dispatches_escola on public.billing_dispatches(school_id, enviado_em desc);

create table if not exists public.billing_channel_prefs (
  user_id uuid not null references public.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  canal text not null check (canal in ('push', 'email')),
  optou_sair boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, canal)
);

alter table public.billing_rules enable row level security;
alter table public.billing_message_templates enable row level security;
alter table public.billing_dispatches enable row level security;
alter table public.billing_channel_prefs enable row level security;

-- ═══ 2. Quem pode usar ═══
create or replace function public.regua_modulo_ligado()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'regua_cobranca') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false);
$$;

create or replace function public.regua_pode_gerir()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.regua_modulo_ligado() and coalesce(public.get_my_role(), '') = 'gestao';
$$;

revoke execute on function public.regua_modulo_ligado() from public, anon;
revoke execute on function public.regua_pode_gerir() from public, anon;
grant execute on function public.regua_modulo_ligado() to authenticated;
grant execute on function public.regua_pode_gerir() to authenticated;

-- ═══ 3. Validação dos passos ═══
create or replace function public.billing_rules_valida()
returns trigger language plpgsql as $$
declare
  passo jsonb;
  canal jsonb;
  vistos int[] := '{}';
  d int;
begin
  if jsonb_typeof(new.passos) <> 'array' or jsonb_array_length(new.passos) > 10 then
    raise exception 'Os passos da régua precisam ser uma lista de até 10 itens.';
  end if;
  for passo in select * from jsonb_array_elements(new.passos) loop
    if jsonb_typeof(passo -> 'dias') <> 'number' or jsonb_typeof(passo -> 'canais') <> 'array' then
      raise exception 'Cada passo precisa de dias e canais.';
    end if;
    d := (passo ->> 'dias')::int;
    if d < -30 or d > 60 then raise exception 'Dias do passo fora do limite (-30 a 60).'; end if;
    if d = any (vistos) then raise exception 'Dois passos no mesmo dia.'; end if;
    vistos := vistos || d;
    if jsonb_array_length(passo -> 'canais') = 0 then raise exception 'Cada passo precisa de ao menos um canal.'; end if;
    for canal in select * from jsonb_array_elements(passo -> 'canais') loop
      if canal #>> '{}' not in ('push', 'email') then raise exception 'Canal inválido na régua.'; end if;
    end loop;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_billing_rules_valida on public.billing_rules;
create trigger trg_billing_rules_valida before insert or update on public.billing_rules
  for each row execute function public.billing_rules_valida();

create or replace function public.billing_rules_toca_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_billing_templates_updated on public.billing_message_templates;
create trigger trg_billing_templates_updated before update on public.billing_message_templates
  for each row execute function public.billing_rules_toca_updated_at();
drop trigger if exists trg_billing_prefs_updated on public.billing_channel_prefs;
create trigger trg_billing_prefs_updated before update on public.billing_channel_prefs
  for each row execute function public.billing_rules_toca_updated_at();

-- ═══ 4. Policies ═══
create policy "Regua gestao le regras" on public.billing_rules
  for select using (school_id = public.get_my_school_id() and public.regua_pode_gerir());
create policy "Regua gestao cria regras" on public.billing_rules
  for insert with check (school_id = public.get_my_school_id() and public.regua_pode_gerir());
create policy "Regua gestao edita regras" on public.billing_rules
  for update using (school_id = public.get_my_school_id() and public.regua_pode_gerir())
  with check (school_id = public.get_my_school_id() and public.regua_pode_gerir());

create policy "Regua gestao le modelos" on public.billing_message_templates
  for select using (school_id = public.get_my_school_id() and public.regua_pode_gerir());
create policy "Regua gestao cria modelos" on public.billing_message_templates
  for insert with check (school_id = public.get_my_school_id() and public.regua_pode_gerir());
create policy "Regua gestao edita modelos" on public.billing_message_templates
  for update using (school_id = public.get_my_school_id() and public.regua_pode_gerir())
  with check (school_id = public.get_my_school_id() and public.regua_pode_gerir());
create policy "Regua gestao apaga modelos" on public.billing_message_templates
  for delete using (school_id = public.get_my_school_id() and public.regua_pode_gerir());

-- Envios: só leitura (a escrita é da Edge Function com service_role).
create policy "Regua gestao le envios" on public.billing_dispatches
  for select using (school_id = public.get_my_school_id() and public.regua_pode_gerir());

-- Preferência de canal: cada um cuida só da própria, e só de si mesmo na própria escola.
create policy "Regua usuario le a propria preferencia" on public.billing_channel_prefs
  for select using (user_id = auth.uid() and school_id = public.get_my_school_id());
create policy "Regua usuario cria a propria preferencia" on public.billing_channel_prefs
  for insert with check (user_id = auth.uid() and school_id = public.get_my_school_id()
                         and public.get_my_role() = 'family');
create policy "Regua usuario edita a propria preferencia" on public.billing_channel_prefs
  for update using (user_id = auth.uid() and school_id = public.get_my_school_id())
  with check (user_id = auth.uid() and school_id = public.get_my_school_id());

-- ═══ 5. Preço provisório (fora de pacotes; o Zela ajusta depois pelo Portal do Dev) ═══
insert into public.zela_modulo_precos (item_id, tipo_cobranca, valor, custo_estimado, chaves)
values ('regua_cobranca', 'por_aluno', 1.00, 0.10, array['regua_cobranca'])
on conflict (item_id) do nothing;
