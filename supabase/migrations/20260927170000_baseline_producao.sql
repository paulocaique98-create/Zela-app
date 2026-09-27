-- Linha de base do banco (auditoria de 27/09/2026, item 9).
--
-- Retrato fiel da estrutura de produção gerado com `supabase db dump --linked`
-- em 27/09/2026, depois de todas as correções de segurança do dia. Substitui
-- as ~160 migrações antigas (movidas pra supabase/migrations_legado/, só pra
-- consulta), que tinham nomes fora do padrão do Supabase CLI e nunca foram
-- registradas no histórico (supabase_migrations.schema_migrations vazio).
--
-- A partir daqui: toda mudança nova vira um arquivo novo criado com
-- `npx supabase migration new <nome>` e aplicado com `npx supabase db push`.
--
-- Fora da linha de base de propósito:
--   - jobs do pg_cron: apontam pro endereço de produção (ver
--     supabase/cron_jobs_producao.sql, só referência);
--   - dados (inclusive segredos do Vault, contas, escolas).




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_apply_attendance_correction"("p_log_id" "uuid", "p_new_event_time" timestamp with time zone, "p_new_event_type" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_log record;
  v_original_type text;
  v_final_type text;
  v_is_today boolean;
  v_is_latest_today boolean;
  v_other_original_type_exists boolean;
BEGIN
  SELECT * INTO v_log FROM attendance_logs WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de presença não encontrado';
  END IF;

  v_original_type := v_log.event_type;
  v_final_type := COALESCE(p_new_event_type, v_log.event_type);

  UPDATE attendance_logs SET
    original_event_time = COALESCE(original_event_time, event_time),
    event_time = p_new_event_time,
    event_type = v_final_type,
    corrected = true,
    corrected_by = auth.uid(),
    corrected_at = now()
  WHERE id = p_log_id;

  v_is_today := (p_new_event_time AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF NOT v_is_today THEN
    RETURN;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM attendance_logs al
    WHERE al.student_id = v_log.student_id
      AND al.id <> p_log_id
      AND (al.event_time AT TIME ZONE 'America/Sao_Paulo')::date = (p_new_event_time AT TIME ZONE 'America/Sao_Paulo')::date
      AND al.event_time > p_new_event_time
  ) INTO v_is_latest_today;

  IF NOT v_is_latest_today THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM attendance_logs al
    WHERE al.student_id = v_log.student_id
      AND al.id <> p_log_id
      AND al.event_type = v_original_type
      AND (al.event_time AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ) INTO v_other_original_type_exists;

  IF v_final_type = 'entry' THEN
    UPDATE students SET
      today_entry_at = p_new_event_time,
      today_entry = (p_new_event_time AT TIME ZONE 'America/Sao_Paulo')::time,
      status = 'in_school',
      today_exit_at = CASE WHEN v_original_type <> v_final_type AND NOT v_other_original_type_exists THEN NULL ELSE today_exit_at END,
      today_exit = CASE WHEN v_original_type <> v_final_type AND NOT v_other_original_type_exists THEN NULL ELSE today_exit END
    WHERE id = v_log.student_id;
  ELSE
    UPDATE students SET
      today_exit_at = p_new_event_time,
      today_exit = (p_new_event_time AT TIME ZONE 'America/Sao_Paulo')::time,
      status = 'left',
      today_entry_at = CASE WHEN v_original_type <> v_final_type AND NOT v_other_original_type_exists THEN NULL ELSE today_entry_at END,
      today_entry = CASE WHEN v_original_type <> v_final_type AND NOT v_other_original_type_exists THEN NULL ELSE today_entry END
    WHERE id = v_log.student_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."_apply_attendance_correction"("p_log_id" "uuid", "p_new_event_time" timestamp with time zone, "p_new_event_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_apply_attendance_manual_entry"("p_school_id" "uuid", "p_student_id" "uuid", "p_event_type" "text", "p_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_log_id uuid;
  v_is_today boolean;
  v_is_latest_today boolean;
BEGIN
  INSERT INTO attendance_logs (
    school_id, student_id, event_type, event_time, recorded_by,
    corrected, correction_reason_code, correction_reason_detail,
    corrected_by, corrected_at
  ) VALUES (
    p_school_id, p_student_id, p_event_type, p_event_time, auth.uid(),
    true, p_reason_code, p_reason_detail,
    auth.uid(), now()
  )
  RETURNING id INTO v_log_id;

  v_is_today := (p_event_time AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF NOT v_is_today THEN
    RETURN v_log_id;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM attendance_logs al
    WHERE al.student_id = p_student_id
      AND al.id <> v_log_id
      AND (al.event_time AT TIME ZONE 'America/Sao_Paulo')::date = (p_event_time AT TIME ZONE 'America/Sao_Paulo')::date
      AND al.event_time > p_event_time
  ) INTO v_is_latest_today;

  IF NOT v_is_latest_today THEN
    RETURN v_log_id;
  END IF;

  IF p_event_type = 'entry' THEN
    UPDATE students SET
      today_entry_at = p_event_time,
      today_entry = (p_event_time AT TIME ZONE 'America/Sao_Paulo')::time,
      status = 'in_school'
    WHERE id = p_student_id;
  ELSE
    UPDATE students SET
      today_exit_at = p_event_time,
      today_exit = (p_event_time AT TIME ZONE 'America/Sao_Paulo')::time,
      status = 'left'
    WHERE id = p_student_id;
  END IF;

  RETURN v_log_id;
END;
$$;


ALTER FUNCTION "public"."_apply_attendance_manual_entry"("p_school_id" "uuid", "p_student_id" "uuid", "p_event_type" "text", "p_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_qr_hmac_key"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT '38ab11bd74a98bcb21c46f34d06f3c4350785f1f990264e4706bd7da65b7c89c'::text;
$$;


ALTER FUNCTION "public"."_qr_hmac_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_attendance_correction"("p_correction_id" "uuid", "p_approve" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_correction record;
  v_new_log_id uuid;
  v_role text := coalesce(public.get_my_role(), '');
begin
  if v_role not in ('developer', 'gestao') then
    raise exception 'Sem permissão para revisar correções de presença';
  end if;

  select * into v_correction from attendance_corrections where id = p_correction_id for update;
  if not found then
    raise exception 'Solicitação de correção não encontrada';
  end if;
  if v_role <> 'developer' and v_correction.school_id is distinct from public.get_my_school_id() then
    raise exception 'Solicitação não pertence à sua escola';
  end if;
  if v_correction.status <> 'pending' then
    raise exception 'Solicitação já foi % — nada a fazer', v_correction.status;
  end if;
  if v_correction.requested_by = auth.uid() then
    raise exception 'Quem solicitou a correção não pode aprovar a própria solicitação';
  end if;

  if p_approve then
    if v_correction.attendance_log_id is null then
      v_new_log_id := public._apply_attendance_manual_entry(
        v_correction.school_id, v_correction.student_id, v_correction.event_type,
        v_correction.new_event_time, v_correction.reason_code, v_correction.reason_detail
      );
      update attendance_corrections
      set attendance_log_id = v_new_log_id, status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_correction_id;
    else
      perform public._apply_attendance_correction(v_correction.attendance_log_id, v_correction.new_event_time, v_correction.new_event_type);
      update attendance_corrections
      set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_correction_id;
    end if;
  else
    update attendance_corrections
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_correction_id;
  end if;

  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;


ALTER FUNCTION "public"."approve_attendance_correction"("p_correction_id" "uuid", "p_approve" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_atualizacao_cadastral"("p_solicitacao_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_solicitacao record;
  v_resp jsonb;
  v_crianca jsonb;
  v_autorizado jsonb;
  v_student_id uuid;
  v_family_id uuid;
  v_max_order int;
  v_periodo text;
  v_entry time;
  v_exit time;
  v_updated_students uuid[] := array[]::uuid[];
begin
  select * into v_solicitacao from matricula_solicitacoes where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação não encontrada';
  end if;
  if v_solicitacao.status <> 'pending' then
    raise exception 'Solicitação já foi % — nada a fazer', v_solicitacao.status;
  end if;
  if v_solicitacao.tipo <> 'atualizacao_cadastral' then
    raise exception 'Esta função só aprova solicitações do tipo atualizacao_cadastral';
  end if;

  if not exists (
    select 1 from users
    where id = auth.uid()
    and (role = 'developer' or (role = 'gestao' and school_id = v_solicitacao.school_id))
  ) then
    raise exception 'Permissão negada';
  end if;

  v_family_id := v_solicitacao.family_id;
  v_resp := v_solicitacao.responsavel_financeiro;

  update users set
    profession = coalesce(profession, nullif(v_resp->>'profissao', '')),
    civil_status = coalesce(civil_status, nullif(v_resp->>'estado_civil', '')),
    doc_type = coalesce(doc_type, case when nullif(v_resp->>'cpf', '') is not null then 'CPF' else null end),
    doc_number = coalesce(doc_number, nullif(v_resp->>'cpf', '')),
    documents = case when documents is null or documents = '{}'::jsonb then
      jsonb_build_object('rg_expedicao', nullif(v_resp->>'rg_expedicao', ''), 'rg_orgao', nullif(v_resp->>'rg_orgao', ''))
      else documents end,
    street = coalesce(street, nullif(v_resp->>'rua', '')),
    number = coalesce(number, nullif(v_resp->>'numero', '')),
    complement = coalesce(complement, nullif(v_resp->>'complemento', '')),
    neighborhood = coalesce(neighborhood, nullif(v_resp->>'bairro', '')),
    city = coalesce(city, nullif(v_resp->>'cidade', '')),
    state = coalesce(state, nullif(v_resp->>'uf', '')),
    zip_code = coalesce(zip_code, nullif(v_resp->>'cep', ''))
  where id = v_family_id;

  for v_crianca in select * from jsonb_array_elements(coalesce(v_solicitacao.criancas, '[]'::jsonb))
  loop
    v_student_id := (v_crianca->>'student_id')::uuid;
    if v_student_id is null then continue; end if;

    v_periodo := v_crianca->>'periodo_normalizado';
    v_entry := case v_periodo
      when '07:00 às 13:00' then time '07:00'
      when '07:00 às 15:00' then time '07:00'
      when '07:00 às 17:00' then time '07:00'
      when '09:00 às 19:00' then time '09:00'
      when '11:00 às 19:00' then time '11:00'
      when '13:00 às 19:00' then time '13:00'
      else null
    end;
    v_exit := case v_periodo
      when '07:00 às 13:00' then time '13:00'
      when '07:00 às 15:00' then time '15:00'
      when '07:00 às 17:00' then time '17:00'
      when '09:00 às 19:00' then time '19:00'
      when '11:00 às 19:00' then time '19:00'
      when '13:00 às 19:00' then time '19:00'
      else null
    end;

    update students set
      cidade_nascimento = coalesce(cidade_nascimento, nullif(v_crianca->>'cidade_nascimento', '')),
      autorizacao_imagem = coalesce(autorizacao_imagem, case v_resp->>'autorizacao_imagem' when 'sim' then true when 'nao' then false else null end),
      autorizacao_emergencia_medica = coalesce(autorizacao_emergencia_medica, case v_resp->>'autorizacao_emergencia' when 'sim' then true when 'nao' then false else null end),
      periodo = coalesce(periodo, nullif(v_periodo, '')),
      turno = coalesce(turno, nullif(v_crianca->>'turno', '')),
      contracted_hours = coalesce(contracted_hours, nullif(v_crianca->>'ciclo_numero', '')::numeric),
      contracted_entry_time = coalesce(contracted_entry_time, v_entry),
      contracted_exit_time = coalesce(contracted_exit_time, v_exit)
    where id = v_student_id;

    if not exists (select 1 from fichas_medicas where student_id = v_student_id) then
      insert into fichas_medicas (
        school_id, student_id,
        tem_restricao_alimentar, restricoes_alimentares,
        tem_restricao_saude, restricoes_saude,
        consultou_especialista, especialistas,
        faz_tratamento, tratamentos,
        usa_medicamento, medicamentos,
        tem_habito_importante, habitos_importantes
      ) values (
        v_solicitacao.school_id, v_student_id,
        coalesce((v_crianca->'restricoes_alimentares')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'restricoes_alimentares', '[]'::jsonb))), array[]::text[]),
        coalesce((v_crianca->'restricoes_saude')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'restricoes_saude', '[]'::jsonb))), array[]::text[]),
        coalesce((v_crianca->'especialistas')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'especialistas', '[]'::jsonb))), array[]::text[]),
        coalesce((v_crianca->'tratamentos')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'tratamentos', '[]'::jsonb))), array[]::text[]),
        false, array[]::text[],
        coalesce((v_crianca->'habitos_importantes')::jsonb <> '[]'::jsonb, false),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_crianca->'habitos_importantes', '[]'::jsonb))), array[]::text[])
      );
    end if;

    v_updated_students := array_append(v_updated_students, v_student_id);
  end loop;

  v_max_order := coalesce((select max(emergency_order) from authorized_persons where family_id = v_family_id), 1);
  for v_autorizado in select * from jsonb_array_elements(coalesce(v_solicitacao.autorizados, '[]'::jsonb))
  loop
    if coalesce(v_autorizado->>'nome', '') = '' then continue; end if;
    if not exists (
      select 1 from authorized_persons
      where family_id = v_family_id
      and lower(unaccent(name)) = lower(unaccent(v_autorizado->>'nome'))
    ) then
      v_max_order := v_max_order + 1;
      begin
        insert into authorized_persons (family_id, school_id, name, relation, has_photo, emergency_order)
        values (v_family_id, v_solicitacao.school_id, v_autorizado->>'nome', coalesce(nullif(v_autorizado->>'parentesco', ''), 'Autorizado'), false, v_max_order);
      exception when sqlstate 'P0001' then
        exit;
      end;
    end if;
  end loop;

  update matricula_solicitacoes
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_solicitacao_id;

  return jsonb_build_object('updated_student_ids', to_jsonb(v_updated_students));
end;
$$;


