-- 1. Habilitar RLS em todas as tabelas sensíveis
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorized_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- 2. Políticas para a Tabela 'users' (Permite que o usuário veja apenas a si mesmo)
CREATE POLICY "Usuários podem ver seu próprio perfil"
ON users FOR SELECT
USING (auth.uid() = id);

-- 3. Políticas para a Tabela 'students'
-- Famílias veem e atualizam apenas seus próprios filhos
CREATE POLICY "Famílias acessam próprios filhos"
ON students FOR ALL
USING (auth.uid() = family_id);

-- Admins de Escola veem e atualizam todos os alunos da sua escola
CREATE POLICY "Admins acessam alunos da escola"
ON students FOR ALL
USING (
  school_id IN (
    SELECT school_id FROM users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 4. Políticas para a Tabela 'authorized_persons'
-- Famílias gerenciam seus próprios autorizados
CREATE POLICY "Famílias acessam próprios autorizados"
ON authorized_persons FOR ALL
USING (auth.uid() = family_id);

-- Admins acessam autorizados da sua escola
CREATE POLICY "Admins acessam autorizados da escola"
ON authorized_persons FOR ALL
USING (
  school_id IN (
    SELECT school_id FROM users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 5. Políticas para 'attendance_logs' (Histórico)
-- Famílias só veem seus logs
CREATE POLICY "Famílias veem logs dos seus filhos"
ON attendance_logs FOR SELECT
USING (auth.uid() = family_id);

-- Admins veem logs da escola
CREATE POLICY "Admins veem logs da escola"
ON attendance_logs FOR SELECT
USING (
  school_id IN (
    SELECT school_id FROM users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Apenas funções com privilégios (Service Role via Edge Function) podem inserir logs.
-- O cliente (anon/authenticated) NÃO PODE fazer INSERT direto no histórico.
CREATE POLICY "Impedir insert direto no histórico (Apenas Edge Function)"
ON attendance_logs FOR INSERT
WITH CHECK (false); 
