-- Item 10 do plano de expansão da Gestão: negociação de dívida (19/11/2026).
-- Acordo com a família inadimplente: desconto + parcelamento em cobranças novas.
-- Escrita só pelas Edge Functions (service role); a Gestão e a família só leem.
-- Sem policy de INSERT/UPDATE/DELETE: o histórico do acordo não se apaga nem se edita pelo cliente.

-- ═══ 1. Tabelas ═══════════════════════════════════════════════════════════
create table if not exists public.debt_agreements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null references public.users(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  valor_original_cents integer not null check (valor_original_cents > 0),
  desconto_cents integer not null default 0 check (desconto_cents >= 0),
  valor_acordado_cents integer not null check (valor_acordado_cents > 0),
  parcelas smallint not null check (parcelas between 1 and 24),
  primeiro_vencimento date not null,
  status text not null default 'aguardando_assinatura'
    check (status in ('rascunho', 'aguardando_assinatura', 'ativo', 'quitado', 'rompido', 'cancelado')),
  contract_id uuid references public.contract_documents(id) on delete set null,
  motivo text,
  motivo_encerramento text,
  ativando_em timestamptz,
  ativado_em timestamptz,
  encerrado_em timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valor_acordado_cents = valor_original_cents - desconto_cents)
);
create index if not exists idx_debt_agreements_school_status on public.debt_agreements (school_id, status, created_at desc);
create index if not exists idx_debt_agreements_guardian on public.debt_agreements (guardian_id);

create table if not exists public.debt_agreement_charges (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.debt_agreements(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  charge_id uuid not null references public.financial_charges(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  status_anterior text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);
-- Uma cobrança só entra em um acordo vigente por vez.
create unique index if not exists uq_debt_agreement_charges_ativa on public.debt_agreement_charges (charge_id) where ativa;
create index if not exists idx_debt_agreement_charges_agreement on public.debt_agreement_charges (agreement_id);

create table if not exists public.debt_agreement_installments (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.debt_agreements(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  numero smallint not null check (numero >= 1),
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  charge_id uuid references public.financial_charges(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agreement_id, numero)
);
create index if not exists idx_debt_agreement_installments_charge on public.debt_agreement_installments (charge_id);

-- ═══ 2. Integridade entre escolas e das transições ════════════════════════
create or replace function public.debt_agreements_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.students s where s.id = new.student_id and s.school_id = new.school_id)
       or not exists (select 1 from public.users u where u.id = new.guardian_id and u.school_id = new.school_id) then
      raise exception 'acordo_escola_invalida' using errcode = '42501';
    end if;
    if new.contract_id is not null and not exists (select 1 from public.contract_documents d where d.id = new.contract_id and d.school_id = new.school_id) then
      raise exception 'acordo_escola_invalida' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Valores, partes e escola não mudam depois de criados.
  if new.school_id is distinct from old.school_id or new.guardian_id is distinct from old.guardian_id
     or new.student_id is distinct from old.student_id or new.valor_original_cents is distinct from old.valor_original_cents
     or new.desconto_cents is distinct from old.desconto_cents or new.valor_acordado_cents is distinct from old.valor_acordado_cents
     or new.parcelas is distinct from old.parcelas or new.primeiro_vencimento is distinct from old.primeiro_vencimento then
    raise exception 'acordo_imutavel';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'rascunho' and new.status in ('aguardando_assinatura', 'cancelado'))
      or (old.status = 'aguardando_assinatura' and new.status in ('ativo', 'cancelado'))
      or (old.status = 'ativo' and new.status in ('quitado', 'rompido'))
    ) then
      raise exception 'acordo_transicao_invalida: % para %', old.status, new.status;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_debt_agreements_guard on public.debt_agreements;
create trigger trg_debt_agreements_guard
before insert or update on public.debt_agreements
for each row execute function public.debt_agreements_guard();

create or replace function public.debt_agreement_children_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.debt_agreements a where a.id = new.agreement_id and a.school_id = new.school_id) then
    raise exception 'acordo_escola_invalida' using errcode = '42501';
  end if;
  if tg_table_name = 'debt_agreement_charges'
     and not exists (select 1 from public.financial_charges c where c.id = new.charge_id and c.school_id = new.school_id) then
    raise exception 'acordo_escola_invalida' using errcode = '42501';
  end if;
  if tg_table_name = 'debt_agreement_installments' and new.charge_id is not null
     and not exists (select 1 from public.financial_charges c where c.id = new.charge_id and c.school_id = new.school_id) then
    raise exception 'acordo_escola_invalida' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_debt_agreement_charges_guard on public.debt_agreement_charges;
create trigger trg_debt_agreement_charges_guard
before insert or update on public.debt_agreement_charges
for each row execute function public.debt_agreement_children_guard();

drop trigger if exists trg_debt_agreement_installments_guard on public.debt_agreement_installments;
create trigger trg_debt_agreement_installments_guard
before insert or update on public.debt_agreement_installments
for each row execute function public.debt_agreement_children_guard();

-- ═══ 3. Quitação automática ═══════════════════════════════════════════════
-- Quando a última parcela do acordo é paga (webhook ou baixa manual), o acordo vira "quitado".
create or replace function public.debt_agreement_quitar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement uuid;
begin
  if new.status <> 'PAID' or old.status = 'PAID' then
    return new;
  end if;
  select i.agreement_id into v_agreement
  from public.debt_agreement_installments i
  where i.charge_id = new.id
  limit 1;
  if v_agreement is null then
    return new;
  end if;
  if exists (
    select 1 from public.debt_agreement_installments i
    left join public.financial_charges c on c.id = i.charge_id
    where i.agreement_id = v_agreement and (c.id is null or c.status <> 'PAID')
  ) then
    return new;
  end if;
  update public.debt_agreements
  set status = 'quitado', encerrado_em = now()
  where id = v_agreement and status = 'ativo';
  return new;
end;
$$;
revoke execute on function public.debt_agreement_quitar() from public, anon, authenticated;

drop trigger if exists trg_debt_agreement_quitar on public.financial_charges;
create trigger trg_debt_agreement_quitar
after update of status on public.financial_charges
for each row execute function public.debt_agreement_quitar();

-- ═══ 4. RLS (somente leitura para o cliente) ══════════════════════════════
alter table public.debt_agreements enable row level security;
alter table public.debt_agreement_charges enable row level security;
alter table public.debt_agreement_installments enable row level security;

create policy "Acordos: Gestao le"
on public.debt_agreements for select
using (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

create policy "Acordos: familia financeira le o proprio"
on public.debt_agreements for select
using (
  public.get_my_role() = 'family'
  and guardian_id = auth.uid()
  and public.is_financial_guardian()
  and status in ('aguardando_assinatura', 'ativo', 'quitado', 'rompido')
);

create policy "Cobrancas do acordo: Gestao le"
on public.debt_agreement_charges for select
using (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

create policy "Parcelas do acordo: Gestao le"
on public.debt_agreement_installments for select
using (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

create policy "Parcelas do acordo: familia financeira le"
on public.debt_agreement_installments for select
using (
  public.get_my_role() = 'family'
  and public.is_financial_guardian()
  and exists (
    select 1 from public.debt_agreements a
    where a.id = debt_agreement_installments.agreement_id
      and a.guardian_id = auth.uid()
      and a.status in ('ativo', 'quitado', 'rompido')
  )
);
