-- Registros Pedagógicos Internos: observação diária, períodos sensíveis/interesses e
-- interações sociais compartilham a mesma tabela (log "append-only", campos variam
-- por record_type, guardados em content jsonb). REGRA ABSOLUTA: família nunca tem
-- policy de SELECT aqui — não é a UI que esconde, é a ausência de acesso na camada
-- de dados (RLS nega por padrão quando nenhuma policy concede).
CREATE TABLE IF NOT EXISTS pedagogical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN ('DAILY_OBSERVATION', 'SENSITIVE_PERIOD', 'SOCIAL_INTERACTION')),
  author_id uuid NOT NULL REFERENCES users(id),
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedagogical_records_student ON pedagogical_records(student_id, record_type, record_date DESC);
CREATE INDEX IF NOT EXISTS idx_pedagogical_records_school ON pedagogical_records(school_id, record_type);

ALTER TABLE pedagogical_records ENABLE ROW LEVEL SECURITY;

-- Professor: só acessa registros de alunos da(s) turma(s) que leciona, e só enquanto
-- a conta estiver ativa (inativo/bloqueado perde acesso automaticamente, sem precisar
-- de um mecanismo separado de "forçar logout").
DROP POLICY IF EXISTS "Professores gerenciam registros dos alunos de suas turmas" ON pedagogical_records;
CREATE POLICY "Professores gerenciam registros dos alunos de suas turmas"
ON pedagogical_records FOR ALL
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students
    WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
)
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students
    WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

-- Admin: visão geral só de leitura (acompanhamento pedagógico), sem editar registro
-- de outro professor.
DROP POLICY IF EXISTS "Admins leem registros pedagogicos da escola" ON pedagogical_records;
CREATE POLICY "Admins leem registros pedagogicos da escola"
ON pedagogical_records FOR SELECT
USING (
  public.get_my_role() = 'admin'
  AND school_id = public.get_my_school_id()
);
