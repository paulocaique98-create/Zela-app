-- Portal da Gestão · módulos do PLANO_PORTAL_GESTAO.md (27/09/2026).
--
-- Seções:
--   1. Permissões configuráveis (base da lacuna 5.3): catálogo por papel +
--      ajuste por escola; has_permission() usada pelos módulos NOVOS.
--   2. Fornecedores e Despesas (contas a pagar).
--   3. Baixa manual de cobrança (formas de pagamento fora do Asaas).
--   4. Ano letivo e matrícula por ano (lacuna 5.1), de forma ADITIVA: o
--      aluno continua sendo a fonte da operação do dia a dia; a matrícula do
--      ano guarda o retrato por ano e é mantida por trigger.
--   5. Contratos (documento jurídico): modelos, contratos, aditivos e
--      assinatura eletrônica simples pelo app do responsável.
--   6. Leitura acadêmica e de integrações pela Gestão.
--   7. Segurança: exigir troca de senha das contas da escola.
--   8. Notificação às famílias pela Gestão (ver notify-families).

-- ═══ 1. Permissões ═══════════════════════════════════════════════════════
create table if not exists public.permission_catalog (
  permission text primary key,
  label text not null,
  area text not null,
  default_roles text[] not null default array[]::text[]
);

insert into public.permission_catalog (permission, label, area, default_roles) values
  ('despesas.ver', 'Ver despesas', 'Financeiro', array[]::text[]),
  ('despesas.gerenciar', 'Cadastrar e pagar despesas', 'Financeiro', array[]::text[]),
  ('fornecedores.gerenciar', 'Cadastrar fornecedores', 'Cadastros', array[]::text[]),
  ('financeiro.baixa_manual', 'Registrar pagamento recebido por fora do Asaas', 'Financeiro', array[]::text[]),
  ('contratos.ver', 'Ver contratos', 'Contratos', array['admin']),
  ('contratos.gerenciar', 'Gerar, enviar e cancelar contratos', 'Contratos', array[]::text[]),
  ('relatorios.financeiro.ver', 'Ver relatórios financeiros', 'Relatórios', array[]::text[])
on conflict (permission) do update set label = excluded.label, area = excluded.area;