ALTER FUNCTION "public"."approve_atualizacao_cadastral"("p_solicitacao_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_matricula"("p_solicitacao_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_solicitacao record;
  v_resp jsonb;
  v_crianca jsonb;
  v_autorizado jsonb;
  v_transporte jsonb;
  v_student_id uuid;
  v_existing_student_id uuid;
  v_new_student_ids uuid[] := ARRAY[]::uuid[];
  v_periodo text;
  v_entry time;
  v_exit time;
  v_autorizado_order int;
begin
  select * into v_solicitacao from matricula_solicitacoes where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação não encontrada';
  end if;
  if v_solicitacao.status <> 'pending' then
    raise exception 'Solicitação já foi % — nada a fazer', v_solicitacao.status;
  end if;

  v_resp := v_solicitacao.responsavel_financeiro;

  update users set
    status = 'active',
    phone = nullif(v_resp->>'telefone', ''),
    doc_type = case when v_resp->>'cpf' is not null and v_resp->>'cpf' <> '' then 'CPF' else null end,
    doc_number = nullif(v_resp->>'cpf', ''),
    profession = nullif(v_resp->>'profissao', ''),
    civil_status = nullif(v_resp->>'estado_civil', ''),
    documents = jsonb_build_object(
      'cpf_doc', v_resp->'cpf_doc',
      'rg_doc', v_resp->'rg_doc',
      'comprovante_residencia_doc', v_resp->'comprovante_residencia_doc',
      'plano_saude_doc', v_resp->'plano_saude_doc',
      'cartao_vacina_doc', v_resp->'cartao_vacina_doc',
      'rg_expedicao', v_resp->'rg_expedicao',
      'rg_orgao', v_resp->'rg_orgao'
    )
  where id = v_solicitacao.family_id;

  for v_crianca in select * from jsonb_array_elements(coalesce(v_solicitacao.criancas, '[]'::jsonb))
  loop
    v_periodo := v_crianca->>'periodo';
    v_entry := case v_periodo
      when '07:00 às 13:00' then time '07:00'
      when '07:00 às 15:00' then time '07:00'
      when '07:00 às 17:00' then time '07:00'
      when '09:00 às 19:00' then time '09:00'
      when '11:00 às 19:00' then time '11:00'
      when '13:00 às 19:00' then time '13:00'
      else null
    end;
    v_exit := case v_periodo
      when '07:00 às 13:00' then time '13:00'
      when '07:00 às 15:00' then time '15:00'
      when '07:00 às 17:00' then time '17:00'
      when '09:00 às 19:00' then time '19:00'
      when '11:00 às 19:00' then time '19:00'
      when '13:00 às 19:00' then time '19:00'
      else null
    end;

    -- Só reaproveita o student_id se ele realmente existir e for da mesma
    -- escola -- nunca confia cegamente num id vindo do payload.
    v_existing_student_id := null;
    if v_crianca->>'student_id' is not null then
      select id into v_existing_student_id
      from students
      where id = (v_crianca->>'student_id')::uuid
        and school_id = v_solicitacao.school_id;
    end if;

    if v_existing_student_id is not null then
      update students set
        name = v_crianca->>'nome',
        birth_date = nullif(v_crianca->>'nascimento', '')::date,
        contracted_hours = nullif(v_crianca->>'ciclo', '')::numeric,
        turno = nullif(v_crianca->>'turno', ''),
        periodo = nullif(v_periodo, ''),
        contracted_entry_time = v_entry,
        contracted_exit_time = v_exit,
        cidade_nascimento = nullif(v_crianca->>'cidade_nascimento', ''),
        autorizacao_imagem = case v_resp->>'autorizacao_imagem' when 'sim' then true when 'nao' then false else autorizacao_imagem end,
        autorizacao_emergencia_medica = case v_resp->>'autorizacao_emergencia' when 'sim' then true when 'nao' then false else autorizacao_emergencia_medica end
      where id = v_existing_student_id;

      v_student_id := v_existing_student_id;

      -- Garante que quem submeteu o pedido fique vinculado ao aluno --
      -- sem mexer em quem já é o responsável principal/financeiro.
      insert into student_guardians (student_id, guardian_id, school_id, is_primary, is_financial, relationship)
      values (v_student_id, v_solicitacao.family_id, v_solicitacao.school_id, false, false, 'Responsável')
      on conflict (student_id, guardian_id) do nothing;
    else
      insert into students (name, birth_date, contracted_hours, turno, periodo, contracted_entry_time, contracted_exit_time, family_id, school_id, status, cidade_nascimento, autorizacao_imagem, autorizacao_emergencia_medica)
      values (
        v_crianca->>'nome',
        nullif(v_crianca->>'nascimento', '')::date,
        nullif(v_crianca->>'ciclo', '')::numeric,
        nullif(v_crianca->>'turno', ''),
        nullif(v_periodo, ''),
        v_entry,
        v_exit,
        v_solicitacao.family_id,
        v_solicitacao.school_id,
        'idle',
        nullif(v_crianca->>'cidade_nascimento', ''),
        case v_resp->>'autorizacao_imagem' when 'sim' then true when 'nao' then false else null end,
        case v_resp->>'autorizacao_emergencia' when 'sim' then true when 'nao' then false else null end
      )
      returning id into v_student_id;

      v_new_student_ids := array_append(v_new_student_ids, v_student_id);

      insert into student_guardians (student_id, guardian_id, school_id, is_primary, is_financial, relationship)
      values (v_student_id, v_solicitacao.family_id, v_solicitacao.school_id, true, true, 'Responsável Financeiro');
    end if;
  end loop;

  v_autorizado_order := 2;
  for v_autorizado in select * from jsonb_array_elements(coalesce(v_solicitacao.autorizados, '[]'::jsonb))
  loop
    if coalesce(v_autorizado->>'nome', '') <> '' then
      insert into authorized_persons (family_id, school_id, name, relation, has_photo, emergency_order)
      values (v_solicitacao.family_id, v_solicitacao.school_id, v_autorizado->>'nome', coalesce(nullif(v_autorizado->>'parentesco', ''), 'Autorizado'), false, v_autorizado_order);
      v_autorizado_order := v_autorizado_order + 1;
    end if;
  end loop;

  for v_transporte in select * from jsonb_array_elements(coalesce(v_solicitacao.transporte_autorizados, '[]'::jsonb))
  loop
    if coalesce(v_transporte->>'nome', '') <> '' then
      insert into authorized_persons (family_id, school_id, name, relation, has_photo, emergency_order)
      values (v_solicitacao.family_id, v_solicitacao.school_id, v_transporte->>'nome', 'Transporte', false, v_autorizado_order);
      v_autorizado_order := v_autorizado_order + 1;
    end if;
  end loop;

  update matricula_solicitacoes
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null, updated_at = now()
  where id = p_solicitacao_id;

  return jsonb_build_object('new_student_ids', to_jsonb(v_new_student_ids));
end;
$$;


ALTER FUNCTION "public"."approve_matricula"("p_solicitacao_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_gestao"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.get_my_role() in ('admin', 'gestao');
$$;


ALTER FUNCTION "public"."can_read_gestao"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_write_gestao"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.get_my_role() = 'gestao';
$$;


ALTER FUNCTION "public"."can_write_gestao"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_kiosk_confirm_rate_limit"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.check_rate_limit('kiosk_confirm:' || public.get_my_school_id()::text, 60, 60);
END;
$$;


ALTER FUNCTION "public"."check_kiosk_confirm_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_kiosk_recognition_rate_limit"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.check_rate_limit('kiosk_recognition:' || public.get_my_school_id()::text, 40, 60);
END;
$$;


ALTER FUNCTION "public"."check_kiosk_recognition_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_pin_login_rate_limit"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.check_rate_limit('pin_login:' || public.get_my_school_id()::text, 5, 30);
END;
$$;


ALTER FUNCTION "public"."check_pin_login_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count int;
BEGIN
  -- Limpeza oportunista das tentativas antigas dessa mesma chave — mantém a
  -- tabela pequena sem precisar de um job de limpeza separado.
  DELETE FROM rate_limit_attempts
  WHERE key = p_key AND created_at < now() - (p_window_seconds || ' seconds')::interval;

  SELECT count(*) INTO v_count
  FROM rate_limit_attempts
  WHERE key = p_key AND created_at > now() - (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_attempts (key) VALUES (p_key);
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_must_change_password_on_password_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.users set must_change_password = false
    where id = new.id and must_change_password = true;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."clear_must_change_password_on_password_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_school_and_users"("target_school_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user record;
BEGIN
  IF public.get_my_role() != 'developer' THEN
    RAISE EXCEPTION 'Apenas o suporte (developer) pode excluir uma escola.';
  END IF;

  -- 1. Apaga todos os históricos e presenças
  DELETE FROM public.attendance_logs WHERE school_id = target_school_id;

  -- 2. Apaga todos os totens vinculados
  DELETE FROM public.kiosk_devices WHERE school_id = target_school_id;

  -- 3. Apaga as pessoas autorizadas, fotos e biometrias
  DELETE FROM public.authorized_persons WHERE school_id = target_school_id;

  -- 4. Apaga os alunos
  DELETE FROM public.students WHERE school_id = target_school_id;

  -- 5. Apaga as permissões e as contas de login de todos os usuários daquela escola
  FOR v_user IN SELECT id FROM public.users WHERE school_id = target_school_id LOOP
    DELETE FROM public.users WHERE id = v_user.id;
    DELETE FROM auth.users WHERE id = v_user.id;
  END LOOP;

  -- 6. Por fim, apaga o cadastro da própria escola
  DELETE FROM public.schools WHERE id = target_school_id;
END;
$$;


ALTER FUNCTION "public"."delete_school_and_users"("target_school_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_stale_attendance_marking"("p_student_id" "uuid", "p_event_type" "text", "p_reason_code" "text", "p_reason_detail" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_student record;
  v_original_time timestamptz;
  v_has_real_log boolean;
  v_correction_id uuid;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Só administradores podem remover marcações de presença';
  END IF;
  IF p_event_type NOT IN ('entry', 'exit') THEN
    RAISE EXCEPTION 'Tipo de evento inválido';
  END IF;
  IF COALESCE(p_reason_code, '') = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório';
  END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;
  IF v_student.school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'Aluno não pertence à sua escola';
  END IF;

  v_original_time := CASE WHEN p_event_type = 'entry' THEN v_student.today_entry_at ELSE v_student.today_exit_at END;
  IF v_original_time IS NULL THEN
    RAISE EXCEPTION 'Não há marcação de % hoje para remover', p_event_type;
  END IF;

  -- Trava de segurança: se já existe um log de verdade pra esse tipo hoje,
  -- isso não é uma marcação fantasma — é um registro real, que deve ser
  -- editado (horário/tipo) pelo fluxo normal de correção, nunca apagado.
  SELECT EXISTS (
    SELECT 1 FROM attendance_logs al
    WHERE al.student_id = p_student_id
      AND al.event_type = p_event_type
      AND (al.event_time AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ) INTO v_has_real_log;
  IF v_has_real_log THEN
    RAISE EXCEPTION 'Já existe um registro confirmado de % hoje — use a correção de horário/tipo, não a remoção', p_event_type;
  END IF;

  IF p_event_type = 'entry' THEN
    UPDATE students SET today_entry = NULL, today_entry_at = NULL WHERE id = p_student_id;
  ELSE
    UPDATE students SET today_exit = NULL, today_exit_at = NULL WHERE id = p_student_id;
  END IF;

  INSERT INTO attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, action_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) VALUES (
    v_student.school_id, NULL, p_student_id, p_event_type, 'delete',
    v_original_time, NULL, p_reason_code, p_reason_detail,
    0, false, auth.uid(), 'applied'
  )
  RETURNING id INTO v_correction_id;

  RETURN jsonb_build_object('correction_id', v_correction_id, 'status', 'applied');
END;
$$;


ALTER FUNCTION "public"."delete_stale_attendance_marking"("p_student_id" "uuid", "p_event_type" "text", "p_reason_code" "text", "p_reason_detail" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_authorized_persons_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_limits jsonb;
  v_max_geral int;
  v_max_transporte int;
  v_is_transporte boolean;
  v_has_segundo boolean;
  v_count int;
  v_max int;
begin
  -- Entrada do próprio responsável (self check-in) -- nunca é limitada.
  if new.relation ilike '%(Titular)%' then
    return new;
  end if;

  select coalesce(limits, '{}'::jsonb) into v_limits
  from public.schools where id = new.school_id;

  v_max_geral := coalesce((v_limits->>'autorizados_por_responsavel')::int, 2);
  v_max_transporte := coalesce((v_limits->>'autorizados_transporte')::int, 1);
  v_is_transporte := (new.relation = 'Transporte');

  -- 2º Responsável: outra conta (guardian_id diferente) vinculada a algum
  -- aluno do qual esta família (new.family_id) é titular OU guardian.
  select exists (
    select 1
    from public.student_guardians sg
    where sg.guardian_id <> new.family_id
      and sg.student_id in (
        select sg2.student_id from public.student_guardians sg2 where sg2.guardian_id = new.family_id
        union
        select s.id from public.students s where s.family_id = new.family_id
      )
  ) into v_has_segundo;

  if v_is_transporte then
    select count(*) into v_count
    from public.authorized_persons
    where family_id = new.family_id and relation = 'Transporte';

    if v_count >= v_max_transporte then
      raise exception 'Limite de % autorizado(s) de transporte escolar atingido.', v_max_transporte
        using errcode = 'P0001';
    end if;
  else
    v_max := v_max_geral * (case when v_has_segundo then 2 else 1 end);

    select count(*) into v_count
    from public.authorized_persons
    where family_id = new.family_id
      and relation is distinct from 'Transporte'
      and relation not ilike '%(Titular)%';

    if v_count >= v_max then
      raise exception 'Limite de % autorizados atingido.', v_max
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_authorized_persons_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_chat_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.check_rate_limit('chat_send:' || NEW.sender_id::text, 20, 60) THEN
    RAISE EXCEPTION 'Muitas mensagens enviadas em pouco tempo. Aguarde um instante.';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_chat_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_school_by_webhook_token"("p_gateway" "text", "p_token" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT sga.school_id
  FROM public.school_gateway_accounts sga
  JOIN vault.decrypted_secrets ds ON ds.id = sga.vault_secret_id
  WHERE sga.gateway = p_gateway AND ds.decrypted_secret = p_token
  LIMIT 1;
$$;


ALTER FUNCTION "public"."find_school_by_webhook_token"("p_gateway" "text", "p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_school_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  next_num INT;
  new_code TEXT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(school_code FROM 3) AS INT)), 0
  ) + 1
  INTO next_num
  FROM public.schools
  WHERE school_code LIKE 'ZL%';
  new_code := 'ZL' || LPAD(next_num::TEXT, 3, '0');
  RETURN new_code;
END;
$$;


ALTER FUNCTION "public"."generate_school_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_student_qr_token"("p_student_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_school_id uuid;
  v_new_token uuid;
  v_payload text;
  v_signature text;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem gerar QR de check-in.';
  END IF;

  SELECT school_id INTO v_school_id
  FROM public.students
  WHERE id = p_student_id;

  IF v_school_id IS NULL OR v_school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'Aluno não encontrado nesta escola.';
  END IF;

  v_new_token := gen_random_uuid();

  UPDATE public.students
  SET checkin_qr_token = v_new_token,
      checkin_qr_created_at = now(),
      checkin_qr_created_by = auth.uid()
  WHERE id = p_student_id;

  v_payload := v_school_id::text || '.' || v_new_token::text;
  v_signature := encode(hmac(v_payload::bytea, public._qr_hmac_key()::bytea, 'sha256'), 'hex');

  -- Formato "ZL1.<school_id>.<token>.<assinatura>" -- versão explícita no
  -- prefixo (ZL1) pra permitir trocar o formato/algoritmo no futuro sem
  -- quebrar QRs antigos já impressos (o validador decide pelo prefixo).
  RETURN 'ZL1.' || v_payload || '.' || v_signature;
END;
$$;


ALTER FUNCTION "public"."generate_student_qr_token"("p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_co_guardian_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT sg2.guardian_id
  FROM student_guardians sg1
  JOIN student_guardians sg2 ON sg2.student_id = sg1.student_id
  WHERE sg1.guardian_id = auth.uid()
  AND sg2.guardian_id != auth.uid();
$$;


ALTER FUNCTION "public"."get_co_guardian_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cron_secret"("p_name" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT ds.decrypted_secret
  FROM public.cron_secrets cs
  JOIN vault.decrypted_secrets ds ON ds.id = cs.vault_secret_id
  WHERE cs.name = p_name;
$$;


ALTER FUNCTION "public"."get_cron_secret"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_role"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_chat_visibilidade_total"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(chat_visibilidade_total, false) FROM users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_chat_visibilidade_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_departamento"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT departamento FROM users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_departamento"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from public.users
  where id = auth.uid() and coalesce(status, 'active') = 'active';
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_school_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT school_id FROM public.users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_school_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_teacher_status"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT teacher_status FROM users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_teacher_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_turmas"() RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT turmas FROM users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_turmas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_school_gateway_secret"("p_school_id" "uuid", "p_gateway" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT ds.decrypted_secret
  FROM public.school_gateway_accounts sga
  JOIN vault.decrypted_secrets ds ON ds.id = sga.vault_secret_id
  WHERE sga.school_id = p_school_id AND sga.gateway = p_gateway;
$$;


ALTER FUNCTION "public"."get_school_gateway_secret"("p_school_id" "uuid", "p_gateway" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_school_login_image"("p_school_code" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT login_image_url FROM public.schools WHERE school_code = upper(trim(p_school_code));
$$;


ALTER FUNCTION "public"."get_school_login_image"("p_school_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_segundo_responsavel"("p_student_ids" "uuid"[]) RETURNS TABLE("name" "text", "email" "text", "phone" "text", "doc_number" "text", "profession" "text", "civil_status" "text", "documents" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM student_guardians sg WHERE sg.student_id = ANY(p_student_ids) AND sg.guardian_id = auth.uid()
    UNION
    SELECT 1 FROM students s WHERE s.id = ANY(p_student_ids) AND s.family_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.name, u.email, u.phone, u.doc_number, u.profession, u.civil_status, u.documents
  FROM student_guardians sg
  JOIN users u ON u.id = sg.guardian_id
  WHERE sg.student_id = ANY(p_student_ids)
  AND sg.is_financial = false
  AND sg.guardian_id <> auth.uid()
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_segundo_responsavel"("p_student_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_guardians"("student_uuid" "uuid") RETURNS TABLE("guardian_id" "uuid", "relationship" "text", "is_financial" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT sg.guardian_id, sg.relationship, sg.is_financial
  FROM student_guardians sg
  WHERE sg.student_id = student_uuid
    AND (
      public.is_guardian_of(student_uuid)
      OR (
        public.get_my_role() IN ('admin', 'developer')
        AND EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.id = student_uuid AND s.school_id = public.get_my_school_id()
        )
      )
    );
$$;


ALTER FUNCTION "public"."get_student_guardians"("student_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_teacher_authorized_persons"() RETURNS TABLE("id" "uuid", "family_id" "uuid", "name" "text", "relation" "text", "has_photo" boolean, "photo_storage_path" "text", "status" "text", "emergency_order" integer, "temporary_until" "date", "has_biometrics" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select ap.id, ap.family_id, ap.name, ap.relation, ap.has_photo,
         ap.photo_storage_path, ap.status, ap.emergency_order,
         ap.temporary_until, (ap.face_descriptor is not null) as has_biometrics
  from authorized_persons ap
  where ap.school_id = public.get_my_school_id()
    and ap.family_id in (select public.teacher_visible_family_ids());
$$;


ALTER FUNCTION "public"."get_teacher_authorized_persons"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_turmas_by_school_code"("p_school_code" "text") RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT turmas FROM public.schools WHERE school_code = upper(trim(p_school_code));
$$;


ALTER FUNCTION "public"."get_turmas_by_school_code"("p_school_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_financial_guardian"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians
    WHERE guardian_id = auth.uid() AND is_financial = true
  );
$$;


ALTER FUNCTION "public"."is_financial_guardian"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_guardian_of"("student_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM student_guardians 
    WHERE student_id = student_uuid 
    AND guardian_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_guardian_of"("student_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_guardian_released"("p_guardian_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM students
    WHERE first_checkin_at IS NOT NULL
    AND (
      family_id = p_guardian_id
      OR id IN (SELECT student_id FROM student_guardians WHERE guardian_id = p_guardian_id)
    )
  );
$$;


ALTER FUNCTION "public"."is_guardian_released"("p_guardian_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_valid_billing_config"("p" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  allowed_keys text[] := ARRAY['early_checkin_tolerance_min', 'late_checkout_tolerance_min', 'hourly_rate_cents', 'charge_early_checkin'];
  k text;
BEGIN
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;

  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT (k = ANY(allowed_keys)) THEN RETURN false; END IF;
  END LOOP;

  IF p ? 'early_checkin_tolerance_min' AND (jsonb_typeof(p->'early_checkin_tolerance_min') <> 'number' OR (p->>'early_checkin_tolerance_min')::numeric < 0 OR (p->>'early_checkin_tolerance_min')::numeric > 60) THEN
    RETURN false;
  END IF;
  IF p ? 'late_checkout_tolerance_min' AND (jsonb_typeof(p->'late_checkout_tolerance_min') <> 'number' OR (p->>'late_checkout_tolerance_min')::numeric < 0 OR (p->>'late_checkout_tolerance_min')::numeric > 60) THEN
    RETURN false;
  END IF;
  IF p ? 'hourly_rate_cents' AND (jsonb_typeof(p->'hourly_rate_cents') <> 'number' OR (p->>'hourly_rate_cents')::numeric < 0 OR (p->>'hourly_rate_cents')::numeric > 100000) THEN
    RETURN false;
  END IF;
  IF p ? 'charge_early_checkin' AND jsonb_typeof(p->'charge_early_checkin') <> 'boolean' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."is_valid_billing_config"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_valid_weekly_schedule"("p" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
DECLARE
  k text;
  v jsonb;
  entry_str text;
  exit_str text;
BEGIN
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;

  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo') THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v) <> 'object' THEN
      RETURN false;
    END IF;
    entry_str := v->>'entry';
    exit_str := v->>'exit';
    IF entry_str IS NULL OR exit_str IS NULL THEN
      RETURN false;
    END IF;
    IF entry_str !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR exit_str !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RETURN false;
    END IF;
    IF entry_str::time >= exit_str::time THEN
      RETURN false; -- entrada tem que ser antes da saída
    END IF;
  END LOOP;

  RETURN true;
END;
$_$;


ALTER FUNCTION "public"."is_valid_weekly_schedule"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kiosk_request_access"("p_student_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_student record;
  v_new_status text;
  v_updated_students jsonb := '[]'::jsonb;
  v_now timestamp := now();
  v_time text := to_char(v_now, 'HH24:MI:SS');
  v_date_str text := to_char(v_now, 'YYYY-MM-DD');
  v_full_record text := v_date_str || '|' || v_time;
BEGIN
  FOR v_student IN SELECT * FROM students WHERE id = ANY(p_student_ids) FOR UPDATE LOOP
    IF v_student.status IN ('idle', 'left') OR v_student.status IS NULL THEN
      v_new_status := 'pending_entry';
      UPDATE students 
      SET status = v_new_status, today_entry = v_full_record, today_exit = NULL
      WHERE id = v_student.id;
    ELSIF v_student.status = 'in_school' THEN
      v_new_status := 'pending_exit';
      UPDATE students 
      SET status = v_new_status, today_exit = v_full_record
      WHERE id = v_student.id;
    ELSE
      -- Se já for pending_entry ou pending_exit (duplo scan, etc), ignora e preserva
      v_new_status := v_student.status;
    END IF;

    v_updated_students := v_updated_students || jsonb_build_object(
      'id', v_student.id,
      'status', v_new_status
    );
  END LOOP;
  RETURN v_updated_students;
END;
$$;


ALTER FUNCTION "public"."kiosk_request_access"("p_student_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_security_definer_grantees"("p_function_name" "text") RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT array_agg(DISTINCT grantee.rolname ORDER BY grantee.rolname)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(p.proacl) a
  JOIN pg_roles grantee ON grantee.oid = a.grantee
  WHERE n.nspname = 'public'
    AND p.proname = p_function_name
    AND a.privilege_type = 'EXECUTE';
$$;


ALTER FUNCTION "public"."list_security_definer_grantees"("p_function_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_cron_job_run"("p_job_name" "text", "p_status_code" integer, "p_detail" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  INSERT INTO public.cron_job_logs (job_name, status_code, success, detail)
  VALUES (p_job_name, p_status_code, p_status_code IS NOT NULL AND p_status_code BETWEEN 200 AND 299, p_detail);
$$;


ALTER FUNCTION "public"."log_cron_job_run"("p_job_name" "text", "p_status_code" integer, "p_detail" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_edge_function_error"("p_function_name" "text", "p_level" "text", "p_message" "text", "p_context" "jsonb", "p_school_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  INSERT INTO public.edge_function_logs (function_name, level, message, context, school_id)
  VALUES (p_function_name, COALESCE(p_level, 'error'), p_message, p_context, p_school_id);
$$;


ALTER FUNCTION "public"."log_edge_function_error"("p_function_name" "text", "p_level" "text", "p_message" "text", "p_context" "jsonb", "p_school_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_error"("p_source" "text", "p_category" "text", "p_message" "text", "p_severity" "text" DEFAULT 'error'::"text", "p_stack" "text" DEFAULT NULL::"text", "p_context" "jsonb" DEFAULT NULL::"jsonb", "p_school_id" "uuid" DEFAULT NULL::"uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_role" "text" DEFAULT NULL::"text", "p_url" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_screen" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_source text := lower(coalesce(p_source, ''));
  v_severity text := lower(coalesce(p_severity, 'error'));
  v_message text := left(coalesce(p_message, '(sem mensagem)'), 2000);
  v_stack text := left(p_stack, 8000);
  v_category text := left(coalesce(p_category, 'unknown'), 200);
  v_fingerprint text;
  v_id uuid;
BEGIN
  IF v_source NOT IN ('client', 'edge_function', 'cron', 'business', 'face_recognition') THEN
    v_source := 'client';
  END IF;
  IF v_severity NOT IN ('warn', 'error', 'critical') THEN
    v_severity := 'error';
  END IF;

  v_fingerprint := md5(v_source || '|' || v_category || '|' || left(v_message, 300));

  INSERT INTO public.error_logs (
    source, category, severity, message, stack, context,
    school_id, user_id, role, url, user_agent, screen, fingerprint
  )
  VALUES (
    v_source, v_category, v_severity, v_message, v_stack, p_context,
    p_school_id, p_user_id, p_role, p_url, p_user_agent, p_screen, v_fingerprint
  )
  ON CONFLICT (fingerprint) WHERE NOT resolved
  DO UPDATE SET
    occurrences = public.error_logs.occurrences + 1,
    last_seen_at = now(),
    context = COALESCE(EXCLUDED.context, public.error_logs.context),
    school_id = COALESCE(EXCLUDED.school_id, public.error_logs.school_id),
    screen = COALESCE(EXCLUDED.screen, public.error_logs.screen)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."log_error"("p_source" "text", "p_category" "text", "p_message" "text", "p_severity" "text", "p_stack" "text", "p_context" "jsonb", "p_school_id" "uuid", "p_user_id" "uuid", "p_role" "text", "p_url" "text", "p_user_agent" "text", "p_screen" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_critical_error_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_last_notified timestamptz;
BEGIN
  IF NEW.severity <> 'critical' THEN
    RETURN NEW;
  END IF;

  SELECT max(notified_at) INTO v_last_notified FROM public.error_logs WHERE notified_at IS NOT NULL;
  IF v_last_notified IS NOT NULL AND now() - v_last_notified < interval '10 minutes' THEN
    RETURN NEW; -- rate limitado: a linha é gravada normalmente, só não notifica
  END IF;

  NEW.notified_at := now();

  PERFORM net.http_post(
    url := 'https://orafqopnomdrvwlvxrkz.supabase.co/functions/v1/notify-critical-error',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_secret('notify_critical_error_auth_key')
    ),
    body := jsonb_build_object(
      'id', NEW.id, 'source', NEW.source, 'category', NEW.category,
      'message', NEW.message, 'school_id', NEW.school_id
    )
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_critical_error_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_admin_privilege_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_role text;
  v_caller_primary boolean;
begin
  -- auth.uid() é nulo em contexto de service_role (edge functions/scripts
  -- administrativos) e no trigger de troca de senha do Auth -- esses já
  -- passam por fora da RLS, então não há o que proteger aqui.
  if auth.uid() is null then
    return new;
  end if;

  -- role e school_id definem quem o usuário É e a QUE ESCOLA ele pertence —
  -- só o suporte (developer) pode alterar isso, nunca um admin de escola,
  -- nem mesmo o admin principal.
  if (new.role is distinct from old.role)
     or (new.school_id is distinct from old.school_id) then
    select role into v_caller_role from users where id = auth.uid();

    if v_caller_role is distinct from 'developer' then
      raise exception 'Apenas o suporte pode alterar o cargo ou a escola de um usuário';
    end if;
  end if;

  if (new.chat_visibilidade_total is distinct from old.chat_visibilidade_total)
     or (new.is_primary_admin is distinct from old.is_primary_admin) then
    select role, is_primary_admin into v_caller_role, v_caller_primary
    from users where id = auth.uid();

    if v_caller_role is distinct from 'developer' and not coalesce(v_caller_primary, false) then
      raise exception 'Apenas o admin principal da escola pode alterar essas permissões';
    end if;
  end if;

  -- Ninguém desliga a própria troca obrigatória de senha por conta própria;
  -- ela só desliga quando a senha é trocada de verdade.
  if old.must_change_password = true
     and new.must_change_password = false
     and new.id = auth.uid() then
    raise exception 'Defina uma nova senha para continuar';
  end if;

  -- Colunas que definem ACESSO: professor/família não alteram no próprio
  -- cadastro (a escola continua alterando normalmente).
  if new.id = auth.uid()
     and coalesce(public.get_my_role(), '') not in ('admin', 'gestao', 'developer')
     and (new.turmas is distinct from old.turmas
          or new.teacher_status is distinct from old.teacher_status
          or new.status is distinct from old.status
          or new.departamento is distinct from old.departamento) then
    raise exception 'Esses dados do seu cadastro só podem ser alterados pela escola.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_admin_privilege_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_financial_contract_admin_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role (Edge Functions) -- não restringido
  END IF;

  IF public.get_my_role() = 'admin' THEN
    IF NEW.status IS DISTINCT FROM 'cancelled'
       OR NEW.school_id IS DISTINCT FROM OLD.school_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.financial_guardian_id IS DISTINCT FROM OLD.financial_guardian_id
       OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
       OR NEW.base_monthly_amount_cents IS DISTINCT FROM OLD.base_monthly_amount_cents
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.first_due_date IS DISTINCT FROM OLD.first_due_date
       OR NEW.gateway IS DISTINCT FROM OLD.gateway
       OR NEW.gateway_subscription_id IS DISTINCT FROM OLD.gateway_subscription_id THEN
      RAISE EXCEPTION 'Admin só pode cancelar um contrato (status -> cancelled) -- nenhum outro campo pode ser alterado por aqui.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_financial_contract_admin_updates"() OWNER TO "postgres";


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

  IF (NEW.turmas IS DISTINCT FROM OLD.turmas)
     OR (NEW.login_image_url IS DISTINCT FROM OLD.login_image_url)
     OR (NEW.billing_config IS DISTINCT FROM OLD.billing_config) THEN
    IF public.get_my_role() = 'developer' THEN
      NULL; -- ok, developer sempre pode
    ELSIF public.get_my_role() = 'admin' THEN
      SELECT is_primary_admin INTO v_is_primary_admin FROM public.users WHERE id = auth.uid();
      IF v_is_primary_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Só o admin principal da escola pode gerenciar as turmas, a imagem de login ou a configuração de cobrança.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Só o admin principal da escola (ou o suporte) pode gerenciar as turmas, a imagem de login ou a configuração de cobrança.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_school_pedagogical_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_student_weekly_schedule"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_primary_admin boolean;
  v_changed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role -- não restringido
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.weekly_schedule IS DISTINCT FROM '{}'::jsonb;
  ELSE
    v_changed := NEW.weekly_schedule IS DISTINCT FROM OLD.weekly_schedule;
  END IF;

  IF v_changed THEN
    IF public.get_my_role() = 'developer' THEN
      NULL;
    ELSIF public.get_my_role() = 'admin' THEN
      SELECT is_primary_admin INTO v_is_primary_admin FROM public.users WHERE id = auth.uid();
      IF v_is_primary_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Só o admin principal da escola pode configurar horários personalizados por dia.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Só o admin principal da escola (ou o suporte) pode configurar horários personalizados por dia.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_student_weekly_schedule"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_school_turma"("p_old_name" "text", "p_new_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_school_id uuid;
  v_role text;
  v_is_primary_admin boolean;
  v_old text := trim(p_old_name);
  v_new text := trim(p_new_name);
  v_turmas text[];
  v_rows_updated int;
BEGIN
  v_school_id := public.get_my_school_id();
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem escola vinculada.';
  END IF;

  v_role := public.get_my_role();
  IF v_role = 'developer' THEN
    NULL;
  ELSIF v_role = 'admin' THEN
    SELECT is_primary_admin INTO v_is_primary_admin FROM public.users WHERE id = auth.uid();
    IF v_is_primary_admin IS NOT TRUE THEN
      RAISE EXCEPTION 'Só o admin principal da escola pode gerenciar as turmas.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Só o admin principal da escola (ou o suporte) pode gerenciar as turmas.';
  END IF;

  IF v_old = '' OR v_new = '' THEN
    RAISE EXCEPTION 'Nome de turma não pode ser vazio.';
  END IF;
  IF v_old = v_new THEN
    RAISE EXCEPTION 'O novo nome é igual ao atual.';
  END IF;

  SELECT turmas INTO v_turmas FROM public.schools WHERE id = v_school_id;
  v_turmas := COALESCE(v_turmas, ARRAY[]::text[]);

  IF NOT (v_old = ANY(v_turmas)) THEN
    RAISE EXCEPTION 'A turma "%" não existe na lista de turmas desta escola.', v_old;
  END IF;
  IF v_new = ANY(v_turmas) THEN
    RAISE EXCEPTION 'Já existe uma turma chamada "%".', v_new;
  END IF;

  -- Defesa extra: `classes` é alimentada por uso real (class_subjects/
  -- class_attendance), então pode ter um nome que nunca foi adicionado
  -- em schools.turmas (dado legado/órfão). Checa aqui pra devolver uma
  -- mensagem amigável em vez de deixar a UPDATE abaixo estourar
  -- unique_violation cru.
  IF EXISTS (SELECT 1 FROM public.classes WHERE school_id = v_school_id AND name = v_new) THEN
    RAISE EXCEPTION 'Já existe uma turma chamada "%" nos registros da escola.', v_new;
  END IF;

  -- Propagação -- `classes` primeiro (ver comentário no topo do arquivo
  -- sobre a ordem), depois todas as tabelas que referenciam turma por
  -- texto, e schools.turmas por último.
  UPDATE public.classes SET name = v_new WHERE school_id = v_school_id AND name = v_old;

  UPDATE public.students SET turma = v_new WHERE school_id = v_school_id AND turma = v_old;

  UPDATE public.users SET turmas = array_replace(turmas, v_old, v_new)
    WHERE school_id = v_school_id AND role = 'teacher' AND v_old = ANY(turmas);

  UPDATE public.mural_fotos SET turmas = array_replace(turmas, v_old, v_new)
    WHERE school_id = v_school_id AND v_old = ANY(turmas);

  UPDATE public.comunicados SET turmas = array_replace(turmas, v_old, v_new)
    WHERE school_id = v_school_id AND v_old = ANY(turmas);

  UPDATE public.class_subjects SET class_name = v_new WHERE school_id = v_school_id AND class_name = v_old;

  UPDATE public.class_attendance SET class_name = v_new WHERE school_id = v_school_id AND class_name = v_old;

  UPDATE public.schools SET turmas = array_replace(turmas, v_old, v_new) WHERE id = v_school_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Não foi possível renomear a turma -- escola não encontrada ou sem permissão.';
  END IF;

  RETURN jsonb_build_object('turmas', to_jsonb(array_replace(v_turmas, v_old, v_new)));
END;
$$;


ALTER FUNCTION "public"."rename_school_turma"("p_old_name" "text", "p_new_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_attendance_correction"("p_log_id" "uuid", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean, "p_new_event_type" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_log record;
  v_correction_id uuid;
  v_status text;
  v_role text := coalesce(public.get_my_role(), '');
begin
  if v_role not in ('admin', 'gestao') then
    raise exception 'Só administradores podem corrigir presença';
  end if;

  select * into v_log from attendance_logs where id = p_log_id;
  if not found then
    raise exception 'Registro de presença não encontrado';
  end if;
  if v_log.school_id is distinct from public.get_my_school_id() then
    raise exception 'Registro não pertence à sua escola';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo da correção é obrigatório';
  end if;
  if p_new_event_type is not null and p_new_event_type not in ('entry', 'exit') then
    raise exception 'Tipo de evento inválido';
  end if;
  if p_new_event_time is null then
    raise exception 'Informe o novo horário';
  end if;

  v_status := case when coalesce(p_increases_billing, true) then 'pending' else 'applied' end;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, new_event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) values (
    v_log.school_id, p_log_id, v_log.student_id, v_log.event_type, p_new_event_type,
    v_log.event_time, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, coalesce(p_increases_billing, true), auth.uid(), v_status
  )
  returning id into v_correction_id;

  if v_status = 'applied' then
    perform public._apply_attendance_correction(p_log_id, p_new_event_time, p_new_event_type);
  end if;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$$;


ALTER FUNCTION "public"."request_attendance_correction"("p_log_id" "uuid", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean, "p_new_event_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_attendance_manual_entry"("p_student_id" "uuid", "p_event_type" "text", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_student record;
  v_correction_id uuid;
  v_log_id uuid;
  v_status text;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' then
    raise exception 'Só administradores podem lançar presença manualmente';
  end if;
  if p_event_type is null or p_event_type not in ('entry', 'exit') then
    raise exception 'Tipo de evento inválido';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo é obrigatório';
  end if;
  if p_new_event_time is null then
    raise exception 'Informe o horário';
  end if;

  select * into v_student from students where id = p_student_id;
  if not found then
    raise exception 'Aluno não encontrado';
  end if;
  if v_student.school_id is distinct from public.get_my_school_id() then
    raise exception 'Aluno não pertence à sua escola';
  end if;

  v_status := case when coalesce(p_increases_billing, true) then 'pending' else 'applied' end;

  if v_status = 'applied' then
    v_log_id := public._apply_attendance_manual_entry(
      v_student.school_id, p_student_id, p_event_type, p_new_event_time,
      p_reason_code, p_reason_detail
    );
  end if;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) values (
    v_student.school_id, v_log_id, p_student_id, p_event_type,
    null, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, coalesce(p_increases_billing, true), auth.uid(), v_status
  )
  returning id into v_correction_id;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$$;


ALTER FUNCTION "public"."request_attendance_manual_entry"("p_student_id" "uuid", "p_event_type" "text", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_class_id_from_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_class_id uuid;
BEGIN
  IF NEW.class_name IS NULL OR NEW.class_name = '' THEN
    NEW.class_id := NULL;
    RETURN NEW;
  END IF;

  SELECT id INTO v_class_id FROM public.classes WHERE school_id = NEW.school_id AND name = NEW.class_name;
  IF v_class_id IS NULL THEN
    INSERT INTO public.classes (school_id, name) VALUES (NEW.school_id, NEW.class_name)
      ON CONFLICT (school_id, name) DO UPDATE SET name = EXCLUDED.name -- no-op, só pra devolver o id em corrida concorrente
      RETURNING id INTO v_class_id;
  END IF;

  NEW.class_id := v_class_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."resolve_class_id_from_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restrict_family_student_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_checkin_columns text[] := array[
    'status', 'today_entry', 'today_exit', 'today_entry_at', 'today_exit_at', 'pending_requester_id'
  ];
  v_role text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  select role into v_role from public.users where id = auth.uid();
  if v_role in ('admin', 'gestao', 'developer') then
    return new;
  end if;
  if (to_jsonb(new) - v_checkin_columns) is distinct from (to_jsonb(old) - v_checkin_columns) then
    raise exception 'A família só pode registrar entrada e saída; os demais dados do aluno são alterados pela escola.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."restrict_family_student_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_audit_log_actor_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.actor_name is null and new.actor_id is not null then
    select name into new.actor_name from users where id = new.actor_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_audit_log_actor_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_cron_secret"("p_name" "text", "p_secret" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_existing_vault_id uuid;
BEGIN
  SELECT vault_secret_id INTO v_existing_vault_id FROM public.cron_secrets WHERE name = p_name;
  IF v_existing_vault_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_existing_vault_id;
    UPDATE public.cron_secrets
    SET vault_secret_id = vault.create_secret(p_secret, p_name || ':' || gen_random_uuid()::text, 'Segredo de cron: ' || p_name),
        updated_at = now()
    WHERE name = p_name;
  ELSE
    INSERT INTO public.cron_secrets (name, vault_secret_id)
    VALUES (p_name, vault.create_secret(p_secret, p_name || ':' || gen_random_uuid()::text, 'Segredo de cron: ' || p_name));
  END IF;
END;
$$;


ALTER FUNCTION "public"."set_cron_secret"("p_name" "text", "p_secret" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_school_gateway_secret"("p_school_id" "uuid", "p_gateway" "text", "p_secret" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_existing_vault_id uuid;
  v_secret_name text;
BEGIN
  v_secret_name := 'gateway_key:' || p_gateway || ':' || p_school_id::text;

  SELECT vault_secret_id INTO v_existing_vault_id
  FROM public.school_gateway_accounts
  WHERE school_id = p_school_id AND gateway = p_gateway;

  IF v_existing_vault_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_vault_id, p_secret);
    UPDATE public.school_gateway_accounts
    SET updated_at = now()
    WHERE school_id = p_school_id AND gateway = p_gateway;
  ELSE
    INSERT INTO public.school_gateway_accounts (school_id, gateway, vault_secret_id)
    VALUES (p_school_id, p_gateway, vault.create_secret(p_secret, v_secret_name, 'Chave API do gateway ' || p_gateway || ' — escola ' || p_school_id::text));
  END IF;
END;
$$;


ALTER FUNCTION "public"."set_school_gateway_secret"("p_school_id" "uuid", "p_gateway" "text", "p_secret" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."teacher_can_see_authorized_person"("p_person_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from authorized_persons ap
    where ap.id::text = p_person_id
      and ap.school_id = public.get_my_school_id()
      and ap.family_id in (select public.teacher_visible_family_ids())
  );
$$;


ALTER FUNCTION "public"."teacher_can_see_authorized_person"("p_person_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."teacher_visible_family_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select s.family_id
  from students s
  where coalesce(public.get_my_role(), '') = 'teacher'
    and public.get_my_teacher_status() = 'ativo'
    and s.turma = any(public.get_my_turmas())
    and s.school_id = public.get_my_school_id()
    and s.family_id is not null
  union
  select sg.guardian_id
  from student_guardians sg
  join students s on s.id = sg.student_id
  where coalesce(public.get_my_role(), '') = 'teacher'
    and public.get_my_teacher_status() = 'ativo'
    and s.turma = any(public.get_my_turmas())
    and s.school_id = public.get_my_school_id();
$$;


ALTER FUNCTION "public"."teacher_visible_family_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_chat_thread"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE chat_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_chat_thread"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_class_attendance_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_class_attendance_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_subjects_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_subjects_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_student_class"("p_student_id" "uuid", "p_new_turma" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_school_id uuid;
  v_old_turma text;
begin
  select school_id, turma into v_school_id, v_old_turma from public.students where id = p_student_id;
  if v_school_id is null then raise exception 'Aluno não encontrado.'; end if;
  if not (public.get_my_role() = 'developer' or (public.get_my_role() in ('admin', 'gestao') and public.get_my_school_id() = v_school_id)) then
    raise exception 'Permissão negada.';
  end if;
  if p_new_turma is null or trim(p_new_turma) = '' then raise exception 'Informe a turma de destino.'; end if;
  if p_new_turma = v_old_turma then raise exception 'O aluno já está nesta turma.'; end if;

  update public.students set turma = p_new_turma where id = p_student_id;

  insert into public.student_transfers (school_id, student_id, from_class_name, to_class_name, reason, transferred_by)
  values (v_school_id, p_student_id, v_old_turma, p_new_turma, nullif(trim(coalesce(p_reason, '')), ''), auth.uid());
end;
$$;


ALTER FUNCTION "public"."transfer_student_class"("p_student_id" "uuid", "p_new_turma" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_student_to_external_school"("p_student_id" "uuid", "p_destination_school_name" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_school_id uuid;
  v_turma text;
  v_role text := coalesce(public.get_my_role(), '');
begin
  if v_role not in ('developer', 'gestao') then
    raise exception 'Permissão negada.';
  end if;
  select school_id, turma into v_school_id, v_turma from public.students where id = p_student_id;
  if v_school_id is null then raise exception 'Aluno não encontrado.'; end if;
  if v_role <> 'developer' and v_school_id is distinct from public.get_my_school_id() then
    raise exception 'Permissão negada.';
  end if;
  if p_destination_school_name is null or trim(p_destination_school_name) = '' then
    raise exception 'Informe o nome da escola de destino.';
  end if;

  update public.students set enrollment_status = 'transferido' where id = p_student_id;

  insert into public.student_transfers (school_id, student_id, from_class_name, to_class_name, transfer_type, destination_school_name, reason, transferred_by)
  values (v_school_id, p_student_id, v_turma, null, 'saida_externa', trim(p_destination_school_name), nullif(trim(coalesce(p_reason, '')), ''), auth.uid());
end;
$$;


ALTER FUNCTION "public"."transfer_student_to_external_school"("p_student_id" "uuid", "p_destination_school_name" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_school_turmas"("p_turmas" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_school_id uuid;
  v_old_turmas text[];
  v_new_turmas text[];
  v_removed text;
  v_usage jsonb;
  v_count int;
  v_role text;
  v_is_primary_admin boolean;
  v_rows_updated int;
BEGIN
  v_school_id := public.get_my_school_id();
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem escola vinculada.';
  END IF;

  -- Checagem explícita de permissão -- não basta confiar só na RLS/trigger
  -- de schools: pra role sem policy de UPDATE (teacher, family), o UPDATE
  -- abaixo afetaria 0 linhas SILENCIOSAMENTE (sem erro nenhum), e a função
  -- devolveria sucesso mesmo sem ter gravado nada. Acontece só com essa
  -- checagem aqui que teacher/family recebem o erro de verdade.
  v_role := public.get_my_role();
  IF v_role = 'developer' THEN
    NULL; -- ok
  ELSIF v_role = 'admin' THEN
    SELECT is_primary_admin INTO v_is_primary_admin FROM public.users WHERE id = auth.uid();
    IF v_is_primary_admin IS NOT TRUE THEN
      RAISE EXCEPTION 'Só o admin principal da escola pode gerenciar as turmas.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Só o admin principal da escola (ou o suporte) pode gerenciar as turmas.';
  END IF;

  -- Normaliza: apara espaços, remove vazios, remove duplicatas mantendo
  -- a primeira ocorrência (ordem importa pra exibição na tela).
  SELECT array_agg(t ORDER BY min_ord) INTO v_new_turmas
  FROM (
    SELECT trim(t) AS t, min(ord) AS min_ord
    FROM unnest(p_turmas) WITH ORDINALITY AS u(t, ord)
    WHERE trim(t) <> ''
    GROUP BY trim(t)
  ) dedup;
  v_new_turmas := COALESCE(v_new_turmas, ARRAY[]::text[]);

  SELECT turmas INTO v_old_turmas FROM public.schools WHERE id = v_school_id;
  v_old_turmas := COALESCE(v_old_turmas, ARRAY[]::text[]);

  -- Turmas que existiam e não estão mais na lista nova (removidas ou
  -- renomeadas -- do ponto de vista de validação de uso, é o mesmo caso:
  -- o texto antigo deixaria de existir na lista oficial da escola).
  FOR v_removed IN SELECT unnest(v_old_turmas) EXCEPT SELECT unnest(v_new_turmas)
  LOOP
    v_usage := '[]'::jsonb;

    SELECT count(*) INTO v_count FROM public.students WHERE school_id = v_school_id AND turma = v_removed;
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Alunos', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.users WHERE school_id = v_school_id AND role = 'teacher' AND v_removed = ANY(turmas);
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Professores', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.mural_fotos WHERE school_id = v_school_id AND v_removed = ANY(turmas);
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Mural de fotos', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.comunicados WHERE school_id = v_school_id AND v_removed = ANY(turmas);
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Comunicados', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.class_subjects WHERE school_id = v_school_id AND class_name = v_removed;
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Matérias', 'quantidade', v_count); END IF;

    SELECT count(*) INTO v_count FROM public.class_attendance WHERE school_id = v_school_id AND class_name = v_removed;
    IF v_count > 0 THEN v_usage := v_usage || jsonb_build_object('tabela', 'Frequência', 'quantidade', v_count); END IF;

    IF jsonb_array_length(v_usage) > 0 THEN
      RAISE EXCEPTION 'A turma "%" não pode ser removida ou renomeada: ainda está em uso (%).', v_removed, v_usage
        USING ERRCODE = 'raise_exception';
    END IF;
  END LOOP;

  UPDATE public.schools SET turmas = v_new_turmas WHERE id = v_school_id;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Não foi possível salvar as turmas -- escola não encontrada ou sem permissão.';
  END IF;

  RETURN jsonb_build_object('turmas', to_jsonb(v_new_turmas));
END;
$$;


ALTER FUNCTION "public"."update_school_turmas"("p_turmas" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_checkin_qr"("p_payload" "text") RETURNS TABLE("student_id" "uuid", "student_name" "text", "student_school_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_parts text[];
  v_school_id uuid;
  v_token uuid;
  v_signature text;
  v_expected_signature text;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Apenas o totem administrativo pode validar QR de check-in.';
  END IF;

  v_parts := string_to_array(p_payload, '.');

  IF array_length(v_parts, 1) <> 4 OR v_parts[1] <> 'ZL1' THEN
    RAISE EXCEPTION 'QR Code inválido.';
  END IF;

  v_school_id := v_parts[2]::uuid;
  v_token := v_parts[3]::uuid;
  v_signature := v_parts[4];

  v_expected_signature := encode(
    hmac((v_parts[2] || '.' || v_parts[3])::bytea, public._qr_hmac_key()::bytea, 'sha256'),
    'hex'
  );

  IF v_signature <> v_expected_signature THEN
    RAISE EXCEPTION 'QR Code inválido ou adulterado.';
  END IF;

  IF v_school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'QR Code não pertence a esta escola.';
  END IF;

  RETURN QUERY
  SELECT s.id, s.name, s.school_id
  FROM public.students s
  WHERE s.checkin_qr_token = v_token
    AND s.school_id = v_school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR Code não encontrado nesta escola.';
  END IF;
END;
$$;


ALTER FUNCTION "public"."verify_checkin_qr"("p_payload" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."attendance_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "attendance_log_id" "uuid",
    "student_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "original_event_time" timestamp with time zone,
    "new_event_time" timestamp with time zone,
    "reason_code" "text" NOT NULL,
    "reason_detail" "text",
    "minutes_delta" integer DEFAULT 0 NOT NULL,
    "increases_billing" boolean DEFAULT false NOT NULL,
    "requested_by" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "new_event_type" "text",
    "action_type" "text" DEFAULT 'edit'::"text" NOT NULL,
    CONSTRAINT "attendance_corrections_action_type_check" CHECK (("action_type" = ANY (ARRAY['edit'::"text", 'delete'::"text"]))),
    CONSTRAINT "attendance_corrections_event_type_check" CHECK (("event_type" = ANY (ARRAY['entry'::"text", 'exit'::"text"]))),
    CONSTRAINT "attendance_corrections_new_event_type_check" CHECK (("new_event_type" = ANY (ARRAY['entry'::"text", 'exit'::"text"]))),
    CONSTRAINT "attendance_corrections_status_check" CHECK (("status" = ANY (ARRAY['applied'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."attendance_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "family_id" "uuid",
    "school_id" "uuid",
    "event_type" "text",
    "event_time" timestamp with time zone DEFAULT "now"(),
    "recorded_by" "uuid",
    "original_event_time" timestamp with time zone,
    "corrected" boolean DEFAULT false NOT NULL,
    "correction_reason_code" "text",
    "correction_reason_detail" "text",
    "corrected_by" "uuid",
    "corrected_at" timestamp with time zone,
    "performed_by_name" "text",
    CONSTRAINT "attendance_logs_event_type_check" CHECK (("event_type" = ANY (ARRAY['entry'::"text", 'exit'::"text"])))
);


ALTER TABLE "public"."attendance_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_name" "text"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."aulas_especiais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "frequencia" "text" NOT NULL,
    "dias_semana" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "ocorrencias_mes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "aulas_especiais_categoria_check" CHECK (("categoria" = ANY (ARRAY['geral'::"text", 'integral'::"text"]))),
    CONSTRAINT "aulas_especiais_frequencia_check" CHECK (("frequencia" = ANY (ARRAY['semanal'::"text", 'mensal'::"text"])))
);


ALTER TABLE "public"."aulas_especiais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_nonces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nonce" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."auth_nonces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."authorized_persons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid",
    "name" "text" NOT NULL,
    "relation" "text" NOT NULL,
    "has_photo" boolean DEFAULT false,
    "status" "text" DEFAULT 'pending'::"text",
    "emergency_order" integer,
    "temporary_until" "date",
    "photo_url" "text",
    "school_id" "uuid",
    "face_descriptor" "text",
    "biometric_consent_at" timestamp with time zone,
    "photo_storage_path" "text",
    "face_descriptor_v2" "text",
    "face_descriptor_v2_status" "text",
    CONSTRAINT "check_authorized_persons_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."authorized_persons" OWNER TO "postgres";


COMMENT ON COLUMN "public"."authorized_persons"."status" IS 'Status de aprovação da pessoa autorizada (ex: approved, pending, blocked)';



COMMENT ON COLUMN "public"."authorized_persons"."photo_storage_path" IS 'Path no bucket person-photos (formato {school_id}/{id}.jpg). Quando preenchido, tem prioridade sobre photo_url (legado, base64) na hora de exibir a foto.';



COMMENT ON COLUMN "public"."authorized_persons"."face_descriptor_v2" IS 'Descritor facial gerado pelo @vladmandic/human (1024 dimensões) — em teste, não usado pelo reconhecimento em produção ainda. Fase B do plano de migração de biblioteca.';



COMMENT ON COLUMN "public"."authorized_persons"."face_descriptor_v2_status" IS 'PENDING | GENERATED | FAILED_NO_FACE | FAILED_LOW_QUALITY | FAILED_ERROR';



CREATE TABLE IF NOT EXISTS "public"."cardapio_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cardapio_id" "uuid" NOT NULL,
    "event_date" "date" NOT NULL,
    "refeicao" "text" NOT NULL,
    "descricao" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."cardapio_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cardapios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "ativacao_date" "date",
    "desativacao_date" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cardapios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "sender_role" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "family_id" "uuid" NOT NULL,
    "setor" "text" NOT NULL,
    "family_last_read_at" timestamp with time zone,
    "staff_last_read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_threads_setor_check" CHECK (("setor" = ANY (ARRAY['administrativo'::"text", 'diretoria_pedagogica'::"text", 'coordenacao'::"text", 'recepcao'::"text", 'suporte_zela'::"text"])))
);


ALTER TABLE "public"."chat_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "class_name" "text" NOT NULL,
    "date" "date" NOT NULL,
    "status" "text" NOT NULL,
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" "uuid",
    CONSTRAINT "class_attendance_status_check" CHECK (("status" = ANY (ARRAY['presente'::"text", 'ausente'::"text", 'atrasado'::"text", 'justificado'::"text"])))
);


ALTER TABLE "public"."class_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "class_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" "uuid"
);


ALTER TABLE "public"."class_subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_error_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message" "text" NOT NULL,
    "stack" "text",
    "component_stack" "text",
    "url" "text",
    "user_agent" "text",
    "user_id" "uuid",
    "role" "text",
    "school_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_error_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comunicado_reads" (
    "comunicado_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comunicado_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comunicados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "turmas" "text"[],
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."comunicados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cron_job_logs" (
    "id" bigint NOT NULL,
    "job_name" "text" NOT NULL,
    "status_code" integer,
    "success" boolean NOT NULL,
    "detail" "text",
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cron_job_logs" OWNER TO "postgres";


ALTER TABLE "public"."cron_job_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."cron_job_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cron_secrets" (
    "name" "text" NOT NULL,
    "vault_secret_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cron_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_attendance_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notified_late_entry_5" boolean DEFAULT false,
    "notified_late_exit_5" boolean DEFAULT false,
    "notified_late_exit_10" boolean DEFAULT false,
    "notified_late_exit_15_billing" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notified_early_checkin_billing" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."daily_attendance_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diario_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "entry_date" "date" NOT NULL,
    "refeicoes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sono_inicio" time without time zone,
    "sono_fim" time without time zone,
    "evacuou" boolean,
    "observacoes" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "aparencia_evacuacao" "text"
);


ALTER TABLE "public"."diario_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."edge_function_logs" (
    "id" bigint NOT NULL,
    "function_name" "text" NOT NULL,
    "level" "text" DEFAULT 'error'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "context" "jsonb",
    "school_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "edge_function_logs_level_check" CHECK (("level" = ANY (ARRAY['error'::"text", 'warn'::"text"])))
);


ALTER TABLE "public"."edge_function_logs" OWNER TO "postgres";


ALTER TABLE "public"."edge_function_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."edge_function_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."error_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "category" "text" NOT NULL,
    "severity" "text" DEFAULT 'error'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "stack" "text",
    "context" "jsonb",
    "school_id" "uuid",
    "user_id" "uuid",
    "role" "text",
    "url" "text",
    "user_agent" "text",
    "fingerprint" "text" NOT NULL,
    "occurrences" integer DEFAULT 1 NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notified_at" timestamp with time zone,
    "ai_summary" "text",
    "ai_summary_model" "text",
    "ai_summary_generated_at" timestamp with time zone,
    "ai_summary_generated_by" "uuid",
    "screen" "text",
    CONSTRAINT "error_logs_severity_check" CHECK (("severity" = ANY (ARRAY['warn'::"text", 'error'::"text", 'critical'::"text"]))),
    CONSTRAINT "error_logs_source_check" CHECK (("source" = ANY (ARRAY['client'::"text", 'edge_function'::"text", 'cron'::"text", 'business'::"text", 'face_recognition'::"text"])))
);


ALTER TABLE "public"."error_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eventos_calendario" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "event_date" "date" NOT NULL,
    "event_type" "text" DEFAULT 'geral'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."eventos_calendario" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fichas_medicas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "tem_restricao_alimentar" boolean DEFAULT false NOT NULL,
    "restricoes_alimentares" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tem_restricao_saude" boolean DEFAULT false NOT NULL,
    "restricoes_saude" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "consultou_especialista" boolean DEFAULT false NOT NULL,
    "especialistas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "faz_tratamento" boolean DEFAULT false NOT NULL,
    "tratamentos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "usa_medicamento" boolean DEFAULT false NOT NULL,
    "medicamentos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tem_habito_importante" boolean DEFAULT false NOT NULL,
    "habitos_importantes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fichas_medicas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_billing_discounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "billing_cycle" "text" NOT NULL,
    "discount_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "guardian_id" "uuid" NOT NULL,
    CONSTRAINT "financial_billing_discounts_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['MONTHLY'::"text", 'QUARTERLY'::"text", 'SEMIANNUALLY'::"text", 'YEARLY'::"text"]))),
    CONSTRAINT "financial_billing_discounts_discount_percent_check" CHECK ((("discount_percent" >= (0)::numeric) AND ("discount_percent" < (100)::numeric)))
);


ALTER TABLE "public"."financial_billing_discounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_charge_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "charge_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "source" "text",
    "webhook_event_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "financial_charge_events_source_check" CHECK (("source" = ANY (ARRAY['system'::"text", 'webhook'::"text", 'admin_manual'::"text"])))
);


ALTER TABLE "public"."financial_charge_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_charges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "contract_id" "uuid",
    "student_id" "uuid" NOT NULL,
    "family_id" "uuid" NOT NULL,
    "due_date" "date" NOT NULL,
    "available_from" "date" NOT NULL,
    "amount_cents" integer NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "gateway" "text",
    "gateway_payment_id" "text",
    "payment_method" "text",
    "pix_qr_code" "text",
    "pix_copy_paste" "text",
    "boleto_url" "text",
    "boleto_barcode" "text",
    "boleto_identification_field" "text",
    "payment_link" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reminder_sent_at" timestamp with time zone,
    CONSTRAINT "financial_charges_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "financial_charges_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['pix'::"text", 'boleto'::"text", 'credit_card'::"text", 'link'::"text"]))),
    CONSTRAINT "financial_charges_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'AWAITING_PAYMENT'::"text", 'PAID'::"text", 'OVERDUE'::"text", 'CANCELLED'::"text", 'REFUNDED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."financial_charges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_contracts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "financial_guardian_id" "uuid" NOT NULL,
    "billing_cycle" "text" NOT NULL,
    "base_monthly_amount_cents" integer NOT NULL,
    "discount_percent_applied" numeric(5,2) DEFAULT 0 NOT NULL,
    "amount_cents" integer NOT NULL,
    "first_due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "gateway" "text",
    "gateway_customer_id" "text",
    "gateway_subscription_id" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "financial_contracts_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "financial_contracts_base_monthly_amount_cents_check" CHECK (("base_monthly_amount_cents" > 0)),
    CONSTRAINT "financial_contracts_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['MONTHLY'::"text", 'QUARTERLY'::"text", 'SEMIANNUALLY'::"text", 'YEARLY'::"text"]))),
    CONSTRAINT "financial_contracts_discount_percent_applied_check" CHECK ((("discount_percent_applied" >= (0)::numeric) AND ("discount_percent_applied" < (100)::numeric))),
    CONSTRAINT "financial_contracts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."financial_contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."funcionarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cargo" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "doc_number" "text",
    "admission_date" "date",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."funcionarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."history_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "record_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "entry_time" time without time zone,
    "exit_time" time without time zone,
    "total_hours" numeric,
    "status" "text",
    "school_id" "uuid"
);


ALTER TABLE "public"."history_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kiosk_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "device_token" "text" NOT NULL,
    "device_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."kiosk_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matricula_solicitacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "family_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "responsavel_financeiro" "jsonb" NOT NULL,
    "segundo_responsavel" "jsonb",
    "criancas" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "transporte_autorizados" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "rejection_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "autorizados" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tipo" "text" DEFAULT 'matricula'::"text" NOT NULL,
    CONSTRAINT "matricula_solicitacoes_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'changes_requested'::"text"]))),
    CONSTRAINT "matricula_solicitacoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['matricula'::"text", 'rematricula'::"text", 'atualizacao_cadastral'::"text"])))
);


ALTER TABLE "public"."matricula_solicitacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mitigacao_report_reads" (
    "report_id" "uuid" NOT NULL,
    "family_user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mitigacao_report_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mitigacao_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "reference_period" "text",
    "guia_responsavel" "text",
    "status" "text" DEFAULT 'RASCUNHO'::"text" NOT NULL,
    "current_step" integer DEFAULT 1 NOT NULL,
    "entrada" "text",
    "socializacao" "text",
    "foco_interesses" "text",
    "alimentacao" "text",
    "sono" "text",
    "normalizacao" "text",
    "pontuacoes_gerais" "text",
    "conclusao" "text",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mitigacao_reports_current_step_check" CHECK ((("current_step" >= 1) AND ("current_step" <= 8))),
    CONSTRAINT "mitigacao_reports_status_check" CHECK (("status" = ANY (ARRAY['RASCUNHO'::"text", 'PUBLICADO'::"text", 'ARQUIVADO'::"text"])))
);


ALTER TABLE "public"."mitigacao_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mural_fotos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "caption" "text",
    "turmas" "text"[],
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."mural_fotos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "family_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "url" "text"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gateway" "text" NOT NULL,
    "gateway_event_id" "text" NOT NULL,
    "event_type" "text",
    "payload" "jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "school_id" "uuid"
);


ALTER TABLE "public"."payment_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedagogical_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "record_type" "text" NOT NULL,
    "author_id" "uuid",
    "record_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subject_id" "uuid",
    CONSTRAINT "pedagogical_records_record_type_check" CHECK (("record_type" = ANY (ARRAY['DAILY_OBSERVATION'::"text", 'SENSITIVE_PERIOD'::"text", 'SOCIAL_INTERACTION'::"text"])))
);


ALTER TABLE "public"."pedagogical_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'family'::"text",
    "name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_delivery_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid",
    "endpoint" "text",
    "success" boolean NOT NULL,
    "status_code" integer,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_delivery_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "device_info" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_attempts" (
    "id" bigint NOT NULL,
    "key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limit_attempts" OWNER TO "postgres";


ALTER TABLE "public"."rate_limit_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."rate_limit_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."report_reads" (
    "report_id" "uuid" NOT NULL,
    "family_user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "section_type" "text" DEFAULT 'CUSTOM'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."report_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_template_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "section_type" "text" DEFAULT 'CUSTOM'::"text" NOT NULL,
    "instructions" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."report_template_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "report_type" "text" DEFAULT 'DESEMPENHO_EVOLUCAO'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "template_version" integer,
    "title" "text" NOT NULL,
    "reference_period" "text",
    "author_id" "uuid",
    "status" "text" DEFAULT 'RASCUNHO'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reports_status_check" CHECK (("status" = ANY (ARRAY['RASCUNHO'::"text", 'PUBLICADO'::"text", 'ARQUIVADO'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_gateway_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "gateway" "text" NOT NULL,
    "vault_secret_id" "uuid" NOT NULL,
    "pix_key_registered" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "school_gateway_accounts_gateway_check" CHECK (("gateway" = ANY (ARRAY['asaas'::"text", 'asaas_webhook'::"text"])))
);


ALTER TABLE "public"."school_gateway_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_code" character varying(5) NOT NULL,
    "name" "text" NOT NULL,
    "cnpj" character varying(18),
    "email" "text",
    "phone" "text",
    "address" "text",
    "plan" "text" DEFAULT 'basic'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logo_url" "text",
    "max_students" integer DEFAULT 100,
    "features_enabled" "jsonb" DEFAULT '{"checkin": true, "calendario": false}'::"jsonb",
    "limits" "jsonb" DEFAULT '{"autorizados_transporte": 1, "autorizados_por_responsavel": 2}'::"jsonb" NOT NULL,
    "city" "text",
    "director_name" "text",
    "pedagogical_method" "text" DEFAULT 'tradicional'::"text" NOT NULL,
    "custom_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "turmas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "login_image_url" "text",
    "billing_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "absence_alert_config" "jsonb" DEFAULT '{"enabled": false, "consecutive_days_threshold": 3}'::"jsonb" NOT NULL,
    CONSTRAINT "schools_billing_config_valid" CHECK ("public"."is_valid_billing_config"("billing_config")),
    CONSTRAINT "schools_pedagogical_method_check" CHECK (("pedagogical_method" = ANY (ARRAY['tradicional'::"text", 'montessori'::"text", 'personalizado'::"text"])))
);


ALTER TABLE "public"."schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shadow_face_recognition_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "faceapi_matched_person_id" "uuid",
    "human_matched_person_id" "uuid",
    "human_similarity" numeric,
    "agree" boolean,
    "human_detection_ms" integer
);


ALTER TABLE "public"."shadow_face_recognition_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."shadow_face_recognition_log" IS 'Fase F (modo observador) do plano de migração de face-api.js para @vladmandic/human. Só leitura/análise — nunca influencia o check-in real.';



CREATE TABLE IF NOT EXISTS "public"."student_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "notes" "text",
    "uploaded_by" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_documents_category_check" CHECK (("category" = ANY (ARRAY['rg'::"text", 'certidao_nascimento'::"text", 'comprovante_residencia'::"text", 'cartao_vacina'::"text", 'plano_saude'::"text", 'contrato'::"text", 'ficha_medica'::"text", 'outro'::"text"])))
);


ALTER TABLE "public"."student_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_guardians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "guardian_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false,
    "is_financial" boolean DEFAULT false,
    "relationship" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_guardians" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "from_class_name" "text",
    "to_class_name" "text",
    "reason" "text",
    "transferred_by" "uuid",
    "transferred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "transfer_type" "text" DEFAULT 'turma'::"text" NOT NULL,
    "destination_school_name" "text",
    CONSTRAINT "student_transfers_saida_externa_shape_check" CHECK (((("transfer_type" = 'turma'::"text") AND ("to_class_name" IS NOT NULL) AND ("destination_school_name" IS NULL)) OR (("transfer_type" = 'saida_externa'::"text") AND ("to_class_name" IS NULL) AND ("destination_school_name" IS NOT NULL)))),
    CONSTRAINT "student_transfers_transfer_type_check" CHECK (("transfer_type" = ANY (ARRAY['turma'::"text", 'saida_externa'::"text"])))
);


ALTER TABLE "public"."student_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid",
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'idle'::"text",
    "contracted_hours" numeric DEFAULT 6,
    "today_entry" time without time zone,
    "today_exit" time without time zone,
    "turma" "text",
    "school_id" "uuid",
    "birth_date" "date",
    "turno" "text",
    "periodo" "text",
    "contracted_entry_time" time without time zone,
    "contracted_exit_time" time without time zone,
    "pending_requester_id" "uuid",
    "first_checkin_at" timestamp with time zone,
    "weekly_schedule" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "today_entry_at" timestamp with time zone,
    "today_exit_at" timestamp with time zone,
    "isento_hora_extra" boolean DEFAULT false NOT NULL,
    "consecutive_absent_days" integer DEFAULT 0 NOT NULL,
    "absence_alert_sent_at" "date",
    "checkin_qr_token" "uuid",
    "checkin_qr_created_at" timestamp with time zone,
    "checkin_qr_created_by" "uuid",
    "cidade_nascimento" "text",
    "autorizacao_imagem" boolean,
    "autorizacao_emergencia_medica" boolean,
    "enrollment_status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    CONSTRAINT "students_enrollment_status_check" CHECK (("enrollment_status" = ANY (ARRAY['ativo'::"text", 'inativo'::"text", 'transferido'::"text", 'cancelado'::"text"]))),
    CONSTRAINT "students_weekly_schedule_valid" CHECK ("public"."is_valid_weekly_schedule"("weekly_schedule"))
);

ALTER TABLE ONLY "public"."students" REPLICA IDENTITY FULL;


ALTER TABLE "public"."students" OWNER TO "postgres";


COMMENT ON COLUMN "public"."students"."today_entry_at" IS 'Instante exato (timestamptz) do reconhecimento/solicitação de entrada de hoje. Fonte de verdade pra attendance_logs.event_time na confirmação -- today_entry (time) perde a data e não deve ser usado pra esse fim.';



COMMENT ON COLUMN "public"."students"."today_exit_at" IS 'Instante exato (timestamptz) do reconhecimento/solicitação de saída de hoje. Fonte de verdade pra attendance_logs.event_time na confirmação -- today_exit (time) perde a data e não deve ser usado pra esse fim.';



CREATE TABLE IF NOT EXISTS "public"."subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_update_reads" (
    "update_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_update_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."system_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_menu_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "menu_key" "text" NOT NULL,
    "click_count" integer DEFAULT 1,
    "last_clicked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_menu_clicks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'family'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "lgpd_accepted" boolean DEFAULT false,
    "school_id" "uuid",
    "phone2" "text",
    "doc_type" "text",
    "doc_number" "text",
    "profession" "text",
    "civil_status" "text",
    "guardian_type" "text",
    "zip_code" "text",
    "street" "text",
    "number" "text",
    "complement" "text",
    "neighborhood" "text",
    "city" "text",
    "state" "text",
    "documents" "jsonb",
    "departamento" "text",
    "chat_visibilidade_total" boolean DEFAULT false NOT NULL,
    "is_primary_admin" boolean DEFAULT false NOT NULL,
    "turmas" "text"[],
    "teacher_status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "must_change_password" boolean DEFAULT false NOT NULL,
    CONSTRAINT "users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'pending'::"text"]))),
    CONSTRAINT "users_teacher_status_check" CHECK (("teacher_status" = ANY (ARRAY['ativo'::"text", 'inativo'::"text", 'bloqueado'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."attendance_corrections"
    ADD CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aulas_especiais"
    ADD CONSTRAINT "aulas_especiais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_nonces"
    ADD CONSTRAINT "auth_nonces_nonce_key" UNIQUE ("nonce");



ALTER TABLE ONLY "public"."auth_nonces"
    ADD CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."authorized_persons"
    ADD CONSTRAINT "authorized_persons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cardapio_itens"
    ADD CONSTRAINT "cardapio_itens_cardapio_id_event_date_refeicao_key" UNIQUE ("cardapio_id", "event_date", "refeicao");



ALTER TABLE ONLY "public"."cardapio_itens"
    ADD CONSTRAINT "cardapio_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cardapios"
    ADD CONSTRAINT "cardapios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_threads"
    ADD CONSTRAINT "chat_threads_family_id_setor_key" UNIQUE ("family_id", "setor");



ALTER TABLE ONLY "public"."chat_threads"
    ADD CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_attendance"
    ADD CONSTRAINT "class_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_attendance"
    ADD CONSTRAINT "class_attendance_student_id_date_key" UNIQUE ("student_id", "date");



ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_school_id_subject_id_class_name_key" UNIQUE ("school_id", "subject_id", "class_name");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_school_id_name_key" UNIQUE ("school_id", "name");



ALTER TABLE ONLY "public"."client_error_logs"
    ADD CONSTRAINT "client_error_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comunicado_reads"
    ADD CONSTRAINT "comunicado_reads_pkey" PRIMARY KEY ("comunicado_id", "user_id");



ALTER TABLE ONLY "public"."comunicados"
    ADD CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_job_logs"
    ADD CONSTRAINT "cron_job_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_secrets"
    ADD CONSTRAINT "cron_secrets_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."daily_attendance_status"
    ADD CONSTRAINT "daily_attendance_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_attendance_status"
    ADD CONSTRAINT "daily_attendance_status_student_id_date_key" UNIQUE ("student_id", "date");



ALTER TABLE ONLY "public"."diario_entries"
    ADD CONSTRAINT "diario_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diario_entries"
    ADD CONSTRAINT "diario_entries_student_id_entry_date_key" UNIQUE ("student_id", "entry_date");



ALTER TABLE ONLY "public"."edge_function_logs"
    ADD CONSTRAINT "edge_function_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eventos_calendario"
    ADD CONSTRAINT "eventos_calendario_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fichas_medicas"
    ADD CONSTRAINT "fichas_medicas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fichas_medicas"
    ADD CONSTRAINT "fichas_medicas_student_id_key" UNIQUE ("student_id");



ALTER TABLE ONLY "public"."financial_billing_discounts"
    ADD CONSTRAINT "financial_billing_discounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_billing_discounts"
    ADD CONSTRAINT "financial_billing_discounts_school_guardian_cycle_key" UNIQUE ("school_id", "guardian_id", "billing_cycle");



ALTER TABLE ONLY "public"."financial_charge_events"
    ADD CONSTRAINT "financial_charge_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_charges"
    ADD CONSTRAINT "financial_charges_contract_id_due_date_key" UNIQUE ("contract_id", "due_date");



ALTER TABLE ONLY "public"."financial_charges"
    ADD CONSTRAINT "financial_charges_gateway_payment_key" UNIQUE ("gateway", "gateway_payment_id");



ALTER TABLE ONLY "public"."financial_charges"
    ADD CONSTRAINT "financial_charges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_contracts"
    ADD CONSTRAINT "financial_contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."funcionarios"
    ADD CONSTRAINT "funcionarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."history_records"
    ADD CONSTRAINT "history_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kiosk_devices"
    ADD CONSTRAINT "kiosk_devices_device_token_key" UNIQUE ("device_token");



ALTER TABLE ONLY "public"."kiosk_devices"
    ADD CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matricula_solicitacoes"
    ADD CONSTRAINT "matricula_solicitacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mitigacao_report_reads"
    ADD CONSTRAINT "mitigacao_report_reads_pkey" PRIMARY KEY ("report_id", "family_user_id");



ALTER TABLE ONLY "public"."mitigacao_reports"
    ADD CONSTRAINT "mitigacao_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mural_fotos"
    ADD CONSTRAINT "mural_fotos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_school_gateway_event_key" UNIQUE ("school_id", "gateway", "gateway_event_id");



ALTER TABLE ONLY "public"."pedagogical_records"
    ADD CONSTRAINT "pedagogical_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_delivery_attempts"
    ADD CONSTRAINT "push_delivery_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."rate_limit_attempts"
    ADD CONSTRAINT "rate_limit_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_reads"
    ADD CONSTRAINT "report_reads_pkey" PRIMARY KEY ("report_id", "family_user_id");



ALTER TABLE ONLY "public"."report_sections"
    ADD CONSTRAINT "report_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_template_sections"
    ADD CONSTRAINT "report_template_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_gateway_accounts"
    ADD CONSTRAINT "school_gateway_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_gateway_accounts"
    ADD CONSTRAINT "school_gateway_accounts_school_id_gateway_key" UNIQUE ("school_id", "gateway");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_school_code_key" UNIQUE ("school_code");



ALTER TABLE ONLY "public"."shadow_face_recognition_log"
    ADD CONSTRAINT "shadow_face_recognition_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_guardians"
    ADD CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_guardians"
    ADD CONSTRAINT "student_guardians_student_id_guardian_id_key" UNIQUE ("student_id", "guardian_id");



ALTER TABLE ONLY "public"."student_transfers"
    ADD CONSTRAINT "student_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_checkin_qr_token_key" UNIQUE ("checkin_qr_token");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_school_id_name_key" UNIQUE ("school_id", "name");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."system_update_reads"
    ADD CONSTRAINT "system_update_reads_pkey" PRIMARY KEY ("update_id", "user_id");



ALTER TABLE ONLY "public"."system_updates"
    ADD CONSTRAINT "system_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_menu_clicks"
    ADD CONSTRAINT "user_menu_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_menu_clicks"
    ADD CONSTRAINT "user_menu_clicks_user_id_menu_key_key" UNIQUE ("user_id", "menu_key");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_attendance_corrections_pending" ON "public"."attendance_corrections" USING "btree" ("school_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_attendance_corrections_school" ON "public"."attendance_corrections" USING "btree" ("school_id", "requested_at" DESC);



CREATE INDEX "idx_attendance_logs_family_id" ON "public"."attendance_logs" USING "btree" ("family_id");



CREATE INDEX "idx_attendance_logs_school_id" ON "public"."attendance_logs" USING "btree" ("school_id");



CREATE INDEX "idx_attendance_logs_student_id" ON "public"."attendance_logs" USING "btree" ("student_id");



CREATE INDEX "idx_audit_logs_school" ON "public"."audit_logs" USING "btree" ("school_id", "created_at" DESC);



CREATE INDEX "idx_aulas_especiais_school" ON "public"."aulas_especiais" USING "btree" ("school_id");



CREATE INDEX "idx_authorized_persons_family_id" ON "public"."authorized_persons" USING "btree" ("family_id");



CREATE INDEX "idx_authorized_persons_school_status" ON "public"."authorized_persons" USING "btree" ("school_id", "status");



CREATE INDEX "idx_cardapio_itens_cardapio" ON "public"."cardapio_itens" USING "btree" ("cardapio_id");



CREATE INDEX "idx_chat_messages_thread" ON "public"."chat_messages" USING "btree" ("thread_id", "created_at");



CREATE INDEX "idx_chat_threads_school_setor" ON "public"."chat_threads" USING "btree" ("school_id", "setor");



CREATE INDEX "idx_class_attendance_class_id" ON "public"."class_attendance" USING "btree" ("class_id");



CREATE INDEX "idx_class_attendance_date" ON "public"."class_attendance" USING "btree" ("date");



CREATE INDEX "idx_class_attendance_school_id" ON "public"."class_attendance" USING "btree" ("school_id");



CREATE INDEX "idx_class_attendance_student_id" ON "public"."class_attendance" USING "btree" ("student_id");



CREATE INDEX "idx_class_subjects_class_id" ON "public"."class_subjects" USING "btree" ("class_id");



CREATE INDEX "idx_class_subjects_class_name" ON "public"."class_subjects" USING "btree" ("class_name");



CREATE INDEX "idx_class_subjects_school_id" ON "public"."class_subjects" USING "btree" ("school_id");



CREATE INDEX "idx_class_subjects_subject_id" ON "public"."class_subjects" USING "btree" ("subject_id");



CREATE INDEX "idx_classes_school_id" ON "public"."classes" USING "btree" ("school_id");



CREATE INDEX "idx_client_error_logs_created" ON "public"."client_error_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_client_error_logs_school" ON "public"."client_error_logs" USING "btree" ("school_id");



CREATE INDEX "idx_diario_entries_school" ON "public"."diario_entries" USING "btree" ("school_id");



CREATE INDEX "idx_diario_entries_student_date" ON "public"."diario_entries" USING "btree" ("student_id", "entry_date" DESC);



CREATE INDEX "idx_edge_function_logs_created_at" ON "public"."edge_function_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_edge_function_logs_function_name" ON "public"."edge_function_logs" USING "btree" ("function_name");



CREATE INDEX "idx_error_logs_context_gin" ON "public"."error_logs" USING "gin" ("context");



CREATE INDEX "idx_error_logs_created" ON "public"."error_logs" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_error_logs_fingerprint_open" ON "public"."error_logs" USING "btree" ("fingerprint") WHERE (NOT "resolved");



CREATE INDEX "idx_error_logs_school" ON "public"."error_logs" USING "btree" ("school_id");



CREATE INDEX "idx_error_logs_screen" ON "public"."error_logs" USING "btree" ("screen");



CREATE INDEX "idx_error_logs_severity_unresolved" ON "public"."error_logs" USING "btree" ("severity") WHERE (NOT "resolved");



CREATE INDEX "idx_error_logs_source_category" ON "public"."error_logs" USING "btree" ("source", "category");



CREATE INDEX "idx_eventos_calendario_school_date" ON "public"."eventos_calendario" USING "btree" ("school_id", "event_date");



CREATE INDEX "idx_fichas_medicas_school" ON "public"."fichas_medicas" USING "btree" ("school_id");



CREATE INDEX "idx_financial_billing_discounts_guardian" ON "public"."financial_billing_discounts" USING "btree" ("guardian_id");



CREATE INDEX "idx_financial_billing_discounts_school" ON "public"."financial_billing_discounts" USING "btree" ("school_id");



CREATE INDEX "idx_financial_charge_events_charge" ON "public"."financial_charge_events" USING "btree" ("charge_id", "created_at" DESC);



CREATE INDEX "idx_financial_charges_contract" ON "public"."financial_charges" USING "btree" ("contract_id");



CREATE INDEX "idx_financial_charges_due_date" ON "public"."financial_charges" USING "btree" ("due_date");



CREATE INDEX "idx_financial_charges_family" ON "public"."financial_charges" USING "btree" ("family_id");



CREATE INDEX "idx_financial_charges_pending_availability" ON "public"."financial_charges" USING "btree" ("available_from") WHERE ("status" = 'PENDING'::"text");



CREATE INDEX "idx_financial_charges_school" ON "public"."financial_charges" USING "btree" ("school_id");



CREATE INDEX "idx_financial_charges_status" ON "public"."financial_charges" USING "btree" ("status");



CREATE INDEX "idx_financial_contracts_guardian" ON "public"."financial_contracts" USING "btree" ("financial_guardian_id");



CREATE UNIQUE INDEX "idx_financial_contracts_one_active_per_student" ON "public"."financial_contracts" USING "btree" ("student_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_financial_contracts_school" ON "public"."financial_contracts" USING "btree" ("school_id");



CREATE INDEX "idx_financial_contracts_student" ON "public"."financial_contracts" USING "btree" ("student_id");



CREATE INDEX "idx_funcionarios_school" ON "public"."funcionarios" USING "btree" ("school_id");



CREATE INDEX "idx_history_records_school_id" ON "public"."history_records" USING "btree" ("school_id");



CREATE INDEX "idx_history_records_student_id" ON "public"."history_records" USING "btree" ("student_id");



CREATE INDEX "idx_matricula_solicitacoes_family" ON "public"."matricula_solicitacoes" USING "btree" ("family_id", "submitted_at" DESC);



CREATE INDEX "idx_matricula_solicitacoes_school" ON "public"."matricula_solicitacoes" USING "btree" ("school_id", "status", "submitted_at" DESC);



CREATE INDEX "idx_mitigacao_reports_school" ON "public"."mitigacao_reports" USING "btree" ("school_id");



CREATE INDEX "idx_mitigacao_reports_student" ON "public"."mitigacao_reports" USING "btree" ("student_id", "status");



CREATE INDEX "idx_mural_fotos_school" ON "public"."mural_fotos" USING "btree" ("school_id", "created_at" DESC);



CREATE INDEX "idx_notifications_family_id" ON "public"."notifications" USING "btree" ("family_id");



CREATE INDEX "idx_notifications_school_id" ON "public"."notifications" USING "btree" ("school_id");



CREATE INDEX "idx_notifications_student_id" ON "public"."notifications" USING "btree" ("student_id");



CREATE INDEX "idx_payment_webhook_events_received" ON "public"."payment_webhook_events" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_payment_webhook_events_school" ON "public"."payment_webhook_events" USING "btree" ("school_id");



CREATE INDEX "idx_payment_webhook_events_unprocessed" ON "public"."payment_webhook_events" USING "btree" ("processed_at") WHERE ("processed_at" IS NULL);



CREATE INDEX "idx_pedagogical_records_school" ON "public"."pedagogical_records" USING "btree" ("school_id", "record_type");



CREATE INDEX "idx_pedagogical_records_student" ON "public"."pedagogical_records" USING "btree" ("student_id", "record_type", "record_date" DESC);



CREATE INDEX "idx_pedagogical_records_subject_id" ON "public"."pedagogical_records" USING "btree" ("subject_id");



CREATE INDEX "idx_push_subscriptions_school_id" ON "public"."push_subscriptions" USING "btree" ("school_id");



CREATE INDEX "idx_rate_limit_key_time" ON "public"."rate_limit_attempts" USING "btree" ("key", "created_at");



CREATE INDEX "idx_report_sections_report" ON "public"."report_sections" USING "btree" ("report_id", "sort_order");



CREATE INDEX "idx_report_template_sections_template" ON "public"."report_template_sections" USING "btree" ("template_id", "sort_order");



CREATE INDEX "idx_reports_school" ON "public"."reports" USING "btree" ("school_id");



CREATE INDEX "idx_reports_student" ON "public"."reports" USING "btree" ("student_id", "status");



CREATE INDEX "idx_school_gateway_accounts_school" ON "public"."school_gateway_accounts" USING "btree" ("school_id");



CREATE INDEX "idx_student_documents_school" ON "public"."student_documents" USING "btree" ("school_id");



CREATE INDEX "idx_student_documents_student" ON "public"."student_documents" USING "btree" ("student_id", "uploaded_at" DESC);



CREATE INDEX "idx_student_guardians_school_id" ON "public"."student_guardians" USING "btree" ("school_id");



CREATE INDEX "idx_student_transfers_school_id" ON "public"."student_transfers" USING "btree" ("school_id");



CREATE INDEX "idx_student_transfers_student_id" ON "public"."student_transfers" USING "btree" ("student_id");



CREATE INDEX "idx_students_family_id" ON "public"."students" USING "btree" ("family_id");



CREATE INDEX "idx_students_school_id" ON "public"."students" USING "btree" ("school_id");



CREATE INDEX "idx_subjects_school_id" ON "public"."subjects" USING "btree" ("school_id");



CREATE INDEX "idx_system_updates_created" ON "public"."system_updates" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_menu_clicks_user_id" ON "public"."user_menu_clicks" USING "btree" ("user_id", "click_count" DESC);



CREATE OR REPLACE TRIGGER "protect_financial_contract_admin_updates_trigger" BEFORE UPDATE ON "public"."financial_contracts" FOR EACH ROW EXECUTE FUNCTION "public"."protect_financial_contract_admin_updates"();



CREATE OR REPLACE TRIGGER "protect_school_pedagogical_columns_trigger" BEFORE UPDATE ON "public"."schools" FOR EACH ROW EXECUTE FUNCTION "public"."protect_school_pedagogical_columns"();



CREATE OR REPLACE TRIGGER "protect_student_weekly_schedule_trigger" BEFORE INSERT OR UPDATE ON "public"."students" FOR EACH ROW EXECUTE FUNCTION "public"."protect_student_weekly_schedule"();



CREATE OR REPLACE TRIGGER "resolve_class_id_from_name_trigger" BEFORE INSERT OR UPDATE OF "class_name" ON "public"."class_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."resolve_class_id_from_name"();



CREATE OR REPLACE TRIGGER "resolve_class_id_from_name_trigger" BEFORE INSERT OR UPDATE OF "class_name" ON "public"."class_subjects" FOR EACH ROW EXECUTE FUNCTION "public"."resolve_class_id_from_name"();



CREATE OR REPLACE TRIGGER "restrict_family_student_updates_trigger" BEFORE UPDATE ON "public"."students" FOR EACH ROW EXECUTE FUNCTION "public"."restrict_family_student_updates"();



CREATE OR REPLACE TRIGGER "set_schools_updated_at" BEFORE UPDATE ON "public"."schools" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "touch_class_attendance_updated_at_trigger" BEFORE UPDATE ON "public"."class_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."touch_class_attendance_updated_at"();



CREATE OR REPLACE TRIGGER "touch_subjects_updated_at_trigger" BEFORE UPDATE ON "public"."subjects" FOR EACH ROW EXECUTE FUNCTION "public"."touch_subjects_updated_at"();



CREATE OR REPLACE TRIGGER "trg_enforce_authorized_persons_limit" BEFORE INSERT ON "public"."authorized_persons" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_authorized_persons_limit"();



CREATE OR REPLACE TRIGGER "trg_notify_critical_error" BEFORE INSERT ON "public"."error_logs" FOR EACH ROW EXECUTE FUNCTION "public"."notify_critical_error_log"();



CREATE OR REPLACE TRIGGER "trg_set_audit_log_actor_name" BEFORE INSERT ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_audit_log_actor_name"();



CREATE OR REPLACE TRIGGER "trigger_chat_rate_limit" BEFORE INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_chat_rate_limit"();



CREATE OR REPLACE TRIGGER "trigger_protect_admin_privilege_columns" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."protect_admin_privilege_columns"();



CREATE OR REPLACE TRIGGER "trigger_touch_chat_thread" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_chat_thread"();



ALTER TABLE ONLY "public"."attendance_corrections"
    ADD CONSTRAINT "attendance_corrections_attendance_log_id_fkey" FOREIGN KEY ("attendance_log_id") REFERENCES "public"."attendance_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_corrections"
    ADD CONSTRAINT "attendance_corrections_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_corrections"
    ADD CONSTRAINT "attendance_corrections_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_corrections"
    ADD CONSTRAINT "attendance_corrections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_corrections"
    ADD CONSTRAINT "attendance_corrections_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aulas_especiais"
    ADD CONSTRAINT "aulas_especiais_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."aulas_especiais"
    ADD CONSTRAINT "aulas_especiais_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."authorized_persons"
    ADD CONSTRAINT "authorized_persons_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."authorized_persons"
    ADD CONSTRAINT "authorized_persons_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cardapio_itens"
    ADD CONSTRAINT "cardapio_itens_cardapio_id_fkey" FOREIGN KEY ("cardapio_id") REFERENCES "public"."cardapios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cardapios"
    ADD CONSTRAINT "cardapios_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cardapios"
    ADD CONSTRAINT "cardapios_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_threads"
    ADD CONSTRAINT "chat_threads_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_threads"
    ADD CONSTRAINT "chat_threads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_attendance"
    ADD CONSTRAINT "class_attendance_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."class_attendance"
    ADD CONSTRAINT "class_attendance_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."class_attendance"
    ADD CONSTRAINT "class_attendance_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_attendance"
    ADD CONSTRAINT "class_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comunicado_reads"
    ADD CONSTRAINT "comunicado_reads_comunicado_id_fkey" FOREIGN KEY ("comunicado_id") REFERENCES "public"."comunicados"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comunicado_reads"
    ADD CONSTRAINT "comunicado_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comunicados"
    ADD CONSTRAINT "comunicados_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comunicados"
    ADD CONSTRAINT "comunicados_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_attendance_status"
    ADD CONSTRAINT "daily_attendance_status_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_attendance_status"
    ADD CONSTRAINT "daily_attendance_status_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diario_entries"
    ADD CONSTRAINT "diario_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."diario_entries"
    ADD CONSTRAINT "diario_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diario_entries"
    ADD CONSTRAINT "diario_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diario_entries"
    ADD CONSTRAINT "diario_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."eventos_calendario"
    ADD CONSTRAINT "eventos_calendario_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."eventos_calendario"
    ADD CONSTRAINT "eventos_calendario_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fichas_medicas"
    ADD CONSTRAINT "fichas_medicas_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fichas_medicas"
    ADD CONSTRAINT "fichas_medicas_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fichas_medicas"
    ADD CONSTRAINT "fichas_medicas_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_billing_discounts"
    ADD CONSTRAINT "financial_billing_discounts_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_billing_discounts"
    ADD CONSTRAINT "financial_billing_discounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_billing_discounts"
    ADD CONSTRAINT "financial_billing_discounts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_charge_events"
    ADD CONSTRAINT "financial_charge_events_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "public"."financial_charges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_charge_events"
    ADD CONSTRAINT "financial_charge_events_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."payment_webhook_events"("id");



ALTER TABLE ONLY "public"."financial_charges"
    ADD CONSTRAINT "financial_charges_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."financial_contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_charges"
    ADD CONSTRAINT "financial_charges_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."financial_charges"
    ADD CONSTRAINT "financial_charges_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_charges"
    ADD CONSTRAINT "financial_charges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id");



ALTER TABLE ONLY "public"."financial_contracts"
    ADD CONSTRAINT "financial_contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_contracts"
    ADD CONSTRAINT "financial_contracts_financial_guardian_id_fkey" FOREIGN KEY ("financial_guardian_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."financial_contracts"
    ADD CONSTRAINT "financial_contracts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_contracts"
    ADD CONSTRAINT "financial_contracts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."funcionarios"
    ADD CONSTRAINT "funcionarios_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."funcionarios"
    ADD CONSTRAINT "funcionarios_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."history_records"
    ADD CONSTRAINT "history_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."history_records"
    ADD CONSTRAINT "history_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kiosk_devices"
    ADD CONSTRAINT "kiosk_devices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kiosk_devices"
    ADD CONSTRAINT "kiosk_devices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matricula_solicitacoes"
    ADD CONSTRAINT "matricula_solicitacoes_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matricula_solicitacoes"
    ADD CONSTRAINT "matricula_solicitacoes_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matricula_solicitacoes"
    ADD CONSTRAINT "matricula_solicitacoes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mitigacao_report_reads"
    ADD CONSTRAINT "mitigacao_report_reads_family_user_id_fkey" FOREIGN KEY ("family_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mitigacao_report_reads"
    ADD CONSTRAINT "mitigacao_report_reads_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."mitigacao_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mitigacao_reports"
    ADD CONSTRAINT "mitigacao_reports_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mitigacao_reports"
    ADD CONSTRAINT "mitigacao_reports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mitigacao_reports"
    ADD CONSTRAINT "mitigacao_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mural_fotos"
    ADD CONSTRAINT "mural_fotos_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mural_fotos"
    ADD CONSTRAINT "mural_fotos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."pedagogical_records"
    ADD CONSTRAINT "pedagogical_records_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pedagogical_records"
    ADD CONSTRAINT "pedagogical_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedagogical_records"
    ADD CONSTRAINT "pedagogical_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedagogical_records"
    ADD CONSTRAINT "pedagogical_records_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_reads"
    ADD CONSTRAINT "report_reads_family_user_id_fkey" FOREIGN KEY ("family_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_reads"
    ADD CONSTRAINT "report_reads_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_sections"
    ADD CONSTRAINT "report_sections_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_template_sections"
    ADD CONSTRAINT "report_template_sections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id");



ALTER TABLE ONLY "public"."school_gateway_accounts"
    ADD CONSTRAINT "school_gateway_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."school_gateway_accounts"
    ADD CONSTRAINT "school_gateway_accounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_documents"
    ADD CONSTRAINT "student_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_guardians"
    ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_guardians"
    ADD CONSTRAINT "student_guardians_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_guardians"
    ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_transfers"
    ADD CONSTRAINT "student_transfers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_transfers"
    ADD CONSTRAINT "student_transfers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_transfers"
    ADD CONSTRAINT "student_transfers_transferred_by_fkey" FOREIGN KEY ("transferred_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_checkin_qr_created_by_fkey" FOREIGN KEY ("checkin_qr_created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pending_requester_id_fkey" FOREIGN KEY ("pending_requester_id") REFERENCES "public"."authorized_persons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_update_reads"
    ADD CONSTRAINT "system_update_reads_update_id_fkey" FOREIGN KEY ("update_id") REFERENCES "public"."system_updates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_update_reads"
    ADD CONSTRAINT "system_update_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_updates"
    ADD CONSTRAINT "system_updates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_menu_clicks"
    ADD CONSTRAINT "user_menu_clicks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_menu_clicks"
    ADD CONSTRAINT "user_menu_clicks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



CREATE POLICY "Acesso completo a pessoas autorizadas" ON "public"."authorized_persons" USING ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())) OR (("public"."get_my_role"() = 'family'::"text") AND ("family_id" = "auth"."uid"())))) WITH CHECK ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())) OR (("public"."get_my_role"() = 'family'::"text") AND ("family_id" = "auth"."uid"()))));



CREATE POLICY "Admin acessa vínculos da escola" ON "public"."student_guardians" TO "authenticated" USING ((("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'gestao'::"text"])) AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'gestao'::"text"])) AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admin e developer leem atualizacoes" ON "public"."system_updates" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'developer'::"text"])));



CREATE POLICY "Admin e developer marcam propria leitura" ON "public"."system_update_reads" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'developer'::"text"]))));



CREATE POLICY "Admin gerencia kiosks" ON "public"."kiosk_devices" USING ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())))) WITH CHECK ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))));



CREATE POLICY "Admin ve status do gateway da propria escola" ON "public"."school_gateway_accounts" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_read_gestao"()));



CREATE POLICY "Admins acessam alunos da escola" ON "public"."students" USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins acessam autorizados da escola" ON "public"."authorized_persons" USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'gestao'::"text"])))) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'gestao'::"text"]))));



CREATE POLICY "Admins acessam threads do proprio setor" ON "public"."chat_threads" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("setor" <> 'suporte_zela'::"text") AND ("public"."get_my_chat_visibilidade_total"() OR ("setor" = "public"."get_my_departamento"())))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("setor" <> 'suporte_zela'::"text") AND ("public"."get_my_chat_visibilidade_total"() OR ("setor" = "public"."get_my_departamento"()))));



