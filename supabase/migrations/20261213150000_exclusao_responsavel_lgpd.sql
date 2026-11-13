-- Exclusão de responsável com retenção legal (LGPD Art. 16, I, e Art. 7º, VI).
--
-- Regra: ao excluir um responsável (role 'family'), apaga-se tudo da família
-- (alunos, autorizados, biometria, ficha médica, 2º responsável sem vínculo
-- com outra família, arquivos). Ficam só os registros financeiros (contratos,
-- cobranças, acordos, notas), desligados das contas apagadas, mais UM registro
-- de retenção com a identificação mínima do devedor (nome, e-mail, CPF) pelo
-- prazo legal. Vencido o prazo, a identificação é anonimizada.
--
-- Antes desta migration, excluir um responsável com cobrança FALHAVA (FKs
-- sem ON DELETE) e apagar o aluno apagaria o contrato em cascata
-- (financial_contracts.student_id ON DELETE CASCADE).
--
-- PRAZO: 5 anos é o valor padrão, configurável por chamada. É proposta
-- técnica; o prazo definitivo depende de validação jurídica
-- (docs/juridico/LGPD_RETENCAO.md).

-- ═══ 1. Registro de retenção ═══════════════════════════════════════════════
create table if not exists public.lgpd_retention_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  former_user_id uuid not null,
  former_name text,
  former_email text,
  former_doc_number text,
  students jsonb not null default '[]'::jsonb,
  second_guardians jsonb not null default '[]'::jsonb,
  contract_ids uuid[] not null default '{}',
  charge_ids uuid[] not null default '{}',
  reason text,
  executed_by uuid,
  deleted_at timestamptz not null default now(),
  retain_until date not null,
  anonymized_at timestamptz
);
create index if not exists idx_lgpd_retention_school on public.lgpd_retention_records(school_id, retain_until);

alter table public.lgpd_retention_records enable row level security;

-- Só leitura, só Gestão e Financeiro da mesma escola. Escrita apenas pelas
-- funções abaixo (security definer): nenhuma policy de insert/update/delete.
create policy "Gestao e financeiro leem retencao da escola"
on public.lgpd_retention_records for select
using (school_id = get_my_school_id() and coalesce(get_my_role(), '') in ('gestao', 'financeiro'));

-- ═══ 2. Tabelas financeiras passam a sobreviver à exclusão da pessoa ═══════
-- Em toda tabela de retenção (financeiro, acordos, extrato, fiscal, bolsa
-- concedida), FKs para users/students viram ON DELETE SET NULL e as colunas
-- passam a aceitar NULL. O vínculo fica registrado em lgpd_retention_records.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname, c.confrelid::regclass as ref
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and c.confrelid in ('public.users'::regclass, 'public.students'::regclass)
      and t.relname ~ '^(financial_|debt_agreement|bank_statement|contract_documents|scholarship_grants|scholarship_applications|school_fiscal)'
  loop
    execute format('alter table %s alter column %I drop not null', r.tbl, r.attname);
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references %s(id) on delete set null',
                   r.tbl, r.conname, r.attname, r.ref);
    raise notice 'retenção: % .% -> % agora ON DELETE SET NULL', r.tbl, r.attname, r.ref;
  end loop;
end $$;

