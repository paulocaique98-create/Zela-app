-- Cobrança de hora extra geral: billing_config passa a aceitar o modo de
-- cobrança e a faixa única. Só amplia o que a função valida; não mexe em
-- RLS, policies nem em dados existentes (escolas sem as chaves seguem no
-- modo individual por default no código).
CREATE OR REPLACE FUNCTION "public"."is_valid_billing_config"("p" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  allowed_keys text[] := ARRAY['early_checkin_tolerance_min', 'late_checkout_tolerance_min', 'hourly_rate_cents', 'charge_early_checkin', 'billing_mode', 'general_tolerance_min', 'general_charge_cents'];
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
  IF p ? 'billing_mode' AND (jsonb_typeof(p->'billing_mode') <> 'string' OR (p->>'billing_mode') NOT IN ('individual', 'general')) THEN
    RETURN false;
  END IF;
  IF p ? 'general_tolerance_min' AND (jsonb_typeof(p->'general_tolerance_min') <> 'number' OR (p->>'general_tolerance_min')::numeric < 0 OR (p->>'general_tolerance_min')::numeric > 240) THEN
    RETURN false;
  END IF;
  IF p ? 'general_charge_cents' AND (jsonb_typeof(p->'general_charge_cents') <> 'number' OR (p->>'general_charge_cents')::numeric < 0 OR (p->>'general_charge_cents')::numeric > 100000) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;