create table if not exists public.school_role_permissions (
  school_id uuid not null references public.schools(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher')),
  permission text not null references public.permission_catalog(permission) on delete cascade,
  granted boolean not null,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (school_id, role, permission)
);

alter table public.permission_catalog enable row level security;
alter table public.school_role_permissions enable row level security;

create policy "Catalogo de permissoes visivel para a escola"
on public.permission_catalog for select to authenticated using (true);

create policy "Escola le os proprios ajustes de permissao"
on public.school_role_permissions for select
using (school_id = get_my_school_id() or get_my_role() = 'developer');

create policy "Gestao ajusta permissoes da escola"
on public.school_role_permissions for all
using (school_id = get_my_school_id() and get_my_role() = 'gestao')
with check (school_id = get_my_school_id() and get_my_role() = 'gestao');

-- Suporte e Gestão têm todas (a Gestão nunca se tranca pra fora); admin e
-- professor: ajuste da escola, senão o padrão do catálogo.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when coalesce(public.get_my_role(), '') in ('developer', 'gestao') then true
    when coalesce(public.get_my_role(), '') not in ('admin', 'teacher') then false
    else coalesce(
      (select srp.granted from public.school_role_permissions srp
        where srp.school_id = public.get_my_school_id()
          and srp.role = public.get_my_role()
          and srp.permission = p_permission),
      (select public.get_my_role() = any(pc.default_roles) from public.permission_catalog pc
        where pc.permission = p_permission),
      false)
  end;
$function$;

revoke execute on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

-- ═══ 2. Fornecedores e Despesas ══════════════════════════════════════════
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  document text,
  category text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_suppliers_school on public.suppliers(school_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  description text not null,
  category text not null,
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  paid_on date,
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado')),
  payment_method text,
  attachment_path text,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pago') = (paid_on is not null))
);
create index if not exists idx_expenses_school_due on public.expenses(school_id, due_date);

alter table public.suppliers enable row level security;
alter table public.expenses enable row level security;

create policy "Fornecedores visiveis pra quem gerencia ou ve despesas"
on public.suppliers for select
using (school_id = get_my_school_id() and (has_permission('fornecedores.gerenciar') or has_permission('despesas.ver')));
create policy "Fornecedores gerenciados com permissao"
on public.suppliers for all
using (school_id = get_my_school_id() and has_permission('fornecedores.gerenciar'))
with check (school_id = get_my_school_id() and has_permission('fornecedores.gerenciar'));

create policy "Despesas visiveis com permissao"
on public.expenses for select
using (school_id = get_my_school_id() and (has_permission('despesas.ver') or has_permission('despesas.gerenciar')));
create policy "Despesas gerenciadas com permissao"
on public.expenses for all
using (school_id = get_my_school_id() and has_permission('despesas.gerenciar'))
with check (school_id = get_my_school_id() and has_permission('despesas.gerenciar'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-attachments', 'expense-attachments', false, 15728640, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Anexos de despesas com permissao" on storage.objects;
create policy "Anexos de despesas com permissao"
on storage.objects for all
using (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = get_my_school_id()::text
       and (has_permission('despesas.gerenciar') or has_permission('despesas.ver') or has_permission('financeiro.baixa_manual')))
with check (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = get_my_school_id()::text
       and (has_permission('despesas.gerenciar') or has_permission('financeiro.baixa_manual')));

-- ═══ 3. Baixa manual ═════════════════════════════════════════════════════
alter table public.financial_charges drop constraint if exists financial_charges_payment_method_check;
alter table public.financial_charges add constraint financial_charges_payment_method_check
  check (payment_method = any (array['pix', 'boleto', 'credit_card', 'link', 'cash', 'transfer', 'other']));

-- ═══ 4. Ano letivo ═══════════════════════════════════════════════════════
create table if not exists public.school_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'aberto' check (status in ('aberto', 'encerrado')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (school_id, name),
  check (ends_on > starts_on)
);
create unique index if not exists uq_school_years_one_open on public.school_years(school_id) where status = 'aberto';

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  turma text,
  turno text,
  periodo text,
  contracted_hours numeric,
  enrollment_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_year_id, student_id)
);
create index if not exists idx_enrollments_school_year on public.enrollments(school_year_id);

alter table public.school_years enable row level security;
alter table public.enrollments enable row level security;

create policy "Escola le os anos letivos"
on public.school_years for select
using ((school_id = get_my_school_id() and can_read_gestao()) or get_my_role() = 'developer');
create policy "Escola le as matriculas por ano"
on public.enrollments for select
using ((school_id = get_my_school_id() and can_read_gestao()) or get_my_role() = 'developer');

-- Mantém o retrato do ano aberto sempre igual ao aluno (roda como dona:
-- quem altera o aluno não precisa de permissão na tabela de matrículas).
create or replace function public.sync_student_enrollment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_year_id uuid;
begin
  select id into v_year_id from school_years where school_id = new.school_id and status = 'aberto';
  if v_year_id is null then
    return new;
  end if;
  insert into enrollments (school_id, school_year_id, student_id, turma, turno, periodo, contracted_hours, enrollment_status)
  values (new.school_id, v_year_id, new.id, new.turma, new.turno, new.periodo, new.contracted_hours, new.enrollment_status)
  on conflict (school_year_id, student_id) do update set
    turma = excluded.turma, turno = excluded.turno, periodo = excluded.periodo,
    contracted_hours = excluded.contracted_hours, enrollment_status = excluded.enrollment_status,
    updated_at = now();
  return new;
end;
$function$;
revoke execute on function public.sync_student_enrollment() from public, anon, authenticated;

drop trigger if exists sync_student_enrollment_trigger on public.students;
create trigger sync_student_enrollment_trigger
after insert or update of turma, turno, periodo, contracted_hours, enrollment_status on public.students
for each row execute function public.sync_student_enrollment();

-- Virada de ano: encerra o ano aberto e abre o novo com os alunos ativos.
create or replace function public.open_school_year(p_name text, p_starts_on date, p_ends_on date)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := public.get_my_school_id();
  v_new_id uuid;
begin
  if coalesce(public.get_my_role(), '') not in ('gestao', 'developer') or v_school_id is null then
    raise exception 'Só a Gestão pode abrir um ano letivo.';
  end if;
  if coalesce(trim(p_name), '') = '' or p_starts_on is null or p_ends_on is null or p_ends_on <= p_starts_on then
    raise exception 'Informe o nome e um período válido para o ano letivo.';
  end if;

  update school_years set status = 'encerrado', closed_at = now()
  where school_id = v_school_id and status = 'aberto';

  insert into school_years (school_id, name, starts_on, ends_on, created_by)
  values (v_school_id, trim(p_name), p_starts_on, p_ends_on, auth.uid())
  returning id into v_new_id;

  insert into enrollments (school_id, school_year_id, student_id, turma, turno, periodo, contracted_hours, enrollment_status)
  select school_id, v_new_id, id, turma, turno, periodo, contracted_hours, enrollment_status
  from students
  where school_id = v_school_id and coalesce(enrollment_status, 'ativo') = 'ativo';

  insert into audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
  values (v_school_id, auth.uid(), 'open_school_year', 'school_year', v_new_id, jsonb_build_object('name', trim(p_name)));

  return v_new_id;
end;
$function$;
revoke execute on function public.open_school_year(text, date, date) from public, anon;
grant execute on function public.open_school_year(text, date, date) to authenticated;

-- Ano corrente para toda escola existente, com o retrato atual.
insert into public.school_years (school_id, name, starts_on, ends_on)
select id, extract(year from now())::text, date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date
from public.schools
on conflict (school_id, name) do nothing;

insert into public.enrollments (school_id, school_year_id, student_id, turma, turno, periodo, contracted_hours, enrollment_status)
select s.school_id, y.id, s.id, s.turma, s.turno, s.periodo, s.contracted_hours, s.enrollment_status
from public.students s join public.school_years y on y.school_id = s.school_id and y.status = 'aberto'
on conflict (school_year_id, student_id) do nothing;

-- ═══ 5. Contratos ════════════════════════════════════════════════════════
create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  kind text not null default 'contrato' check (kind in ('contrato', 'aditivo')),
  body text not null,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  template_id uuid references public.contract_templates(id) on delete set null,
  kind text not null default 'contrato' check (kind in ('contrato', 'aditivo')),
  parent_id uuid references public.contract_documents(id) on delete set null,
  school_year_id uuid references public.school_years(id) on delete set null,
  financial_contract_id uuid references public.financial_contracts(id) on delete set null,
  title text not null,
  body text not null,
  content_hash text not null default '',
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'assinado', 'cancelado')),
  sent_at timestamptz,
  signed_at timestamptz,
  signed_by uuid references public.users(id) on delete set null,
  signer_name text,
  signature_meta jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'contrato' or parent_id is not null)
);
create index if not exists idx_contract_documents_school on public.contract_documents(school_id, status);
create index if not exists idx_contract_documents_student on public.contract_documents(student_id);

