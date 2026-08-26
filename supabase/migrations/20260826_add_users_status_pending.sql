-- Autocadastro público de Responsável ("Novo usuário?" na tela de login):
-- cria a conta já com status 'pending' até um admin aprovar. Contas criadas
-- pelos fluxos existentes (admin, 2º responsável) continuam 'active' por
-- padrão, sem qualquer mudança de comportamento pra elas.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'pending'));
