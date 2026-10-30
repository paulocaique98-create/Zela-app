-- Faturamento do Zela Edu (PLANO_FATURAMENTO_ZELA.md, itens 1 e 7A).
-- 1) zela_condicoes_pagamento: período + pagamento, parcelas, intervalo e desconto. É a única fonte do
--    desconto na contratação. RLS só developer; toda alteração entra no histórico (zela_planos_historico).
-- 2) zela_config_comercial ganha as regras de cobrança (vencimento da 1ª parcela, carência, multa, juros e
--    lista de descontos da mensalidade). Mesma linha única e mesma RLS já existentes.
-- 3) Semestral e Bianual saem de uso: ciclos desativados (ativo = false) e desconto_percent zerado. Nada é
--    apagado; contratações existentes seguem como estão. A coluna desconto_percent deixa de valer.

create table if not exists public.zela_condicoes_pagamento (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^[a-z0-9_]+$'),
  ciclo text not null check (ciclo in ('MENSAL', 'ANUAL')),
  pagamento text not null check (pagamento in ('mes_a_mes', 'a_vista', 'parcelado')),
  parcelas integer not null check (parcelas between 1 and 12),
  intervalo_meses integer not null check (intervalo_meses between 1 and 12),
  desconto_percent numeric(5,2) not null default 0 check (desconto_percent between 0 and 50),
  ativo boolean not null default true,
  ordem integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (
    (ciclo = 'MENSAL' and pagamento = 'mes_a_mes' and parcelas = 1)
    or (ciclo = 'ANUAL' and pagamento = 'a_vista' and parcelas = 1)
    or (ciclo = 'ANUAL' and pagamento = 'parcelado' and parcelas in (6, 12))
  ),
  unique (ciclo, pagamento, parcelas)
);

insert into public.zela_condicoes_pagamento (chave, ciclo, pagamento, parcelas, intervalo_meses, desconto_percent, ordem) values
  ('mensal',     'MENSAL', 'mes_a_mes', 1,  1,  0, 1),
  ('anual_vista','ANUAL',  'a_vista',   1,  12, 15, 2),
  ('anual_6x',   'ANUAL',  'parcelado', 6,  2,  10, 3),
  ('anual_12x',  'ANUAL',  'parcelado', 12, 1,  5, 4)
on conflict (chave) do nothing;

create or replace function public.zela_condicoes_carimbar()
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
revoke execute on function public.zela_condicoes_carimbar() from public, anon, authenticated;

drop trigger if exists zela_condicoes_carimbar_trg on public.zela_condicoes_pagamento;
create trigger zela_condicoes_carimbar_trg before insert or update on public.zela_condicoes_pagamento
for each row execute function public.zela_condicoes_carimbar();

drop trigger if exists zela_hist_condicoes on public.zela_condicoes_pagamento;
create trigger zela_hist_condicoes after insert or update on public.zela_condicoes_pagamento
for each row execute function public.zela_registrar_historico();

alter table public.zela_condicoes_pagamento enable row level security;
revoke all on public.zela_condicoes_pagamento from anon;
revoke insert, update, delete on public.zela_condicoes_pagamento from authenticated;
grant select, update on public.zela_condicoes_pagamento to authenticated;

drop policy if exists "Developer le as condicoes de pagamento" on public.zela_condicoes_pagamento;
create policy "Developer le as condicoes de pagamento" on public.zela_condicoes_pagamento
  for select to authenticated using (public.get_my_role() = 'developer');
drop policy if exists "Developer altera as condicoes de pagamento" on public.zela_condicoes_pagamento;
create policy "Developer altera as condicoes de pagamento" on public.zela_condicoes_pagamento
  for update to authenticated using (public.get_my_role() = 'developer') with check (public.get_my_role() = 'developer');

-- Regras de cobrança na configuração comercial (linha única, já com RLS só developer).
alter table public.zela_config_comercial
  add column if not exists vencimento_primeira_dias integer not null default 3 check (vencimento_primeira_dias between 0 and 60),
  add column if not exists carencia_dias integer not null default 15 check (carencia_dias between 0 and 90),
  add column if not exists multa_percent numeric(5,2) not null default 2 check (multa_percent between 0 and 10),
  add column if not exists juros_mensal_percent numeric(5,2) not null default 1 check (juros_mensal_percent between 0 and 10),
  add column if not exists desconto_mensalidade_opcoes numeric(5,2)[] not null default '{5,10}';

-- Semestral e Bianual saem do projeto: desativa e zera o desconto, sem apagar.
update public.zela_plano_ciclos
   set ativo = false, desconto_percent = 0
 where ciclo in ('SEMESTRAL', 'BIANUAL') and (ativo or desconto_percent <> 0);
