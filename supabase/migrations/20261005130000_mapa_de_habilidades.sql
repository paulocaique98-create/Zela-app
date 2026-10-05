-- Mapa de Habilidades · 05/10/2026
--
-- Relatório semestral em que a professora marca, habilidade por habilidade,
-- se cada criança está "Sem interesse", "Adquirindo" ou "Adquirido". A
-- habilidade só aparece para as crianças na faixa de idade dela (em meses).
--
-- Tabelas novas (nenhuma tabela existente é alterada):
--   mapa_habilidades            catálogo de habilidades da escola
--   mapa_habilidades_registros  situação de cada criança, por semestre
--
-- Segurança (tudo com school_id e RLS):
--   Professora ativa  lê o catálogo da escola; lê, cria e edita RASCUNHOS das
--                     alunas e alunos das turmas dela. Nunca publica.
--   Coordenação e Direção (Recepção ou Gestão Pedagógica com esse departamento)
--                     leem tudo da escola, editam registros que já existem
--                     (nunca criam) e publicam. Mexem no catálogo.
--   Gestão            lê tudo e mantém o catálogo.
--   Família           só lê registros PUBLICADOS dos próprios filhos.
--   Ninguém apaga registro. Habilidade em uso não pode ser apagada (RESTRICT);
--   para tirar do ar, a tela desativa (ativa = false).

-- ═══ 1. Funções de acesso (nomes sem "Gestao pedagogica" de propósito) ═══

-- Coordenação ou Direção Pedagógica da escola informada.
create or replace function public.mapa_edita_escola(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.get_my_role(), '') in ('admin', 'gestao_pedagogica')
     and coalesce(public.get_my_departamento(), '') in ('coordenacao', 'diretoria_pedagogica')
     and coalesce(p_school_id = public.get_my_school_id(), false);
$function$;
revoke execute on function public.mapa_edita_escola(uuid) from public, anon;
grant execute on function public.mapa_edita_escola(uuid) to authenticated;

-- Quem enxerga o mapa inteiro da escola (Recepção, Gestão, Gestão Pedagógica).
create or replace function public.mapa_le_escola(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.get_my_role(), '') in ('admin', 'gestao', 'gestao_pedagogica')
     and coalesce(p_school_id = public.get_my_school_id(), false);
$function$;
revoke execute on function public.mapa_le_escola(uuid) from public, anon;
grant execute on function public.mapa_le_escola(uuid) to authenticated;

-- Quem mantém o catálogo: Coordenação, Direção e a Gestão.
create or replace function public.mapa_catalogo_escola(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.mapa_edita_escola(p_school_id)
      or (coalesce(public.get_my_role(), '') = 'gestao'
          and coalesce(p_school_id = public.get_my_school_id(), false));
$function$;
revoke execute on function public.mapa_catalogo_escola(uuid) from public, anon;
grant execute on function public.mapa_catalogo_escola(uuid) to authenticated;

-- Professora ativa que dá aula para a turma do aluno.
create or replace function public.mapa_professora_do_aluno(p_student_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.get_my_role(), '') = 'teacher'
     and coalesce(public.get_my_teacher_status(), '') = 'ativo'
     and coalesce(p_school_id = public.get_my_school_id(), false)
     and exists (
       select 1 from public.students s
       where s.id = p_student_id
         and s.school_id = p_school_id
         and s.turma = any (coalesce(public.get_my_turmas(), array[]::text[]))
     );
$function$;
revoke execute on function public.mapa_professora_do_aluno(uuid, uuid) from public, anon;
grant execute on function public.mapa_professora_do_aluno(uuid, uuid) to authenticated;

-- Responsável (principal ou vinculado) do aluno.
create or replace function public.mapa_responsavel_do_aluno(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.get_my_role(), '') = 'family'
     and (
       exists (select 1 from public.student_guardians g where g.student_id = p_student_id and g.guardian_id = auth.uid())
       or exists (select 1 from public.students s where s.id = p_student_id and s.family_id = auth.uid())
     );
$function$;
revoke execute on function public.mapa_responsavel_do_aluno(uuid) from public, anon;
grant execute on function public.mapa_responsavel_do_aluno(uuid) to authenticated;

-- ═══ 2. Catálogo de habilidades ═════════════════════════════════════════

create table public.mapa_habilidades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  area text not null,
  descricao text not null,
  idade_min_meses integer not null,
  idade_max_meses integer not null,
  ordem integer not null default 0,
  ativa boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mapa_habilidades_area_check check (char_length(btrim(area)) between 1 and 80),
  constraint mapa_habilidades_descricao_check check (char_length(btrim(descricao)) between 1 and 400),
  constraint mapa_habilidades_idade_check check (
    idade_min_meses >= 0 and idade_max_meses <= 240 and idade_min_meses <= idade_max_meses
  )
);

