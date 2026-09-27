-- Período de adaptação das biometrias: quando a entrada da manhã não é
-- reconhecida (rosto ainda não cadastrado, iluminação, etc.) o aluno fica
-- 'idle'/'pending_entry' o dia todo. Na saída, o totem reconhece o
-- responsável e o sistema — corretamente, do ponto de vista dele, já que
-- não existe entrada confirmada — trata aquele reconhecimento como uma NOVA
-- entrada (computeKioskTransition em App.jsx), não como a saída real.
-- Resultado: o check-out nunca é registrado, e o aluno some do controle de
-- horas extras ou aparece com hora extra errada.
--
-- Correção: além de ajustar o HORÁRIO de um registro (já suportado), o admin
-- agora também pode trocar o TIPO do registro (entrada -> saída ou o
-- inverso) — o botão "seta de troca" no modal de correção. Estende as três
-- funções da migração anterior (20260925) com um parâmetro opcional
-- p_new_event_type; precisa DROP + CREATE (não CREATE OR REPLACE) porque
-- mudar a lista de parâmetros criaria uma segunda função sobrecarregada em
-- vez de substituir a existente, o que quebraria a resolução do endpoint
-- RPC no PostgREST (nome ambíguo).

ALTER TABLE attendance_corrections
  ADD COLUMN IF NOT EXISTS new_event_type text CHECK (new_event_type IN ('entry', 'exit'));

DROP FUNCTION IF EXISTS public.approve_attendance_correction(uuid, boolean);
DROP FUNCTION IF EXISTS public.request_attendance_correction(uuid, timestamptz, text, text, integer, boolean);
DROP FUNCTION IF EXISTS public._apply_attendance_correction(uuid, timestamptz);

-- Aplica a correção (horário e/ou tipo) e mantém students.today_entry*/
-- today_exit*/status em sincronia — SOMENTE quando o log corrigido é o
-- evento mais recente do aluno hoje, pra nunca sobrescrever um estado mais
-- novo com um mais antigo que também esteja sendo corrigido.
CREATE OR REPLACE FUNCTION public._apply_attendance_correction(
  p_log_id uuid,
  p_new_event_time timestamptz,
  p_new_event_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_log record;
  v_final_type text;
  v_is_today boolean;
  v_is_latest_today boolean;
BEGIN
  SELECT * INTO v_log FROM attendance_logs WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de presença não encontrado';
  END IF;

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

  -- Só espelha em students se este for o evento mais recente do aluno hoje
  -- (comparando com os outros logs do mesmo dia, já excluindo o próprio).
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

  IF v_final_type = 'entry' THEN
    UPDATE students SET
      today_entry_at = p_new_event_time,
      today_entry = to_char(p_new_event_time AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"|"HH24:MI:SS'),
      status = 'in_school'
    WHERE id = v_log.student_id;
  ELSE
    UPDATE students SET
      today_exit_at = p_new_event_time,
      today_exit = to_char(p_new_event_time AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"|"HH24:MI:SS'),
      status = 'left'
    WHERE id = v_log.student_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_attendance_correction(
  p_log_id uuid,
  p_new_event_time timestamptz,
  p_reason_code text,
  p_reason_detail text,
  p_minutes_delta integer,
  p_increases_billing boolean,
  p_new_event_type text DEFAULT NULL
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
  IF p_new_event_type IS NOT NULL AND p_new_event_type NOT IN ('entry', 'exit') THEN
    RAISE EXCEPTION 'Tipo de evento inválido';
  END IF;

  v_status := CASE WHEN p_increases_billing THEN 'pending' ELSE 'applied' END;

  INSERT INTO attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, new_event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) VALUES (
    v_log.school_id, p_log_id, v_log.student_id, v_log.event_type, p_new_event_type,
    v_log.event_time, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, p_increases_billing, auth.uid(), v_status
  )
  RETURNING id INTO v_correction_id;

  IF NOT p_increases_billing THEN
    PERFORM public._apply_attendance_correction(p_log_id, p_new_event_time, p_new_event_type);
  END IF;

  RETURN jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
END;
$$;

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
    PERFORM public._apply_attendance_correction(v_correction.attendance_log_id, v_correction.new_event_time, v_correction.new_event_type);
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

GRANT EXECUTE ON FUNCTION public.request_attendance_correction(uuid, timestamptz, text, text, integer, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_attendance_correction(uuid, boolean) TO authenticated;
