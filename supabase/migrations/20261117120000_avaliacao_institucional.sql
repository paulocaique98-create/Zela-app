-- Avaliação institucional (PLANO_EXPANSAO_GESTAO.md, item 8). Só tabelas, funções e
-- policies novas: nada existente é alterado ou apagado.
--  * Módulo `avaliacao_institucional` (schools.features_enabled), lido como = 'true'.
--  * gestao e gestao_pedagogica: leem pesquisas e perguntas da escola. Escrevem só
--    pelas funções pesquisa_salvar, pesquisa_publicar, pesquisa_encerrar e
--    pesquisa_excluir (pesquisa publicada não se edita: as respostas perderiam o sentido).
--  * Família e professora: sem acesso às tabelas. Veem as pesquisas abertas para o
--    seu público (pesquisas_abertas), leem as perguntas (pesquisa_para_responder) e
--    gravam por pesquisa_responder, que confere público, prazo e resposta única.
--  * Privacidade: survey_participation (quem respondeu, só a data) e survey_responses
--    e survey_answers (o que respondeu) são gravadas na mesma transação e SEM nenhum
--    horário, então nada liga uma à outra. Em pesquisa anônima survey_responses.user_id
--    fica nulo. As três tabelas não têm policy: o cliente nunca as lê direto.
--  * Resultados só por pesquisa_resultados e pesquisa_textos (Gestão): segmento
--    (turma) só aparece com 5 ou mais respostas; em pesquisa anônima, abaixo de 5
--    respostas nada do conteúdo é mostrado; texto livre anônimo nunca mostra autor
--    e vem em ordem embaralhada.
--  * Recepção (admin) e developer: sem acesso.

-- ═══ 1. Tabelas ═══
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 3 and 150),
  descricao text not null default '' check (length(descricao) <= 1000),
  publico text not null check (publico in ('familias', 'equipe', 'turmas')),
  turmas text[] not null default '{}',
  anonima boolean not null default false,
  abre_em timestamptz not null default now(),
  fecha_em timestamptz not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'encerrada')),
  notificada_em timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_em > abre_em),
  check (publico = 'turmas' or cardinality(turmas) = 0),
  check (publico <> 'turmas' or cardinality(turmas) > 0)
);
create index if not exists idx_surveys_escola on public.surveys(school_id, fecha_em desc);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  ordem int not null check (ordem between 1 and 50),
  tipo text not null check (tipo in ('nps', 'escala5', 'multipla', 'texto')),
  enunciado text not null check (length(btrim(enunciado)) between 3 and 300),
  opcoes text[] not null default '{}',
  obrigatoria boolean not null default true,
  created_at timestamptz not null default now(),
  unique (survey_id, ordem),
  check (tipo = 'multipla' or cardinality(opcoes) = 0),
  check (tipo <> 'multipla' or cardinality(opcoes) between 2 and 10)
);
create index if not exists idx_survey_questions_pesquisa on public.survey_questions(school_id, survey_id, ordem);

-- Quem respondeu. Só a data (sem horário) para não casar com nenhuma resposta.
create table if not exists public.survey_participation (
  survey_id uuid not null references public.surveys(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  respondeu_em date not null default current_date,
  primary key (survey_id, user_id)
);
create index if not exists idx_survey_participation_escola on public.survey_participation(school_id, survey_id);

-- O que foi respondido. Sem created_at de propósito (ver cabeçalho).
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  segmento text
);
create index if not exists idx_survey_responses_pesquisa on public.survey_responses(school_id, survey_id);

create table if not exists public.survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  survey_id uuid not null references public.surveys(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  valor_num int,
  valor_texto text check (valor_texto is null or length(valor_texto) <= 2000),
  check (valor_num is not null or valor_texto is not null)
);
create index if not exists idx_survey_answers_pergunta on public.survey_answers(school_id, question_id);
create index if not exists idx_survey_answers_resposta on public.survey_answers(response_id);

-- ═══ 2. Funções de apoio ═══
create or replace function public.pesquisas_modulo_ligado()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'avaliacao_institucional') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false);
$$;

create or replace function public.pesquisas_gestao()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.pesquisas_modulo_ligado()
     and coalesce(public.get_my_role(), '') in ('gestao', 'gestao_pedagogica');
$$;

