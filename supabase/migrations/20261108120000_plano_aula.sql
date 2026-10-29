-- Plano de aula (PLANO_EXPANSAO_GESTAO.md, item 2). Só tabelas, funções, policies
-- e bucket novos: nada existente é alterado ou apagado.
--  * Professor ativo: lê e escreve só os próprios planos, dentro da escola e das
--    turmas dele (Montessori: users.turmas; Tradicional: trad_atribuicoes).
--    Edita só em rascunho/devolvido e só pode enviar (rascunho -> enviado).
--  * gestao e gestao_pedagogica: leem todos da escola e só decidem a revisão
--    (enviado -> aprovado/devolvido, aprovado -> devolvido). O trigger impede
--    qualquer alteração no conteúdo da professora e carimba revisado_por/em.
--  * Recepção (admin), família e developer: sem acesso.
--  * Anexos: bucket privado lesson-plans/<school_id>/<plan_id>/<arquivo>.

create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.users(id) on delete restrict,
  turma text not null check (length(btrim(turma)) > 0),
  atribuicao_id uuid,
  periodo_inicio date not null,
  periodo_fim date not null,
  objetivos text not null default '' check (length(objetivos) <= 4000),
  conteudo text not null default '' check (length(conteudo) <= 4000),
  metodologia text not null default '' check (length(metodologia) <= 4000),
  recursos text not null default '' check (length(recursos) <= 4000),
  avaliacao text not null default '' check (length(avaliacao) <= 4000),
  habilidades text not null default '' check (length(habilidades) <= 2000),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aprovado', 'devolvido')),
  comentario_coordenacao text check (comentario_coordenacao is null or length(comentario_coordenacao) <= 2000),
  revisado_por uuid references public.users(id) on delete set null,
  revisado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (periodo_fim >= periodo_inicio),
  unique (id, school_id),
  foreign key (atribuicao_id, school_id) references public.trad_atribuicoes(id, school_id) on delete restrict
);
create index if not exists idx_lesson_plans_periodo on public.lesson_plans(school_id, periodo_inicio);
create index if not exists idx_lesson_plans_professor on public.lesson_plans(school_id, teacher_id);
create index if not exists idx_lesson_plans_status on public.lesson_plans(school_id, status);

-- Regras de transição e colunas protegidas. Sem sessão (service role,
-- migrations) não interfere.
create or replace function public.lesson_plans_guard() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
declare
  v_role text := get_my_role();
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('rascunho', 'enviado') then
      raise exception 'Plano novo só pode nascer como rascunho ou enviado';
    end if;
    new.comentario_coordenacao := null;
    new.revisado_por := null;
    new.revisado_em := null;
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE: identidade e vínculo nunca mudam
  if new.id <> old.id or new.school_id <> old.school_id or new.teacher_id <> old.teacher_id
     or new.created_at <> old.created_at then
    raise exception 'Identidade do plano não pode ser alterada';
  end if;

  if v_role = 'teacher' then
    if old.status not in ('rascunho', 'devolvido') then
      raise exception 'Plano % só pode ser editado em rascunho ou devolvido', old.status;
    end if;
    if new.status not in ('rascunho', 'enviado') then
      raise exception 'A professora só pode manter como rascunho ou enviar';
    end if;
    -- revisão é da coordenação: a professora não escreve nesses campos
    new.comentario_coordenacao := old.comentario_coordenacao;
    new.revisado_por := old.revisado_por;
    new.revisado_em := old.revisado_em;
  elsif v_role in ('gestao', 'gestao_pedagogica') then
    if new.turma is distinct from old.turma or new.atribuicao_id is distinct from old.atribuicao_id
       or new.periodo_inicio <> old.periodo_inicio or new.periodo_fim <> old.periodo_fim
       or new.objetivos <> old.objetivos or new.conteudo <> old.conteudo
       or new.metodologia <> old.metodologia or new.recursos <> old.recursos
       or new.avaliacao <> old.avaliacao or new.habilidades <> old.habilidades then
      raise exception 'A coordenação não altera o conteúdo do plano';
    end if;
    if not ((old.status = 'enviado' and new.status in ('aprovado', 'devolvido'))
            or (old.status = 'aprovado' and new.status = 'devolvido')) then
      raise exception 'Transição de revisão inválida: % para %', old.status, new.status;
    end if;
    if new.status = 'devolvido' and length(btrim(coalesce(new.comentario_coordenacao, ''))) = 0 then
      raise exception 'Informe o comentário ao devolver o plano';
    end if;
    new.revisado_por := auth.uid();
    new.revisado_em := now();
  else
    raise exception 'Sem permissão para alterar planos de aula';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_lesson_plans_guard on public.lesson_plans;
