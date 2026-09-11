-- Correção manual de horário de check-in/check-out com auditoria e
-- aprovação. Ver plano em: Correção Manual de Presença com Auditoria e
-- Aprovação. Duas peças:
--   1. attendance_logs ganha colunas de auditoria — nunca sobrescreve o
--      valor original, sempre guarda quem/quando/motivo.
--   2. attendance_corrections é a fila estruturada: toda correção passa por
--      ela. Se NÃO aumenta a cobrança, aplica na hora (status 'applied'). Se
--      aumenta, fica 'pending' até outro admin (nunca quem pediu) aprovar.
-- Ambas as mutações reais passam pelas RPCs abaixo (SECURITY INVOKER — a RLS
-- de quem chama continua valendo).

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS original_event_time timestamptz,
  ADD COLUMN IF NOT EXISTS corrected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction_reason_code text,
  ADD COLUMN IF NOT EXISTS correction_reason_detail text,
  ADD COLUMN IF NOT EXISTS corrected_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz;

-- UPDATE em attendance_logs não existia (a tabela era só-inserção). Só admin
-- da própria escola pode atualizar, e só as RPCs abaixo de fato o fazem no
-- app — a RLS aqui é o limite real, não uma trava de UI.
DROP POLICY IF EXISTS "Admins corrigem historico da escola" ON attendance_logs;
CREATE POLICY "Admins corrigem historico da escola"
ON attendance_logs FOR UPDATE
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  attendance_log_id uuid NOT NULL REFERENCES attendance_logs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('entry', 'exit')),
  original_event_time timestamptz NOT NULL,
  new_event_time timestamptz NOT NULL,
  reason_code text NOT NULL,
  reason_detail text,
  minutes_delta integer NOT NULL DEFAULT 0,
  increases_billing boolean NOT NULL DEFAULT false,
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('applied', 'pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_school ON attendance_corrections(school_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_pending ON attendance_corrections(school_id) WHERE status = 'pending';
ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;

-- Só admin da escola enxerga a fila/histórico de correções — é dado
-- operacional interno, não é exposto à família nesta tabela (a família vê o
-- resultado já espelhado em attendance_logs.corrected).
DROP POLICY IF EXISTS "Admins leem correcoes da escola" ON attendance_corrections;
CREATE POLICY "Admins leem correcoes da escola"
ON attendance_corrections FOR SELECT
USING (public.get_my_role() IN ('admin', 'developer') AND school_id = public.get_my_school_id());

-- Sem INSERT/UPDATE direto pelo client — só as RPCs abaixo escrevem aqui
-- (rodando com o privilégio de quem chama, então essa ausência de policy de
-- escrita é proposital: força tudo passar pela validação das funções).

-- Aplica de fato a correção num log (usada pelas duas RPCs abaixo). Espelha
-- em students.today_entry*/today_exit* SOMENTE se o log corrigido for de
-- hoje (fuso Brasília) — é o que AdminDailyPresence.jsx lê ao vivo.
CREATE OR REPLACE FUNCTION public._apply_attendance_correction(p_log_id uuid, p_new_event_time timestamptz)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_log record;
  v_is_today boolean;
BEGIN
  SELECT * INTO v_log FROM attendance_logs WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de presença não encontrado';
  END IF;

  UPDATE attendance_logs SET
    original_event_time = COALESCE(original_event_time, event_time),
    event_time = p_new_event_time,
    corrected = true,
    corrected_by = auth.uid(),
    corrected_at = now()
  WHERE id = p_log_id;

  v_is_today := (p_new_event_time AT TIME ZONE 'America/Sao_Paulo')::date
              = (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF v_is_today THEN
    IF v_log.event_type = 'entry' THEN
      UPDATE students SET
        today_entry_at = p_new_event_time,
        today_entry = to_char(p_new_event_time AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"|"HH24:MI:SS')
      WHERE id = v_log.student_id;
    ELSE
      UPDATE students SET
        today_exit_at = p_new_event_time,
        today_exit = to_char(p_new_event_time AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"|"HH24:MI:SS')
      WHERE id = v_log.student_id;
    END IF;
  END IF;
END;
$$;

-- Chamada pelo admin que está corrigindo. increases_billing/minutes_delta
-- vêm calculados do client (mesmas funções de attendanceUtils.js usadas no
-- relatório de horas extras) — não é uma decisão de segurança financeira
-- crítica, é só o gatilho de fricção; a correção fica sempre auditada e
-- visível independente do valor desse flag.
CREATE OR REPLACE FUNCTION public.request_attendance_correction(
  p_log_id uuid,
  p_new_event_time timestamptz,
  p_reason_code text,
  p_reason_detail text,
  p_minutes_delta integer,
  p_increases_billing boolean
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_log record;
  v_correction_id uuid;
  v_status text;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Só administradores podem corrigir presença';
  END IF;

  SELECT * INTO v_log FROM attendance_logs WHERE id = p_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de presença não encontrado';
  END IF;
  IF v_log.school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'Registro não pertence à sua escola';
  END IF;
  IF COALESCE(p_reason_code, '') = '' THEN
    RAISE EXCEPTION 'Motivo da correção é obrigatório';
  END IF;

  v_status := CASE WHEN p_increases_billing THEN 'pending' ELSE 'applied' END;

  INSERT INTO attendance_corrections (
    school_id, attendance_log_id, student_id, event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) VALUES (
    v_log.school_id, p_log_id, v_log.student_id, v_log.event_type,
    v_log.event_time, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, p_increases_billing, auth.uid(), v_status
  )
  RETURNING id INTO v_correction_id;

  IF NOT p_increases_billing THEN
    PERFORM public._apply_attendance_correction(p_log_id, p_new_event_time);
  END IF;

  RETURN jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
END;
$$;

-- Chamada por outro admin (ou developer) pra aprovar/rejeitar uma correção
-- que aumenta cobrança. Quem pediu não pode aprovar a própria solicitação.
CREATE OR REPLACE FUNCTION public.approve_attendance_correction(p_correction_id uuid, p_approve boolean)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_correction record;
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'developer') THEN
    RAISE EXCEPTION 'Sem permissão para revisar correções de presença';
  END IF;

  SELECT * INTO v_correction FROM attendance_corrections WHERE id = p_correction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação de correção não encontrada';
  END IF;
  IF public.get_my_role() = 'admin' AND v_correction.school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'Solicitação não pertence à sua escola';
  END IF;
  IF v_correction.status <> 'pending' THEN
    RAISE EXCEPTION 'Solicitação já foi % — nada a fazer', v_correction.status;
  END IF;
  IF v_correction.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'Quem solicitou a correção não pode aprovar a própria solicitação';
  END IF;

  IF p_approve THEN
    PERFORM public._apply_attendance_correction(v_correction.attendance_log_id, v_correction.new_event_time);
    UPDATE attendance_corrections
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_correction_id;
  ELSE
    UPDATE attendance_corrections
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_correction_id;
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_attendance_correction(uuid, timestamptz, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_attendance_correction(uuid, boolean) TO authenticated;
