-- Pacotes por faixa de alunos (menu Planos > Pacotes do Portal do Dev).
-- Cada plano pacote tem um preço final por faixa (50 a 1000 alunos). O dev edita só o custo por
-- aluno do plano e a alíquota de imposto; média, custo total, lucro e margem são calculados no
-- front. Nada aqui altera contratações vigentes nem a RPC contratar_plano_escola.

-- 1. Custo por aluno do plano (null = soma do custo estimado dos módulos) e imposto da simulação.
alter table public.zela_planos
  add column if not exists custo_por_aluno numeric(8,2) check (custo_por_aluno is null or custo_por_aluno >= 0);
alter table public.zela_config_comercial
  add column if not exists imposto_percent numeric(5,2) not null default 15 check (imposto_percent between 0 and 100);

-- 2. Preço final por faixa. Só o developer lê e escreve; ninguém apaga.
create table if not exists public.zela_pacote_faixas (
  plano_id uuid not null references public.zela_planos(id) on delete cascade,
  faixa integer not null check (faixa in (
    50, 60, 70, 80, 90, 100,
    120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500,
    550, 600, 650, 700, 750, 800, 850, 900, 950, 1000)),
  valor_final numeric(12,2) not null check (valor_final > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (plano_id, faixa)
);

drop trigger if exists zela_carimbar_faixas on public.zela_pacote_faixas;
create trigger zela_carimbar_faixas before insert or update on public.zela_pacote_faixas
for each row execute function public.zela_carimbar();

alter table public.zela_pacote_faixas enable row level security;
revoke all on public.zela_pacote_faixas from anon;
revoke delete on public.zela_pacote_faixas from authenticated;

drop policy if exists "Developer le as faixas dos pacotes" on public.zela_pacote_faixas;
create policy "Developer le as faixas dos pacotes" on public.zela_pacote_faixas
  for select to authenticated using (public.get_my_role() = 'developer');
drop policy if exists "Developer cria faixas dos pacotes" on public.zela_pacote_faixas;
create policy "Developer cria faixas dos pacotes" on public.zela_pacote_faixas
  for insert to authenticated with check (public.get_my_role() = 'developer');
drop policy if exists "Developer altera faixas dos pacotes" on public.zela_pacote_faixas;
create policy "Developer altera faixas dos pacotes" on public.zela_pacote_faixas
  for update to authenticated using (public.get_my_role() = 'developer') with check (public.get_my_role() = 'developer');

-- 3. Seed do Básico: custo de R$ 1,50 por aluno (plano base) e a escada de preços aprovada.
update public.zela_planos set custo_por_aluno = 1.50
  where nome = 'Básico' and modalidade = 'pacote' and custo_por_aluno is null;

insert into public.zela_pacote_faixas (plano_id, faixa, valor_final)
select p.id, v.faixa, v.valor
from public.zela_planos p
cross join (values
  (50, 299), (60, 349), (70, 399), (80, 449), (90, 499), (100, 549),
  (120, 649), (140, 749), (160, 849), (180, 949), (200, 1049), (220, 1149), (240, 1249), (260, 1349),
  (280, 1449), (300, 1549), (320, 1649), (340, 1749), (360, 1849), (380, 1949), (400, 2049), (420, 2149),
  (440, 2249), (460, 2349), (480, 2449), (500, 2549),
  (550, 2799), (600, 3049), (650, 3299), (700, 3549), (750, 3799), (800, 4049), (850, 4289),
  (900, 4529), (950, 4769), (1000, 5009)
) as v(faixa, valor)
where p.nome = 'Básico' and p.modalidade = 'pacote'
on conflict (plano_id, faixa) do nothing;
