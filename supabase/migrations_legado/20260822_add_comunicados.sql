-- Feature: Comunicados (mural de avisos da escola para as famílias)

CREATE TABLE IF NOT EXISTS comunicados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comunicado_reads (
  comunicado_id uuid NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz DEFAULT now(),
  PRIMARY KEY (comunicado_id, user_id)
);

ALTER TABLE comunicados ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicado_reads ENABLE ROW LEVEL SECURITY;

-- Admins gerenciam (CRUD completo) os comunicados da própria escola
DROP POLICY IF EXISTS "Admins gerenciam comunicados da escola" ON comunicados;
CREATE POLICY "Admins gerenciam comunicados da escola"
ON comunicados FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Famílias só leem os comunicados da própria escola
DROP POLICY IF EXISTS "Familias veem comunicados da escola" ON comunicados;
CREATE POLICY "Familias veem comunicados da escola"
ON comunicados FOR SELECT
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'family');

-- Cada usuário só lê/escreve suas próprias marcações de leitura
DROP POLICY IF EXISTS "Usuarios gerenciam suas proprias leituras" ON comunicado_reads;
CREATE POLICY "Usuarios gerenciam suas proprias leituras"
ON comunicado_reads FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Ao publicar um comunicado, notifica (in-app) todas as famílias da escola —
-- reaproveita a tabela/infra de notifications já usada por notify_on_attendance.
CREATE OR REPLACE FUNCTION notify_on_comunicado()
RETURNS TRIGGER AS $$
DECLARE
  v_family_id uuid;
BEGIN
  FOR v_family_id IN
    SELECT id FROM users WHERE school_id = NEW.school_id AND role = 'family'
  LOOP
    INSERT INTO notifications (school_id, family_id, student_id, type, message)
    VALUES (NEW.school_id, v_family_id, NULL, 'comunicado', NEW.title);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_comunicado ON comunicados;
CREATE TRIGGER trigger_notify_comunicado
AFTER INSERT ON comunicados
FOR EACH ROW
EXECUTE FUNCTION notify_on_comunicado();