CREATE POLICY "Admins atualizam correcoes da propria escola" ON "public"."attendance_corrections" FOR UPDATE USING (((("public"."get_my_role"() = 'developer'::"text") OR "public"."can_write_gestao"()) AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK (((("public"."get_my_role"() = 'developer'::"text") OR "public"."can_write_gestao"()) AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins cancelam contratos da propria escola" ON "public"."financial_contracts" FOR UPDATE USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_write_gestao"())) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_write_gestao"()));



CREATE POLICY "Admins corrigem historico da escola" ON "public"."attendance_logs" FOR UPDATE USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_write_gestao"())) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_write_gestao"()));



CREATE POLICY "Admins editam a propria escola" ON "public"."schools" FOR UPDATE USING (("id" = ( SELECT "users"."school_id"
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'developer'::"text"]))))));



CREATE POLICY "Admins enviam mensagens em horario comercial" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("sender_id" = "auth"."uid"()) AND (((("now"() AT TIME ZONE 'America/Sao_Paulo'::"text"))::time without time zone >= '07:00:00'::time without time zone) AND ((("now"() AT TIME ZONE 'America/Sao_Paulo'::"text"))::time without time zone <= '19:00:00'::time without time zone)) AND ("thread_id" IN ( SELECT "chat_threads"."id"
   FROM "public"."chat_threads"
  WHERE (("chat_threads"."school_id" = "public"."get_my_school_id"()) AND ("chat_threads"."setor" <> 'suporte_zela'::"text") AND ("public"."get_my_chat_visibilidade_total"() OR ("chat_threads"."setor" = "public"."get_my_departamento"())))))));