create trigger trg_lesson_plans_guard
  before insert or update on public.lesson_plans
  for each row execute function public.lesson_plans_guard();

alter table public.lesson_plans enable row level security;

drop policy if exists "Professores leem os proprios planos de aula" on public.lesson_plans;
create policy "Professores leem os proprios planos de aula" on public.lesson_plans
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and teacher_id = auth.uid()
  );

drop policy if exists "Professores criam planos de aula das suas turmas" on public.lesson_plans;
create policy "Professores criam planos de aula das suas turmas" on public.lesson_plans
  for insert
  with check (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and teacher_id = auth.uid()
    and status in ('rascunho', 'enviado')
    and (
      (atribuicao_id is null and turma = any (get_my_turmas()))
      or (atribuicao_id is not null and atribuicao_id in (
        select a.id from public.trad_atribuicoes a
        where a.school_id = get_my_school_id() and a.professor_id = auth.uid()))
    )
  );

drop policy if exists "Professores editam planos de aula em rascunho ou devolvidos" on public.lesson_plans;
create policy "Professores editam planos de aula em rascunho ou devolvidos" on public.lesson_plans
  for update
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and teacher_id = auth.uid()
    and status in ('rascunho', 'devolvido')
  )
  with check (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and teacher_id = auth.uid()
    and status in ('rascunho', 'enviado')
    and (
      (atribuicao_id is null and turma = any (get_my_turmas()))
      or (atribuicao_id is not null and atribuicao_id in (
        select a.id from public.trad_atribuicoes a
        where a.school_id = get_my_school_id() and a.professor_id = auth.uid()))
    )
  );

drop policy if exists "Professores apagam os proprios rascunhos de plano de aula" on public.lesson_plans;
create policy "Professores apagam os proprios rascunhos de plano de aula" on public.lesson_plans
  for delete
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and teacher_id = auth.uid()
    and status = 'rascunho'
  );

drop policy if exists "Coordenacao le planos de aula da escola" on public.lesson_plans;
create policy "Coordenacao le planos de aula da escola" on public.lesson_plans
  for select
  using (
    get_my_role() in ('gestao', 'gestao_pedagogica')
    and school_id = get_my_school_id()
  );

drop policy if exists "Coordenacao revisa planos de aula da escola" on public.lesson_plans;
create policy "Coordenacao revisa planos de aula da escola" on public.lesson_plans
  for update
  using (
    get_my_role() in ('gestao', 'gestao_pedagogica')
    and school_id = get_my_school_id()
    and status in ('enviado', 'aprovado')
  )
  with check (
    get_my_role() in ('gestao', 'gestao_pedagogica')
    and school_id = get_my_school_id()
    and status in ('aprovado', 'devolvido')
  );

-- Anexos (bucket privado, caminho <school_id>/<plan_id>/<arquivo>)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-plans', 'lesson-plans', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Professores enviam anexos dos proprios planos" on storage.objects;
create policy "Professores enviam anexos dos proprios planos" on storage.objects
  for insert
  with check (
    bucket_id = 'lesson-plans'
    and get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.lesson_plans p
      where p.id::text = (storage.foldername(name))[2]
        and p.school_id = get_my_school_id()
        and p.teacher_id = auth.uid()
        and p.status in ('rascunho', 'devolvido')
    )
  );

drop policy if exists "Professores leem anexos dos proprios planos" on storage.objects;
create policy "Professores leem anexos dos proprios planos" on storage.objects
  for select
  using (
    bucket_id = 'lesson-plans'
    and get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.lesson_plans p
      where p.id::text = (storage.foldername(name))[2]
        and p.school_id = get_my_school_id()
        and p.teacher_id = auth.uid()
    )
  );

drop policy if exists "Professores apagam anexos dos planos editaveis" on storage.objects;
create policy "Professores apagam anexos dos planos editaveis" on storage.objects
  for delete
  using (
    bucket_id = 'lesson-plans'
    and get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.lesson_plans p
      where p.id::text = (storage.foldername(name))[2]
        and p.school_id = get_my_school_id()
        and p.teacher_id = auth.uid()
        and p.status in ('rascunho', 'devolvido')
    )
  );

drop policy if exists "Coordenacao le anexos dos planos da escola" on storage.objects;
create policy "Coordenacao le anexos dos planos da escola" on storage.objects
  for select
  using (
    bucket_id = 'lesson-plans'
    and get_my_role() in ('gestao', 'gestao_pedagogica')
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.lesson_plans p
      where p.id::text = (storage.foldername(name))[2]
        and p.school_id = get_my_school_id()
    )
  );
