-- Ocorrências completas (PLANO_EXPANSAO_GESTAO.md, item 7). Só tabelas, funções,
-- policies e bucket novos: nada existente é alterado ou apagado.
--  * Módulo `ocorrencias` (schools.features_enabled), lido como = 'true'.
--  * Professora ativa: registra para alunos das suas turmas (Montessori:
--    users.turmas; Tradicional: trad_atribuicoes) e lê só as que registrou.
--    Não edita (histórico imutável) e não aplica medida (advertência, suspensão).
--  * gestao e gestao_pedagogica: leem e gerenciam todas da escola. Editar o
--    conteúdo guarda a versão anterior em student_incident_versions.
--  * Recepção (admin) e developer: sem acesso.
--  * Família: sem SELECT direto. Lê só `visivel_familia = true` dos próprios
--    filhos por ocorrencias_minhas() e grava só a ciência por
--    registrar_ciencia_ocorrencia(id). Ocorrência interna nunca chega à família.
--  * Nenhuma tabela tem policy de DELETE.
--  * Anexos: bucket privado incident-files/<school_id>/<incident_id>/<arquivo>,
--    sem update nem delete, visível só a quem registrou e à Gestão.

-- ═══ 1. Tabelas ═══
create table if not exists public.student_incidents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  tipo text not null check (tipo in ('comportamento', 'saude', 'acidente', 'disciplinar', 'elogio', 'outro')),
  gravidade text not null default 'leve' check (gravidade in ('leve', 'media', 'grave')),
  ocorrido_em date not null default current_date,
  descricao text not null check (length(btrim(descricao)) > 0 and length(descricao) <= 4000),
  providencias text not null default '' check (length(providencias) <= 4000),
  visivel_familia boolean not null default false,
  exige_ciencia boolean not null default false,
  ciencia_em timestamptz,
  ciencia_por uuid references public.users(id) on delete set null,
  medida text check (medida is null or medida in ('advertencia', 'suspensao')),
  medida_inicio date,
  medida_fim date,
  registrado_por uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not exige_ciencia or visivel_familia),
  check (medida_fim is null or medida_inicio is null or medida_fim >= medida_inicio),
  check (medida is not null or (medida_inicio is null and medida_fim is null))
);
create index if not exists idx_student_incidents_escola on public.student_incidents(school_id, ocorrido_em desc);
create index if not exists idx_student_incidents_aluno on public.student_incidents(school_id, student_id, ocorrido_em desc);
create index if not exists idx_student_incidents_autor on public.student_incidents(school_id, registrado_por);

create table if not exists public.student_incident_versions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.student_incidents(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  versao int not null,
  snapshot jsonb not null,
  alterado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (incident_id, versao)
);
create index if not exists idx_student_incident_versions_inc on public.student_incident_versions(school_id, incident_id);

-- ═══ 2. Funções de apoio ═══
create or replace function public.ocorrencias_modulo_ligado()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'ocorrencias') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false);
$$;

create or replace function public.ocorrencias_gestao()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.ocorrencias_modulo_ligado()
     and coalesce(public.get_my_role(), '') in ('gestao', 'gestao_pedagogica');
$$;