-- Impressão digital do texto: o responsável assina exatamente o que viu.
-- Depois de enviado, o texto não muda mais (qualquer correção = novo
-- documento ou aditivo).
create or replace function public.contract_document_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' and old.status in ('enviado', 'assinado') and new.body is distinct from old.body then
    raise exception 'O texto de um contrato enviado ou assinado não pode ser alterado. Crie um aditivo.';
  end if;
  if tg_op = 'UPDATE' and old.status = 'assinado' and new.status not in ('assinado', 'cancelado') then
    raise exception 'Um contrato assinado não volta para rascunho ou enviado.';
  end if;
  new.content_hash := encode(extensions.digest(convert_to(new.body, 'UTF8'), 'sha256'), 'hex');
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists contract_document_guard_trigger on public.contract_documents;
create trigger contract_document_guard_trigger
before insert or update on public.contract_documents
for each row execute function public.contract_document_guard();

alter table public.contract_templates enable row level security;
alter table public.contract_documents enable row level security;

create policy "Modelos de contrato visiveis com permissao"
on public.contract_templates for select
using (school_id = get_my_school_id() and (has_permission('contratos.ver') or has_permission('contratos.gerenciar')));
create policy "Modelos de contrato gerenciados com permissao"
on public.contract_templates for all
using (school_id = get_my_school_id() and has_permission('contratos.gerenciar'))
with check (school_id = get_my_school_id() and has_permission('contratos.gerenciar'));