-- Quem está logado faz parte do público da pesquisa (não olha o prazo).
create or replace function public.pesquisa_publico_ok(p_survey_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.surveys sv
     where sv.id = p_survey_id
       and sv.school_id = public.get_my_school_id()
       and (
         (sv.publico = 'familias' and public.get_my_role() = 'family')
         or (sv.publico = 'turmas' and public.get_my_role() = 'family' and exists (
               select 1 from public.students s
                where s.school_id = sv.school_id
                  and s.turma = any (sv.turmas)
                  and (s.family_id = auth.uid()
                       or exists (select 1 from public.student_guardians g
                                   where g.student_id = s.id and g.guardian_id = auth.uid()))))
         or (sv.publico = 'equipe' and public.get_my_role() = 'teacher'
             and public.get_my_teacher_status() = 'ativo')
       )
  );
$$;

-- Quantas pessoas poderiam responder (taxa de resposta). Uso interno.
create or replace function public.pesquisa_elegiveis(p_survey_id uuid)
returns integer
language sql stable security definer
set search_path to 'public'
as $$
  select case sv.publico
    when 'equipe' then (
      select count(*)::int from public.users u
       where u.school_id = sv.school_id and u.role = 'teacher'
         and u.teacher_status = 'ativo' and u.status = 'active')
    when 'familias' then (
      select count(*)::int from public.users u
       where u.school_id = sv.school_id and u.role = 'family' and u.status = 'active')
    else (
      select count(distinct x.uid)::int from (
        select s.family_id as uid from public.students s
         where s.school_id = sv.school_id and s.turma = any (sv.turmas) and s.family_id is not null
        union
        select g.guardian_id from public.student_guardians g
          join public.students s on s.id = g.student_id
         where s.school_id = sv.school_id and s.turma = any (sv.turmas)
      ) x)
  end
  from public.surveys sv where sv.id = p_survey_id;
$$;

revoke execute on function public.pesquisas_modulo_ligado() from public, anon;
revoke execute on function public.pesquisas_gestao() from public, anon;
revoke execute on function public.pesquisa_publico_ok(uuid) from public, anon;
revoke execute on function public.pesquisa_elegiveis(uuid) from public, anon, authenticated;
grant execute on function public.pesquisas_modulo_ligado() to authenticated;
grant execute on function public.pesquisas_gestao() to authenticated;
grant execute on function public.pesquisa_publico_ok(uuid) to authenticated;

-- ═══ 3. RLS: Gestão lê; ninguém escreve direto ═══
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_participation enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;

drop policy if exists "Gestao le pesquisas da escola" on public.surveys;
create policy "Gestao le pesquisas da escola" on public.surveys
  for select using (school_id = public.get_my_school_id() and public.pesquisas_gestao());

drop policy if exists "Gestao le perguntas das pesquisas da escola" on public.survey_questions;
create policy "Gestao le perguntas das pesquisas da escola" on public.survey_questions
  for select using (school_id = public.get_my_school_id() and public.pesquisas_gestao());

-- survey_participation, survey_responses e survey_answers: RLS ligada e sem policy
-- (fechadas para o cliente). Só as funções security definer abaixo mexem nelas.

-- ═══ 4. Gestão: salvar, publicar, encerrar, excluir ═══
create or replace function public.pesquisa_salvar(p_id uuid, p_dados jsonb, p_perguntas jsonb)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_id uuid := p_id;
  v_titulo text := btrim(coalesce(p_dados ->> 'titulo', ''));
  v_publico text := p_dados ->> 'publico';
  v_turmas text[];
  v_abre timestamptz := coalesce((p_dados ->> 'abre_em')::timestamptz, now());
  v_fecha timestamptz := (p_dados ->> 'fecha_em')::timestamptz;
