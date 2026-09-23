-- Bug real em produção (23/09): editar/lançar um horário de hoje quebrava
-- com "column today_entry is of type time without time zone but expression
-- is of type text". As funções de correção/lançamento manual escreviam um
-- texto composto "YYYY-MM-DD|HH24:MI:SS" em students.today_entry/today_exit,
-- só que essas colunas são `time without time zone` de verdade (confirmado
-- via information_schema), não texto -- provavelmente um mal-entendido de
-- schema na hora de escrever essas funções. today_entry/today_exit já são
-- documentadas como campos LEGADO só de exibição (a fonte de verdade real é
-- today_entry_at/today_exit_at, timestamptz), então o conserto certo é só
-- gravar a HORA (sem data) nesses campos, igual ao que sempre foi o formato
-- real da coluna.

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