-- ═══ 3. Exclusão da família ════════════════════════════════════════════════
-- Atômica: qualquer erro desfaz tudo (nada é apagado pela metade). Só o
-- service_role executa; a Edge Function delete-user valida a Gestão e chama.
create or replace function public.lgpd_excluir_familia(
  p_user_id uuid,
  p_caller_id uuid,
  p_reason text default null,
  p_retention_years integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller record;
  v_target record;
  v_students uuid[];
  v_second_del uuid[];
  v_second_kept uuid[];
  v_uids uuid[];
  v_contracts uuid[];
  v_charges uuid[];
  v_rec uuid;
  v_paths jsonb;
  v_students_json jsonb;
  v_second_json jsonb;
  v_arr uuid[];
  v_n integer := 0;
  r record;
begin
  select id, role, school_id into v_caller from users where id = p_caller_id;
  if v_caller.id is null or v_caller.role not in ('gestao', 'developer') then
    raise exception 'Acesso negado: apenas a Gestão pode excluir uma família.';
  end if;

  select id, name, email, role, school_id, doc_number into v_target from users where id = p_user_id;
  if v_target.id is null then
    raise exception 'Responsável não encontrado.';
  end if;
  if v_target.role <> 'family' then
    raise exception 'Esta rotina só exclui contas de responsável (family).';
  end if;
  if v_caller.role <> 'developer' and v_caller.school_id is distinct from v_target.school_id then
    raise exception 'Acesso negado: o usuário não pertence à sua escola.';
  end if;
  if p_retention_years is null or p_retention_years < 1 or p_retention_years > 20 then
    raise exception 'Prazo de retenção inválido (1 a 20 anos).';
  end if;

  -- Alunos da família
  select coalesce(array_agg(id), '{}') into v_students
  from students where family_id = p_user_id and school_id = v_target.school_id;

  -- 2º responsável: só é apagado se TODOS os vínculos dele são com alunos
  -- desta família e ele não é titular de outra família. Caso contrário, só o
  -- vínculo some (junto com o aluno) e a Gestão é avisada.
  select coalesce(array_agg(distinct g.id), '{}') into v_second_del
  from student_guardians sg
  join users g on g.id = sg.guardian_id
  where sg.student_id = any(v_students)
    and g.id <> p_user_id
    and g.role = 'family'
    and g.school_id = v_target.school_id
    and not exists (select 1 from student_guardians o where o.guardian_id = g.id and o.student_id <> all(v_students))
    and not exists (select 1 from students s2 where s2.family_id = g.id);

  select coalesce(array_agg(distinct sg.guardian_id), '{}') into v_second_kept
  from student_guardians sg
  where sg.student_id = any(v_students)
    and sg.guardian_id <> p_user_id
    and sg.guardian_id <> all(v_second_del);

  v_uids := array[p_user_id] || v_second_del;

  -- Retenção: contratos e cobranças da família (antes de qualquer exclusão)
  select coalesce(array_agg(id), '{}') into v_contracts
  from financial_contracts
  where school_id = v_target.school_id
    and (financial_guardian_id = any(v_uids) or student_id = any(v_students));

  select coalesce(array_agg(id), '{}') into v_charges
  from financial_charges
  where school_id = v_target.school_id
    and (family_id = any(v_uids) or student_id = any(v_students) or contract_id = any(v_contracts));

  select coalesce(jsonb_agg(jsonb_build_object('name', name)), '[]'::jsonb) into v_students_json
  from students where id = any(v_students);

  select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'doc_number', g.doc_number)), '[]'::jsonb) into v_second_json
  from users g
  where g.id = any(v_second_del)
    and exists (select 1 from student_guardians sg where sg.guardian_id = g.id and sg.is_financial);

  insert into lgpd_retention_records (
    school_id, former_user_id, former_name, former_email, former_doc_number,
    students, second_guardians, contract_ids, charge_ids, reason, executed_by, retain_until
  ) values (
    v_target.school_id, v_target.id, v_target.name, v_target.email, v_target.doc_number,
    v_students_json, v_second_json, v_contracts, v_charges,
    nullif(trim(coalesce(p_reason, '')), ''), p_caller_id,
    (current_date + make_interval(years => p_retention_years))::date
  ) returning id into v_rec;

  -- Arquivos a remover do Storage (a Edge Function apaga; SQL não alcança)
  v_paths :=
    coalesce((select jsonb_agg(jsonb_build_object('bucket', 'person-photos', 'path', photo_storage_path))
              from authorized_persons where family_id = any(v_uids) and photo_storage_path is not null), '[]'::jsonb)
    || coalesce((select jsonb_agg(jsonb_build_object('bucket', 'student-documents', 'path', storage_path))
              from student_documents where student_id = any(v_students) and storage_path is not null), '[]'::jsonb);

  -- Resíduos sem FK: toda tabela com student_id/family_id que NÃO é de
  -- retenção nem de auditoria. (Tabelas com FK em cascata também passam aqui;
  -- apagar antes é inofensivo.)
  for r in
    select c.table_name::text as tbl, c.column_name::text as col
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name in ('student_id', 'family_id')
      and c.data_type = 'uuid'
      and c.table_name !~ '^(financial_|debt_agreement|bank_statement|contract_documents|scholarship_grants|scholarship_applications|school_fiscal)'
      and c.table_name not in ('audit_logs', 'account_deletion_requests', 'lgpd_retention_records', 'users', 'students')
  loop
    v_arr := case when r.col = 'student_id' then v_students else v_uids end;
    execute format('delete from public.%I where %I = any($1)', r.tbl, r.col) using v_arr;
  end loop;

  delete from students where id = any(v_students);
  delete from users where id = any(v_uids);
  get diagnostics v_n = row_count;

  insert into audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
  values (v_target.school_id, p_caller_id, 'lgpd_excluir_familia', 'user', p_user_id,
    jsonb_build_object(
      'retention_record_id', v_rec,
      'alunos_excluidos', coalesce(array_length(v_students, 1), 0),
      'usuarios_excluidos', v_n,
      'segundo_responsavel_mantido', coalesce(array_length(v_second_kept, 1), 0),
      'contratos_retidos', coalesce(array_length(v_contracts, 1), 0),
      'cobrancas_retidas', coalesce(array_length(v_charges, 1), 0)
    ));

  return jsonb_build_object(
    'retention_record_id', v_rec,
    'deleted_user_ids', to_jsonb(v_uids),
    'second_guardians_kept', to_jsonb(v_second_kept),
    'students_deleted', coalesce(array_length(v_students, 1), 0),
    'contracts_retained', coalesce(array_length(v_contracts, 1), 0),
    'charges_retained', coalesce(array_length(v_charges, 1), 0),
    'storage_paths', v_paths
  );
end;
$function$;
revoke execute on function public.lgpd_excluir_familia(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.lgpd_excluir_familia(uuid, uuid, text, integer) to service_role;

-- ═══ 4. Anonimização após o prazo (manual, por decisão do projeto) ═════════
create or replace function public.lgpd_anonimizar_retencoes_vencidas()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_school uuid;
  v_n integer;
begin
  select role, school_id into v_role, v_school from users where id = auth.uid();
  if v_role is null or v_role not in ('gestao', 'developer') then
    raise exception 'Acesso negado.';
  end if;

  update lgpd_retention_records
  set former_name = 'Titular anonimizado', former_email = null, former_doc_number = null,
      students = '[]'::jsonb, second_guardians = '[]'::jsonb, anonymized_at = now()
  where anonymized_at is null
    and retain_until < current_date
    and (v_role = 'developer' or school_id = v_school);
  get diagnostics v_n = row_count;

  if v_n > 0 and v_school is not null then
    insert into audit_logs (school_id, actor_id, action, entity_type, details)
    values (v_school, auth.uid(), 'lgpd_anonimizar_retencoes', 'lgpd_retention_records', jsonb_build_object('registros', v_n));
  end if;
  return v_n;
end;
$function$;
revoke execute on function public.lgpd_anonimizar_retencoes_vencidas() from public, anon;
grant execute on function public.lgpd_anonimizar_retencoes_vencidas() to authenticated;