begin
  if auth.uid() is null or not public.pesquisas_gestao() then
    raise exception 'Sem permissão';
  end if;
  if length(v_titulo) < 3 then raise exception 'Informe o título da pesquisa'; end if;
  if v_publico is null or v_publico not in ('familias', 'equipe', 'turmas') then
    raise exception 'Escolha o público da pesquisa';
  end if;
  if v_fecha is null or v_fecha <= v_abre then
    raise exception 'A data de encerramento deve ser depois da abertura';
  end if;
  if p_perguntas is null or jsonb_typeof(p_perguntas) <> 'array' or jsonb_array_length(p_perguntas) > 50 then
    raise exception 'Perguntas inválidas';
  end if;

  if v_publico = 'turmas' then
    v_turmas := array(select btrim(t.v) from jsonb_array_elements_text(coalesce(p_dados -> 'turmas', '[]'::jsonb)) as t(v)
                       where btrim(t.v) <> '');
    if cardinality(v_turmas) = 0 then raise exception 'Escolha ao menos uma turma'; end if;
  else
    v_turmas := '{}';
  end if;

  if v_id is null then
    insert into public.surveys (school_id, titulo, descricao, publico, turmas, anonima, abre_em, fecha_em, created_by)
    values (v_school, v_titulo, btrim(coalesce(p_dados ->> 'descricao', '')), v_publico, v_turmas,
            coalesce((p_dados ->> 'anonima')::boolean, false), v_abre, v_fecha, auth.uid())
    returning id into v_id;
  else
    update public.surveys
       set titulo = v_titulo, descricao = btrim(coalesce(p_dados ->> 'descricao', '')),
           publico = v_publico, turmas = v_turmas,
           anonima = coalesce((p_dados ->> 'anonima')::boolean, false),
           abre_em = v_abre, fecha_em = v_fecha, updated_at = now()
     where id = v_id and school_id = v_school and status = 'rascunho';
    if not found then
      raise exception 'Só é possível editar uma pesquisa em rascunho';
    end if;
    delete from public.survey_questions where survey_id = v_id and school_id = v_school;
  end if;

  insert into public.survey_questions (survey_id, school_id, ordem, tipo, enunciado, opcoes, obrigatoria)
  select v_id, v_school, t.ord::int, e ->> 'tipo', btrim(coalesce(e ->> 'enunciado', '')),
         array(select btrim(o.v) from jsonb_array_elements_text(coalesce(e -> 'opcoes', '[]'::jsonb)) as o(v)
                where btrim(o.v) <> ''),
         coalesce((e ->> 'obrigatoria')::boolean, true)
    from jsonb_array_elements(p_perguntas) with ordinality as t(e, ord);

  return v_id;
end $$;

create or replace function public.pesquisa_publicar(p_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  sv public.surveys%rowtype;
begin
  if auth.uid() is null or not public.pesquisas_gestao() then
    raise exception 'Sem permissão';
  end if;
  select * into sv from public.surveys
   where id = p_id and school_id = public.get_my_school_id() for update;
  if not found then raise exception 'Pesquisa não encontrada'; end if;
  if sv.status <> 'rascunho' then raise exception 'Esta pesquisa já foi publicada'; end if;
  if sv.fecha_em <= now() then raise exception 'A data de encerramento já passou'; end if;
  if not exists (select 1 from public.survey_questions where survey_id = sv.id) then
    raise exception 'Adicione ao menos uma pergunta';
  end if;
  update public.surveys set status = 'publicada', updated_at = now() where id = sv.id;
end $$;

create or replace function public.pesquisa_encerrar(p_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.pesquisas_gestao() then
    raise exception 'Sem permissão';
  end if;
  update public.surveys
     set status = 'encerrada', fecha_em = least(fecha_em, now()), updated_at = now()
   where id = p_id and school_id = public.get_my_school_id() and status = 'publicada';
  if not found then raise exception 'Pesquisa não encontrada ou não está publicada'; end if;
end $$;

create or replace function public.pesquisa_excluir(p_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.pesquisas_gestao() then
    raise exception 'Sem permissão';
  end if;
  delete from public.surveys
   where id = p_id and school_id = public.get_my_school_id() and status = 'rascunho';
  if not found then raise exception 'Só é possível excluir uma pesquisa em rascunho'; end if;
end $$;

-- ═══ 5. Família e professora: ver as abertas e responder ═══
create or replace function public.pesquisas_abertas()
returns table (id uuid, titulo text, descricao text, fecha_em timestamptz, anonima boolean, respondida boolean)
language sql stable security definer
set search_path to 'public'
as $$
  select sv.id, sv.titulo, sv.descricao, sv.fecha_em, sv.anonima,
         exists (select 1 from public.survey_participation p
                  where p.survey_id = sv.id and p.user_id = auth.uid())
    from public.surveys sv
   where sv.school_id = public.get_my_school_id()
     and public.pesquisas_modulo_ligado()
     and sv.status = 'publicada'
     and now() >= sv.abre_em and now() < sv.fecha_em
     and public.pesquisa_publico_ok(sv.id)
   order by sv.fecha_em
   limit 50;
$$;

create or replace function public.pesquisa_para_responder(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  sv public.surveys%rowtype;
begin
  if auth.uid() is null or not public.pesquisas_modulo_ligado() then
    raise exception 'Sem permissão';
  end if;
  select * into sv from public.surveys
   where id = p_id and school_id = public.get_my_school_id() and status = 'publicada'
     and now() >= abre_em and now() < fecha_em;
  if not found or not public.pesquisa_publico_ok(p_id) then
    raise exception 'Pesquisa não encontrada ou encerrada';
  end if;
  if exists (select 1 from public.survey_participation p where p.survey_id = p_id and p.user_id = auth.uid()) then
    raise exception 'Você já respondeu esta pesquisa';
  end if;
  return jsonb_build_object(
    'id', sv.id, 'titulo', sv.titulo, 'descricao', sv.descricao,
    'anonima', sv.anonima, 'fecha_em', sv.fecha_em,
    'perguntas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'ordem', q.ordem, 'tipo', q.tipo, 'enunciado', q.enunciado,
               'opcoes', to_jsonb(q.opcoes), 'obrigatoria', q.obrigatoria) order by q.ordem)
        from public.survey_questions q where q.survey_id = sv.id), '[]'::jsonb));
