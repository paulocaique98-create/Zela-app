-- Gestão de bolsas (PLANO_EXPANSAO_GESTAO.md, item 13). Só tabelas, funções, policies e
-- bucket novos, mais uma coluna com default em schools: nada existente é alterado ou apagado.
--  * Quem usa: só `gestao` (Recepção e Coordenação não leem renda nem documento) e só com o
--    módulo `bolsas` ligado (schools.features_enabled->>'bolsas' = 'true').
--  * A família enxerga os tipos ativos e os próprios pedidos e concessões.
--  * Pedido, anexo, decisão e encerramento passam por funções security definer: não existe
--    policy de INSERT/UPDATE/DELETE direta em pedidos e concessões, então o histórico não se edita.
--  * Documentos de renda ficam no bucket privado `scholarships/<school_id>/<application_id>/`
--    e são apagados 12 meses depois do fim da bolsa (decisão D11), pela Edge Function
--    purge-scholarship-documents.
--  * `financial_guardian_conditions.bolsista` (100%) continua valendo; nada é migrado.

-- ═══ 1. Limite de desconto total por escola (padrão 100%) ═══
alter table public.schools
  add column if not exists scholarship_max_discount_percent numeric(5,2) not null default 100
  check (scholarship_max_discount_percent > 0 and scholarship_max_discount_percent <= 100);

-- ═══ 2. Tabelas ═══
create table if not exists public.scholarship_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  descricao text check (descricao is null or length(descricao) <= 500),
  criterios text check (criterios is null or length(criterios) <= 1000),
  percentual numeric(5,2) check (percentual is null or (percentual > 0 and percentual <= 100)),
  valor_cents integer check (valor_cents is null or valor_cents > 0),
  base text not null default 'mensalidade' check (base = 'mensalidade'),
  vagas integer check (vagas is null or vagas > 0),
  vigencia_inicio date,
  vigencia_fim date,
  cumulativa boolean not null default true,
  ativo boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  check ((percentual is not null)::int + (valor_cents is not null)::int = 1),
  check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio)
);
create index if not exists idx_scholarship_types_escola on public.scholarship_types(school_id, ativo);

create table if not exists public.scholarship_applications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  type_id uuid not null,
  student_id uuid not null references public.students(id) on delete restrict,
  family_id uuid not null references public.users(id) on delete restrict,
  renda_mensal_cents integer check (renda_mensal_cents is null or renda_mensal_cents >= 0),
  pessoas_na_casa smallint not null check (pessoas_na_casa between 1 and 30),
  justificativa text not null check (length(btrim(justificativa)) between 1 and 1500),
  status text not null default 'enviada'
    check (status in ('enviada', 'em_analise', 'aprovada', 'negada', 'cancelada')),
  parecer text check (parecer is null or length(parecer) <= 1500),
  decidido_por uuid references public.users(id) on delete set null,
  decidido_em timestamptz,
  expurgado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (type_id, school_id) references public.scholarship_types(id, school_id) on delete restrict
);
create index if not exists idx_scholarship_applications_fila on public.scholarship_applications(school_id, status, created_at);
create index if not exists idx_scholarship_applications_familia on public.scholarship_applications(family_id);
-- Um pedido aberto por aluno e tipo.
create unique index if not exists uq_scholarship_application_aberto
  on public.scholarship_applications(student_id, type_id) where status in ('enviada', 'em_analise');

create table if not exists public.scholarship_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  application_id uuid not null,
  path text not null check (length(path) between 10 and 300),
  nome text not null check (length(btrim(nome)) between 1 and 160),
  created_at timestamptz not null default now(),
  foreign key (application_id, school_id) references public.scholarship_applications(id, school_id) on delete cascade,
  unique (path)
);
create index if not exists idx_scholarship_documents_pedido on public.scholarship_documents(application_id);

