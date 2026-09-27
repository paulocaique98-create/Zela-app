-- Feature: Ficha Médica — família preenche/edita, admin só visualiza (leitura).
-- Uma ficha por aluno. Cada bloco (alergia, restrição de saúde, especialista,
-- tratamento, medicamento, hábito) é um booleano "possui?" + uma lista de textos
-- (text[]) pra suportar múltiplas entradas quando a resposta é SIM.
CREATE TABLE IF NOT EXISTS fichas_medicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  tem_restricao_alimentar boolean NOT NULL DEFAULT false,
  restricoes_alimentares text[] NOT NULL DEFAULT '{}',
  tem_restricao_saude boolean NOT NULL DEFAULT false,
  restricoes_saude text[] NOT NULL DEFAULT '{}',
  consultou_especialista boolean NOT NULL DEFAULT false,
  especialistas text[] NOT NULL DEFAULT '{}',
  faz_tratamento boolean NOT NULL DEFAULT false,
  tratamentos text[] NOT NULL DEFAULT '{}',
  usa_medicamento boolean NOT NULL DEFAULT false,
  medicamentos text[] NOT NULL DEFAULT '{}',
  tem_habito_importante boolean NOT NULL DEFAULT false,
  habitos_importantes text[] NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fichas_medicas_school ON fichas_medicas(school_id);

ALTER TABLE fichas_medicas ENABLE ROW LEVEL SECURITY;

-- Família (1º ou 2º responsável) gerencia (CRUD completo) a ficha dos próprios filhos.
DROP POLICY IF EXISTS "Familias gerenciam ficha medica dos filhos" ON fichas_medicas;
CREATE POLICY "Familias gerenciam ficha medica dos filhos"
ON fichas_medicas FOR ALL
USING (
  public.get_my_role() = 'family'
  AND student_id IN (SELECT student_id FROM student_guardians WHERE guardian_id = auth.uid())
)
WITH CHECK (
  public.get_my_role() = 'family'
  AND student_id IN (SELECT student_id FROM student_guardians WHERE guardian_id = auth.uid())
);

-- Admin só lê (nunca edita) as fichas médicas da própria escola.
DROP POLICY IF EXISTS "Admins leem ficha medica da escola" ON fichas_medicas;
CREATE POLICY "Admins leem ficha medica da escola"
ON fichas_medicas FOR SELECT
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');