end $$;

-- p_respostas: [{ "question_id": "...", "valor": "7" }]
create or replace function public.pesquisa_responder(p_id uuid, p_respostas jsonb)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  sv public.surveys%rowtype;
  q record;
  r jsonb;
  v_resp uuid;
  v_segmento text;
  v_valor text;
  v_num int;
begin
  if v_user is null or not public.pesquisas_modulo_ligado() then
    raise exception 'Sem permissão';
  end if;
  select * into sv from public.surveys
   where id = p_id and school_id = public.get_my_school_id() and status = 'publicada'
     and now() >= abre_em and now() < fecha_em;
  if not found or not public.pesquisa_publico_ok(p_id) then
    raise exception 'Pesquisa não encontrada ou encerrada';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'array' or jsonb_array_length(p_respostas) > 100 then
    raise exception 'Respostas inválidas';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_respostas) as e
     where not exists (select 1 from public.survey_questions qq
                        where qq.survey_id = p_id and qq.id::text = e ->> 'question_id')
  ) then
    raise exception 'Resposta de pergunta inexistente';
  end if;
  if (select count(distinct e ->> 'question_id') from jsonb_array_elements(p_respostas) as e)
     <> jsonb_array_length(p_respostas) then
    raise exception 'Pergunta respondida mais de uma vez';
  end if;

  begin
    insert into public.survey_participation (survey_id, school_id, user_id)
    values (p_id, sv.school_id, v_user);
  exception when unique_violation then
    raise exception 'Você já respondeu esta pesquisa';
  end;

  -- Segmento = turma do primeiro filho (por nome) que cabe na pesquisa.
  if public.get_my_role() = 'family' then
    select s.turma into v_segmento
      from public.students s
     where s.school_id = sv.school_id
       and s.turma is not null
       and (sv.publico <> 'turmas' or s.turma = any (sv.turmas))
       and (s.family_id = v_user
            or exists (select 1 from public.student_guardians g
                        where g.student_id = s.id and g.guardian_id = v_user))
     order by s.name
     limit 1;
  end if;

  insert into public.survey_responses (survey_id, school_id, user_id, segmento)
  values (p_id, sv.school_id, case when sv.anonima then null else v_user end, v_segmento)
  returning id into v_resp;

  for q in select * from public.survey_questions where survey_id = p_id order by ordem loop
    r := null;
    select e into r from jsonb_array_elements(p_respostas) as e where e ->> 'question_id' = q.id::text limit 1;
    v_valor := nullif(btrim(coalesce(r ->> 'valor', '')), '');
    if v_valor is null then
      if q.obrigatoria then raise exception 'Responda todas as perguntas obrigatórias'; end if;
      continue;
    end if;
    if q.tipo in ('nps', 'escala5') then
      if v_valor !~ '^[0-9]{1,2}$' then raise exception 'Resposta inválida'; end if;
      v_num := v_valor::int;
      if (q.tipo = 'nps' and v_num not between 0 and 10) or (q.tipo = 'escala5' and v_num not between 1 and 5) then
        raise exception 'Resposta inválida';
      end if;
      insert into public.survey_answers (response_id, survey_id, question_id, school_id, valor_num)
      values (v_resp, p_id, q.id, sv.school_id, v_num);
    elsif q.tipo = 'multipla' then
      if not (v_valor = any (q.opcoes)) then raise exception 'Resposta inválida'; end if;
      insert into public.survey_answers (response_id, survey_id, question_id, school_id, valor_texto)
      values (v_resp, p_id, q.id, sv.school_id, v_valor);
    else
      if length(v_valor) > 2000 then raise exception 'Texto longo demais'; end if;
      insert into public.survey_answers (response_id, survey_id, question_id, school_id, valor_texto)
      values (v_resp, p_id, q.id, sv.school_id, v_valor);
    end if;
  end loop;
end $$;