create table if not exists public.scholarship_grants (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  type_id uuid not null,
  student_id uuid not null references public.students(id) on delete restrict,
  family_id uuid references public.users(id) on delete set null,
  application_id uuid,
  percentual numeric(5,2) check (percentual is null or (percentual > 0 and percentual <= 100)),
  valor_cents integer check (valor_cents is null or valor_cents > 0),
  inicio date not null,
  fim date,
  encerrada_em timestamptz,
  motivo_encerramento text check (motivo_encerramento is null or length(motivo_encerramento) <= 300),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((percentual is not null)::int + (valor_cents is not null)::int = 1),
  check (fim is null or fim >= inicio),
  foreign key (type_id, school_id) references public.scholarship_types(id, school_id) on delete restrict,
  foreign key (application_id, school_id) references public.scholarship_applications(id, school_id)
);
create index if not exists idx_scholarship_grants_aluno on public.scholarship_grants(school_id, student_id);
create index if not exists idx_scholarship_grants_vigencia on public.scholarship_grants(school_id, fim) where encerrada_em is null;

alter table public.scholarship_types enable row level security;
alter table public.scholarship_applications enable row level security;
alter table public.scholarship_documents enable row level security;
alter table public.scholarship_grants enable row level security;

-- ═══ 3. Quem pode usar ═══
create or replace function public.bolsas_modulo_ligado()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'bolsas') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false);
$$;

create or replace function public.bolsas_pode_analisar()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.bolsas_modulo_ligado() and coalesce(public.get_my_role(), '') = 'gestao';
$$;

revoke execute on function public.bolsas_modulo_ligado() from public, anon;
revoke execute on function public.bolsas_pode_analisar() from public, anon;
grant execute on function public.bolsas_modulo_ligado() to authenticated;
grant execute on function public.bolsas_pode_analisar() to authenticated;

-- ═══ 4. Policies (escrita de pedido e concessão só pelas funções abaixo) ═══
create policy "Bolsas gestao le tipos" on public.scholarship_types
  for select using (school_id = public.get_my_school_id() and public.bolsas_pode_analisar());
create policy "Bolsas familia le tipos ativos" on public.scholarship_types
  for select using (school_id = public.get_my_school_id() and ativo and public.bolsas_modulo_ligado()
                    and public.get_my_role() = 'family');
create policy "Bolsas gestao cadastra tipos" on public.scholarship_types
  for insert with check (school_id = public.get_my_school_id() and public.bolsas_pode_analisar());
create policy "Bolsas gestao edita tipos" on public.scholarship_types
  for update using (school_id = public.get_my_school_id() and public.bolsas_pode_analisar())
  with check (school_id = public.get_my_school_id() and public.bolsas_pode_analisar());
create policy "Bolsas gestao apaga tipos" on public.scholarship_types
  for delete using (school_id = public.get_my_school_id() and public.bolsas_pode_analisar());

create policy "Bolsas gestao le pedidos" on public.scholarship_applications
  for select using (school_id = public.get_my_school_id() and public.bolsas_pode_analisar());
create policy "Bolsas familia le os proprios pedidos" on public.scholarship_applications
  for select using (school_id = public.get_my_school_id() and family_id = auth.uid());

create policy "Bolsas gestao le documentos" on public.scholarship_documents
  for select using (school_id = public.get_my_school_id() and public.bolsas_pode_analisar());
create policy "Bolsas familia le os proprios documentos" on public.scholarship_documents
  for select using (school_id = public.get_my_school_id() and exists (
    select 1 from public.scholarship_applications a
     where a.id = application_id and a.school_id = scholarship_documents.school_id and a.family_id = auth.uid()));

create policy "Bolsas gestao le concessoes" on public.scholarship_grants
  for select using (school_id = public.get_my_school_id() and public.bolsas_pode_analisar());
create policy "Bolsas familia le as proprias concessoes" on public.scholarship_grants
  for select using (school_id = public.get_my_school_id() and family_id = auth.uid());

-- ═══ 5. Gatilho: updated_at e vínculo dos tipos ═══
create or replace function public.bolsas_toca_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_scholarship_types_updated on public.scholarship_types;
create trigger trg_scholarship_types_updated before update on public.scholarship_types
  for each row execute function public.bolsas_toca_updated_at();

