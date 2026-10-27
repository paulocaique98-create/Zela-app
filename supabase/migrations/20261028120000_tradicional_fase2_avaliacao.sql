-- Método Tradicional, Fase 2: avaliação (PLANO_METODO_TRADICIONAL.md).
-- Só tabelas novas com prefixo trad_; nenhuma tabela do Montessori é alterada.
-- Isolamento: school_id em toda tabela e chaves estrangeiras compostas
-- (id, school_id). A nota só é aceita para aluno da mesma escola e da turma
-- da atribuição (students.turma = trad_turmas.nome).
-- RLS: admin, gestao e gestao_pedagogica da escola gerenciam; professor ativo
-- lê e lança apenas nas próprias atribuições. Família não acessa nesta fase
-- (o boletim, Fase 4, abrirá a leitura do próprio filho).
-- Recuperação: avaliação do tipo 'recuperacao' substitui a nota do período.

create table if not exists public.trad_config_avaliacao (
  school_id uuid primary key references public.schools(id) on delete cascade,
  periodo_tipo text not null default 'bimestre' check (periodo_tipo in ('bimestre', 'trimestre')),
  media_minima numeric(3,1) not null default 7.0 check (media_minima between 0 and 10),
  updated_at timestamptz not null default now()
);

create table if not exists public.trad_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  atribuicao_id uuid not null,
  periodo int not null check (periodo between 1 and 4),
  nome text not null check (length(btrim(nome)) > 0),
  tipo text not null default 'prova' check (tipo in ('prova', 'trabalho', 'recuperacao')),
  peso numeric(4,2) not null default 1 check (peso > 0 and peso <= 10),
  created_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (atribuicao_id, school_id) references public.trad_atribuicoes(id, school_id) on delete cascade
);
create index if not exists idx_trad_avaliacoes_atribuicao on public.trad_avaliacoes(school_id, atribuicao_id, periodo);
-- Uma única recuperação por disciplina/turma/período.
create unique index if not exists uq_trad_avaliacoes_recuperacao
  on public.trad_avaliacoes(atribuicao_id, periodo) where tipo = 'recuperacao';

create table if not exists public.trad_notas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  avaliacao_id uuid not null,
  student_id uuid not null references public.students(id) on delete cascade,
  nota numeric(4,2) not null check (nota between 0 and 10),
  lancado_por uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (avaliacao_id, student_id),
  foreign key (avaliacao_id, school_id) references public.trad_avaliacoes(id, school_id) on delete cascade
);
create index if not exists idx_trad_notas_student on public.trad_notas(school_id, student_id);

-- Nota só para aluno da mesma escola e da turma da atribuição.
create or replace function public.trad_valida_nota() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  if not exists (
    select 1
    from public.trad_avaliacoes av
    join public.trad_atribuicoes a on a.id = av.atribuicao_id and a.school_id = av.school_id
    join public.trad_turmas t on t.id = a.turma_id and t.school_id = a.school_id
    join public.students s on s.school_id = t.school_id and s.turma = t.nome
    where av.id = new.avaliacao_id and av.school_id = new.school_id and s.id = new.student_id
  ) then
    raise exception 'Aluno não pertence à turma desta avaliação';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_trad_valida_nota on public.trad_notas;
create trigger trg_trad_valida_nota
  before insert or update on public.trad_notas
  for each row execute function public.trad_valida_nota();

-- RLS
alter table public.trad_config_avaliacao enable row level security;
alter table public.trad_avaliacoes enable row level security;
alter table public.trad_notas enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['trad_config_avaliacao','trad_avaliacoes','trad_notas']
  loop
    execute format('drop policy if exists "Equipe gerencia %1$s da escola" on public.%1$s', t);
    execute format($p$create policy "Equipe gerencia %1$s da escola" on public.%1$s
      for all
      using (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica') and school_id = get_my_school_id())
      with check (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica') and school_id = get_my_school_id())$p$, t);
  end loop;
end $$;

-- Professor ativo: lê a configuração da escola.
drop policy if exists "Professores leem config de avaliacao" on public.trad_config_avaliacao;
create policy "Professores leem config de avaliacao" on public.trad_config_avaliacao
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
  );

-- Professor ativo: avaliações e notas só das próprias atribuições.
drop policy if exists "Professores gerenciam avaliacoes das proprias atribuicoes" on public.trad_avaliacoes;
create policy "Professores gerenciam avaliacoes das proprias atribuicoes" on public.trad_avaliacoes
  for all
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and atribuicao_id in (select a.id from public.trad_atribuicoes a
                          where a.school_id = get_my_school_id() and a.professor_id = auth.uid())
  )
  with check (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and atribuicao_id in (select a.id from public.trad_atribuicoes a
                          where a.school_id = get_my_school_id() and a.professor_id = auth.uid())
  );

drop policy if exists "Professores gerenciam notas das proprias avaliacoes" on public.trad_notas;
create policy "Professores gerenciam notas das proprias avaliacoes" on public.trad_notas
  for all
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and avaliacao_id in (select av.id from public.trad_avaliacoes av
                         join public.trad_atribuicoes a on a.id = av.atribuicao_id and a.school_id = av.school_id
                         where av.school_id = get_my_school_id() and a.professor_id = auth.uid())
  )
  with check (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and avaliacao_id in (select av.id from public.trad_avaliacoes av
                         join public.trad_atribuicoes a on a.id = av.atribuicao_id and a.school_id = av.school_id
                         where av.school_id = get_my_school_id() and a.professor_id = auth.uid())
  );
