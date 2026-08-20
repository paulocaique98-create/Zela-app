-- Permite direcionar um comunicado para uma turma específica em vez de sempre
-- broadcastar pra escola inteira. turma = NULL significa "Todas as Turmas".
ALTER TABLE comunicados ADD COLUMN IF NOT EXISTS turma text;

-- Família só vê comunicados gerais (turma IS NULL) ou da turma de algum filho seu
-- (cobre 1º e 2º Responsável via student_guardians, e fallback via family_id direto).
DROP POLICY IF EXISTS "Familias veem comunicados da escola" ON comunicados;
CREATE POLICY "Familias veem comunicados da escola"
ON comunicados FOR SELECT
USING (
  school_id = public.get_my_school_id()
  AND public.get_my_role() = 'family'
  AND (
    turma IS NULL
    OR turma IN (
      SELECT s.turma FROM students s
      JOIN student_guardians sg ON sg.student_id = s.id
      WHERE sg.guardian_id = auth.uid()
    )
    OR turma IN (
      SELECT turma FROM students WHERE family_id = auth.uid()
    )
  )
);

-- O trigger de notificação agora só avisa as famílias que realmente enxergam o
-- comunicado: todas (turma NULL) ou só quem tem filho na turma selecionada.
CREATE OR REPLACE FUNCTION notify_on_comunicado()
RETURNS TRIGGER AS $$
DECLARE
  v_family_id uuid;
BEGIN
  IF NEW.turma IS NULL THEN
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
      WHERE s.school_id = NEW.school_id AND s.turma = NEW.turma
      UNION
      SELECT DISTINCT family_id AS id
      FROM students
      WHERE school_id = NEW.school_id AND turma = NEW.turma AND family_id IS NOT NULL
    LOOP
      INSERT INTO notifications (school_id, family_id, student_id, type, message)
      VALUES (NEW.school_id, v_family_id, NULL, 'comunicado', NEW.title);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