create policy "Contratos visiveis com permissao"
on public.contract_documents for select
using (school_id = get_my_school_id() and (has_permission('contratos.ver') or has_permission('contratos.gerenciar')));
create policy "Contratos gerenciados com permissao"
on public.contract_documents for all
using (school_id = get_my_school_id() and has_permission('contratos.gerenciar'))
with check (school_id = get_my_school_id() and has_permission('contratos.gerenciar'));

-- Responsável vê os contratos enviados/assinados dos próprios filhos.
create policy "Familia ve contratos dos filhos"
on public.contract_documents for select
using (
  get_my_role() = 'family'
  and status in ('enviado', 'assinado')
  and exists (select 1 from students s where s.id = contract_documents.student_id and (s.family_id = auth.uid() or is_guardian_of(s.id)))
);

-- Assinatura eletrônica simples: só um responsável do aluno, só contrato
-- enviado, e o hash do texto que a pessoa viu tem que bater com o gravado.
create or replace function public.sign_contract_document(p_document_id uuid, p_signer_name text, p_content_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doc record;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
begin
  if coalesce(public.get_my_role(), '') <> 'family' then
    raise exception 'Só o responsável pode assinar o contrato.';
  end if;
  select * into v_doc from contract_documents where id = p_document_id for update;
  if not found then
    raise exception 'Contrato não encontrado.';
  end if;
  if not exists (select 1 from students s where s.id = v_doc.student_id and (s.family_id = auth.uid() or public.is_guardian_of(s.id))) then
    raise exception 'Permissão negada.';
  end if;
  if v_doc.status <> 'enviado' then
    raise exception 'Este contrato não está disponível para assinatura.';
  end if;
  if coalesce(trim(p_signer_name), '') = '' then
    raise exception 'Digite seu nome completo para assinar.';
  end if;
  if p_content_hash is distinct from v_doc.content_hash then
    raise exception 'O texto do contrato mudou. Recarregue a página e leia novamente antes de assinar.';
  end if;

  update contract_documents set
    status = 'assinado',
    signed_at = now(),
    signed_by = auth.uid(),
    signer_name = trim(p_signer_name),
    signature_meta = jsonb_build_object(
      'ip', split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
      'user_agent', v_headers ->> 'user-agent',
      'content_hash', v_doc.content_hash,
      'metodo', 'assinatura eletrônica simples pelo app Zela'
    )
  where id = p_document_id;

  insert into audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
  values (v_doc.school_id, auth.uid(), 'sign_contract', 'contract_document', p_document_id, jsonb_build_object('title', v_doc.title));

  return jsonb_build_object('status', 'assinado');
end;
$function$;
revoke execute on function public.sign_contract_document(uuid, text, text) from public, anon;
grant execute on function public.sign_contract_document(uuid, text, text) to authenticated;

-- ═══ 6. Leitura acadêmica e de integrações pela Gestão ═══════════════════
create policy "Gestao le frequencia da escola" on public.class_attendance for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');
create policy "Gestao le registros pedagogicos da escola" on public.pedagogical_records for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');
create policy "Gestao le relatorios de mitigacao da escola" on public.mitigacao_reports for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');
create policy "Gestao le relatorios pedagogicos da escola" on public.reports for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');
create policy "Gestao le diario da escola" on public.diario_entries for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');
create policy "Gestao le materias da escola" on public.subjects for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');
create policy "Gestao le turmas normalizadas da escola" on public.classes for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');
create policy "Gestao le materias por turma da escola" on public.class_subjects for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');
create policy "Gestao le eventos de webhook da escola" on public.payment_webhook_events for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');
create policy "Gestao ve notificacoes da escola" on public.notifications for select
using (school_id = get_my_school_id() and get_my_role() = 'gestao');

-- ═══ 7. Segurança ════════════════════════════════════════════════════════
create or replace function public.require_password_change_school(p_roles text[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := public.get_my_school_id();
  v_count integer;
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode exigir a troca de senha.';
  end if;
  update users set must_change_password = true
  where school_id = v_school_id
    and role = any(coalesce(p_roles, array[]::text[]))
    and role in ('admin', 'teacher', 'family')
    and id <> auth.uid()
    and must_change_password = false;
  get diagnostics v_count = row_count;

  insert into audit_logs (school_id, actor_id, action, entity_type, details)
  values (v_school_id, auth.uid(), 'require_password_change', 'user', jsonb_build_object('roles', p_roles, 'contas', v_count));
  return v_count;
end;
$function$;
revoke execute on function public.require_password_change_school(text[]) from public, anon;
grant execute on function public.require_password_change_school(text[]) to authenticated;

-- Escola nova já nasce com o ano letivo corrente aberto.
create or replace function public.create_initial_school_year()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into school_years (school_id, name, starts_on, ends_on)
  values (new.id, extract(year from now())::text, date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date)
  on conflict (school_id, name) do nothing;
  return new;
end;
$function$;
revoke execute on function public.create_initial_school_year() from public, anon, authenticated;

drop trigger if exists create_initial_school_year_trigger on public.schools;
create trigger create_initial_school_year_trigger
after insert on public.schools
for each row execute function public.create_initial_school_year();


-- ═══ 9. Configuração de comunicação da escola ═════════════════════════════
-- Lembrete de cobrança antes do vencimento: antes era fixo (2 dias, todas as
-- escolas). Sem configuração, continua igual (ligado, 2 dias).
alter table public.schools add column if not exists communication_config jsonb not null default '{}'::jsonb;

CREATE OR REPLACE FUNCTION "public"."protect_school_pedagogical_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_primary_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role -- não restringido
  END IF;

  IF (NEW.pedagogical_method IS DISTINCT FROM OLD.pedagogical_method)
     OR (NEW.custom_config IS DISTINCT FROM OLD.custom_config)
     OR (NEW.is_active IS DISTINCT FROM OLD.is_active)
     OR (NEW.features_enabled IS DISTINCT FROM OLD.features_enabled)
     OR (NEW.limits IS DISTINCT FROM OLD.limits)
     OR (NEW.plan IS DISTINCT FROM OLD.plan) THEN
    IF public.get_my_role() IS DISTINCT FROM 'developer' THEN
      RAISE EXCEPTION 'Apenas o suporte (developer) pode alterar essas configurações da escola (método pedagógico, status, módulos contratados, limites ou plano).';
    END IF;
  END IF;

  IF ((NEW.turmas IS DISTINCT FROM OLD.turmas)
     OR (NEW.login_image_url IS DISTINCT FROM OLD.login_image_url)
     OR (NEW.billing_config IS DISTINCT FROM OLD.billing_config)
     OR (NEW.communication_config IS DISTINCT FROM OLD.communication_config))
     AND NOT public.can_manage_school_settings() THEN
    RAISE EXCEPTION 'Só a Gestão da escola (ou o suporte) pode gerenciar as turmas, a imagem de login, a configuração de cobrança ou a de comunicação.';
  END IF;

  RETURN NEW;
END;
$$;
