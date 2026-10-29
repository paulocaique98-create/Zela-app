-- Captação de alunos, CRM (PLANO_EXPANSAO_GESTAO.md, item 11). Só tabelas, funções,
-- gatilhos e policies novas: nada existente é alterado ou apagado.
--  * Quem usa: gestao e gestao_pedagogica (Coordenação e Direção), e só com o módulo
--    `captacao` ligado (schools.features_enabled->>'captacao' = 'true').
--  * Lead público entra só pela Edge Function public-lead-request (service role, com
--    limite por IP e consentimento LGPD). Não existe policy de insert para anon.
--  * Lead perdido é anonimizado após 12 meses (leads_anonimizar_perdidos, decisão D9);
--    o funil continua contando, mas sem dado pessoal. Apagar o lead (direito do titular)
--    só a Gestão, e leva junto interações, visitas e fila (cascata).

-- ═══ 1. Tabelas ═══
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  responsavel_nome text not null check (length(btrim(responsavel_nome)) between 1 and 120),
  telefone text check (telefone is null or length(telefone) <= 30),
  email text check (email is null or length(email) <= 160),
  crianca_nome text check (crianca_nome is null or length(crianca_nome) <= 120),
  crianca_nascimento date,
  interesse text check (interesse is null or length(interesse) <= 120),
  origem text not null default 'outro'
    check (origem in ('site', 'indicacao', 'instagram', 'google', 'visita', 'outro')),
  etapa text not null default 'novo'
    check (etapa in ('novo', 'contato', 'visita_agendada', 'visitou', 'proposta', 'matriculado', 'perdido')),
  motivo_perda text check (motivo_perda is null or length(motivo_perda) <= 200),
  responsavel_id uuid references public.users(id) on delete set null,
  consentimento_em timestamptz,
  perdido_em timestamptz,
  convertido_em timestamptz,
  anonimizado_em timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  check (anonimizado_em is not null
         or length(btrim(coalesce(telefone, ''))) > 0
         or length(btrim(coalesce(email, ''))) > 0)
);
create index if not exists idx_leads_escola_etapa on public.leads(school_id, etapa, created_at desc);
create index if not exists idx_leads_perdidos on public.leads(perdido_em) where etapa = 'perdido' and anonimizado_em is null;

create table if not exists public.lead_interactions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  lead_id uuid not null,
  tipo text not null check (tipo in ('ligacao', 'whatsapp', 'email', 'visita', 'nota')),
  nota text not null check (length(btrim(nota)) between 1 and 1000),
  ocorrida_em timestamptz not null default now(),
  registrado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (lead_id, school_id) references public.leads(id, school_id) on delete cascade
);
create index if not exists idx_lead_interactions_lead on public.lead_interactions(school_id, lead_id, ocorrida_em desc);

create table if not exists public.lead_visits (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  lead_id uuid not null,
  agendada_para timestamptz not null,
  status text not null default 'agendada' check (status in ('agendada', 'realizada', 'faltou', 'cancelada')),
  observacao text check (observacao is null or length(observacao) <= 500),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, school_id) references public.leads(id, school_id) on delete cascade
);
create index if not exists idx_lead_visits_agenda on public.lead_visits(school_id, agendada_para);
create index if not exists idx_lead_visits_lead on public.lead_visits(school_id, lead_id);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  lead_id uuid,
  student_id uuid references public.students(id) on delete cascade,
  turma text not null check (length(btrim(turma)) between 1 and 80),
  posicao integer not null check (posicao > 0),
  status text not null default 'aguardando' check (status in ('aguardando', 'chamada', 'desistiu', 'matriculada')),
  observacao text check (observacao is null or length(observacao) <= 300),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, school_id) references public.leads(id, school_id) on delete cascade,
  check ((lead_id is not null)::int + (student_id is not null)::int = 1),
  unique (school_id, turma, posicao)
);
-- Mesma pessoa não entra duas vezes na fila da mesma turma enquanto aguarda.
create unique index if not exists uq_waitlist_lead_ativo
  on public.waitlist(school_id, turma, lead_id) where status = 'aguardando' and lead_id is not null;
create unique index if not exists uq_waitlist_aluno_ativo
  on public.waitlist(school_id, turma, student_id) where status = 'aguardando' and student_id is not null;
