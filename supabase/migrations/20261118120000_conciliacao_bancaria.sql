-- Item 9 da Expansão da Gestão: conciliação bancária completa (entradas e saídas).
-- Não destrutiva: três tabelas novas, RLS só Gestão e da própria escola.
-- Sem policy de DELETE em imports e linhas: o histórico do extrato não se apaga.
-- A baixa de cobrança continua pela Edge Function register-manual-payment (Asaas avisado).

-- ═══ 1. Contas bancárias da escola ════════════════════════════════════════
create table if not exists public.school_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  apelido text not null check (length(btrim(apelido)) > 0),
  banco text,
  agencia text,
  conta_mascarada text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, apelido)
);

-- ═══ 2. Importações de extrato ════════════════════════════════════════════
create table if not exists public.bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  account_id uuid not null references public.school_bank_accounts(id) on delete restrict,
  arquivo_nome text,
  periodo_inicio date,
  periodo_fim date,
  saldo_final_cents bigint,
  saldo_data date,
  linhas_total integer not null default 0,
  linhas_novas integer not null default 0,
  importado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_bank_imports_school on public.bank_statement_imports (school_id, created_at desc);

-- ═══ 3. Linhas do extrato ═════════════════════════════════════════════════
create table if not exists public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  import_id uuid not null references public.bank_statement_imports(id) on delete restrict,
  account_id uuid not null references public.school_bank_accounts(id) on delete restrict,
  fitid text not null check (length(btrim(fitid)) > 0),
  data date not null,
  valor_cents bigint not null check (valor_cents <> 0),
  descricao text,
  status text not null default 'pendente' check (status in ('pendente', 'conciliada', 'ignorada')),
  charge_id uuid references public.financial_charges(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  asaas_transfer_id text,
  conciliada_em timestamptz,
  conciliada_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Reimportar o mesmo extrato não duplica.
  unique (school_id, account_id, fitid),
  -- Uma linha concilia com cobrança (entrada) ou despesa (saída), nunca as duas.
  check (not (charge_id is not null and expense_id is not null)),
  check (charge_id is null or valor_cents > 0),
  check (expense_id is null or valor_cents < 0)
);
create index if not exists idx_bank_lines_school_status on public.bank_statement_lines (school_id, status, data desc);
create index if not exists idx_bank_lines_import on public.bank_statement_lines (import_id);

-- ═══ 4. Integridade entre escolas ═════════════════════════════════════════
-- Conta, importação, cobrança e despesa referenciadas precisam ser da mesma escola da linha.
create or replace function public.bank_lines_mesma_escola()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.school_bank_accounts a where a.id = new.account_id and a.school_id = new.school_id)
     or not exists (select 1 from public.bank_statement_imports i where i.id = new.import_id and i.school_id = new.school_id and i.account_id = new.account_id) then
    raise exception 'conciliacao_escola_invalida' using errcode = '42501';
  end if;
  if new.charge_id is not null and not exists (select 1 from public.financial_charges c where c.id = new.charge_id and c.school_id = new.school_id) then
    raise exception 'conciliacao_escola_invalida' using errcode = '42501';
  end if;
  if new.expense_id is not null and not exists (select 1 from public.expenses e where e.id = new.expense_id and e.school_id = new.school_id) then
    raise exception 'conciliacao_escola_invalida' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bank_lines_mesma_escola on public.bank_statement_lines;
create trigger trg_bank_lines_mesma_escola
before insert or update on public.bank_statement_lines
for each row execute function public.bank_lines_mesma_escola();

create or replace function public.bank_imports_mesma_escola()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.school_bank_accounts a where a.id = new.account_id and a.school_id = new.school_id) then
    raise exception 'conciliacao_escola_invalida' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bank_imports_mesma_escola on public.bank_statement_imports;
create trigger trg_bank_imports_mesma_escola
before insert or update on public.bank_statement_imports
for each row execute function public.bank_imports_mesma_escola();

-- ═══ 5. RLS ═══════════════════════════════════════════════════════════════
alter table public.school_bank_accounts enable row level security;
alter table public.bank_statement_imports enable row level security;
alter table public.bank_statement_lines enable row level security;

create policy "Contas bancarias da Gestao"
on public.school_bank_accounts for all
using (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao')
with check (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

create policy "Importacoes de extrato: Gestao le"
on public.bank_statement_imports for select
using (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

create policy "Importacoes de extrato: Gestao cria"
on public.bank_statement_imports for insert
with check (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

create policy "Linhas de extrato: Gestao le"
on public.bank_statement_lines for select
using (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

create policy "Linhas de extrato: Gestao cria"
on public.bank_statement_lines for insert
with check (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

create policy "Linhas de extrato: Gestao atualiza"
on public.bank_statement_lines for update
using (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao')
with check (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');
