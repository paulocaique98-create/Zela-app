-- Cardápio semanal recorrente (não por data — a escola edita a "semana padrão" e ela
-- se repete até ser alterada de novo).
CREATE TABLE IF NOT EXISTS cardapio_semanal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  dia_semana int NOT NULL CHECK (dia_semana BETWEEN 1 AND 5), -- 1=Segunda .. 5=Sexta
  refeicao text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (school_id, dia_semana, refeicao)
);

ALTER TABLE cardapio_semanal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam cardapio da escola" ON cardapio_semanal;
CREATE POLICY "Admins gerenciam cardapio da escola"
ON cardapio_semanal FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Familias veem cardapio da escola" ON cardapio_semanal;
CREATE POLICY "Familias veem cardapio da escola"
ON cardapio_semanal FOR SELECT
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'family');
