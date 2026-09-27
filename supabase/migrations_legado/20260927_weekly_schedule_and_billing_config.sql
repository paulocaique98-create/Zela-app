-- Refinamento do pedido anterior (20260926, extra_hours): não basta somar
-- horas ao horário de SAÍDA -- a escola também precisa ajustar a ENTRADA
-- contratada por dia da semana (ex.: quarta o aluno entra 1h mais cedo por
-- algum motivo), e a cobrança de hora extra passa a valer tanto pra
-- check-in ANTECIPADO (antes da entrada contratada do dia, com margem)
-- quanto pra check-out TARDIO (já existia). `extra_hours` (só um número por
-- dia, só afetando a saída) não modela isso -- substituído por
-- `weekly_schedule`, que guarda entrada E saída por dia. Nenhuma escola
-- real chegou a usar extra_hours (lançado poucas horas atrás, mesma
-- sessão) -- superseder é seguro, não migração de dado real.

-- 1. Remove a feature anterior por completo.
DROP TRIGGER IF EXISTS protect_student_extra_hours_trigger ON public.students;
DROP FUNCTION IF EXISTS public.protect_student_extra_hours();
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_extra_hours_valid;
ALTER TABLE public.students DROP COLUMN IF EXISTS extra_hours;
DROP FUNCTION IF EXISTS public.is_valid_extra_hours(jsonb);

-- 2. weekly_schedule: por dia, null (usa o horário-base do aluno,
-- contracted_entry_time/contracted_exit_time, comportamento de sempre) ou
-- {"entry": "HH:MM", "exit": "HH:MM"} (override daquele dia específico).
-- Só dias com override precisam aparecer no jsonb -- um dia ausente da
-- chave é equivalente a null.
CREATE OR REPLACE FUNCTION public.is_valid_weekly_schedule(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
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
$$;

ALTER TABLE public.students ADD COLUMN weekly_schedule jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.students ADD CONSTRAINT students_weekly_schedule_valid CHECK (public.is_valid_weekly_schedule(weekly_schedule));

-- 3. Config de cobrança por escola (schools.billing_config) -- valores hoje
-- hardcoded em attendanceUtils.js/check-attendance-delays (tolerância de
-- 15min pro check-out, R$30/h) viram configuráveis por escola, com esses
-- mesmos valores como default (nenhuma escola existente muda de
-- comportamento até o admin mexer explicitamente). Tolerância de check-in
-- antecipado é nova (não existia cobrança nenhuma nesse lado antes).
CREATE OR REPLACE FUNCTION public.is_valid_billing_config(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
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

ALTER TABLE public.schools ADD COLUMN billing_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.schools ADD CONSTRAINT schools_billing_config_valid CHECK (public.is_valid_billing_config(billing_config));

-- 4. Proteção de escrita -- mesmo padrão já usado (admin principal ou
-- developer). students.weekly_schedule entra numa trigger dedicada (só
-- essa coluna, tabela students); schools.billing_config entra no MESMO
-- grupo de turmas/login_image_url em protect_school_pedagogical_columns
-- (já existente, só estendida).
CREATE OR REPLACE FUNCTION public.protect_student_weekly_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS protect_student_weekly_schedule_trigger ON public.students;
CREATE TRIGGER protect_student_weekly_schedule_trigger
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_student_weekly_schedule();

-- Flag de dedupe pra notificação de check-in antecipado, mesmo padrão das
-- flags de saída tardia já existentes -- evita reenviar a cada execução do
-- cron (a cada 5min) enquanto o status do dia não muda.
ALTER TABLE public.daily_attendance_status ADD COLUMN IF NOT EXISTS notified_early_checkin_billing boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_school_pedagogical_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
