-- Método Tradicional, Fase 5B: tarefas (PLANO_METODO_TRADICIONAL.md).
-- Aditiva: uma tabela nova com prefixo trad_; nada do Montessori é alterado.
-- Depende da Fase 1 (trad_atribuicoes, trad_turmas).
-- Isolamento: school_id e chave estrangeira composta (atribuicao_id, school_id).
-- RLS: admin, gestao e gestao_pedagogica da escola gerenciam; professor ativo
-- gerencia só as tarefas das próprias atribuições; a família LÊ apenas as
-- tarefas da turma do próprio filho (students.family_id = auth.uid()).
-- Sem anexos e sem resposta do aluno nesta fase: só título, descrição e entrega.

create table if not exists public.trad_tarefas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  atribuicao_id uuid not null,
  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  descricao text not null default '' check (length(descricao) <= 2000),
  data_entrega date not null,
  criado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (atribuicao_id, school_id) references public.trad_atribuicoes(id, school_id) on delete cascade
);
create index if not exists idx_trad_tarefas_atribuicao on public.trad_tarefas(school_id, atribuicao_id, data_entrega);

-- A família não lê trad_atribuicoes nem trad_disciplinas (RLS delas fica como
-- está); por isso o nome da disciplina e da turma é copiado para a tarefa por
-- trigger, a partir da atribuição, nunca vindo do cliente.
alter table public.trad_tarefas
  add column if not exists disciplina_nome text not null default '',
  add column if not exists turma_nome text not null default '';

create or replace function public.trad_tarefas_preenche_nomes() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  select d.nome, t.nome into new.disciplina_nome, new.turma_nome
  from public.trad_atribuicoes a
  join public.trad_disciplinas d on d.id = a.disciplina_id and d.school_id = a.school_id
  join public.trad_turmas t on t.id = a.turma_id and t.school_id = a.school_id
  where a.id = new.atribuicao_id and a.school_id = new.school_id;
  if new.turma_nome is null then
    raise exception 'Atribuição inválida para esta escola';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trad_tarefas_nomes on public.trad_tarefas;
create trigger trg_trad_tarefas_nomes
  before insert or update of atribuicao_id on public.trad_tarefas
  for each row execute function public.trad_tarefas_preenche_nomes();

alter table public.trad_tarefas enable row level security;

drop policy if exists "Equipe gerencia trad_tarefas da escola" on public.trad_tarefas;
create policy "Equipe gerencia trad_tarefas da escola" on public.trad_tarefas
  for all
  using (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica') and school_id = get_my_school_id())
  with check (get_my_role() in ('admin', 'gestao', 'gestao_pedagogica') and school_id = get_my_school_id());

drop policy if exists "Professores gerenciam tarefas das proprias atribuicoes" on public.trad_tarefas;
create policy "Professores gerenciam tarefas das proprias atribuicoes" on public.trad_tarefas
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

drop policy if exists "Familia le tarefas da turma do proprio filho" on public.trad_tarefas;
create policy "Familia le tarefas da turma do proprio filho" on public.trad_tarefas
  for select
  using (
    get_my_role() = 'family'
    and school_id = get_my_school_id()
    and atribuicao_id in (
      select a.id
      from public.trad_atribuicoes a
      join public.trad_turmas t on t.id = a.turma_id and t.school_id = a.school_id
      join public.students s on s.school_id = t.school_id and s.turma = t.nome
      where a.school_id = get_my_school_id() and s.family_id = auth.uid()
    )
  );