create index idx_mapa_habilidades_escola on public.mapa_habilidades (school_id, ativa, area, ordem);

create trigger set_mapa_habilidades_updated_at
  before update on public.mapa_habilidades
  for each row execute function public.update_updated_at_column();

alter table public.mapa_habilidades enable row level security;
revoke all on table public.mapa_habilidades from anon;
grant select, insert, update, delete on table public.mapa_habilidades to authenticated;
grant all on table public.mapa_habilidades to service_role;

create policy "Mapa habilidades catalogo lido pela equipe" on public.mapa_habilidades
  for select using (
    mapa_le_escola(school_id)
    or (get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo' and school_id = get_my_school_id())
  );
create policy "Mapa habilidades catalogo cria" on public.mapa_habilidades
  for insert with check (mapa_catalogo_escola(school_id) and created_by = auth.uid());
create policy "Mapa habilidades catalogo edita" on public.mapa_habilidades
  for update using (mapa_catalogo_escola(school_id)) with check (mapa_catalogo_escola(school_id));
create policy "Mapa habilidades catalogo exclui" on public.mapa_habilidades
  for delete using (mapa_catalogo_escola(school_id));

-- ═══ 3. Registros por criança e semestre ════════════════════════════════

create table public.mapa_habilidades_registros (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  habilidade_id uuid not null references public.mapa_habilidades(id) on delete restrict,
  ano integer not null,
  semestre smallint not null,
  situacao text not null,
  status text not null default 'RASCUNHO',
  author_id uuid not null,
  updated_by uuid,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mapa_registros_unico unique (student_id, habilidade_id, ano, semestre),
  constraint mapa_registros_semestre_check check (semestre in (1, 2)),
  constraint mapa_registros_ano_check check (ano between 2020 and 2100),
  constraint mapa_registros_situacao_check check (situacao in ('sem_interesse', 'adquirindo', 'adquirido')),
  constraint mapa_registros_status_check check (status in ('RASCUNHO', 'PUBLICADO'))
);

create index idx_mapa_registros_periodo on public.mapa_habilidades_registros (school_id, ano, semestre, status);
create index idx_mapa_registros_aluno on public.mapa_habilidades_registros (student_id, habilidade_id);
create index idx_mapa_registros_habilidade on public.mapa_habilidades_registros (habilidade_id);

alter table public.mapa_habilidades_registros enable row level security;
revoke all on table public.mapa_habilidades_registros from anon;
grant select, insert, update on table public.mapa_habilidades_registros to authenticated;
grant all on table public.mapa_habilidades_registros to service_role;

create policy "Mapa registros lidos pela equipe" on public.mapa_habilidades_registros
  for select using (mapa_le_escola(school_id));
create policy "Mapa registros lidos pela professora" on public.mapa_habilidades_registros
  for select using (mapa_professora_do_aluno(student_id, school_id));
create policy "Mapa registros publicados lidos pela familia" on public.mapa_habilidades_registros
  for select using (status = 'PUBLICADO' and mapa_responsavel_do_aluno(student_id));

create policy "Mapa registros criados pela professora" on public.mapa_habilidades_registros
  for insert with check (
    mapa_professora_do_aluno(student_id, school_id)
    and author_id = auth.uid()
    and status = 'RASCUNHO'
  );
-- Qualquer professora ativa da turma edita o RASCUNHO (se a professora sai da
-- escola, quem assume a turma continua de onde parou). Nunca publica.
create policy "Mapa registros editados pela professora" on public.mapa_habilidades_registros
  for update using (mapa_professora_do_aluno(student_id, school_id) and status = 'RASCUNHO')
  with check (mapa_professora_do_aluno(student_id, school_id) and status = 'RASCUNHO');
-- Coordenação e Direção só atualizam o que já existe: não há regra de INSERT.
create policy "Mapa registros editados pela coordenacao" on public.mapa_habilidades_registros
  for update using (mapa_edita_escola(school_id)) with check (mapa_edita_escola(school_id));

-- Catálogo para a família (criada aqui porque depende da tabela de registros).
-- A família só vê as habilidades que aparecem em registros já publicados dos filhos
-- (a regra de leitura dos registros é aplicada dentro da subconsulta).
create policy "Mapa habilidades catalogo lido pela familia" on public.mapa_habilidades
  for select using (
    get_my_role() = 'family'
    and id in (select r.habilidade_id from public.mapa_habilidades_registros r)
  );

-- ═══ 4. Integridade dos registros (gatilho) ═════════════════════════════

create or replace function public.mapa_registros_integridade()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Aluno e habilidade precisam ser da mesma escola do registro.
  if not exists (select 1 from public.students s where s.id = new.student_id and s.school_id = new.school_id) then
    raise exception 'Aluno de outra escola.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.mapa_habilidades h where h.id = new.habilidade_id and h.school_id = new.school_id) then
    raise exception 'Habilidade de outra escola.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- Habilidade já adquirida em semestre anterior nunca volta para a fila.
    if exists (
      select 1 from public.mapa_habilidades_registros r
      where r.student_id = new.student_id
        and r.habilidade_id = new.habilidade_id
        and r.situacao = 'adquirido'
        and (r.ano, r.semestre) < (new.ano, new.semestre)
    ) then
      raise exception 'Habilidade já adquirida em um semestre anterior.' using errcode = '23514';
    end if;
    new.updated_by := auth.uid();
    if new.status = 'PUBLICADO' then
      new.published_at := now();
      new.published_by := auth.uid();
    end if;
    return new;
  end if;

  -- UPDATE: a identidade do registro não muda nunca.
  if new.school_id is distinct from old.school_id
     or new.student_id is distinct from old.student_id
     or new.habilidade_id is distinct from old.habilidade_id
     or new.ano is distinct from old.ano
     or new.semestre is distinct from old.semestre
     or new.author_id is distinct from old.author_id then
    raise exception 'Identidade do registro não pode ser alterada.' using errcode = '42501';
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.status is distinct from old.status then
    if new.status = 'PUBLICADO' then
      new.published_at := now();
      new.published_by := auth.uid();
    else
      new.published_at := null;
      new.published_by := null;
    end if;
  end if;

  -- Correção depois de publicado fica no histórico (publicar em lote é
  -- registrado pela tela, uma linha por lote).
  if old.status = 'PUBLICADO' and new.situacao is distinct from old.situacao then
    insert into public.audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
    values (
      new.school_id, auth.uid(), 'mapa_habilidades_corrigir', 'mapa_habilidades_registro', new.id,
      jsonb_build_object(
        'student_id', new.student_id, 'habilidade_id', new.habilidade_id,
        'ano', new.ano, 'semestre', new.semestre,
        'de', old.situacao, 'para', new.situacao
      )
    );
  end if;
  return new;
end;
$function$;
revoke execute on function public.mapa_registros_integridade() from public, anon, authenticated;

create trigger trg_mapa_registros_integridade
  before insert or update on public.mapa_habilidades_registros
  for each row execute function public.mapa_registros_integridade();