-- Professora ativa que atende o aluno (turma Montessori ou atribuição Tradicional).
create or replace function public.ocorrencias_professora_atende(p_student_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.ocorrencias_modulo_ligado()
     and coalesce(public.get_my_role(), '') = 'teacher'
     and public.get_my_teacher_status() = 'ativo'
     and exists (
       select 1 from public.students s
        where s.id = p_student_id
          and s.school_id = public.get_my_school_id()
          and (
            s.turma = any (public.get_my_turmas())
            or exists (
              select 1
                from public.trad_atribuicoes a
                join public.trad_turmas t on t.id = a.turma_id and t.school_id = a.school_id
               where a.school_id = s.school_id
                 and a.professor_id = auth.uid()
                 and t.nome = s.turma)
          ));
$$;

revoke execute on function public.ocorrencias_modulo_ligado() from public, anon;
revoke execute on function public.ocorrencias_gestao() from public, anon;
revoke execute on function public.ocorrencias_professora_atende(uuid) from public, anon;
grant execute on function public.ocorrencias_modulo_ligado() to authenticated;
grant execute on function public.ocorrencias_gestao() to authenticated;
grant execute on function public.ocorrencias_professora_atende(uuid) to authenticated;

-- ═══ 3. Trigger: imutabilidade, versões e colunas protegidas ═══
-- Sem sessão (service role, migrations) não interfere. A ciência só muda
-- dentro de registrar_ciencia_ocorrencia (flag local da transação).
create or replace function public.student_incidents_guard() returns trigger
  language plpgsql security definer
  set search_path to 'public'
as $$
declare
  v_role text := coalesce(get_my_role(), '');
  v_versao int;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not exists (select 1 from public.students s where s.id = new.student_id and s.school_id = new.school_id) then
      raise exception 'Aluno não pertence a esta escola';
    end if;
    if new.registrado_por <> auth.uid() then
      raise exception 'A ocorrência deve ser registrada por quem está logado';
    end if;
    if v_role = 'teacher' and new.medida is not null then
      raise exception 'Medida disciplinar é decisão da Coordenação';
    end if;
    new.ciencia_em := null;
    new.ciencia_por := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.id <> old.id or new.school_id <> old.school_id or new.student_id <> old.student_id
     or new.registrado_por <> old.registrado_por or new.created_at <> old.created_at then
    raise exception 'Identidade da ocorrência não pode ser alterada';
  end if;

  if current_setting('zela.ciencia', true) = '1' then
    -- RPC da família: só a ciência muda, nada do conteúdo
    if new.tipo <> old.tipo or new.gravidade <> old.gravidade or new.ocorrido_em <> old.ocorrido_em
       or new.descricao <> old.descricao or new.providencias <> old.providencias
       or new.visivel_familia <> old.visivel_familia or new.exige_ciencia <> old.exige_ciencia
       or new.medida is distinct from old.medida then
      raise exception 'A ciência não altera o conteúdo';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if v_role not in ('gestao', 'gestao_pedagogica') then
    raise exception 'Sem permissão para alterar ocorrências';
  end if;

  new.ciencia_em := old.ciencia_em;
  new.ciencia_por := old.ciencia_por;

  if new.tipo <> old.tipo or new.gravidade <> old.gravidade or new.ocorrido_em <> old.ocorrido_em
     or new.descricao <> old.descricao or new.providencias <> old.providencias
     or new.visivel_familia <> old.visivel_familia or new.exige_ciencia <> old.exige_ciencia
     or new.medida is distinct from old.medida or new.medida_inicio is distinct from old.medida_inicio
     or new.medida_fim is distinct from old.medida_fim then
    select coalesce(max(v.versao), 0) + 1 into v_versao
      from public.student_incident_versions v where v.incident_id = old.id;
    insert into public.student_incident_versions (incident_id, school_id, versao, snapshot, alterado_por)
    values (old.id, old.school_id, v_versao, jsonb_build_object(
      'tipo', old.tipo, 'gravidade', old.gravidade, 'ocorrido_em', old.ocorrido_em,
      'descricao', old.descricao, 'providencias', old.providencias,
      'visivel_familia', old.visivel_familia, 'exige_ciencia', old.exige_ciencia,
      'medida', old.medida, 'medida_inicio', old.medida_inicio, 'medida_fim', old.medida_fim,
      'atualizado_em', old.updated_at), auth.uid());
    -- Mudou o que a família vê: a ciência anterior deixa de valer.
    if new.descricao <> old.descricao or new.providencias <> old.providencias
       or new.medida is distinct from old.medida then
      new.ciencia_em := null;
      new.ciencia_por := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_student_incidents_guard on public.student_incidents;
create trigger trg_student_incidents_guard
  before insert or update on public.student_incidents
  for each row execute function public.student_incidents_guard();

-- ═══ 4. RLS (sem DELETE) ═══
alter table public.student_incidents enable row level security;
alter table public.student_incident_versions enable row level security;

drop policy if exists "Professoras leem as ocorrencias que registraram" on public.student_incidents;
create policy "Professoras leem as ocorrencias que registraram" on public.student_incidents
  for select using (
    school_id = public.get_my_school_id()
    and public.ocorrencias_modulo_ligado()
    and public.get_my_role() = 'teacher' and public.get_my_teacher_status() = 'ativo'
    and registrado_por = auth.uid()
  );

drop policy if exists "Professoras registram ocorrencias das suas turmas" on public.student_incidents;
create policy "Professoras registram ocorrencias das suas turmas" on public.student_incidents
  for insert with check (
    school_id = public.get_my_school_id()
    and registrado_por = auth.uid()
    and public.ocorrencias_professora_atende(student_id)
    and medida is null
  );

drop policy if exists "Gestao le ocorrencias da escola" on public.student_incidents;
create policy "Gestao le ocorrencias da escola" on public.student_incidents
  for select using (school_id = public.get_my_school_id() and public.ocorrencias_gestao());

drop policy if exists "Gestao registra ocorrencias da escola" on public.student_incidents;
create policy "Gestao registra ocorrencias da escola" on public.student_incidents
  for insert with check (
    school_id = public.get_my_school_id() and public.ocorrencias_gestao()
    and registrado_por = auth.uid()
  );

drop policy if exists "Gestao edita ocorrencias da escola" on public.student_incidents;
create policy "Gestao edita ocorrencias da escola" on public.student_incidents
  for update using (school_id = public.get_my_school_id() and public.ocorrencias_gestao())
  with check (school_id = public.get_my_school_id() and public.ocorrencias_gestao());

drop policy if exists "Gestao le versoes das ocorrencias" on public.student_incident_versions;
create policy "Gestao le versoes das ocorrencias" on public.student_incident_versions
  for select using (school_id = public.get_my_school_id() and public.ocorrencias_gestao());

-- ═══ 5. Família: leitura e ciência só pelos filhos vinculados ═══
create or replace function public.ocorrencias_minhas()
returns table (
  id uuid, student_id uuid, student_name text, tipo text, gravidade text, ocorrido_em date,
  descricao text, providencias text, medida text, medida_inicio date, medida_fim date,
  exige_ciencia boolean, ciencia_em timestamptz
)
language sql stable security definer
set search_path to 'public'
as $$
  select i.id, i.student_id, s.name, i.tipo, i.gravidade, i.ocorrido_em,
         i.descricao, i.providencias, i.medida, i.medida_inicio, i.medida_fim,
         i.exige_ciencia, i.ciencia_em
    from public.student_incidents i
    join public.students s on s.id = i.student_id and s.school_id = i.school_id
   where i.school_id = public.get_my_school_id()
     and public.get_my_role() = 'family'
     and public.ocorrencias_modulo_ligado()
     and i.visivel_familia = true
     and (s.family_id = auth.uid()
          or exists (select 1 from public.student_guardians g
                      where g.student_id = s.id and g.guardian_id = auth.uid()))
   order by (i.exige_ciencia and i.ciencia_em is null) desc, i.ocorrido_em desc, i.created_at desc
   limit 200;
$$;

create or replace function public.registrar_ciencia_ocorrencia(p_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_inc public.student_incidents%rowtype;
begin
  if auth.uid() is null or public.get_my_role() <> 'family' or not public.ocorrencias_modulo_ligado() then
    raise exception 'Sem permissão';
  end if;

  select i.* into v_inc
    from public.student_incidents i
    join public.students s on s.id = i.student_id and s.school_id = i.school_id
   where i.id = p_id
     and i.school_id = public.get_my_school_id()
     and i.visivel_familia = true
     and i.exige_ciencia = true
     and (s.family_id = auth.uid()
          or exists (select 1 from public.student_guardians g
                      where g.student_id = s.id and g.guardian_id = auth.uid()));
  if not found then
    raise exception 'Ocorrência não encontrada';
  end if;
  if v_inc.ciencia_em is not null then
    return;
  end if;

  perform set_config('zela.ciencia', '1', true);
  update public.student_incidents set ciencia_em = now(), ciencia_por = auth.uid() where id = p_id;
  perform set_config('zela.ciencia', '0', true);
end $$;

-- Saúde e acidente: mostra as restrições da ficha médica na hora de registrar.
create or replace function public.ocorrencias_alertas_saude(p_student_id uuid)
returns table (restricoes_saude text[], restricoes_alimentares text[], medicamentos text[])
language sql stable security definer
set search_path to 'public'
as $$
  select f.restricoes_saude, f.restricoes_alimentares, f.medicamentos
    from public.fichas_medicas f
   where f.student_id = p_student_id
     and f.school_id = public.get_my_school_id()
     and (public.ocorrencias_gestao() or public.ocorrencias_professora_atende(p_student_id))
   limit 1;
$$;

revoke execute on function public.ocorrencias_minhas() from public, anon;
revoke execute on function public.registrar_ciencia_ocorrencia(uuid) from public, anon;
revoke execute on function public.ocorrencias_alertas_saude(uuid) from public, anon;
grant execute on function public.ocorrencias_minhas() to authenticated;
grant execute on function public.registrar_ciencia_ocorrencia(uuid) to authenticated;
grant execute on function public.ocorrencias_alertas_saude(uuid) to authenticated;

-- ═══ 6. Anexos (bucket privado, caminho <school_id>/<incident_id>/<arquivo>) ═══
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('incident-files', 'incident-files', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Ocorrencias enviam anexos" on storage.objects;
create policy "Ocorrencias enviam anexos" on storage.objects
  for insert with check (
    bucket_id = 'incident-files'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.student_incidents i
       where i.id::text = (storage.foldername(name))[2]
         and i.school_id = get_my_school_id()
         and (i.registrado_por = auth.uid() or public.ocorrencias_gestao())
    )
  );

drop policy if exists "Ocorrencias leem anexos" on storage.objects;
create policy "Ocorrencias leem anexos" on storage.objects
  for select using (
    bucket_id = 'incident-files'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.student_incidents i
       where i.id::text = (storage.foldername(name))[2]
         and i.school_id = get_my_school_id()
         and ((i.registrado_por = auth.uid() and get_my_role() = 'teacher') or public.ocorrencias_gestao())
    )
  );