create index if not exists idx_waitlist_lead on public.waitlist(school_id, lead_id);

alter table public.leads enable row level security;
alter table public.lead_interactions enable row level security;
alter table public.lead_visits enable row level security;
alter table public.waitlist enable row level security;

-- ═══ 2. Quem pode usar ═══
create or replace function public.captacao_pode_gerenciar()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select (s.features_enabled ->> 'captacao') = 'true'
                     from public.schools s
                    where s.id = public.get_my_school_id()), false)
     and coalesce(public.get_my_role(), '') in ('gestao', 'gestao_pedagogica');
$$;

revoke execute on function public.captacao_pode_gerenciar() from public, anon;
grant execute on function public.captacao_pode_gerenciar() to authenticated;

-- ═══ 3. Policies (sem insert para anon; sem update nem delete nas interações) ═══
create policy "Captacao le leads da escola" on public.leads
  for select using (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());
create policy "Captacao cadastra leads da escola" on public.leads
  for insert with check (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());
create policy "Captacao edita leads da escola" on public.leads
  for update using (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar())
  with check (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());
-- Direito do titular: só a Gestão apaga um lead de vez.
create policy "Captacao apaga leads da escola" on public.leads
  for delete using (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar()
                    and public.get_my_role() = 'gestao');

create policy "Captacao le interacoes da escola" on public.lead_interactions
  for select using (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());
create policy "Captacao registra interacoes da escola" on public.lead_interactions
  for insert with check (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());

create policy "Captacao le visitas da escola" on public.lead_visits
  for select using (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());
create policy "Captacao agenda visitas da escola" on public.lead_visits
  for insert with check (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());
create policy "Captacao edita visitas da escola" on public.lead_visits
  for update using (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar())
  with check (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());

create policy "Captacao le fila da escola" on public.waitlist
  for select using (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());
create policy "Captacao entra na fila da escola" on public.waitlist
  for insert with check (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());
create policy "Captacao edita fila da escola" on public.waitlist
  for update using (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar())
  with check (school_id = public.get_my_school_id() and public.captacao_pode_gerenciar());

-- ═══ 4. Guardas ═══
-- Sem sessão (service role: Edge Function pública e cron de LGPD) não barra.
create or replace function public.leads_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return new;
  end if;

  if new.responsavel_id is not null and not exists (
    select 1 from public.users u
     where u.id = new.responsavel_id and u.school_id = new.school_id
       and u.role in ('gestao', 'gestao_pedagogica', 'admin')
  ) then
    raise exception 'Responsável pelo lead deve ser da equipe da escola';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.anonimizado_em := null;
    if new.etapa = 'perdido' then
      if length(btrim(coalesce(new.motivo_perda, ''))) = 0 then
        raise exception 'Informe o motivo da perda';
      end if;
      new.perdido_em := now();
    end if;
    if new.etapa = 'matriculado' then new.convertido_em := now(); end if;
    return new;
  end if;

  if new.id <> old.id or new.school_id <> old.school_id then
    raise exception 'Identidade do lead não pode ser alterada';
  end if;
  if old.anonimizado_em is not null then
    raise exception 'Lead anonimizado não pode ser alterado';
  end if;
  new.anonimizado_em := null;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.consentimento_em := old.consentimento_em;
  new.updated_at := now();

  if new.etapa = 'perdido' then
    if length(btrim(coalesce(new.motivo_perda, ''))) = 0 then
      raise exception 'Informe o motivo da perda';
    end if;
    if old.etapa <> 'perdido' then new.perdido_em := now(); else new.perdido_em := old.perdido_em; end if;
  else
    new.perdido_em := null;
    new.motivo_perda := null;
  end if;
  if new.etapa = 'matriculado' then
    new.convertido_em := coalesce(old.convertido_em, now());
  else
    new.convertido_em := null;
  end if;
  return new;
end;
$$;
drop trigger if exists leads_guard on public.leads;
create trigger leads_guard before insert or update on public.leads
  for each row execute function public.leads_guard();

-- Interação é histórico: autor sempre quem registrou; só entra, não muda.
create or replace function public.lead_interactions_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    new.registrado_por := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists lead_interactions_guard on public.lead_interactions;
create trigger lead_interactions_guard before insert on public.lead_interactions
  for each row execute function public.lead_interactions_guard();

