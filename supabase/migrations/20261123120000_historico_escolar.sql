-- Histórico escolar oficial e declarações (PLANO_EXPANSAO_GESTAO.md, item 12). Só tabelas,
-- funções, policies e uma permissão novas: nada existente é alterado ou apagado.
--  * Quem usa: `gestao` e `gestao_pedagogica`, e a Recepção (`admin`) só com a permissão
--    `historico.emitir`; sempre com o módulo `historico_escolar` ligado
--    (schools.features_enabled->>'historico_escolar' = 'true').
--  * Anos cursados fora (student_external_history): a equipe lança e corrige.
--  * Documento emitido (school_documents_issued): só nasce e é cancelado pelas funções
--    documentos_emitir e documentos_cancelar. Não existe policy de INSERT/UPDATE/DELETE direta,
--    então o histórico de emissões não se edita. O conteúdo emitido fica guardado (foto do
--    momento) com o hash SHA 256 calculado no servidor.
--  * Número sequencial por escola sem condição de corrida (contador com upsert atômico).
--  * Verificação pública (D10): documentos_verificar só roda com a chave de serviço, chamada
--    pela Edge Function verify-document (com limite de tentativas). Devolve escola, tipo, data
--    e situação, nunca dado do aluno.

-- ═══ 1. Permissão e quem pode usar ═══
insert into public.permission_catalog (permission, label, area, default_roles) values
  ('historico.emitir', 'Emitir histórico escolar e declarações', 'Secretaria', array[]::text[])
on conflict (permission) do update set label = excluded.label, area = excluded.area;

create or replace function public.historico_modulo_ligado()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'historico_escolar') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false);
$$;

create or replace function public.historico_pode_emitir()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.historico_modulo_ligado()
     and case
           when coalesce(public.get_my_role(), '') in ('gestao', 'gestao_pedagogica') then true
           when coalesce(public.get_my_role(), '') = 'admin' then public.has_permission('historico.emitir')
           else false
         end;
$$;

revoke execute on function public.historico_modulo_ligado() from public, anon;
revoke execute on function public.historico_pode_emitir() from public, anon;
grant execute on function public.historico_modulo_ligado() to authenticated;
grant execute on function public.historico_pode_emitir() to authenticated;

-- ═══ 2. Tabelas ═══
create table if not exists public.student_external_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  escola_origem text not null check (length(btrim(escola_origem)) between 1 and 160),
  cidade text check (cidade is null or length(cidade) <= 80),
  uf text check (uf is null or uf ~ '^[A-Za-z]{2}$'),
  ano_letivo smallint not null check (ano_letivo between 1980 and 2100),
  serie text not null check (length(btrim(serie)) between 1 and 80),
  disciplinas jsonb not null default '[]'::jsonb check (jsonb_typeof(disciplinas) = 'array' and jsonb_array_length(disciplinas) <= 40),
  carga_horaria integer check (carga_horaria is null or carga_horaria between 1 and 10000),
  frequencia numeric(5,2) check (frequencia is null or (frequencia >= 0 and frequencia <= 100)),
  resultado text not null default 'aprovado' check (resultado in ('aprovado', 'reprovado', 'transferido', 'cursando')),
  observacao text check (observacao is null or length(observacao) <= 500),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_student_external_history_aluno on public.student_external_history(school_id, student_id);

create table if not exists public.school_document_counters (
  school_id uuid primary key references public.schools(id) on delete cascade,
  ultimo integer not null default 0
);

create table if not exists public.school_documents_issued (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  tipo text not null check (tipo in ('historico', 'declaracao_matricula', 'declaracao_escolaridade', 'ficha_acompanhamento')),
  numero integer not null,
  codigo_verificacao text not null check (codigo_verificacao ~ '^[0-9A-F]{16}$'),
  conteudo jsonb not null check (jsonb_typeof(conteudo) = 'object'),
  hash_conteudo text not null,
  emitido_por uuid references public.users(id) on delete set null,
  emitido_em timestamptz not null default now(),
  cancelado_em timestamptz,
  cancelado_por uuid references public.users(id) on delete set null,
  motivo_cancelamento text check (motivo_cancelamento is null or length(motivo_cancelamento) <= 300),
  unique (school_id, numero),
  unique (codigo_verificacao),
  check ((cancelado_em is null) = (motivo_cancelamento is null))
);
create index if not exists idx_school_documents_issued_aluno on public.school_documents_issued(school_id, student_id, emitido_em desc);

alter table public.student_external_history enable row level security;
alter table public.school_document_counters enable row level security;
alter table public.school_documents_issued enable row level security;

