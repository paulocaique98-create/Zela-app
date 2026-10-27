-- Método Tradicional, Fase 1: estrutura acadêmica (PLANO_METODO_TRADICIONAL.md).
-- Só tabelas novas com prefixo trad_; nenhuma tabela do Montessori é alterada.
-- Isolamento: toda tabela tem school_id e as chaves estrangeiras são
-- compostas (id, school_id), então um registro nunca aponta para outra escola.
-- RLS: admin, gestao e gestao_pedagogica da própria escola gerenciam;
-- professor ativo só lê o que é dele (atribuições, e turmas, séries,
-- disciplinas e horários ligados a elas). Família não acessa nesta fase.
-- A turma tradicional guarda série, turno e ano letivo; o nome dela continua
-- indo para students.turma / schools.turmas (check-in e RLS intactos).

create table if not exists public.trad_segmentos (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, nome),
  unique (id, school_id)
);

create table if not exists public.trad_series (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  segmento_id uuid not null,
  nome text not null check (length(btrim(nome)) > 0),
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, nome),
  unique (id, school_id),
  foreign key (segmento_id, school_id) references public.trad_segmentos(id, school_id) on delete restrict
);

create table if not exists public.trad_turmas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete restrict,
  serie_id uuid not null,
  nome text not null check (length(btrim(nome)) > 0),
  turno text not null default 'manha' check (turno in ('manha', 'tarde', 'integral', 'noite')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, school_year_id, nome),
  unique (id, school_id),
  foreign key (serie_id, school_id) references public.trad_series(id, school_id) on delete restrict
);
create index if not exists idx_trad_turmas_school_year on public.trad_turmas(school_id, school_year_id);

create table if not exists public.trad_disciplinas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  sigla text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, nome),
  unique (id, school_id)
);

create table if not exists public.trad_grade (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  serie_id uuid not null,
  disciplina_id uuid not null,
  carga_semanal int not null default 1 check (carga_semanal between 1 and 20),
  created_at timestamptz not null default now(),
  unique (serie_id, disciplina_id),
  unique (id, school_id),
  foreign key (serie_id, school_id) references public.trad_series(id, school_id) on delete cascade,
  foreign key (disciplina_id, school_id) references public.trad_disciplinas(id, school_id) on delete cascade
);

create table if not exists public.trad_atribuicoes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  turma_id uuid not null,
  disciplina_id uuid not null,
  professor_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (turma_id, disciplina_id),
  unique (id, school_id),
  foreign key (turma_id, school_id) references public.trad_turmas(id, school_id) on delete cascade,
  foreign key (disciplina_id, school_id) references public.trad_disciplinas(id, school_id) on delete cascade
);
create index if not exists idx_trad_atribuicoes_professor on public.trad_atribuicoes(school_id, professor_id);

create table if not exists public.trad_horarios (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  turma_id uuid not null,
  atribuicao_id uuid not null,
  dia_semana int not null check (dia_semana between 1 and 5),
  ordem int not null check (ordem between 1 and 12),
  inicio time not null,
  fim time not null,
  created_at timestamptz not null default now(),
  check (fim > inicio),
  unique (turma_id, dia_semana, ordem),
  foreign key (turma_id, school_id) references public.trad_turmas(id, school_id) on delete cascade,
  foreign key (atribuicao_id, school_id) references public.trad_atribuicoes(id, school_id) on delete cascade
);

-- O professor da atribuição precisa ser professor da mesma escola, e o
-- horário só pode usar uma atribuição da própria turma.
create or replace function public.trad_valida_atribuicao() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.id = new.professor_id and u.school_id = new.school_id and u.role = 'teacher'
  ) then
    raise exception 'Professor inválido para esta escola';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trad_valida_atribuicao on public.trad_atribuicoes;
create trigger trg_trad_valida_atribuicao
  before insert or update of professor_id, school_id on public.trad_atribuicoes
  for each row execute function public.trad_valida_atribuicao();

create or replace function public.trad_valida_horario() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.trad_atribuicoes a
    where a.id = new.atribuicao_id and a.school_id = new.school_id and a.turma_id = new.turma_id
  ) then
    raise exception 'A atribuição não pertence a esta turma';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trad_valida_horario on public.trad_horarios;
create trigger trg_trad_valida_horario
  before insert or update on public.trad_horarios
  for each row execute function public.trad_valida_horario();

create or replace function public.trad_valida_turma() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.school_years y where y.id = new.school_year_id and y.school_id = new.school_id
  ) then
    raise exception 'Ano letivo de outra escola';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trad_valida_turma on public.trad_turmas;
create trigger trg_trad_valida_turma
  before insert or update of school_year_id, school_id on public.trad_turmas
  for each row execute function public.trad_valida_turma();

-- RLS
alter table public.trad_segmentos enable row level security;
alter table public.trad_series enable row level security;
alter table public.trad_turmas enable row level security;
alter table public.trad_disciplinas enable row level security;
alter table public.trad_grade enable row level security;
alter table public.trad_atribuicoes enable row level security;
alter table public.trad_horarios enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['trad_segmentos','trad_series','trad_turmas','trad_disciplinas','trad_grade','trad_atribuicoes','trad_horarios']
  loop
    execute format('drop policy if exists "Equipe gerencia %1$s da escola" on public.%1$s', t);
    execute format($p$create policy "Equipe gerencia %1$s da escola" on public.%1$s
      for all
      using (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica') and school_id = get_my_school_id())
      with check (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica') and school_id = get_my_school_id())$p$, t);
  end loop;
end $$;

-- Professor ativo: leitura limitada ao que é dele.
drop policy if exists "Professores leem as proprias atribuicoes" on public.trad_atribuicoes;
create policy "Professores leem as proprias atribuicoes" on public.trad_atribuicoes
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id() and professor_id = auth.uid()
  );

drop policy if exists "Professores leem turmas das proprias atribuicoes" on public.trad_turmas;
create policy "Professores leem turmas das proprias atribuicoes" on public.trad_turmas
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and id in (select a.turma_id from public.trad_atribuicoes a
               where a.school_id = get_my_school_id() and a.professor_id = auth.uid())
  );

drop policy if exists "Professores leem series das proprias turmas" on public.trad_series;
create policy "Professores leem series das proprias turmas" on public.trad_series
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and id in (select t.serie_id from public.trad_turmas t
               join public.trad_atribuicoes a on a.turma_id = t.id and a.school_id = t.school_id
               where t.school_id = get_my_school_id() and a.professor_id = auth.uid())
  );

drop policy if exists "Professores leem disciplinas das proprias atribuicoes" on public.trad_disciplinas;
create policy "Professores leem disciplinas das proprias atribuicoes" on public.trad_disciplinas
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and id in (select a.disciplina_id from public.trad_atribuicoes a
               where a.school_id = get_my_school_id() and a.professor_id = auth.uid())
  );

drop policy if exists "Professores leem horarios das proprias atribuicoes" on public.trad_horarios;
create policy "Professores leem horarios das proprias atribuicoes" on public.trad_horarios
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and atribuicao_id in (select a.id from public.trad_atribuicoes a
                          where a.school_id = get_my_school_id() and a.professor_id = auth.uid())
  );
