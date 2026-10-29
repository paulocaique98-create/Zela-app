-- Item 3 da Expansão da Gestão: DRE e fluxo de caixa projetado.
-- Não destrutiva: duas tabelas novas (RLS só gestao) e duas RPCs de leitura (invoker, só gestao).
-- Fora do DRE por falta de dado: taxas do gateway (sem net_value), descontos e bolsas, tipo da cobrança.

-- ═══ 1. Categorias de despesa e grupo do DRE ══════════════════════════════
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  grupo_dre text not null default 'outros'
    check (grupo_dre in ('pessoal', 'ocupacao', 'material', 'administrativo', 'impostos', 'financeiro', 'outros')),
  created_at timestamptz not null default now(),
  unique (school_id, nome)
);

create table if not exists public.school_cash_balances (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  data date not null,
  saldo_cents bigint not null,
  conta text not null default 'principal',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, data, conta)
);
create index if not exists idx_cash_balances_school_data on public.school_cash_balances (school_id, data desc);

alter table public.expense_categories enable row level security;
alter table public.school_cash_balances enable row level security;

create policy "Categorias de despesa da Gestao"
on public.expense_categories for all
using (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao')
with check (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

create policy "Saldos de caixa da Gestao"
on public.school_cash_balances for all
using (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao')
with check (school_id = public.get_my_school_id() and public.get_my_role() = 'gestao');

-- Mapeia as categorias já usadas (texto livre) sem alterar expenses.
insert into public.expense_categories (school_id, nome, grupo_dre)
select distinct e.school_id, e.category,
  case
    when e.category ilike 'Folha%' then 'pessoal'
    when e.category ilike 'Aluguel%' or e.category ilike '%luz%' or e.category ilike 'Manuten%' then 'ocupacao'
    when e.category ilike 'Material%' or e.category ilike 'Aliment%' or e.category ilike 'Limpeza%' then 'material'
    when e.category ilike 'Impostos%' then 'impostos'
    when e.category ilike 'Servi%' then 'administrativo'
    else 'outros'
  end
from public.expenses e
on conflict (school_id, nome) do nothing;

-- ═══ 2. DRE ═══════════════════════════════════════════════════════════════
create or replace function public.fin_dre(p_inicio date, p_fim date, p_regime text default 'caixa')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_school uuid := public.get_my_school_id();
  v_result jsonb;
begin
  if v_school is null or public.get_my_role() is distinct from 'gestao' then
    raise exception 'fin_acesso_negado' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim > (p_inicio + interval '24 months')::date then
    raise exception 'fin_periodo_invalido' using errcode = '22023';
  end if;
  if p_regime not in ('caixa', 'competencia') then
    raise exception 'fin_regime_invalido' using errcode = '22023';
  end if;

  with
  receitas as (
    select to_char(case when p_regime = 'caixa' then (fc.paid_at at time zone 'America/Sao_Paulo')::date else fc.due_date end, 'YYYY-MM') as mes,
      sum(fc.amount_cents)::bigint as cents
    from public.financial_charges fc
    where fc.school_id = v_school
      and case
        when p_regime = 'caixa' then fc.status = 'PAID' and fc.paid_at is not null
          and (fc.paid_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
        else fc.status not in ('CANCELLED', 'REFUNDED', 'FAILED') and fc.due_date between p_inicio and p_fim
      end
    group by 1
  ),
  despesas as (
    select to_char(case when p_regime = 'caixa' then e.paid_on else e.due_date end, 'YYYY-MM') as mes,
      coalesce(c.grupo_dre, 'outros') as grupo,
      sum(e.amount_cents)::bigint as cents
    from public.expenses e
    left join public.expense_categories c on c.school_id = e.school_id and c.nome = e.category
    where e.school_id = v_school
      and case
        when p_regime = 'caixa' then e.status = 'pago' and e.paid_on between p_inicio and p_fim
        else e.status <> 'cancelado' and e.due_date between p_inicio and p_fim
      end
    group by 1, 2
  )
  select jsonb_build_object(
    'regime', p_regime,
    'receita_por_mes', coalesce((select jsonb_object_agg(mes, cents) from receitas), '{}'::jsonb),
    'despesa_por_grupo_mes', coalesce((
      select jsonb_agg(jsonb_build_object('mes', mes, 'grupo', grupo, 'cents', cents) order by mes, grupo) from despesas
    ), '[]'::jsonb),
    'receita_total', coalesce((select sum(cents) from receitas), 0),
    'despesa_total', coalesce((select sum(cents) from despesas), 0)
  ) into v_result;

  return v_result;
end;
$function$;

-- ═══ 3. Fluxo de caixa projetado ══════════════════════════════════════════
create or replace function public.fin_fluxo_projetado(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $function$
declare
  v_school uuid := public.get_my_school_id();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fim date;
  v_saldo bigint;
  v_saldo_data date;
  v_taxa_media numeric;
  v_taxa_min numeric;
  v_taxa_max numeric;
  v_result jsonb;
begin
  if v_school is null or public.get_my_role() is distinct from 'gestao' then
    raise exception 'fin_acesso_negado' using errcode = '42501';
  end if;
  if p_dias not in (30, 60, 90) then
    raise exception 'fin_horizonte_invalido' using errcode = '22023';
  end if;
  v_fim := v_hoje + p_dias;

  select b.saldo_cents, b.data into v_saldo, v_saldo_data
  from public.school_cash_balances b
  where b.school_id = v_school and b.data <= v_hoje
  order by b.data desc, b.created_at desc limit 1;

  -- Taxa histórica de recebimento: cobranças vencidas nos últimos 6 meses, por mês.
  with mensal as (
    select date_trunc('month', fc.due_date) as mes,
      sum(fc.amount_cents) filter (where fc.status = 'PAID')::numeric / nullif(sum(fc.amount_cents), 0) as taxa
    from public.financial_charges fc
    where fc.school_id = v_school
      and fc.due_date >= (date_trunc('month', v_hoje) - interval '6 months')::date
      and fc.due_date < date_trunc('month', v_hoje)::date
      and fc.status not in ('CANCELLED', 'REFUNDED', 'FAILED')
    group by 1
  )
  select avg(taxa), min(taxa), max(taxa) into v_taxa_media, v_taxa_min, v_taxa_max from mensal;

  with
  entradas as (
    select date_trunc('week', greatest(fc.due_date, v_hoje))::date as semana, sum(fc.amount_cents)::bigint as cents
    from public.financial_charges fc
    where fc.school_id = v_school
      and fc.status in ('PENDING', 'AWAITING_PAYMENT', 'OVERDUE')
      and fc.due_date <= v_fim
    group by 1
  ),
  saidas as (
    select date_trunc('week', greatest(e.due_date, v_hoje))::date as semana, sum(e.amount_cents)::bigint as cents
    from public.expenses e
    where e.school_id = v_school and e.status = 'pendente' and e.due_date <= v_fim
    group by 1
  ),
  semanas as (
    select generate_series(date_trunc('week', v_hoje)::date, v_fim, interval '7 days')::date as semana
  )
  select jsonb_build_object(
    'saldo_inicial_cents', v_saldo,
    'saldo_data', v_saldo_data,
    'taxa_media', v_taxa_media,
    'taxa_min', v_taxa_min,
    'taxa_max', v_taxa_max,
    'semanas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'semana', s.semana,
        'entradas_cents', coalesce(en.cents, 0),
        'saidas_cents', coalesce(sa.cents, 0)
      ) order by s.semana)
      from semanas s
      left join entradas en on en.semana = s.semana
      left join saidas sa on sa.semana = s.semana
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke execute on function public.fin_dre(date, date, text) from public, anon;
revoke execute on function public.fin_fluxo_projetado(integer) from public, anon;
grant execute on function public.fin_dre(date, date, text) to authenticated;
grant execute on function public.fin_fluxo_projetado(integer) to authenticated;