CREATE POLICY "Admins enviam mensagens na propria thread de suporte" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("sender_id" = "auth"."uid"()) AND ("thread_id" IN ( SELECT "chat_threads"."id"
   FROM "public"."chat_threads"
  WHERE (("chat_threads"."family_id" = "auth"."uid"()) AND ("chat_threads"."setor" = 'suporte_zela'::"text"))))));



CREATE POLICY "Admins gerenciam associacoes materia-turma da escola" ON "public"."class_subjects" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins gerenciam aulas especiais da propria escola" ON "public"."aulas_especiais" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins gerenciam cardapios da escola" ON "public"."cardapios" USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins gerenciam comunicados da escola" ON "public"."comunicados" USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins gerenciam descontos da propria escola" ON "public"."financial_billing_discounts" USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_write_gestao"())) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_write_gestao"() AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "financial_billing_discounts"."guardian_id") AND ("u"."school_id" = "financial_billing_discounts"."school_id") AND ("u"."role" = 'family'::"text"))))));



CREATE POLICY "Admins gerenciam diario da propria escola" ON "public"."diario_entries" USING (((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())) OR ("public"."get_my_role"() = 'developer'::"text"))) WITH CHECK (((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())) OR ("public"."get_my_role"() = 'developer'::"text")));



