-- Permite selecionar MÚLTIPLAS turmas por comunicado (em vez de uma só).
-- turmas = NULL continua significando "Todas as Turmas".
ALTER TABLE comunicados ADD COLUMN IF NOT EXISTS turmas text[];

UPDATE comunicados
SET turmas = ARRAY[turma]
WHERE turma IS NOT NULL AND turmas IS NULL;

-- A policy antiga depende da coluna turma — precisa cair antes do DROP COLUMN.
DROP POLICY IF EXISTS "Familias veem comunicados da escola" ON comunicados;

ALTER TABLE comunicados DROP COLUMN IF EXISTS turma;
CREATE POLICY "Familias veem comunicados da escola"
ON comunicados FOR SELECT
USING (
  school_id = public.get_my_school_id()
  AND public.get_my_role() = 'family'
  AND (
    turmas IS NULL
    OR turmas && (
      SELECT COALESCE(array_agg(DISTINCT s.turma), ARRAY[]::text[])
      FROM students s
      JOIN student_guardians sg ON sg.student_id = s.id
      WHERE sg.guardian_id = auth.uid()
    )
    OR turmas && (
      SELECT COALESCE(array_agg(DISTINCT turma), ARRAY[]::text[])
      FROM students WHERE family_id = auth.uid()
    )
  )
);

CREATE OR REPLACE FUNCTION notify_on_comunicado()
RETURNS TRIGGER AS $$
DECLARE
  v_family_id uuid;
BEGIN
  IF NEW.turmas IS NULL THEN
    FOR v_family_id IN
      SELECT id FROM users WHERE school_id = NEW.school_id AND role = 'family'
    LOOP
      INSERT INTO notifications (school_id, family_id, student_id, type, message)
      VALUES (NEW.school_id, v_family_id, NULL, 'comunicado', NEW.title);
    END LOOP;
  ELSE
    FOR v_family_id IN
      SELECT DISTINCT guardian_id AS id
      FROM student_guardians sg
      JOIN students s ON s.id = sg.student_id
      WHERE s.school_id = NEW.school_id AND s.turma = ANY(NEW.turmas)
      UNION
      SELECT DISTINCT family_id AS id
      FROM students
      WHERE school_id = NEW.school_id AND turma = ANY(NEW.turmas) AND family_id IS NOT NULL
    LOOP
      INSERT INTO notifications (school_id, family_id, student_id, type, message)
      VALUES (NEW.school_id, v_family_id, NULL, 'comunicado', NEW.title);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