-- Quem escreve em scholarship_types não troca de escola nem de dono.
create or replace function public.bolsas_tipo_protege_escola()
returns trigger language plpgsql as $$
begin
  if new.school_id <> old.school_id then
    raise exception 'Tipo de bolsa não muda de escola';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_scholarship_types_escola on public.scholarship_types;
create trigger trg_scholarship_types_escola before update on public.scholarship_types
  for each row execute function public.bolsas_tipo_protege_escola();

-- ═══ 6. Funções da família ═══
create or replace function public.bolsas_enviar_pedido(
  p_student uuid, p_type uuid, p_renda_cents integer, p_pessoas integer, p_justificativa text)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_tipo public.scholarship_types%rowtype;
  v_id uuid;
begin
  if auth.uid() is null or public.get_my_role() <> 'family' or not public.bolsas_modulo_ligado() then
    raise exception 'Pedido de bolsa não disponível';
  end if;
  if not exists (
    select 1 from public.student_guardians g
      join public.students s on s.id = g.student_id
     where g.student_id = p_student and g.guardian_id = auth.uid()
       and g.is_financial and s.school_id = v_school) then
    raise exception 'Apenas o responsável financeiro do aluno pode pedir bolsa';
  end if;
  select * into v_tipo from public.scholarship_types
   where id = p_type and school_id = v_school and ativo;
  if not found then raise exception 'Tipo de bolsa indisponível'; end if;
  if (v_tipo.vigencia_inicio is not null and current_date < v_tipo.vigencia_inicio)
     or (v_tipo.vigencia_fim is not null and current_date > v_tipo.vigencia_fim) then
    raise exception 'Este tipo de bolsa está fora do período de inscrição';
  end if;
  if exists (select 1 from public.scholarship_grants gr
              where gr.student_id = p_student and gr.type_id = p_type and gr.encerrada_em is null
                and (gr.fim is null or gr.fim >= current_date)) then
    raise exception 'O aluno já tem esta bolsa vigente';
  end if;
  insert into public.scholarship_applications
    (school_id, type_id, student_id, family_id, renda_mensal_cents, pessoas_na_casa, justificativa)
  values (v_school, p_type, p_student, auth.uid(), p_renda_cents, p_pessoas, btrim(p_justificativa))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.bolsas_anexar_documento(p_application uuid, p_path text, p_nome text)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_school uuid := public.get_my_school_id();
begin
  if not exists (select 1 from public.scholarship_applications a
                  where a.id = p_application and a.school_id = v_school
                    and a.family_id = auth.uid() and a.status = 'enviada') then
    raise exception 'Pedido não encontrado ou já em análise';
  end if;
  if p_path is null or p_path not like (v_school::text || '/' || p_application::text || '/%') then
    raise exception 'Caminho de arquivo inválido';
  end if;
  if (select count(*) from public.scholarship_documents d where d.application_id = p_application) >= 6 then
    raise exception 'Limite de 6 documentos por pedido';
  end if;
  insert into public.scholarship_documents (school_id, application_id, path, nome)
  values (v_school, p_application, p_path, left(btrim(p_nome), 160));
end;
$$;

