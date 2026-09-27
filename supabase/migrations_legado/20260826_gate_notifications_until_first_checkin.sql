-- Um novo aluno cadastrado não deve gerar nenhuma notificação (nem a do
-- próprio check-in) pros responsáveis até o PRIMEIRO check-in de verdade
-- acontecer — evita bombardear a família com avisos de sistema (cardápio,
-- mural, etc) antes de a criança sequer ter frequentado a escola.
-- A partir do 1º check-in (que fica silencioso, só "libera" o aluno), tudo
-- volta a notificar normalmente pros dois responsáveis, do 2º evento em
-- diante — inclusive o próprio check-out desse mesmo dia.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS first_checkin_at timestamptz;

-- 1. Trigger de check-in/check-out (attendance_logs): silencia só o evento
-- que libera o aluno; qualquer notificação depois disso segue normal.
CREATE OR REPLACE FUNCTION notify_on_attendance()
RETURNS TRIGGER AS $$
DECLARE
  v_student_name text;
  v_message text;
  v_type text;
  v_guardian_id uuid;
  v_notified_ids uuid[] := ARRAY[]::uuid[];
  v_first_checkin_at timestamptz;
  v_is_releasing_event boolean := false;
BEGIN
  SELECT name, first_checkin_at INTO v_student_name, v_first_checkin_at
  FROM students WHERE id = NEW.student_id;

  IF NEW.event_type = 'entry' THEN
    v_type := 'checkin_confirmed';
    v_message := 'O check-in de ' || v_student_name || ' foi confirmado.';

    IF v_first_checkin_at IS NULL THEN
      -- Este é o primeiro check-in desse aluno: libera as notificações daqui
      -- pra frente, mas o evento em si fica silencioso.
      UPDATE students SET first_checkin_at = now() WHERE id = NEW.student_id;
      v_is_releasing_event := true;
    END IF;
  ELSIF NEW.event_type = 'exit' THEN
    v_type := 'checkout_confirmed';
    v_message := 'O check-out de ' || v_student_name || ' foi confirmado.';
  ELSE
    RETURN NEW;
  END IF;

  -- Este é o evento que libera o aluno (1º check-in) -> fica silencioso.
  -- Ou: aluno ainda não tinha (e este exit também não conta como liberação)
  -- -> também não notifica (caso de borda: saída sem entrada registrada).
  IF v_is_releasing_event OR v_first_checkin_at IS NULL THEN
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

-- 2. Função auxiliar: um responsável está "liberado" se tiver ao menos um
-- filho (titular via students.family_id, ou 2º responsável via
-- student_guardians) com first_checkin_at já preenchido. Usada pela Edge
-- Function notify-families (avisos gerais: cardápio, mural, comunicados,
-- calendário, diário) pra não notificar quem ainda não passou pelo 1º
-- check-in.
CREATE OR REPLACE FUNCTION public.is_guardian_released(p_guardian_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
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

GRANT EXECUTE ON FUNCTION public.is_guardian_released(uuid) TO authenticated, service_role;