CREATE POLICY "Admins gerenciam eventos da escola" ON "public"."eventos_calendario" USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins gerenciam fotos do mural da escola" ON "public"."mural_fotos" USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins gerenciam funcionarios da escola" ON "public"."funcionarios" USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins gerenciam itens de cardapio da escola" ON "public"."cardapio_itens" USING ((EXISTS ( SELECT 1
   FROM "public"."cardapios" "c"
  WHERE (("c"."id" = "cardapio_itens"."cardapio_id") AND ("c"."school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cardapios" "c"
  WHERE (("c"."id" = "cardapio_itens"."cardapio_id") AND ("c"."school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text")))));



CREATE POLICY "Admins gerenciam log de shadow mode da propria escola" ON "public"."shadow_face_recognition_log" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins gerenciam materias da escola" ON "public"."subjects" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins gerenciam modelos de relatorio da escola" ON "public"."report_templates" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins gerenciam relatorios da escola" ON "public"."reports" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins gerenciam secoes de modelo da escola" ON "public"."report_template_sections" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("template_id" IN ( SELECT "report_templates"."id"
   FROM "public"."report_templates"
  WHERE ("report_templates"."school_id" = "public"."get_my_school_id"()))))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("template_id" IN ( SELECT "report_templates"."id"
   FROM "public"."report_templates"
  WHERE ("report_templates"."school_id" = "public"."get_my_school_id"())))));