create or replace function public.bolsas_cancelar_pedido(p_application uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  update public.scholarship_applications
     set status = 'cancelada', updated_at = now()
   where id = p_application and school_id = public.get_my_school_id()
     and family_id = auth.uid() and status in ('enviada', 'em_analise');
  if not found then raise exception 'Pedido não pode ser cancelado'; end if;
end;
$$;

-- ═══ 7. Funções da Gestão ═══
create or replace function public.bolsas_iniciar_analise(p_application uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.bolsas_pode_analisar() then raise exception 'Sem permissão'; end if;
  update public.scholarship_applications
     set status = 'em_analise', updated_at = now()
   where id = p_application and school_id = public.get_my_school_id() and status = 'enviada';
  if not found then raise exception 'Pedido não está aguardando análise'; end if;
end;
$$;

create or replace function public.bolsas_decidir_pedido(
  p_application uuid, p_aprovar boolean, p_parecer text,
  p_percentual numeric default null, p_valor_cents integer default null,
  p_inicio date default null, p_fim date default null)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_school uuid := public.get_my_school_id();
  v_app public.scholarship_applications%rowtype;
  v_tipo public.scholarship_types%rowtype;
  v_inicio date := coalesce(p_inicio, current_date);
  v_percentual numeric := p_percentual;
  v_valor integer := p_valor_cents;
  v_usadas integer;
  v_grant uuid;
begin
  if not public.bolsas_pode_analisar() then raise exception 'Sem permissão'; end if;
  if p_parecer is null or length(btrim(p_parecer)) < 3 then
    raise exception 'Escreva o parecer da decisão';
  end if;
  select * into v_app from public.scholarship_applications
   where id = p_application and school_id = v_school and status in ('enviada', 'em_analise')
   for update;
  if not found then raise exception 'Pedido não está em aberto'; end if;

  if not p_aprovar then
    update public.scholarship_applications
       set status = 'negada', parecer = btrim(p_parecer), decidido_por = auth.uid(),
           decidido_em = now(), updated_at = now()
     where id = p_application;
    return null;
  end if;

  select * into v_tipo from public.scholarship_types
   where id = v_app.type_id and school_id = v_school for update;
  if v_percentual is null and v_valor is null then
    v_percentual := v_tipo.percentual;
    v_valor := v_tipo.valor_cents;
  end if;
  if (v_percentual is not null)::int + (v_valor is not null)::int <> 1 then
    raise exception 'Informe percentual ou valor, não os dois';
  end if;
  if v_tipo.vigencia_inicio is not null and v_inicio < v_tipo.vigencia_inicio then
    raise exception 'Início anterior à vigência do tipo de bolsa';
  end if;
  if v_tipo.vigencia_fim is not null and (p_fim is null or p_fim > v_tipo.vigencia_fim) then
    raise exception 'Fim posterior à vigência do tipo de bolsa';
  end if;
  if v_tipo.vagas is not null then
    select count(*) into v_usadas from public.scholarship_grants g
     where g.type_id = v_tipo.id and g.encerrada_em is null
       and (g.fim is null or g.fim >= current_date);
    if v_usadas >= v_tipo.vagas then raise exception 'Não há vagas neste tipo de bolsa'; end if;
  end if;

  insert into public.scholarship_grants
    (school_id, type_id, student_id, family_id, application_id, percentual, valor_cents, inicio, fim, created_by)
  values (v_school, v_tipo.id, v_app.student_id, v_app.family_id, v_app.id,
          v_percentual, v_valor, v_inicio, p_fim, auth.uid())
  returning id into v_grant;

  update public.scholarship_applications
     set status = 'aprovada', parecer = btrim(p_parecer), decidido_por = auth.uid(),
         decidido_em = now(), updated_at = now()
   where id = p_application;
  return v_grant;
end;
$$;

create or replace function public.bolsas_encerrar_concessao(p_grant uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.bolsas_pode_analisar() then raise exception 'Sem permissão'; end if;
  update public.scholarship_grants
     set encerrada_em = now(),
         fim = least(coalesce(fim, current_date), current_date),
         motivo_encerramento = left(btrim(coalesce(p_motivo, '')), 300)
   where id = p_grant and school_id = public.get_my_school_id() and encerrada_em is null;
  if not found then raise exception 'Concessão não está vigente'; end if;
end;
$$;

create or replace function public.bolsas_definir_limite(p_percent numeric)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.bolsas_pode_analisar() then raise exception 'Sem permissão'; end if;
  if p_percent is null or p_percent <= 0 or p_percent > 100 then
    raise exception 'O limite precisa ficar entre 1 e 100';
  end if;
  update public.schools set scholarship_max_discount_percent = p_percent
   where id = public.get_my_school_id();
end;
$$;

revoke execute on function public.bolsas_enviar_pedido(uuid, uuid, integer, integer, text) from public, anon;
revoke execute on function public.bolsas_anexar_documento(uuid, text, text) from public, anon;
revoke execute on function public.bolsas_cancelar_pedido(uuid) from public, anon;
revoke execute on function public.bolsas_iniciar_analise(uuid) from public, anon;
revoke execute on function public.bolsas_decidir_pedido(uuid, boolean, text, numeric, integer, date, date) from public, anon;
revoke execute on function public.bolsas_encerrar_concessao(uuid, text) from public, anon;
revoke execute on function public.bolsas_definir_limite(numeric) from public, anon;
grant execute on function public.bolsas_enviar_pedido(uuid, uuid, integer, integer, text) to authenticated;
grant execute on function public.bolsas_anexar_documento(uuid, text, text) to authenticated;
grant execute on function public.bolsas_cancelar_pedido(uuid) to authenticated;
grant execute on function public.bolsas_iniciar_analise(uuid) to authenticated;
grant execute on function public.bolsas_decidir_pedido(uuid, boolean, text, numeric, integer, date, date) to authenticated;
grant execute on function public.bolsas_encerrar_concessao(uuid, text) to authenticated;
grant execute on function public.bolsas_definir_limite(numeric) to authenticated;

-- ═══ 8. Storage privado ═══
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scholarships', 'scholarships', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Bolsas familia envia documentos" on storage.objects;
create policy "Bolsas familia envia documentos" on storage.objects
  for insert with check (
    bucket_id = 'scholarships'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.scholarship_applications a
       where a.id::text = (storage.foldername(name))[2]
         and a.school_id = get_my_school_id()
         and a.family_id = auth.uid() and a.status = 'enviada')
  );

drop policy if exists "Bolsas leem documentos" on storage.objects;
create policy "Bolsas leem documentos" on storage.objects
  for select using (
    bucket_id = 'scholarships'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.scholarship_applications a
       where a.id::text = (storage.foldername(name))[2]
         and a.school_id = get_my_school_id()
         and (a.family_id = auth.uid() or public.bolsas_pode_analisar()))
  );

drop policy if exists "Bolsas familia remove documento do pedido enviado" on storage.objects;
create policy "Bolsas familia remove documento do pedido enviado" on storage.objects
  for delete using (
    bucket_id = 'scholarships'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.scholarship_applications a
       where a.id::text = (storage.foldername(name))[2]
         and a.school_id = get_my_school_id()
         and a.family_id = auth.uid() and a.status = 'enviada')
  );

