-- Até agora só dava pra CORRIGIR um horário de check-in/check-out que já
-- tinha sido registrado -- pedido explícito do usuário: às vezes o horário
-- certo é de um lado que nunca chegou a ser gravado (ex: a saída nunca
-- passou pelo totem, o campo fica em branco pra sempre). Precisa dar pra
-- LANÇAR esse horário do zero, com a mesma auditoria/aprovação de sempre.
--
-- attendance_corrections.attendance_log_id era NOT NULL (toda correção
-- precisava apontar pra um log já existente) -- relaxa pra NULL: uma
-- solicitação de lançamento manual pendente de aprovação ainda não tem
-- log nenhum por trás (só é criado quando aprovada). original_event_time
-- também vira NULL (não existe "valor original" quando nunca houve
-- registro).
ALTER TABLE attendance_corrections
  ALTER COLUMN attendance_log_id DROP NOT NULL,
  ALTER COLUMN original_event_time DROP NOT NULL;

-- Insere de fato um NOVO log (usada só por request_attendance_manual_entry,
-- quando não aumenta cobrança, e por approve_attendance_correction, quando
-- uma solicitação pendente é aprovada). Mesmo espelho em students.today_*
-- de _apply_attendance_correction, mas via INSERT em vez de UPDATE.
CREATE OR REPLACE FUNCTION public._apply_attendance_manual_entry(
  p_school_id uuid,
  p_student_id uuid,
  p_event_type text,
  p_event_time timestamptz,
  p_reason_code text,
  p_reason_detail text
)
RETURNS uuid
LANGUAGE plpgsql
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

  -- Mesmo critério de _apply_attendance_correction: só espelha em students
  -- se este for o evento mais recente do aluno hoje.
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
      today_entry = to_char(p_event_time AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"|"HH24:MI:SS'),
      status = 'in_school'
    WHERE id = p_student_id;
  ELSE
    UPDATE students SET
      today_exit_at = p_event_time,
      today_exit = to_char(p_event_time AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"|"HH24:MI:SS'),
      status = 'left'
    WHERE id = p_student_id;
  END IF;

  RETURN v_log_id;
END;
$$;

-- Solicita o LANÇAMENTO de um horário que nunca foi registrado (não existe
-- attendance_logs por trás). Mesma regra de fricção das outras correções:
-- se não aumenta cobrança, aplica na hora (cria o log já); se aumenta, fica
-- pendente -- e o log só é criado quando outro admin aprovar.
CREATE OR REPLACE FUNCTION public.request_attendance_manual_entry(
  p_student_id uuid,
  p_event_type text,
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
  v_student record;
  v_correction_id uuid;
  v_log_id uuid;
  v_status text;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Só administradores podem lançar presença manualmente';
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

  v_status := CASE WHEN p_increases_billing THEN 'pending' ELSE 'applied' END;

  IF NOT p_increases_billing THEN
    v_log_id := public._apply_attendance_manual_entry(
      v_student.school_id, p_student_id, p_event_type, p_new_event_time,
      p_reason_code, p_reason_detail
    );
  END IF;

  INSERT INTO attendance_corrections (
    school_id, attendance_log_id, student_id, event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) VALUES (
    v_student.school_id, v_log_id, p_student_id, p_event_type,
    NULL, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, p_increases_billing, auth.uid(), v_status
  )
  RETURNING id INTO v_correction_id;

  RETURN jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
END;
$$;

-- approve_attendance_correction precisa saber lidar com uma solicitação
-- pendente que ainda não tem log nenhum (attendance_log_id NULL) -- cria o
-- log só agora, na aprovação, e só então liga a correção a ele.
CREATE OR REPLACE FUNCTION public.approve_attendance_correction(p_correction_id uuid, p_approve boolean)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_correction record;
  v_new_log_id uuid;
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
    IF v_correction.attendance_log_id IS NULL THEN
      -- Lançamento manual pendente: o log só nasce agora.
      v_new_log_id := public._apply_attendance_manual_entry(
        v_correction.school_id, v_correction.student_id, v_correction.event_type,
        v_correction.new_event_time, v_correction.reason_code, v_correction.reason_detail
      );
      UPDATE attendance_corrections
      SET attendance_log_id = v_new_log_id, status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
      WHERE id = p_correction_id;
    ELSE
      PERFORM public._apply_attendance_correction(v_correction.attendance_log_id, v_correction.new_event_time, v_correction.new_event_type);
      UPDATE attendance_corrections
      SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
      WHERE id = p_correction_id;
    END IF;
  ELSE
    UPDATE attendance_corrections
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_correction_id;
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_attendance_manual_entry(uuid, text, timestamptz, text, text, integer, boolean) TO authenticated;
