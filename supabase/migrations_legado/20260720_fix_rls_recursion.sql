-- 1. CRIAR AS FUNCTIONS SECURITY DEFINER
-- A cláusula SET search_path = public é uma boa prática de segurança para functions SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT school_id FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- Garantir que os usuários autenticados possam rodar as functions
GRANT EXECUTE ON FUNCTION public.get_my_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;


-- 2. RECRIAR POLICIES DA TABELA 'users'
DROP POLICY IF EXISTS "Admins acessam usuarios da escola" ON users;
CREATE POLICY "Admins acessam usuarios da escola"
ON users FOR ALL
USING (
  school_id = public.get_my_school_id() 
  AND public.get_my_role() = 'admin'
);


-- 3. RECRIAR POLICIES DA TABELA 'students'
DROP POLICY IF EXISTS "Admins acessam alunos da escola" ON students;
CREATE POLICY "Admins acessam alunos da escola"
ON students FOR ALL
USING (
  school_id = public.get_my_school_id() 
  AND public.get_my_role() = 'admin'
);


-- 4. RECRIAR POLICIES DA TABELA 'authorized_persons'
DROP POLICY IF EXISTS "Admins acessam autorizados da escola" ON authorized_persons;
CREATE POLICY "Admins acessam autorizados da escola"
ON authorized_persons FOR ALL
USING (
  school_id = public.get_my_school_id() 
  AND public.get_my_role() = 'admin'
);


-- 5. RECRIAR POLICIES DA TABELA 'attendance_logs'
DROP POLICY IF EXISTS "Admins veem logs da escola" ON attendance_logs;
CREATE POLICY "Admins veem logs da escola"
ON attendance_logs FOR SELECT
USING (
  school_id = public.get_my_school_id() 
  AND public.get_my_role() = 'admin'
);