-- ═══ 9. LGPD: documentos a apagar 12 meses depois do fim da bolsa (D11) ═══
-- Referência por pedido: maior fim/encerramento das concessões; sem concessão (negado ou
-- cancelado), a data da decisão/cancelamento. Pedido em aberto nunca entra.
create or replace function public.bolsas_documentos_para_apagar()
returns table (document_id uuid, application_id uuid, path text)
language sql stable security definer
set search_path to 'public'
as $$
  select d.id, d.application_id, d.path
    from public.scholarship_documents d
    join public.scholarship_applications a on a.id = d.application_id
   where a.status in ('aprovada', 'negada', 'cancelada')
     and not exists (select 1 from public.scholarship_grants g
                      where g.application_id = a.id and g.encerrada_em is null
                        and (g.fim is null or g.fim >= current_date))
     and coalesce(
           (select max(coalesce(g.fim, g.encerrada_em::date)) from public.scholarship_grants g where g.application_id = a.id),
           coalesce(a.decidido_em, a.updated_at)::date
         ) < (current_date - interval '12 months')
   limit 500;
$$;

create or replace function public.bolsas_expurgar_pedidos(p_applications uuid[])
returns void
language sql security definer
set search_path to 'public'
as $$
  with apagados as (
    delete from public.scholarship_documents where application_id = any(p_applications) returning application_id
  )
  update public.scholarship_applications
     set renda_mensal_cents = null, expurgado_em = now()
   where id = any(p_applications) and expurgado_em is null;
$$;

revoke execute on function public.bolsas_documentos_para_apagar() from public, anon, authenticated;
revoke execute on function public.bolsas_expurgar_pedidos(uuid[]) from public, anon, authenticated;
grant execute on function public.bolsas_documentos_para_apagar() to service_role;
grant execute on function public.bolsas_expurgar_pedidos(uuid[]) to service_role;
