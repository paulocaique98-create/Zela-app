-- Complemento da 20260926: ao trocar o TIPO de um registro (ex: uma entrada
-- mal gravada vira a saída real), o campo antigo em students precisa ser
-- limpo — senão a tela de Presença Diária continua mostrando a "entrada"
-- errada ao lado da "saída" já corrigida, como se fossem dois eventos
-- distintos do mesmo dia. Só limpa se não existir NENHUM outro log do tipo
-- original pra esse aluno hoje — se existir, é um evento real separado e
-- não pode ser apagado. Mesma assinatura da função já publicada — CREATE OR
-- REPLACE simples, sem precisar DROP.
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
      today_entry = to_char(p_new_event_time AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"|"HH24:MI:SS'),
      status = 'in_school',
      today_exit_at = CASE WHEN v_original_type <> v_final_type AND NOT v_other_original_type_exists THEN NULL ELSE today_exit_at END,
      today_exit = CASE WHEN v_original_type <> v_final_type AND NOT v_other_original_type_exists THEN NULL ELSE today_exit END
    WHERE id = v_log.student_id;
  ELSE
    UPDATE students SET
      today_exit_at = p_new_event_time,
      today_exit = to_char(p_new_event_time AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"|"HH24:MI:SS'),
      status = 'left',
      today_entry_at = CASE WHEN v_original_type <> v_final_type AND NOT v_other_original_type_exists THEN NULL ELSE today_entry_at END,
      today_entry = CASE WHEN v_original_type <> v_final_type AND NOT v_other_original_type_exists THEN NULL ELSE today_entry END
    WHERE id = v_log.student_id;
  END IF;
END;
$$;
