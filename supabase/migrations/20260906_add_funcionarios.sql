-- Cadastro de Funcionários: registro interno da equipe da escola (professores,
-- cozinha, limpeza, etc.), sem login/conta no portal — só um cadastro do admin
-- pra ter contato, função e status em um lugar só.
CREATE TABLE IF NOT EXISTS funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  cargo text NOT NULL,
  phone text,
  email text,
  doc_number text,
  admission_date date,
  status text NOT NULL DEFAULT 'ativo', -- 'ativo' | 'inativo'
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_school ON funcionarios(school_id);

ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam funcionarios da escola" ON funcionarios;
CREATE POLICY "Admins gerenciam funcionarios da escola"
ON funcionarios FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');
