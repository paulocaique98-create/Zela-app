-- Garantir que o Realtime está habilitado para a nova tabela de notificações
-- Isso é fundamental para que o sino (no frontend) receba a notificação ao vivo
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Função do Trigger
CREATE OR REPLACE FUNCTION notify_on_attendance()
RETURNS TRIGGER AS $$
DECLARE
  v_student_name text;
BEGIN
  -- Buscar o nome do aluno para personalizar a mensagem
  SELECT name INTO v_student_name FROM students WHERE id = NEW.student_id;

  -- Se for um check-in ('entry')
  IF NEW.event_type = 'entry' THEN
    INSERT INTO notifications (school_id, family_id, student_id, type, message)
    VALUES (
      NEW.school_id,
      NEW.family_id,
      NEW.student_id,
      'checkin_confirmed',
      'O check-in de ' || v_student_name || ' foi confirmado.'
    );
  
  -- Se for um check-out ('exit')
  ELSIF NEW.event_type = 'exit' THEN
    INSERT INTO notifications (school_id, family_id, student_id, type, message)
    VALUES (
      NEW.school_id,
      NEW.family_id,
      NEW.student_id,
      'checkout_confirmed',
      'O check-out de ' || v_student_name || ' foi confirmado.'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover o trigger se já existir, para evitar duplicação em execuções repetidas
DROP TRIGGER IF EXISTS trigger_notify_attendance ON attendance_logs;

-- Criar o Trigger associado à tabela attendance_logs
CREATE TRIGGER trigger_notify_attendance
AFTER INSERT ON attendance_logs
FOR EACH ROW
EXECUTE FUNCTION notify_on_attendance();
