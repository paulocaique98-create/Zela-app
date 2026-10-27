-- Método Tradicional, Fase 3: diário de classe (PLANO_METODO_TRADICIONAL.md).
-- Só tabelas novas com prefixo trad_; nenhuma tabela do Montessori é alterada.
-- Depende das Fases 1 e 2 (trad_atribuicoes, trad_turmas).
-- Isolamento: school_id em toda tabela e chaves estrangeiras compostas
-- (id, school_id). A frequência só é aceita para aluno da mesma escola e da
-- turma da atribuição (students.turma = trad_turmas.nome).
-- RLS: admin, gestao e gestao_pedagogica da escola gerenciam; professor ativo
-- lê e registra apenas nas próprias atribuições. Família não acessa nesta fase
-- (o boletim, Fase 4, abrirá a leitura do próprio filho).
-- Frequência por disciplina: cada aula dada (atribuição + data) guarda a
-- quantidade de aulas do dia e a presença de cada aluno.

create table if not exists public.trad_aulas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  atribuicao_id uuid not null,
  data date not null,
  conteudo text not null default '' check (length(conteudo) <= 2000),
  qtd_aulas int not null default 1 check (qtd_aulas between 1 and 6),
  registrado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, school_id),
  unique (atribuicao_id, data),
  foreign key (atribuicao_id, school_id) references public.trad_atribuicoes(id, school_id) on delete cascade
);
create index if not exists idx_trad_aulas_atribuicao on public.trad_aulas(school_id, atribuicao_id, data);

create table if not exists public.trad_frequencia (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  aula_id uuid not null,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null check (status in ('presente', 'falta', 'justificada')),
  updated_at timestamptz not null default now(),
  unique (aula_id, student_id),
  foreign key (aula_id, school_id) references public.trad_aulas(id, school_id) on delete cascade
);
create index if not exists idx_trad_frequencia_student on public.trad_frequencia(school_id, student_id);

-- Frequência só para aluno da mesma escola e da turma da atribuição.
create or replace function public.trad_valida_frequencia() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  if not exists (
    select 1
    from public.trad_aulas au
    join public.trad_atribuicoes a on a.id = au.atribuicao_id and a.school_id = au.school_id
    join public.trad_turmas t on t.id = a.turma_id and t.school_id = a.school_id
    join public.students s on s.school_id = t.school_id and s.turma = t.nome
    where au.id = new.aula_id and au.school_id = new.school_id and s.id = new.student_id
  ) then
    raise exception 'Aluno não pertence à turma desta aula';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_trad_valida_frequencia on public.trad_frequencia;
create trigger trg_trad_valida_frequencia
  before insert or update on public.trad_frequencia
  for each row execute function public.trad_valida_frequencia();

-- RLS
alter table public.trad_aulas enable row level security;
alter table public.trad_frequencia enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['trad_aulas','trad_frequencia']
  loop
    execute format('drop policy if exists "Equipe gerencia %1$s da escola" on public.%1$s', t);
    execute format($p$create policy "Equipe gerencia %1$s da escola" on public.%1$s
      for all
      using (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica') and school_id = get_my_school_id())
      with check (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica') and school_id = get_my_school_id())$p$, t);
  end loop;
end $$;

-- Professor ativo: aulas e frequência só das próprias atribuições.
drop policy if exists "Professores gerenciam aulas das proprias atribuicoes" on public.trad_aulas;
create policy "Professores gerenciam aulas das proprias atribuicoes" on public.trad_aulas
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

drop policy if exists "Professores gerenciam frequencia das proprias aulas" on public.trad_frequencia;
create policy "Professores gerenciam frequencia das proprias aulas" on public.trad_frequencia
  for all
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and aula_id in (select au.id from public.trad_aulas au
                    join public.trad_atribuicoes a on a.id = au.atribuicao_id and a.school_id = au.school_id
                    where au.school_id = get_my_school_id() and a.professor_id = auth.uid())
  )
  with check (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and aula_id in (select au.id from public.trad_aulas au
                    join public.trad_atribuicoes a on a.id = au.atribuicao_id and a.school_id = au.school_id
                    where au.school_id = get_my_school_id() and a.professor_id = auth.uid())
  );
