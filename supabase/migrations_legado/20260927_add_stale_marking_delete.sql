-- Marcação fantasma: uma solicitação de check-in/out grava o horário em
-- students.today_entry/today_exit (e os _at) no MOMENTO da solicitação,
-- antes de qualquer confirmação. Se a solicitação é cancelada (botão
-- "Cancelar Solicitação" do Monitor), o horário ficava esquecido lá —
-- nenhum registro em attendance_logs existe, mas a Presença Diária
-- continua mostrando aquele horário como se fosse um check-in/out real, e
-- o lápis de correção não acha nada pra editar (não existe log nenhum).
-- App.jsx (rejectStudentStatus) já foi corrigido pra limpar esse campo ao
-- cancelar — mas os casos já existentes (e qualquer outra causa de
-- marcação órfã) precisam de uma forma de remoção, com motivo obrigatório
-- e rastro em attendance_corrections, igual às outras correções.

ALTER TABLE attendance_corrections
  ALTER COLUMN attendance_log_id DROP NOT NULL,
  ALTER COLUMN new_event_time DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'edit' CHECK (action_type IN ('edit', 'delete'));

-- Remove uma marcação de entrada/saída em students.today_* que NÃO tem
-- nenhum log correspondente em attendance_logs (ou seja, nunca foi de fato
-- confirmada) — a única situação em que "apagar" é seguro, porque não hÁ
-- registro imutável sendo destruído, só um valor órfão sendo limpo. Nunca
-- precisa de aprovação de outro admin: remover uma marcação fantasma só
-- pode reduzir o que aparece pra família, nunca aumentar cobrança.
CREATE OR REPLACE FUNCTION public.delete_stale_attendance_marking(
  p_student_id uuid,
  p_event_type text,
  p_reason_code text,
  p_reason_detail text
)
RETURNS jsonb
LANGUAGE plpgsql
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

GRANT EXECUTE ON FUNCTION public.delete_stale_attendance_marking(uuid, text, text, text) TO authenticated;
