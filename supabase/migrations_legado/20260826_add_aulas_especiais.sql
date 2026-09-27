-- Aulas Especiais: grade recorrente (não é evento com data fixa como
-- eventos_calendario) — Yoga toda Segunda, Educação Física toda Terça e
-- Quinta, Biologia primeira Terça do mês, etc. Duas categorias: geral
-- (todos os alunos) e integral (só quem fica no período integral).
CREATE TABLE IF NOT EXISTS public.aulas_especiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nome text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('geral', 'integral')),
  frequencia text NOT NULL CHECK (frequencia IN ('semanal', 'mensal')),
  dias_semana text[] NOT NULL DEFAULT '{}',
  -- só relevante quando frequencia = 'mensal': 'primeira'|'segunda'|'terceira'|'quarta'|'ultima'
  ocorrencias_mes text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aulas_especiais_school ON public.aulas_especiais(school_id);

ALTER TABLE public.aulas_especiais ENABLE ROW LEVEL SECURITY;

-- Qualquer admin (sem restrição de departamento) gerencia as aulas
-- especiais da própria escola — pedido explícito do usuário.
DROP POLICY IF EXISTS "Admins gerenciam aulas especiais da propria escola" ON public.aulas_especiais;
CREATE POLICY "Admins gerenciam aulas especiais da propria escola"
ON public.aulas_especiais FOR ALL
USING (
  public.get_my_role() = 'admin' AND school_id = public.get_my_school_id()
)
WITH CHECK (
  public.get_my_role() = 'admin' AND school_id = public.get_my_school_id()
);

-- Família: só leitura, mesma escola.
DROP POLICY IF EXISTS "Familias leem aulas especiais da escola" ON public.aulas_especiais;
CREATE POLICY "Familias leem aulas especiais da escola"
ON public.aulas_especiais FOR SELECT
USING (
  public.get_my_role() = 'family' AND school_id = public.get_my_school_id()
);