-- ═══ 6. Gestão: resultados ═══
create or replace function public.pesquisa_resultados(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  sv public.surveys%rowtype;
  v_total int;
  v_oculto boolean;
begin
  if auth.uid() is null or not public.pesquisas_gestao() then
    raise exception 'Sem permissão';
  end if;
  select * into sv from public.surveys where id = p_id and school_id = public.get_my_school_id();
  if not found then raise exception 'Pesquisa não encontrada'; end if;

  select count(*)::int into v_total from public.survey_responses where survey_id = p_id;
  v_oculto := sv.anonima and v_total < 5;

  return jsonb_build_object(
    'id', sv.id, 'titulo', sv.titulo, 'status', sv.status, 'anonima', sv.anonima,
    'publico', sv.publico, 'respostas', v_total,
    'elegiveis', public.pesquisa_elegiveis(p_id),
    'oculto', v_oculto, 'minimo', 5,
    'perguntas', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', q.id, 'ordem', q.ordem, 'tipo', q.tipo,
                           'enunciado', q.enunciado, 'opcoes', to_jsonb(q.opcoes))
        || case when v_oculto then jsonb_build_object('oculto', true) else jsonb_build_object(
          'respostas', (select count(*) from public.survey_answers a where a.question_id = q.id),
          'distribuicao', case when q.tipo = 'texto' then '{}'::jsonb else coalesce((
              select jsonb_object_agg(d.k, d.c)
                from (select coalesce(a.valor_num::text, a.valor_texto) as k, count(*) as c
                        from public.survey_answers a where a.question_id = q.id group by 1) d
            ), '{}'::jsonb) end,
          'segmentos', case when q.tipo in ('nps', 'escala5') then coalesce((
              select jsonb_agg(jsonb_build_object('segmento', s.segmento, 'respostas', s.n, 'distribuicao', s.dist)
                               order by s.segmento)
                from (select g.segmento, sum(g.c)::int as n, jsonb_object_agg(g.k, g.c) as dist
                        from (select r.segmento, a.valor_num::text as k, count(*) as c
                                from public.survey_answers a
                                join public.survey_responses r on r.id = a.response_id
                               where a.question_id = q.id and r.segmento is not null and a.valor_num is not null
                               group by 1, 2) g
                       group by g.segmento
                      having sum(g.c) >= 5) s
            ), '[]'::jsonb) else '[]'::jsonb end
        ) end
        order by q.ordem)
        from public.survey_questions q where q.survey_id = p_id), '[]'::jsonb));
end $$;

-- Respostas em texto livre. Anônima: sem autor, embaralhadas e só com 5 ou mais respostas.
create or replace function public.pesquisa_textos(p_id uuid, p_question_id uuid)
returns table (texto text, autor text)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  sv public.surveys%rowtype;
begin
  if auth.uid() is null or not public.pesquisas_gestao() then
    raise exception 'Sem permissão';
  end if;
  select * into sv from public.surveys where id = p_id and school_id = public.get_my_school_id();
  if not found then raise exception 'Pesquisa não encontrada'; end if;
  if sv.anonima and (select count(*) from public.survey_responses where survey_id = p_id) < 5 then
    return;
  end if;
  return query
    select a.valor_texto,
           case when sv.anonima then null::text else (select u.name from public.users u where u.id = r.user_id) end
      from public.survey_answers a
      join public.survey_responses r on r.id = a.response_id
      join public.survey_questions q on q.id = a.question_id
     where a.survey_id = p_id and a.question_id = p_question_id
       and q.tipo = 'texto' and a.valor_texto is not null
     order by md5(a.id::text || p_id::text)
     limit 500;
end $$;

revoke execute on function public.pesquisa_salvar(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.pesquisa_publicar(uuid) from public, anon;
revoke execute on function public.pesquisa_encerrar(uuid) from public, anon;
revoke execute on function public.pesquisa_excluir(uuid) from public, anon;
revoke execute on function public.pesquisas_abertas() from public, anon;
revoke execute on function public.pesquisa_para_responder(uuid) from public, anon;
revoke execute on function public.pesquisa_responder(uuid, jsonb) from public, anon;
revoke execute on function public.pesquisa_resultados(uuid) from public, anon;
revoke execute on function public.pesquisa_textos(uuid, uuid) from public, anon;
grant execute on function public.pesquisa_salvar(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.pesquisa_publicar(uuid) to authenticated;
grant execute on function public.pesquisa_encerrar(uuid) to authenticated;
grant execute on function public.pesquisa_excluir(uuid) to authenticated;
grant execute on function public.pesquisas_abertas() to authenticated;
grant execute on function public.pesquisa_para_responder(uuid) to authenticated;
grant execute on function public.pesquisa_responder(uuid, jsonb) to authenticated;
grant execute on function public.pesquisa_resultados(uuid) to authenticated;
grant execute on function public.pesquisa_textos(uuid, uuid) to authenticated;