CREATE POLICY "Admins gerenciam secoes de relatorio da escola" ON "public"."report_sections" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("report_id" IN ( SELECT "reports"."id"
   FROM "public"."reports"
  WHERE ("reports"."school_id" = "public"."get_my_school_id"()))))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("report_id" IN ( SELECT "reports"."id"
   FROM "public"."reports"
  WHERE ("reports"."school_id" = "public"."get_my_school_id"())))));



CREATE POLICY "Admins gerenciam solicitacoes da escola" ON "public"."matricula_solicitacoes" USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'gestao'::"text"))) WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'gestao'::"text")));



CREATE POLICY "Admins gerenciam sua propria thread de suporte" ON "public"."chat_threads" USING ((("public"."get_my_role"() = 'admin'::"text") AND ("setor" = 'suporte_zela'::"text") AND ("family_id" = "auth"."uid"()))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("setor" = 'suporte_zela'::"text") AND ("family_id" = "auth"."uid"())));



CREATE POLICY "Admins inserem correcoes da propria escola" ON "public"."attendance_corrections" FOR INSERT WITH CHECK ((("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'gestao'::"text"])) AND ("school_id" = "public"."get_my_school_id"()) AND ("requested_by" = "auth"."uid"())));



CREATE POLICY "Admins inserem historico da escola" ON "public"."attendance_logs" FOR INSERT WITH CHECK ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins leem audit logs da escola" ON "public"."audit_logs" FOR SELECT USING (("public"."can_read_gestao"() AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins leem cobrancas da propria escola" ON "public"."financial_charges" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_read_gestao"()));



CREATE POLICY "Admins leem contratos da propria escola" ON "public"."financial_contracts" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_read_gestao"()));



CREATE POLICY "Admins leem correcoes da escola" ON "public"."attendance_corrections" FOR SELECT USING (((("public"."get_my_role"() = 'developer'::"text") OR "public"."can_read_gestao"()) AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins leem ficha medica da escola" ON "public"."fichas_medicas" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));



CREATE POLICY "Admins leem frequencia da escola" ON "public"."class_attendance" FOR SELECT USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins leem historico de transferencias da escola" ON "public"."student_transfers" FOR SELECT USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins leem mensagens da propria thread de suporte" ON "public"."chat_messages" FOR SELECT USING ((("public"."get_my_role"() = 'admin'::"text") AND ("thread_id" IN ( SELECT "chat_threads"."id"
   FROM "public"."chat_threads"
  WHERE (("chat_threads"."family_id" = "auth"."uid"()) AND ("chat_threads"."setor" = 'suporte_zela'::"text"))))));



CREATE POLICY "Admins leem mensagens do proprio setor" ON "public"."chat_messages" FOR SELECT USING ((("public"."get_my_role"() = 'admin'::"text") AND ("thread_id" IN ( SELECT "chat_threads"."id"
   FROM "public"."chat_threads"
  WHERE (("chat_threads"."school_id" = "public"."get_my_school_id"()) AND ("chat_threads"."setor" <> 'suporte_zela'::"text") AND ("public"."get_my_chat_visibilidade_total"() OR ("chat_threads"."setor" = "public"."get_my_departamento"())))))));



CREATE POLICY "Admins leem registros pedagogicos da escola" ON "public"."pedagogical_records" FOR SELECT USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins leem relatorios de mitigacao da escola" ON "public"."mitigacao_reports" FOR SELECT USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins leem status de leitura da escola" ON "public"."report_reads" FOR SELECT USING ((("public"."get_my_role"() = 'admin'::"text") AND ("report_id" IN ( SELECT "reports"."id"
   FROM "public"."reports"
  WHERE ("reports"."school_id" = "public"."get_my_school_id"())))));



CREATE POLICY "Admins leem turmas normalizadas da escola" ON "public"."classes" FOR SELECT USING ((("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Admins veem logs da escola" ON "public"."attendance_logs" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_read_gestao"()));



CREATE POLICY "Admins veem notificacoes da escola" ON "public"."notifications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text") AND ("users"."school_id" = "notifications"."school_id")))));



CREATE POLICY "Admins veem status diario da escola" ON "public"."daily_attendance_status" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text") AND ("users"."school_id" = "daily_attendance_status"."school_id")))));



CREATE POLICY "Atualizacao de estudantes" ON "public"."students" FOR UPDATE USING ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'gestao'::"text"])) AND ("school_id" = "public"."get_my_school_id"())) OR (("public"."get_my_role"() = 'family'::"text") AND ("family_id" = "auth"."uid"())))) WITH CHECK ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'gestao'::"text"])) AND ("school_id" = "public"."get_my_school_id"())) OR (("public"."get_my_role"() = 'family'::"text") AND ("family_id" = "auth"."uid"()))));



CREATE POLICY "Atualizacao de perfis de usuario" ON "public"."users" FOR UPDATE TO "authenticated" USING ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'gestao'::"text"])) AND ("school_id" = "public"."get_my_school_id"())) OR ("id" = "auth"."uid"())));



CREATE POLICY "Coordenacao e Direcao editam relatorios de mitigacao" ON "public"."mitigacao_reports" FOR UPDATE USING ((("public"."get_my_role"() = 'admin'::"text") AND ("public"."get_my_departamento"() = ANY (ARRAY['coordenacao'::"text", 'diretoria_pedagogica'::"text"])) AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'admin'::"text") AND ("public"."get_my_departamento"() = ANY (ARRAY['coordenacao'::"text", 'diretoria_pedagogica'::"text"])) AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Coordenacao e Direcao excluem relatorios de mitigacao" ON "public"."mitigacao_reports" FOR DELETE USING ((("public"."get_my_role"() = 'admin'::"text") AND ("public"."get_my_departamento"() = ANY (ARRAY['coordenacao'::"text", 'diretoria_pedagogica'::"text"])) AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Criacao de estudantes por admin ou developer" ON "public"."students" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'gestao'::"text"])) AND ("school_id" = "public"."get_my_school_id"()))));



CREATE POLICY "Developer acessa mensagens de suporte" ON "public"."chat_messages" USING ((("public"."get_my_role"() = 'developer'::"text") AND ("thread_id" IN ( SELECT "chat_threads"."id"
   FROM "public"."chat_threads"
  WHERE ("chat_threads"."setor" = 'suporte_zela'::"text"))))) WITH CHECK ((("public"."get_my_role"() = 'developer'::"text") AND ("sender_id" = "auth"."uid"()) AND ("thread_id" IN ( SELECT "chat_threads"."id"
   FROM "public"."chat_threads"
  WHERE ("chat_threads"."setor" = 'suporte_zela'::"text")))));



CREATE POLICY "Developer acessa threads de suporte" ON "public"."chat_threads" USING ((("public"."get_my_role"() = 'developer'::"text") AND ("setor" = 'suporte_zela'::"text"))) WITH CHECK ((("public"."get_my_role"() = 'developer'::"text") AND ("setor" = 'suporte_zela'::"text")));



CREATE POLICY "Developer apaga logs de erro" ON "public"."client_error_logs" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "Developer le error_logs" ON "public"."error_logs" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "Developer le eventos de cobranca" ON "public"."financial_charge_events" FOR SELECT USING (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "Developer le eventos de webhook de pagamento" ON "public"."payment_webhook_events" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "Developer le logs de erro" ON "public"."client_error_logs" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "Developer pode criar escolas" ON "public"."schools" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = 'developer'::"text"));



CREATE POLICY "Developer pode editar escolas" ON "public"."schools" FOR UPDATE TO "authenticated" USING ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = 'developer'::"text"));



CREATE POLICY "Developer pode ver todas as escolas" ON "public"."schools" FOR SELECT TO "authenticated" USING ((( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = 'developer'::"text"));



CREATE POLICY "Developer publica atualizacoes" ON "public"."system_updates" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "Developer resolve error_logs" ON "public"."error_logs" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = 'developer'::"text")) WITH CHECK (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "Escolas so podem ser modificadas por developers" ON "public"."schools" USING (("public"."get_my_role"() = 'developer'::"text")) WITH CHECK (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "Exclusao de estudantes" ON "public"."students" FOR DELETE USING ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))));



