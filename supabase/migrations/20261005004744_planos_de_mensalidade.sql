-- Planos de mensalidade (04/10/2026)
--
-- Tabela de preços por ciclo (6, 8 ou 10 horas) e turno (Matutino ou
-- Vespertino), por ano letivo, mais a condição financeira de cada família
-- (desconto continua na tabela que já existia; aqui entra "bolsista") e as
-- configurações da criação automática de mensalidades.
--
--   · school_plan_prices: preço MENSAL em centavos. Só a Gestão lê e grava.
--     Trimestral, semestral e anual saem do mensal x meses, com o desconto da
--     família (financial_billing_discounts), calculado no servidor.
--   · financial_guardian_conditions: bolsista (não recebe cobrança) e uma
--     observação interna, por responsável financeiro.
--   · school_financial_settings: criação automática de mensalidade na
--     aprovação da matrícula. Nasce DESLIGADA (regra do projeto).
--   · financial_contracts ganha ciclo, turno, ano e a origem do preço
--     (tabela ou digitado); financial_charges guarda o valor original quando
--     a Gestão ajusta o valor de uma cobrança.

-- ─── Preços ─────────────────────────────────────────────────────────────────
create table public.school_plan_prices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_year integer not null check (school_year between 2000 and 2100),
  ciclo_horas integer not null check (ciclo_horas in (6, 8, 10)),
  turno text not null check (turno in ('Matutino', 'Vespertino')),
  monthly_amount_cents integer not null check (monthly_amount_cents > 0),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (school_id, school_year, ciclo_horas, turno)
);
create index school_plan_prices_school_idx on public.school_plan_prices (school_id, school_year);

alter table public.school_plan_prices enable row level security;
revoke all on public.school_plan_prices from anon;

create policy "Gestao le precos dos planos"
on public.school_plan_prices for select to authenticated
using (school_id = public.get_my_school_id() and public.can_write_gestao());

create policy "Gestao grava precos dos planos"
on public.school_plan_prices for all to authenticated
using (school_id = public.get_my_school_id() and public.can_write_gestao())
with check (school_id = public.get_my_school_id() and public.can_write_gestao());

create or replace function public.carimbar_preco_do_plano()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

create trigger carimbar_preco_do_plano
before insert or update on public.school_plan_prices
for each row execute function public.carimbar_preco_do_plano();

-- ─── Condição financeira da família ─────────────────────────────────────────
create table public.financial_guardian_conditions (
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null references public.users(id) on delete cascade,
  bolsista boolean not null default false,
  observacao text,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (school_id, guardian_id)
);

alter table public.financial_guardian_conditions enable row level security;
revoke all on public.financial_guardian_conditions from anon;

-- Quem gera contrato precisa saber se a família é bolsista para escrever
-- "bolsa integral" no lugar da mensalidade.
create policy "Gestao e contratos leem a condicao da familia"
on public.financial_guardian_conditions for select to authenticated
using (
  school_id = public.get_my_school_id()
  and (public.get_my_role() = 'gestao' or (public.get_my_role() = 'admin' and public.has_permission('contratos.gerenciar')))
);

create policy "Gestao grava a condicao da familia"
on public.financial_guardian_conditions for all to authenticated
using (school_id = public.get_my_school_id() and public.can_write_gestao())
with check (
  school_id = public.get_my_school_id() and public.can_write_gestao()
  and exists (select 1 from public.users u where u.id = guardian_id and u.school_id = financial_guardian_conditions.school_id)
);

create or replace function public.carimbar_condicao_da_familia()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.observacao := nullif(btrim(coalesce(new.observacao, '')), '');
  return new;
end;
$function$;

create trigger carimbar_condicao_da_familia
before insert or update on public.financial_guardian_conditions
for each row execute function public.carimbar_condicao_da_familia();

-- ─── Configurações da criação automática ────────────────────────────────────
create table public.school_financial_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  auto_create_on_approval boolean not null default false,
  default_due_day integer not null default 10 check (default_due_day between 1 and 28),
  default_billing_type text not null default 'UNDEFINED' check (default_billing_type in ('PIX', 'BOLETO', 'UNDEFINED')),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.school_financial_settings enable row level security;
revoke all on public.school_financial_settings from anon;

create policy "Gestao le as configuracoes financeiras"
on public.school_financial_settings for select to authenticated
using (school_id = public.get_my_school_id() and public.can_write_gestao());

create policy "Gestao grava as configuracoes financeiras"
on public.school_financial_settings for all to authenticated
using (school_id = public.get_my_school_id() and public.can_write_gestao())
with check (school_id = public.get_my_school_id() and public.can_write_gestao());

create or replace function public.carimbar_configuracao_financeira()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

create trigger carimbar_configuracao_financeira
before insert or update on public.school_financial_settings
for each row execute function public.carimbar_configuracao_financeira();

-- ─── Mensalidade e cobrança ─────────────────────────────────────────────────
alter table public.financial_contracts
  add column ciclo_horas integer check (ciclo_horas is null or ciclo_horas in (6, 8, 10)),
  add column turno text check (turno is null or turno in ('Matutino', 'Vespertino')),
  add column school_year integer,
  add column price_source text not null default 'manual' check (price_source in ('tabela', 'manual'));

alter table public.financial_charges
  add column original_amount_cents integer check (original_amount_cents is null or original_amount_cents > 0),
  add column adjusted_at timestamptz;
