-- Fundação do papel Professor: users ganha turmas[] (quais turmas leciona) e
-- teacher_status (ativo/inativo/bloqueado). Segue o mesmo padrão já usado pro
-- Admin (departamento + get_my_departamento()).
ALTER TABLE users ADD COLUMN IF NOT EXISTS turmas text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_status text NOT NULL DEFAULT 'ativo'
  CHECK (teacher_status IN ('ativo', 'inativo', 'bloqueado'));

CREATE OR REPLACE FUNCTION public.get_my_turmas()
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT turmas FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_teacher_status()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT teacher_status FROM users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_turmas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_teacher_status() TO authenticated;
