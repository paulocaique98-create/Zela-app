-- Método Tradicional, Fase 4B: ata do conselho de classe e histórico escolar
-- (PLANO_METODO_TRADICIONAL.md). Aditiva. Roda depois da Fase 4A.
-- 1) trad_resultados ganha ano_letivo e turma_nome (fotografia no fechamento),
--    para o histórico não depender de ler trad_turmas/school_years (a família
--    não tem acesso a elas). Nulos nos resultados já fechados: o histórico usa
--    o ano de fechado_em como alternativa.
-- 2) trad_atas_conselho: uma ata por turma e período, campos fixos.
-- RLS da ata: SÓ Coordenação e Direção (gestao_pedagogica). A família NÃO lê.
-- O histórico usa trad_resultados, cuja RLS (4A) já limita a família ao filho.

alter table public.trad_resultados
  add column if not exists ano_letivo text check (ano_letivo is null or length(ano_letivo) <= 60),
  add column if not exists turma_nome text check (turma_nome is null or length(turma_nome) <= 120);

create table if not exists public.trad_atas_conselho (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  turma_id uuid not null,
  periodo smallint not null check (periodo between 1 and 6),
  data_reuniao date not null,
  participantes text not null default '' check (length(participantes) <= 2000),
  pauta text not null default '' check (length(pauta) <= 4000),
  deliberacoes text not null default '' check (length(deliberacoes) <= 4000),
  encaminhamentos text not null default '' check (length(encaminhamentos) <= 4000),
  registrado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, turma_id, periodo),
  foreign key (turma_id, school_id) references public.trad_turmas(id, school_id) on delete cascade
);
create index if not exists idx_trad_atas_turma on public.trad_atas_conselho(school_id, turma_id);

alter table public.trad_atas_conselho enable row level security;

drop policy if exists "Coordenacao e direcao gerenciam atas da escola" on public.trad_atas_conselho;
create policy "Coordenacao e direcao gerenciam atas da escola" on public.trad_atas_conselho
  for all
  using (get_my_role() = 'gestao_pedagogica' and school_id = get_my_school_id())
  with check (get_my_role() = 'gestao_pedagogica' and school_id = get_my_school_id());