-- Visita: autor fixo; identidade imutável. Depois de gravada, move o lead de etapa:
-- visita agendada leva novo/contato para "visita_agendada"; realizada leva para "visitou".
create or replace function public.lead_visits_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.id <> old.id or new.school_id <> old.school_id or new.lead_id <> old.lead_id then
    raise exception 'Identidade da visita não pode ser alterada';
  end if;
  new.created_by := old.created_by;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists lead_visits_guard on public.lead_visits;
create trigger lead_visits_guard before insert or update on public.lead_visits
  for each row execute function public.lead_visits_guard();

create or replace function public.lead_visits_avanca_etapa()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status = 'agendada' then
    update public.leads set etapa = 'visita_agendada'
     where id = new.lead_id and school_id = new.school_id and etapa in ('novo', 'contato');
  elsif new.status = 'realizada' then
    update public.leads set etapa = 'visitou'
     where id = new.lead_id and school_id = new.school_id and etapa in ('novo', 'contato', 'visita_agendada');
  end if;
  return null;
end;
$$;
drop trigger if exists lead_visits_avanca_etapa on public.lead_visits;
create trigger lead_visits_avanca_etapa after insert or update of status on public.lead_visits
  for each row execute function public.lead_visits_avanca_etapa();

-- Fila: a posição é do banco (próximo número da turma, sob trava), nunca do cliente.
-- Aluno da fila tem que ser da mesma escola.
create or replace function public.waitlist_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.student_id is not null and not exists (
      select 1 from public.students st where st.id = new.student_id and st.school_id = new.school_id
    ) then
      raise exception 'Aluno não pertence a esta escola';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('waitlist:' || new.school_id::text || ':' || new.turma, 0));
    select coalesce(max(w.posicao), 0) + 1 into new.posicao
      from public.waitlist w where w.school_id = new.school_id and w.turma = new.turma;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.id <> old.id or new.school_id <> old.school_id or new.lead_id is distinct from old.lead_id
     or new.student_id is distinct from old.student_id or new.turma <> old.turma or new.posicao <> old.posicao then
    raise exception 'Lugar na fila não pode ser trocado; registre a saída e entre de novo';
  end if;
  new.created_by := old.created_by;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists waitlist_guard on public.waitlist;
create trigger waitlist_guard before insert or update on public.waitlist
  for each row execute function public.waitlist_guard();

-- ═══ 5. Relatório do funil (invoker: as policies acima valem) ═══
create or replace function public.captacao_funil(p_inicio date, p_fim date)
returns table (origem text, etapa text, total bigint)
language sql stable
set search_path to 'public'
as $$
  select l.origem, l.etapa, count(*)::bigint
    from public.leads l
   where l.school_id = public.get_my_school_id()
     and l.created_at >= p_inicio::timestamptz
     and l.created_at < (p_fim + 1)::timestamptz
   group by l.origem, l.etapa;
$$;
revoke execute on function public.captacao_funil(date, date) from public, anon;
grant execute on function public.captacao_funil(date, date) to authenticated;

-- ═══ 6. LGPD: anonimiza lead perdido há mais de 12 meses ═══
-- Roda pelo cron (cron_jobs_producao.sql) ou à mão. Mantém etapa, origem e datas para o
-- funil; apaga nome, contato, criança e o texto das interações.
create or replace function public.leads_anonimizar_perdidos()
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from public.leads
   where etapa = 'perdido' and anonimizado_em is null
     and perdido_em < now() - interval '12 months';

  if cardinality(v_ids) = 0 then return 0; end if;

  update public.lead_interactions set nota = 'Removida por retenção (LGPD)' where lead_id = any(v_ids);
  update public.lead_visits set observacao = null where lead_id = any(v_ids);
  update public.waitlist set observacao = null where lead_id = any(v_ids);
  update public.leads
     set responsavel_nome = 'Anonimizado', telefone = null, email = null, crianca_nome = null,
         crianca_nascimento = null, interesse = null, motivo_perda = coalesce(motivo_perda, 'Não informado'),
         anonimizado_em = now()
   where id = any(v_ids);
  return cardinality(v_ids);
end;
$$;
revoke execute on function public.leads_anonimizar_perdidos() from public, anon, authenticated;
grant execute on function public.leads_anonimizar_perdidos() to service_role;
