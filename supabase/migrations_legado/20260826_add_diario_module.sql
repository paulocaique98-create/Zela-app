-- Módulo "Diário": registro diário de refeições/sono/evacuação/observações
-- por aluno, lançado pela equipe (Administrativo, Diretoria Pedagógica,
-- Coordenação, Recepção — os 4 valores reais de users.departamento, todos
-- role='admin') e consultado pela família. Um registro por (aluno, dia) —
-- reabrir o mesmo dia edita o mesmo registro (upsert), não cria outro.
CREATE TABLE IF NOT EXISTS public.diario_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  -- cada item: { "refeicao": "Almoço", "itens_servidos": ["Arroz","Feijão"],
  --              "comeu_tudo": true, "repetiu": false, "vezes_repetiu": 0 }
  -- Guarda um retrato dos itens do cardápio no momento do lançamento — não
  -- referencia cardapio_itens por id, então segue correto mesmo se o
  -- cardápio daquele dia for editado depois.
  refeicoes jsonb NOT NULL DEFAULT '[]',
  sono_inicio time,
  sono_fim time,
  evacuou boolean,
  observacoes text,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_diario_entries_school ON public.diario_entries(school_id);
CREATE INDEX IF NOT EXISTS idx_diario_entries_student_date ON public.diario_entries(student_id, entry_date DESC);

ALTER TABLE public.diario_entries ENABLE ROW LEVEL SECURITY;

-- Admin (qualquer departamento — cobre Administrativo, Diretoria
-- Pedagógica, Coordenação e Recepção) + developer: CRUD completo da própria
-- escola. WITH CHECK espelha o USING explicitamente (mesmo cuidado do
-- achado de segurança em 20260922_protect_users_role_and_school_columns.sql
-- — nunca deixar o Postgres reusar implicitamente a condição do USING).
DROP POLICY IF EXISTS "Admins gerenciam diario da propria escola" ON public.diario_entries;
CREATE POLICY "Admins gerenciam diario da propria escola"
ON public.diario_entries FOR ALL
USING (
  (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
  OR public.get_my_role() = 'developer'
)
WITH CHECK (
  (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
  OR public.get_my_role() = 'developer'
);

-- Família: só leitura, escopada aos próprios filhos. Mesmo par de condições
-- usado na tabela students (family_id = auth.uid() é o vínculo do
-- responsável titular; student_guardians cobre o 2º responsável) — sem essa
-- união, o titular (o caso mais comum, sem linha em student_guardians)
-- ficaria sem acesso.
DROP POLICY IF EXISTS "Familias leem diario dos filhos" ON public.diario_entries;
CREATE POLICY "Familias leem diario dos filhos"
ON public.diario_entries FOR SELECT
USING (
  public.get_my_role() = 'family'
  AND student_id IN (
    SELECT id FROM students WHERE family_id = auth.uid()
    UNION
    SELECT student_id FROM student_guardians WHERE guardian_id = auth.uid()
  )
);