-- ═══ 3. Policies ═══
-- O aluno precisa ser da mesma escola (a FK sozinha não garante isso).
create policy "Historico equipe le anos externos" on public.student_external_history
  for select using (school_id = public.get_my_school_id() and public.historico_pode_emitir());
create policy "Historico equipe lanca anos externos" on public.student_external_history
  for insert with check (
    school_id = public.get_my_school_id() and public.historico_pode_emitir()
    and exists (select 1 from public.students s where s.id = student_id and s.school_id = student_external_history.school_id));
create policy "Historico equipe edita anos externos" on public.student_external_history
  for update using (school_id = public.get_my_school_id() and public.historico_pode_emitir())
  with check (
    school_id = public.get_my_school_id() and public.historico_pode_emitir()
    and exists (select 1 from public.students s where s.id = student_id and s.school_id = student_external_history.school_id));
create policy "Historico equipe apaga anos externos" on public.student_external_history
  for delete using (school_id = public.get_my_school_id() and public.historico_pode_emitir());

-- Documentos emitidos: só leitura direta; emitir e cancelar passam pelas funções.
create policy "Documentos equipe le emitidos" on public.school_documents_issued
  for select using (school_id = public.get_my_school_id() and public.historico_pode_emitir());

-- Contador: sem policy nenhuma (só as funções security definer mexem).

-- ═══ 4. Emitir e cancelar ═══
create or replace function public.documentos_emitir(p_student uuid, p_tipo text, p_conteudo jsonb)
returns table (id uuid, numero integer, codigo_verificacao text, emitido_em timestamptz, hash_conteudo text)
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_numero integer;
  v_codigo text;
  v_hash text;
  v_id uuid;
  v_em timestamptz := now();
begin
  if auth.uid() is null or not public.historico_pode_emitir() then
    raise exception 'Emissão de documentos não disponível';
  end if;
  if p_tipo is null or p_tipo not in ('historico', 'declaracao_matricula', 'declaracao_escolaridade', 'ficha_acompanhamento') then
    raise exception 'Tipo de documento inválido';
  end if;
  if p_conteudo is null or jsonb_typeof(p_conteudo) <> 'object' or pg_column_size(p_conteudo) > 200000 then
    raise exception 'Conteúdo do documento inválido';
  end if;
  if not exists (select 1 from public.students s where s.id = p_student and s.school_id = v_school) then
    raise exception 'Aluno não encontrado nesta escola';
  end if;

  insert into public.school_document_counters as c (school_id, ultimo)
  values (v_school, 1)
  on conflict (school_id) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v_numero;

  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  v_hash := encode(sha256(convert_to(p_conteudo::text, 'UTF8')), 'hex');

  insert into public.school_documents_issued as d
    (school_id, student_id, tipo, numero, codigo_verificacao, conteudo, hash_conteudo, emitido_por, emitido_em)
  values (v_school, p_student, p_tipo, v_numero, v_codigo, p_conteudo, v_hash, auth.uid(), v_em)
  returning d.id into v_id;

  return query select v_id, v_numero, v_codigo, v_em, v_hash;
end;
$$;

create or replace function public.documentos_cancelar(p_document uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_school uuid := public.get_my_school_id();
begin
  if auth.uid() is null or not public.historico_pode_emitir() then
    raise exception 'Cancelamento de documentos não disponível';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 or length(p_motivo) > 300 then
    raise exception 'Informe o motivo do cancelamento';
  end if;
  update public.school_documents_issued d
     set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
   where d.id = p_document and d.school_id = v_school and d.cancelado_em is null;
  if not found then
    raise exception 'Documento não encontrado ou já cancelado';
  end if;
end;
$$;

revoke execute on function public.documentos_emitir(uuid, text, jsonb) from public, anon;
revoke execute on function public.documentos_cancelar(uuid, text) from public, anon;
grant execute on function public.documentos_emitir(uuid, text, jsonb) to authenticated;
grant execute on function public.documentos_cancelar(uuid, text) to authenticated;

-- ═══ 5. Verificação pública (só a Edge Function, com a chave de serviço) ═══
-- Devolve apenas escola, tipo, data e situação. Nenhum dado do aluno.
create or replace function public.documentos_verificar(p_codigo text)
returns table (escola text, tipo text, emitido_em timestamptz, situacao text)
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(nullif(btrim(s.name), ''), 'Escola'),
         d.tipo,
         d.emitido_em,
         case when d.cancelado_em is null then 'valido' else 'cancelado' end
    from public.school_documents_issued d
    join public.schools s on s.id = d.school_id
   where d.codigo_verificacao = upper(regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g'))
   limit 1;
$$;

revoke execute on function public.documentos_verificar(text) from public, anon, authenticated;
grant execute on function public.documentos_verificar(text) to service_role;