CREATE POLICY "Exclusao de perfis por admin ou developer" ON "public"."users" FOR DELETE TO "authenticated" USING ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))));



CREATE POLICY "Familia le as proprias cobrancas" ON "public"."financial_charges" FOR SELECT USING ((("public"."get_my_role"() = 'family'::"text") AND ("family_id" = "auth"."uid"()) AND "public"."is_financial_guardian"()));



CREATE POLICY "Familia le o proprio contrato" ON "public"."financial_contracts" FOR SELECT USING ((("public"."get_my_role"() = 'family'::"text") AND ("financial_guardian_id" = "auth"."uid"()) AND "public"."is_financial_guardian"()));



CREATE POLICY "Familias gerenciam ficha medica dos filhos" ON "public"."fichas_medicas" USING ((("public"."get_my_role"() = 'family'::"text") AND ("student_id" IN ( SELECT "student_guardians"."student_id"
   FROM "public"."student_guardians"
  WHERE ("student_guardians"."guardian_id" = "auth"."uid"()))))) WITH CHECK ((("public"."get_my_role"() = 'family'::"text") AND ("student_id" IN ( SELECT "student_guardians"."student_id"
   FROM "public"."student_guardians"
  WHERE ("student_guardians"."guardian_id" = "auth"."uid"())))));



CREATE POLICY "Familias gerenciam suas proprias leituras de mitigacao" ON "public"."mitigacao_report_reads" USING ((("public"."get_my_role"() = 'family'::"text") AND ("family_user_id" = "auth"."uid"()))) WITH CHECK ((("public"."get_my_role"() = 'family'::"text") AND ("family_user_id" = "auth"."uid"()) AND ("report_id" IN ( SELECT "mitigacao_reports"."id"
   FROM "public"."mitigacao_reports"
  WHERE ("mitigacao_reports"."status" = 'PUBLICADO'::"text")))));



CREATE POLICY "Familias gerenciam suas proprias leituras de relatorio" ON "public"."report_reads" USING ((("public"."get_my_role"() = 'family'::"text") AND ("family_user_id" = "auth"."uid"()))) WITH CHECK ((("public"."get_my_role"() = 'family'::"text") AND ("family_user_id" = "auth"."uid"()) AND ("report_id" IN ( SELECT "reports"."id"
   FROM "public"."reports"
  WHERE (("reports"."status" = 'PUBLICADO'::"text") AND (("reports"."student_id" IN ( SELECT "student_guardians"."student_id"
           FROM "public"."student_guardians"
          WHERE ("student_guardians"."guardian_id" = "auth"."uid"()))) OR ("reports"."student_id" IN ( SELECT "students"."id"
           FROM "public"."students"
          WHERE ("students"."family_id" = "auth"."uid"())))))))));



CREATE POLICY "Familias gerenciam suas proprias threads" ON "public"."chat_threads" USING ((("family_id" = "auth"."uid"()) AND ("public"."get_my_role"() = 'family'::"text") AND ("setor" <> 'suporte_zela'::"text"))) WITH CHECK ((("family_id" = "auth"."uid"()) AND ("public"."get_my_role"() = 'family'::"text") AND ("setor" <> 'suporte_zela'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Familias gerenciam suas solicitacoes pendentes" ON "public"."matricula_solicitacoes" USING ((("family_id" = "auth"."uid"()) AND ("public"."get_my_role"() = 'family'::"text") AND ("status" = ANY (ARRAY['pending'::"text", 'changes_requested'::"text"])))) WITH CHECK ((("family_id" = "auth"."uid"()) AND ("public"."get_my_role"() = 'family'::"text") AND ("status" = 'pending'::"text")));



CREATE POLICY "Familias inserem mensagens nas suas threads" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'family'::"text") AND ("sender_id" = "auth"."uid"()) AND ("thread_id" IN ( SELECT "chat_threads"."id"
   FROM "public"."chat_threads"
  WHERE (("chat_threads"."family_id" = "auth"."uid"()) AND ("chat_threads"."setor" <> 'suporte_zela'::"text"))))));



CREATE POLICY "Familias leem aulas especiais da escola" ON "public"."aulas_especiais" FOR SELECT USING ((("public"."get_my_role"() = 'family'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Familias leem diario dos filhos" ON "public"."diario_entries" FOR SELECT USING ((("public"."get_my_role"() = 'family'::"text") AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE ("students"."family_id" = "auth"."uid"())
UNION
 SELECT "student_guardians"."student_id"
   FROM "public"."student_guardians"
  WHERE ("student_guardians"."guardian_id" = "auth"."uid"())))));



CREATE POLICY "Familias leem e enviam mensagens das suas threads" ON "public"."chat_messages" FOR SELECT USING ((("public"."get_my_role"() = 'family'::"text") AND ("thread_id" IN ( SELECT "chat_threads"."id"
   FROM "public"."chat_threads"
  WHERE (("chat_threads"."family_id" = "auth"."uid"()) AND ("chat_threads"."setor" <> 'suporte_zela'::"text"))))));



CREATE POLICY "Familias leem relatorios de mitigacao publicados dos filhos" ON "public"."mitigacao_reports" FOR SELECT USING ((("public"."get_my_role"() = 'family'::"text") AND ("status" = 'PUBLICADO'::"text") AND (("student_id" IN ( SELECT "student_guardians"."student_id"
   FROM "public"."student_guardians"
  WHERE ("student_guardians"."guardian_id" = "auth"."uid"()))) OR ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE ("students"."family_id" = "auth"."uid"()))))));



CREATE POLICY "Familias leem relatorios publicados dos filhos" ON "public"."reports" FOR SELECT USING ((("public"."get_my_role"() = 'family'::"text") AND ("status" = 'PUBLICADO'::"text") AND (("student_id" IN ( SELECT "student_guardians"."student_id"
   FROM "public"."student_guardians"
  WHERE ("student_guardians"."guardian_id" = "auth"."uid"()))) OR ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE ("students"."family_id" = "auth"."uid"()))))));



CREATE POLICY "Familias leem secoes de relatorios publicados" ON "public"."report_sections" FOR SELECT USING ((("public"."get_my_role"() = 'family'::"text") AND ("report_id" IN ( SELECT "reports"."id"
   FROM "public"."reports"
  WHERE (("reports"."status" = 'PUBLICADO'::"text") AND (("reports"."student_id" IN ( SELECT "student_guardians"."student_id"
           FROM "public"."student_guardians"
          WHERE ("student_guardians"."guardian_id" = "auth"."uid"()))) OR ("reports"."student_id" IN ( SELECT "students"."id"
           FROM "public"."students"
          WHERE ("students"."family_id" = "auth"."uid"())))))))));



CREATE POLICY "Familias veem cardapios da escola" ON "public"."cardapios" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'family'::"text")));



CREATE POLICY "Familias veem comunicados da escola" ON "public"."comunicados" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'family'::"text") AND (("turmas" IS NULL) OR ("turmas" && ( SELECT COALESCE("array_agg"(DISTINCT "s"."turma"), ARRAY[]::"text"[]) AS "coalesce"
   FROM ("public"."students" "s"
     JOIN "public"."student_guardians" "sg" ON (("sg"."student_id" = "s"."id")))
  WHERE ("sg"."guardian_id" = "auth"."uid"()))) OR ("turmas" && ( SELECT COALESCE("array_agg"(DISTINCT "students"."turma"), ARRAY[]::"text"[]) AS "coalesce"
   FROM "public"."students"
  WHERE ("students"."family_id" = "auth"."uid"()))))));



CREATE POLICY "Familias veem eventos da escola" ON "public"."eventos_calendario" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'family'::"text")));



CREATE POLICY "Familias veem fotos do mural da escola" ON "public"."mural_fotos" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'family'::"text") AND (("turmas" IS NULL) OR ("turmas" && ( SELECT COALESCE("array_agg"(DISTINCT "s"."turma"), ARRAY[]::"text"[]) AS "coalesce"
   FROM ("public"."students" "s"
     JOIN "public"."student_guardians" "sg" ON (("sg"."student_id" = "s"."id")))
  WHERE ("sg"."guardian_id" = "auth"."uid"()))) OR ("turmas" && ( SELECT COALESCE("array_agg"(DISTINCT "students"."turma"), ARRAY[]::"text"[]) AS "coalesce"
   FROM "public"."students"
  WHERE ("students"."family_id" = "auth"."uid"()))))));



CREATE POLICY "Familias veem itens de cardapio da escola" ON "public"."cardapio_itens" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."cardapios" "c"
  WHERE (("c"."id" = "cardapio_itens"."cardapio_id") AND ("c"."school_id" = "public"."get_my_school_id"()) AND ("public"."get_my_role"() = 'family'::"text")))));



CREATE POLICY "Familias veem suas solicitacoes" ON "public"."matricula_solicitacoes" FOR SELECT USING ((("family_id" = "auth"."uid"()) AND ("public"."get_my_role"() = 'family'::"text")));



CREATE POLICY "Families atualizam suas proprias notificacoes" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "family_id"));



CREATE POLICY "Families veem suas proprias notificacoes" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "family_id"));



CREATE POLICY "Família acessa logs dos filhos vinculados" ON "public"."attendance_logs" FOR SELECT TO "authenticated" USING ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"())) OR (("public"."get_my_role"() = 'family'::"text") AND ("family_id" = "auth"."uid"())) OR (("public"."get_my_role"() = 'family'::"text") AND ("student_id" IN ( SELECT "student_guardians"."student_id"
   FROM "public"."student_guardians"
  WHERE ("student_guardians"."guardian_id" = "auth"."uid"()))))));



CREATE POLICY "Família lê próprios vínculos" ON "public"."student_guardians" FOR SELECT USING ((("guardian_id" = "auth"."uid"()) OR ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE ("students"."family_id" = "auth"."uid"())))));



CREATE POLICY "Família remove vínculos dos próprios filhos" ON "public"."student_guardians" FOR DELETE USING ((("guardian_id" = "auth"."uid"()) OR ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE ("students"."family_id" = "auth"."uid"())))));



CREATE POLICY "Famílias acessam próprios autorizados" ON "public"."authorized_persons" USING ((("auth"."uid"() = "family_id") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("auth"."uid"() = "family_id") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Famílias atualizam check-in dos próprios filhos" ON "public"."students" FOR UPDATE USING ((("auth"."uid"() = "family_id") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("auth"."uid"() = "family_id") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Famílias leem próprios filhos" ON "public"."students" FOR SELECT USING ((("auth"."uid"() = "family_id") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Gestao e admin gerenciam documentos do aluno" ON "public"."student_documents" USING ((("public"."get_my_role"() = 'gestao'::"text") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'gestao'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Gestao le autorizados da escola" ON "public"."authorized_persons" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_read_gestao"()));



CREATE POLICY "Gestao le ficha medica da escola" ON "public"."fichas_medicas" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_read_gestao"()));



CREATE POLICY "Gestao le solicitacoes da escola" ON "public"."matricula_solicitacoes" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_read_gestao"()));



CREATE POLICY "Gestao le vinculos da escola" ON "public"."student_guardians" FOR SELECT USING ((("school_id" = "public"."get_my_school_id"()) AND "public"."can_read_gestao"()));



CREATE POLICY "Guardioes inserem historico dos proprios filhos" ON "public"."attendance_logs" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'family'::"text") AND ("family_id" = "auth"."uid"()) AND ("student_id" IN ( SELECT "student_guardians"."student_id"
   FROM "public"."student_guardians"
  WHERE ("student_guardians"."guardian_id" = "auth"."uid"())))));



CREATE POLICY "Guardioes veem logs dos proprios filhos" ON "public"."attendance_logs" FOR SELECT USING ((("public"."get_my_role"() = 'family'::"text") AND (("auth"."uid"() = "family_id") OR ("student_id" IN ( SELECT "student_guardians"."student_id"
   FROM "public"."student_guardians"
  WHERE ("student_guardians"."guardian_id" = "auth"."uid"()))))));



CREATE POLICY "Impedir insert direto no histórico (Apenas Edge Function)" ON "public"."attendance_logs" FOR INSERT WITH CHECK (false);



CREATE POLICY "Insercao de historico por admin ou developer" ON "public"."attendance_logs" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()))));



CREATE POLICY "Insercao de usuarios por admin ou developer" ON "public"."users" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'developer'::"text") OR (("public"."get_my_role"() = 'admin'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'family'::"text"])))));



CREATE POLICY "Leitura de configuracoes globais por autenticados" ON "public"."system_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Leitura de documentos do aluno" ON "public"."student_documents" FOR SELECT USING (("public"."can_read_gestao"() AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Leitura de escolas permitida para membros ou devs" ON "public"."schools" FOR SELECT USING ((("public"."get_my_role"() = 'developer'::"text") OR ("id" = "public"."get_my_school_id"())));



CREATE POLICY "Leitura de estudantes filtrada por tenant/familia" ON "public"."students" FOR SELECT TO "authenticated" USING ((("public"."get_my_role"() = 'developer'::"text") OR ("public"."can_read_gestao"() AND ("school_id" = "public"."get_my_school_id"())) OR (("public"."get_my_role"() = 'family'::"text") AND ("family_id" = "auth"."uid"())) OR (("public"."get_my_role"() = 'family'::"text") AND "public"."is_guardian_of"("id"))));



CREATE POLICY "Leitura de perfis de usuario" ON "public"."users" FOR SELECT TO "authenticated" USING ((("public"."get_my_role"() = 'developer'::"text") OR ("public"."can_read_gestao"() AND ("school_id" = "public"."get_my_school_id"())) OR ("id" = "auth"."uid"()) OR ("id" IN ( SELECT "public"."get_co_guardian_ids"() AS "get_co_guardian_ids"))));



CREATE POLICY "Leitura publica da imagem de login (anon)" ON "public"."system_settings" FOR SELECT TO "anon" USING (("key" = 'login_image_url'::"text"));



CREATE POLICY "Modificacao de configuracoes globais apenas por developers" ON "public"."system_settings" USING (("public"."get_my_role"() = 'developer'::"text")) WITH CHECK (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "Professores atualizam seus proprios relatorios" ON "public"."reports" FOR UPDATE USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores criam frequencia dos alunos de suas turmas" ON "public"."class_attendance" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("recorded_by" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores criam registros dos alunos de suas turmas" ON "public"."pedagogical_records" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores criam relatorios de mitigacao" ON "public"."mitigacao_reports" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores criam relatorios dos alunos de suas turmas" ON "public"."reports" FOR INSERT WITH CHECK ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores editam apenas seus proprios registros" ON "public"."pedagogical_records" FOR UPDATE USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()))) WITH CHECK ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores editam apenas seus proprios registros de frequencia" ON "public"."class_attendance" FOR UPDATE USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("recorded_by" = "auth"."uid"()))) WITH CHECK ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("recorded_by" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores editam seus proprios rascunhos de mitigacao" ON "public"."mitigacao_reports" FOR UPDATE USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()) AND ("status" = 'RASCUNHO'::"text") AND ("school_id" = "public"."get_my_school_id"()))) WITH CHECK ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()) AND ("status" = 'RASCUNHO'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Professores excluem apenas seus proprios registros" ON "public"."pedagogical_records" FOR DELETE USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"())));



CREATE POLICY "Professores excluem apenas seus proprios registros de frequenci" ON "public"."class_attendance" FOR DELETE USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("recorded_by" = "auth"."uid"())));



CREATE POLICY "Professores excluem seus proprios rascunhos de mitigacao" ON "public"."mitigacao_reports" FOR DELETE USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("author_id" = "auth"."uid"()) AND ("status" = 'RASCUNHO'::"text")));



CREATE POLICY "Professores excluem seus proprios relatorios" ON "public"."reports" FOR DELETE USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("author_id" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Professores gerenciam secoes de seus relatorios" ON "public"."report_sections" USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("report_id" IN ( SELECT "reports"."id"
   FROM "public"."reports"
  WHERE ("reports"."author_id" = "auth"."uid"()))))) WITH CHECK ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("report_id" IN ( SELECT "reports"."id"
   FROM "public"."reports"
  WHERE ("reports"."author_id" = "auth"."uid"())))));



CREATE POLICY "Professores leem alunos de suas turmas" ON "public"."students" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("turma" = ANY ("public"."get_my_turmas"()))));



CREATE POLICY "Professores leem associacoes das proprias turmas" ON "public"."class_subjects" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("class_name" = ANY ("public"."get_my_turmas"()))));



CREATE POLICY "Professores leem frequencia dos alunos de suas turmas" ON "public"."class_attendance" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores leem materias da escola" ON "public"."subjects" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Professores leem modelos ativos da escola" ON "public"."report_templates" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("is_active" = true)));



CREATE POLICY "Professores leem registros dos alunos de suas turmas" ON "public"."pedagogical_records" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores leem relatorios de mitigacao de suas turmas" ON "public"."mitigacao_reports" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores leem relatorios dos alunos de suas turmas" ON "public"."reports" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("school_id" = "public"."get_my_school_id"()) AND ("student_id" IN ( SELECT "students"."id"
   FROM "public"."students"
  WHERE (("students"."turma" = ANY ("public"."get_my_turmas"())) AND ("students"."school_id" = "public"."get_my_school_id"()))))));



CREATE POLICY "Professores leem secoes de modelos ativos" ON "public"."report_template_sections" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("template_id" IN ( SELECT "report_templates"."id"
   FROM "public"."report_templates"
  WHERE (("report_templates"."school_id" = "public"."get_my_school_id"()) AND ("report_templates"."is_active" = true))))));



CREATE POLICY "Professores leem status de leitura de seus relatorios" ON "public"."report_reads" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("report_id" IN ( SELECT "reports"."id"
   FROM "public"."reports"
  WHERE ("reports"."author_id" = "auth"."uid"())))));



