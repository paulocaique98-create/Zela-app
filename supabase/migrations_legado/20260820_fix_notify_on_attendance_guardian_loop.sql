-- Corrige notify_on_attendance() para notificar TODOS os responsáveis vinculados ao aluno
-- (via student_guardians), não apenas o guardião registrado em attendance_logs.family_id.
-- Sem isso, o 2º Responsável nunca recebe notificação de check-in/check-out.
CREATE OR REPLACE FUNCTION notify_on_attendance()
RETURNS TRIGGER AS $$
DECLARE
  v_student_name text;
  v_message text;
  v_type text;
  v_guardian_id uuid;
  v_notified_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT name INTO v_student_name FROM students WHERE id = NEW.student_id;

  IF NEW.event_type = 'entry' THEN
    v_type := 'checkin_confirmed';
    v_message := 'O check-in de ' || v_student_name || ' foi confirmado.';
  ELSIF NEW.event_type = 'exit' THEN
    v_type := 'checkout_confirmed';
    v_message := 'O check-out de ' || v_student_name || ' foi confirmado.';
  ELSE
    RETURN NEW;
  END IF;

  -- Notifica todos os guardiões vinculados ao aluno (1º e 2º Responsável)
  FOR v_guardian_id IN
    SELECT DISTINCT guardian_id FROM student_guardians WHERE student_id = NEW.student_id
  LOOP
    INSERT INTO notifications (school_id, family_id, student_id, type, message)
    VALUES (NEW.school_id, v_guardian_id, NEW.student_id, v_type, v_message);
    v_notified_ids := array_append(v_notified_ids, v_guardian_id);
  END LOOP;

  -- Fallback: garante que o family_id do próprio log seja notificado mesmo se
  -- não houver vínculo em student_guardians (ex: dados legados sem 2º Responsável).
  IF NEW.family_id IS NOT NULL AND NOT (NEW.family_id = ANY(v_notified_ids)) THEN
    INSERT INTO notifications (school_id, family_id, student_id, type, message)
    VALUES (NEW.school_id, NEW.family_id, NEW.student_id, v_type, v_message);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
