-- Estoque (PLANO_EXPANSAO_GESTAO.md, item 6, v1 só controle de estoque). Só tabelas,
-- view, funções e policies novas: nada existente é alterado ou apagado.
--  * Quem usa: gestao e gestao_pedagogica (Coordenação e Direção), e só com o módulo
--    `estoque` ligado (schools.features_enabled->>'estoque' = 'true').
--  * Saldo nunca é coluna: vem da view stock_balances (soma dos movimentos).
--  * Movimento só entra pela RPC estoque_registrar (trava o item, barra saldo negativo)
--    e nunca muda nem é apagado (histórico). Item não é apagado: baixa por ativo = false.
--  * Sem integração com despesas e cobranças nesta versão.

-- ═══ 1. Tabelas ═══
create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 120),
  categoria text check (categoria is null or length(categoria) <= 80),
  unidade text not null default 'un' check (length(btrim(unidade)) between 1 and 20),
  estoque_minimo numeric(12,3) not null default 0 check (estoque_minimo >= 0),
  ativo boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);
create unique index if not exists uq_stock_items_nome
  on public.stock_items(school_id, lower(btrim(nome)));

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  item_id uuid not null,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  -- entrada e saída: quantidade positiva. Ajuste: variação com sinal (+ ou -).
  quantidade numeric(12,3) not null check (quantidade <> 0),
  motivo text check (motivo is null or length(motivo) <= 200),
  registrado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (item_id, school_id) references public.stock_items(id, school_id) on delete restrict,
  check (tipo = 'ajuste' or quantidade > 0),
  check (tipo <> 'ajuste' or length(btrim(coalesce(motivo, ''))) > 0)
);
create index if not exists idx_stock_movements_item on public.stock_movements(school_id, item_id, created_at desc);

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;

-- ═══ 2. Quem pode usar ═══
create or replace function public.estoque_pode_gerenciar()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'estoque') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false)
     and coalesce(public.get_my_role(), '') in ('gestao', 'gestao_pedagogica');
$$;

revoke execute on function public.estoque_pode_gerenciar() from public, anon;
grant execute on function public.estoque_pode_gerenciar() to authenticated;

-- ═══ 3. Policies (sem DELETE; movimentos só leitura direta) ═══
create policy "Estoque le itens da escola" on public.stock_items
  for select using (school_id = public.get_my_school_id() and public.estoque_pode_gerenciar());
create policy "Estoque cadastra itens da escola" on public.stock_items
  for insert with check (school_id = public.get_my_school_id() and public.estoque_pode_gerenciar());
create policy "Estoque edita itens da escola" on public.stock_items
  for update using (school_id = public.get_my_school_id() and public.estoque_pode_gerenciar())
  with check (school_id = public.get_my_school_id() and public.estoque_pode_gerenciar());

create policy "Estoque le movimentos da escola" on public.stock_movements
  for select using (school_id = public.get_my_school_id() and public.estoque_pode_gerenciar());

-- Saldo por item, com as permissões de quem consulta (as policies acima valem).
create or replace view public.stock_balances
with (security_invoker = true) as
select i.id as item_id,
       i.school_id,
       coalesce(sum(case m.tipo when 'entrada' then m.quantidade
                                when 'saida' then -m.quantidade
                                else m.quantidade end), 0)::numeric(12,3) as saldo
  from public.stock_items i
  left join public.stock_movements m on m.item_id = i.id and m.school_id = i.school_id
 group by i.id, i.school_id;

revoke all on public.stock_balances from public, anon;
grant select on public.stock_balances to authenticated;

-- ═══ 4. Guardas ═══
-- Identidade do item nunca muda. Sem sessão (service role) não barra, para manutenção.
create or replace function public.stock_items_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    return new;
  end if;
  if new.id <> old.id or new.school_id <> old.school_id then
    raise exception 'Identidade do item não pode ser alterada';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists stock_items_guard on public.stock_items;
create trigger stock_items_guard before insert or update on public.stock_items
  for each row execute function public.stock_items_guard();

-- Movimento é histórico: com sessão de usuário, não muda e não apaga.
create or replace function public.stock_movements_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  raise exception 'Movimento de estoque não pode ser alterado nem apagado';
end;
$$;
drop trigger if exists stock_movements_guard on public.stock_movements;
create trigger stock_movements_guard before update or delete on public.stock_movements
  for each row execute function public.stock_movements_guard();

-- ═══ 5. RPC ═══
create or replace function public.estoque_registrar(
  p_item_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_motivo text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_item record;
  v_saldo numeric;
  v_delta numeric;
  v_id uuid;
begin
  if auth.uid() is null or not public.estoque_pode_gerenciar() then
    raise exception 'Sem permissão para movimentar o estoque';
  end if;
  if p_tipo not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Tipo de movimento inválido';
  end if;
  if p_quantidade is null or p_quantidade = 0 then
    raise exception 'Informe a quantidade';
  end if;
  if p_tipo <> 'ajuste' and p_quantidade < 0 then
    raise exception 'A quantidade deve ser maior que zero';
  end if;
  if p_tipo = 'ajuste' and length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo do ajuste';
  end if;

  -- Trava o item para dois lançamentos simultâneos não furarem o saldo.
  select id, ativo into v_item
    from public.stock_items
   where id = p_item_id and school_id = v_school
   for update;
  if not found then
    raise exception 'Item não encontrado';
  end if;
  if not v_item.ativo then
    raise exception 'Item inativo';
  end if;

  v_delta := case p_tipo when 'saida' then -p_quantidade else p_quantidade end;
  select coalesce(sum(case tipo when 'saida' then -quantidade else quantidade end), 0)
    into v_saldo
    from public.stock_movements
   where item_id = p_item_id and school_id = v_school;
  if v_saldo + v_delta < 0 then
    raise exception 'Saldo insuficiente: há % em estoque', v_saldo;
  end if;

  insert into public.stock_movements (school_id, item_id, tipo, quantidade, motivo, registrado_por)
  values (v_school, p_item_id, p_tipo, p_quantidade, nullif(btrim(p_motivo), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.estoque_registrar(uuid, text, numeric, text) from public, anon;
grant execute on function public.estoque_registrar(uuid, text, numeric, text) to authenticated;