CREATE POLICY "Professores leem turmas normalizadas da escola" ON "public"."classes" FOR SELECT USING ((("public"."get_my_role"() = 'teacher'::"text") AND ("public"."get_my_teacher_status"() = 'ativo'::"text") AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Qualquer um registra erros de cliente" ON "public"."client_error_logs" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Usuario le suas proprias leituras" ON "public"."system_update_reads" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Usuarios gerenciam suas proprias leituras" ON "public"."comunicado_reads" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Usuarios registram suas proprias acoes de auditoria" ON "public"."audit_logs" FOR INSERT WITH CHECK ((("actor_id" = "auth"."uid"()) AND ("school_id" = "public"."get_my_school_id"())));



CREATE POLICY "Usuários acessam próprios cliques" ON "public"."user_menu_clicks" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários gerenciam próprias subscriptions" ON "public"."push_subscriptions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."attendance_corrections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aulas_especiais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auth_nonces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."authorized_persons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cardapio_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cardapios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_subjects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_error_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comunicado_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comunicados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_job_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_attendance_status" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "developer le cron_job_logs" ON "public"."cron_job_logs" FOR SELECT USING (("public"."get_my_role"() = 'developer'::"text"));



CREATE POLICY "developer le edge_function_logs" ON "public"."edge_function_logs" FOR SELECT USING (("public"."get_my_role"() = 'developer'::"text"));



ALTER TABLE "public"."diario_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."edge_function_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."error_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eventos_calendario" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fichas_medicas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_billing_discounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_charge_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_charges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_contracts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."funcionarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."history_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kiosk_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matricula_solicitacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mitigacao_report_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mitigacao_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mural_fotos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedagogical_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_delivery_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limit_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_template_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_gateway_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role only" ON "public"."push_delivery_attempts" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."shadow_face_recognition_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_guardians" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subjects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_update_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_menu_clicks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."attendance_logs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."schools";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."students";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."_apply_attendance_correction"("p_log_id" "uuid", "p_new_event_time" timestamp with time zone, "p_new_event_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_apply_attendance_correction"("p_log_id" "uuid", "p_new_event_time" timestamp with time zone, "p_new_event_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_apply_attendance_manual_entry"("p_school_id" "uuid", "p_student_id" "uuid", "p_event_type" "text", "p_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_apply_attendance_manual_entry"("p_school_id" "uuid", "p_student_id" "uuid", "p_event_type" "text", "p_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_qr_hmac_key"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_qr_hmac_key"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_attendance_correction"("p_correction_id" "uuid", "p_approve" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_attendance_correction"("p_correction_id" "uuid", "p_approve" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_attendance_correction"("p_correction_id" "uuid", "p_approve" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_atualizacao_cadastral"("p_solicitacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_atualizacao_cadastral"("p_solicitacao_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_atualizacao_cadastral"("p_solicitacao_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_matricula"("p_solicitacao_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_matricula"("p_solicitacao_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_matricula"("p_solicitacao_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_read_gestao"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_gestao"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_gestao"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_write_gestao"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_write_gestao"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_write_gestao"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_kiosk_confirm_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_kiosk_confirm_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_kiosk_confirm_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_kiosk_recognition_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_kiosk_recognition_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_kiosk_recognition_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_pin_login_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_pin_login_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_pin_login_rate_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_key" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_must_change_password_on_password_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_must_change_password_on_password_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_school_and_users"("target_school_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_school_and_users"("target_school_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_school_and_users"("target_school_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_stale_attendance_marking"("p_student_id" "uuid", "p_event_type" "text", "p_reason_code" "text", "p_reason_detail" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_stale_attendance_marking"("p_student_id" "uuid", "p_event_type" "text", "p_reason_code" "text", "p_reason_detail" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_stale_attendance_marking"("p_student_id" "uuid", "p_event_type" "text", "p_reason_code" "text", "p_reason_detail" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_authorized_persons_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_authorized_persons_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_authorized_persons_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_chat_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_chat_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_chat_rate_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_school_by_webhook_token"("p_gateway" "text", "p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_school_by_webhook_token"("p_gateway" "text", "p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_school_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_school_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_school_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_student_qr_token"("p_student_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_student_qr_token"("p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_student_qr_token"("p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_co_guardian_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_co_guardian_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_co_guardian_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_cron_secret"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_cron_secret"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_chat_visibilidade_total"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_chat_visibilidade_total"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_chat_visibilidade_total"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_departamento"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_departamento"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_departamento"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_school_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_school_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_school_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_teacher_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_teacher_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_teacher_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_turmas"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_turmas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_turmas"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_school_gateway_secret"("p_school_id" "uuid", "p_gateway" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_school_gateway_secret"("p_school_id" "uuid", "p_gateway" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_school_login_image"("p_school_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_school_login_image"("p_school_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_school_login_image"("p_school_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_school_login_image"("p_school_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_segundo_responsavel"("p_student_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_segundo_responsavel"("p_student_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_segundo_responsavel"("p_student_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_guardians"("student_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_guardians"("student_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_guardians"("student_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_teacher_authorized_persons"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_teacher_authorized_persons"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_teacher_authorized_persons"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_turmas_by_school_code"("p_school_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_turmas_by_school_code"("p_school_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_turmas_by_school_code"("p_school_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_financial_guardian"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_financial_guardian"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_financial_guardian"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_guardian_of"("student_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_guardian_of"("student_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_guardian_of"("student_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_guardian_released"("p_guardian_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_guardian_released"("p_guardian_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_guardian_released"("p_guardian_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_valid_billing_config"("p" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."is_valid_billing_config"("p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_valid_billing_config"("p" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_valid_weekly_schedule"("p" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."is_valid_weekly_schedule"("p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_valid_weekly_schedule"("p" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kiosk_request_access"("p_student_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kiosk_request_access"("p_student_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_security_definer_grantees"("p_function_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_security_definer_grantees"("p_function_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_cron_job_run"("p_job_name" "text", "p_status_code" integer, "p_detail" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_cron_job_run"("p_job_name" "text", "p_status_code" integer, "p_detail" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_edge_function_error"("p_function_name" "text", "p_level" "text", "p_message" "text", "p_context" "jsonb", "p_school_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_edge_function_error"("p_function_name" "text", "p_level" "text", "p_message" "text", "p_context" "jsonb", "p_school_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_error"("p_source" "text", "p_category" "text", "p_message" "text", "p_severity" "text", "p_stack" "text", "p_context" "jsonb", "p_school_id" "uuid", "p_user_id" "uuid", "p_role" "text", "p_url" "text", "p_user_agent" "text", "p_screen" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_error"("p_source" "text", "p_category" "text", "p_message" "text", "p_severity" "text", "p_stack" "text", "p_context" "jsonb", "p_school_id" "uuid", "p_user_id" "uuid", "p_role" "text", "p_url" "text", "p_user_agent" "text", "p_screen" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_error"("p_source" "text", "p_category" "text", "p_message" "text", "p_severity" "text", "p_stack" "text", "p_context" "jsonb", "p_school_id" "uuid", "p_user_id" "uuid", "p_role" "text", "p_url" "text", "p_user_agent" "text", "p_screen" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_error"("p_source" "text", "p_category" "text", "p_message" "text", "p_severity" "text", "p_stack" "text", "p_context" "jsonb", "p_school_id" "uuid", "p_user_id" "uuid", "p_role" "text", "p_url" "text", "p_user_agent" "text", "p_screen" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_critical_error_log"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_critical_error_log"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_critical_error_log"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_admin_privilege_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_admin_privilege_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_admin_privilege_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_financial_contract_admin_updates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_financial_contract_admin_updates"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_school_pedagogical_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_school_pedagogical_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_student_weekly_schedule"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_student_weekly_schedule"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_student_weekly_schedule"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rename_school_turma"("p_old_name" "text", "p_new_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rename_school_turma"("p_old_name" "text", "p_new_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rename_school_turma"("p_old_name" "text", "p_new_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_attendance_correction"("p_log_id" "uuid", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean, "p_new_event_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_attendance_correction"("p_log_id" "uuid", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean, "p_new_event_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_attendance_correction"("p_log_id" "uuid", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean, "p_new_event_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_attendance_manual_entry"("p_student_id" "uuid", "p_event_type" "text", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_attendance_manual_entry"("p_student_id" "uuid", "p_event_type" "text", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_attendance_manual_entry"("p_student_id" "uuid", "p_event_type" "text", "p_new_event_time" timestamp with time zone, "p_reason_code" "text", "p_reason_detail" "text", "p_minutes_delta" integer, "p_increases_billing" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_class_id_from_name"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_class_id_from_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restrict_family_student_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."restrict_family_student_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restrict_family_student_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_audit_log_actor_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_audit_log_actor_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_audit_log_actor_name"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_cron_secret"("p_name" "text", "p_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_cron_secret"("p_name" "text", "p_secret" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_school_gateway_secret"("p_school_id" "uuid", "p_gateway" "text", "p_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_school_gateway_secret"("p_school_id" "uuid", "p_gateway" "text", "p_secret" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."teacher_can_see_authorized_person"("p_person_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."teacher_can_see_authorized_person"("p_person_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."teacher_can_see_authorized_person"("p_person_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."teacher_visible_family_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."teacher_visible_family_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."teacher_visible_family_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_chat_thread"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_chat_thread"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_chat_thread"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_class_attendance_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_class_attendance_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_subjects_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_subjects_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_student_class"("p_student_id" "uuid", "p_new_turma" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_student_class"("p_student_id" "uuid", "p_new_turma" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_student_class"("p_student_id" "uuid", "p_new_turma" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_student_to_external_school"("p_student_id" "uuid", "p_destination_school_name" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_student_to_external_school"("p_student_id" "uuid", "p_destination_school_name" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_student_to_external_school"("p_student_id" "uuid", "p_destination_school_name" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_school_turmas"("p_turmas" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_school_turmas"("p_turmas" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_school_turmas"("p_turmas" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_checkin_qr"("p_payload" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_checkin_qr"("p_payload" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_checkin_qr"("p_payload" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."attendance_corrections" TO "anon";
GRANT ALL ON TABLE "public"."attendance_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_logs" TO "anon";
GRANT ALL ON TABLE "public"."attendance_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_logs" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."aulas_especiais" TO "anon";
GRANT ALL ON TABLE "public"."aulas_especiais" TO "authenticated";
GRANT ALL ON TABLE "public"."aulas_especiais" TO "service_role";



GRANT ALL ON TABLE "public"."auth_nonces" TO "anon";
GRANT ALL ON TABLE "public"."auth_nonces" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_nonces" TO "service_role";



GRANT ALL ON TABLE "public"."authorized_persons" TO "anon";
GRANT ALL ON TABLE "public"."authorized_persons" TO "authenticated";
GRANT ALL ON TABLE "public"."authorized_persons" TO "service_role";



GRANT ALL ON TABLE "public"."cardapio_itens" TO "anon";
GRANT ALL ON TABLE "public"."cardapio_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."cardapio_itens" TO "service_role";



GRANT ALL ON TABLE "public"."cardapios" TO "anon";
GRANT ALL ON TABLE "public"."cardapios" TO "authenticated";
GRANT ALL ON TABLE "public"."cardapios" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_threads" TO "anon";
GRANT ALL ON TABLE "public"."chat_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_threads" TO "service_role";



GRANT ALL ON TABLE "public"."class_attendance" TO "anon";
GRANT ALL ON TABLE "public"."class_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."class_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."class_subjects" TO "anon";
GRANT ALL ON TABLE "public"."class_subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."class_subjects" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."client_error_logs" TO "anon";
GRANT ALL ON TABLE "public"."client_error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."client_error_logs" TO "service_role";



GRANT ALL ON TABLE "public"."comunicado_reads" TO "anon";
GRANT ALL ON TABLE "public"."comunicado_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."comunicado_reads" TO "service_role";



GRANT ALL ON TABLE "public"."comunicados" TO "anon";
GRANT ALL ON TABLE "public"."comunicados" TO "authenticated";
GRANT ALL ON TABLE "public"."comunicados" TO "service_role";



GRANT ALL ON TABLE "public"."cron_job_logs" TO "anon";
GRANT ALL ON TABLE "public"."cron_job_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_job_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cron_job_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cron_job_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cron_job_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cron_secrets" TO "anon";
GRANT ALL ON TABLE "public"."cron_secrets" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."daily_attendance_status" TO "anon";
GRANT ALL ON TABLE "public"."daily_attendance_status" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_attendance_status" TO "service_role";



GRANT ALL ON TABLE "public"."diario_entries" TO "anon";
GRANT ALL ON TABLE "public"."diario_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."diario_entries" TO "service_role";



GRANT ALL ON TABLE "public"."edge_function_logs" TO "anon";
GRANT ALL ON TABLE "public"."edge_function_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."edge_function_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."edge_function_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."edge_function_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."edge_function_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."error_logs" TO "anon";
GRANT ALL ON TABLE "public"."error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."error_logs" TO "service_role";



GRANT ALL ON TABLE "public"."eventos_calendario" TO "anon";
GRANT ALL ON TABLE "public"."eventos_calendario" TO "authenticated";
GRANT ALL ON TABLE "public"."eventos_calendario" TO "service_role";



GRANT ALL ON TABLE "public"."fichas_medicas" TO "anon";
GRANT ALL ON TABLE "public"."fichas_medicas" TO "authenticated";
GRANT ALL ON TABLE "public"."fichas_medicas" TO "service_role";



GRANT ALL ON TABLE "public"."financial_billing_discounts" TO "anon";
GRANT ALL ON TABLE "public"."financial_billing_discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_billing_discounts" TO "service_role";



GRANT ALL ON TABLE "public"."financial_charge_events" TO "anon";
GRANT ALL ON TABLE "public"."financial_charge_events" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_charge_events" TO "service_role";



GRANT ALL ON TABLE "public"."financial_charges" TO "anon";
GRANT ALL ON TABLE "public"."financial_charges" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_charges" TO "service_role";



GRANT ALL ON TABLE "public"."financial_contracts" TO "anon";
GRANT ALL ON TABLE "public"."financial_contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_contracts" TO "service_role";



GRANT ALL ON TABLE "public"."funcionarios" TO "anon";
GRANT ALL ON TABLE "public"."funcionarios" TO "authenticated";
GRANT ALL ON TABLE "public"."funcionarios" TO "service_role";



GRANT ALL ON TABLE "public"."history_records" TO "service_role";



GRANT ALL ON TABLE "public"."kiosk_devices" TO "anon";
GRANT ALL ON TABLE "public"."kiosk_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."kiosk_devices" TO "service_role";



GRANT ALL ON TABLE "public"."matricula_solicitacoes" TO "anon";
GRANT ALL ON TABLE "public"."matricula_solicitacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."matricula_solicitacoes" TO "service_role";



GRANT ALL ON TABLE "public"."mitigacao_report_reads" TO "anon";
GRANT ALL ON TABLE "public"."mitigacao_report_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."mitigacao_report_reads" TO "service_role";



GRANT ALL ON TABLE "public"."mitigacao_reports" TO "anon";
GRANT ALL ON TABLE "public"."mitigacao_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."mitigacao_reports" TO "service_role";



GRANT ALL ON TABLE "public"."mural_fotos" TO "anon";
GRANT ALL ON TABLE "public"."mural_fotos" TO "authenticated";
GRANT ALL ON TABLE "public"."mural_fotos" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."pedagogical_records" TO "anon";
GRANT ALL ON TABLE "public"."pedagogical_records" TO "authenticated";
GRANT ALL ON TABLE "public"."pedagogical_records" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_delivery_attempts" TO "anon";
GRANT ALL ON TABLE "public"."push_delivery_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."push_delivery_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_attempts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rate_limit_attempts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rate_limit_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rate_limit_attempts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."report_reads" TO "anon";
GRANT ALL ON TABLE "public"."report_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."report_reads" TO "service_role";



GRANT ALL ON TABLE "public"."report_sections" TO "anon";
GRANT ALL ON TABLE "public"."report_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."report_sections" TO "service_role";



GRANT ALL ON TABLE "public"."report_template_sections" TO "anon";
GRANT ALL ON TABLE "public"."report_template_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."report_template_sections" TO "service_role";



GRANT ALL ON TABLE "public"."report_templates" TO "anon";
GRANT ALL ON TABLE "public"."report_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."report_templates" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."school_gateway_accounts" TO "anon";
GRANT ALL ON TABLE "public"."school_gateway_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."school_gateway_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";



GRANT ALL ON TABLE "public"."shadow_face_recognition_log" TO "anon";
GRANT ALL ON TABLE "public"."shadow_face_recognition_log" TO "authenticated";
GRANT ALL ON TABLE "public"."shadow_face_recognition_log" TO "service_role";



GRANT ALL ON TABLE "public"."student_documents" TO "anon";
GRANT ALL ON TABLE "public"."student_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."student_documents" TO "service_role";



GRANT ALL ON TABLE "public"."student_guardians" TO "anon";
GRANT ALL ON TABLE "public"."student_guardians" TO "authenticated";
GRANT ALL ON TABLE "public"."student_guardians" TO "service_role";



GRANT ALL ON TABLE "public"."student_transfers" TO "anon";
GRANT ALL ON TABLE "public"."student_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."student_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."subjects" TO "anon";
GRANT ALL ON TABLE "public"."subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."subjects" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."system_update_reads" TO "anon";
GRANT ALL ON TABLE "public"."system_update_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."system_update_reads" TO "service_role";



GRANT ALL ON TABLE "public"."system_updates" TO "anon";
GRANT ALL ON TABLE "public"."system_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."system_updates" TO "service_role";



GRANT ALL ON TABLE "public"."user_menu_clicks" TO "anon";
GRANT ALL ON TABLE "public"."user_menu_clicks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_menu_clicks" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































-- ── Fora do esquema public (não entra no db dump padrão) ─────────────

-- As expressões abaixo citam funções/tabelas de public sem prefixo; o
-- Postgres resolve os nomes na criação e grava a referência exata.
SET search_path TO public, extensions;

-- Buckets do Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('comunicados-anexos', 'comunicados-anexos', false, 15728640, '{image/png,image/jpeg,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('matriculas-docs', 'matriculas-docs', false, 15728640, '{image/png,image/jpeg,image/webp,application/pdf}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('mural-fotos', 'mural-fotos', false, 10485760, '{image/png,image/jpeg,image/webp,image/gif}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('person-photos', 'person-photos', false, 5242880, '{image/png,image/jpeg,image/webp}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('student-documents', 'student-documents', false, 15728640, '{image/png,image/jpeg,image/webp,application/pdf}'::text[]) ON CONFLICT (id) DO NOTHING;

-- Policies do Storage (storage.objects)
DROP POLICY IF EXISTS "Admins gerenciam anexos de comunicados da escola" ON storage.objects;
CREATE POLICY "Admins gerenciam anexos de comunicados da escola" ON storage.objects AS PERMISSIVE FOR ALL TO public USING (((bucket_id = 'comunicados-anexos'::text) AND (get_my_role() = 'admin'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text))) WITH CHECK (((bucket_id = 'comunicados-anexos'::text) AND (get_my_role() = 'admin'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));
DROP POLICY IF EXISTS "Admins gerenciam fotos de autorizados da escola" ON storage.objects;
CREATE POLICY "Admins gerenciam fotos de autorizados da escola" ON storage.objects AS PERMISSIVE FOR ALL TO public USING (((bucket_id = 'person-photos'::text) AND (get_my_role() = 'admin'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text))) WITH CHECK (((bucket_id = 'person-photos'::text) AND (get_my_role() = 'admin'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));
DROP POLICY IF EXISTS "Admins gerenciam objetos do mural da escola" ON storage.objects;
CREATE POLICY "Admins gerenciam objetos do mural da escola" ON storage.objects AS PERMISSIVE FOR ALL TO public USING (((bucket_id = 'mural-fotos'::text) AND (get_my_role() = 'admin'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text))) WITH CHECK (((bucket_id = 'mural-fotos'::text) AND (get_my_role() = 'admin'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));
DROP POLICY IF EXISTS "Admins leem documentos de matricula da escola" ON storage.objects;
CREATE POLICY "Admins leem documentos de matricula da escola" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'matriculas-docs'::text) AND (get_my_role() = 'admin'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));
DROP POLICY IF EXISTS "Familias gerenciam fotos dos proprios autorizados" ON storage.objects;
CREATE POLICY "Familias gerenciam fotos dos proprios autorizados" ON storage.objects AS PERMISSIVE FOR ALL TO public USING (((bucket_id = 'person-photos'::text) AND (get_my_role() = 'family'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text) AND (EXISTS ( SELECT 1
   FROM authorized_persons ap
  WHERE ((ap.family_id = auth.uid()) AND ((ap.id)::text = regexp_replace(split_part(objects.name, '/'::text, 2), '\.[a-zA-Z0-9]+$'::text, ''::text))))))) WITH CHECK (((bucket_id = 'person-photos'::text) AND (get_my_role() = 'family'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text) AND (EXISTS ( SELECT 1
   FROM authorized_persons ap
  WHERE ((ap.family_id = auth.uid()) AND ((ap.id)::text = regexp_replace(split_part(objects.name, '/'::text, 2), '\.[a-zA-Z0-9]+$'::text, ''::text)))))));
DROP POLICY IF EXISTS "Familias gerenciam seus documentos de matricula" ON storage.objects;
CREATE POLICY "Familias gerenciam seus documentos de matricula" ON storage.objects AS PERMISSIVE FOR ALL TO public USING (((bucket_id = 'matriculas-docs'::text) AND (get_my_role() = 'family'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'matriculas-docs'::text) AND (get_my_role() = 'family'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Familias leem anexos de comunicados da escola" ON storage.objects;
CREATE POLICY "Familias leem anexos de comunicados da escola" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'comunicados-anexos'::text) AND (get_my_role() = 'family'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));
DROP POLICY IF EXISTS "Familias leem objetos do mural da escola" ON storage.objects;
CREATE POLICY "Familias leem objetos do mural da escola" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'mural-fotos'::text) AND (get_my_role() = 'family'::text) AND (EXISTS ( SELECT 1
   FROM mural_fotos mf
  WHERE ((mf.storage_path = objects.name) AND (mf.school_id = get_my_school_id()) AND ((mf.turmas IS NULL) OR (mf.turmas && ( SELECT COALESCE(array_agg(DISTINCT s.turma), ARRAY[]::text[]) AS "coalesce"
           FROM (students s
             JOIN student_guardians sg ON ((sg.student_id = s.id)))
          WHERE (sg.guardian_id = auth.uid()))) OR (mf.turmas && ( SELECT COALESCE(array_agg(DISTINCT students.turma), ARRAY[]::text[]) AS "coalesce"
           FROM students
          WHERE (students.family_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Gestao e admin gerenciam arquivos de documentos do aluno" ON storage.objects;
CREATE POLICY "Gestao e admin gerenciam arquivos de documentos do aluno" ON storage.objects AS PERMISSIVE FOR ALL TO public USING (((bucket_id = 'student-documents'::text) AND (get_my_role() = 'gestao'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text))) WITH CHECK (((bucket_id = 'student-documents'::text) AND (get_my_role() = 'gestao'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));
DROP POLICY IF EXISTS "Leitura de arquivos de documentos do aluno" ON storage.objects;
CREATE POLICY "Leitura de arquivos de documentos do aluno" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'student-documents'::text) AND can_read_gestao() AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));
DROP POLICY IF EXISTS "Professores leem fotos de autorizados de suas turmas" ON storage.objects;
CREATE POLICY "Professores leem fotos de autorizados de suas turmas" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'person-photos'::text) AND (get_my_role() = 'teacher'::text) AND (get_my_teacher_status() = 'ativo'::text) AND ((storage.foldername(name))[1] = (get_my_school_id())::text) AND teacher_can_see_authorized_person(regexp_replace(split_part(name, '/'::text, 2), '\.[a-zA-Z0-9]+$'::text, ''::text))));

-- Trigger em auth.users: desliga a troca obrigatória de senha quando a senha muda de verdade
DROP TRIGGER IF EXISTS "on_auth_password_changed_clear_flag" ON auth.users;
CREATE TRIGGER on_auth_password_changed_clear_flag AFTER UPDATE OF encrypted_password ON auth.users FOR EACH ROW EXECUTE FUNCTION public.clear_must_change_password_on_password_update();
