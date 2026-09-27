-- Adiciona a coluna status na tabela authorized_persons se ela não existir
ALTER TABLE IF EXISTS public.authorized_persons 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

-- Cria índice composto para otimizar consultas filtradas por escola e status
CREATE INDEX IF NOT EXISTS idx_authorized_persons_school_status 
ON public.authorized_persons (school_id, status);

-- Comentário descritivo na coluna
COMMENT ON COLUMN public.authorized_persons.status is 'Status de aprovação da pessoa autorizada (ex: approved, pending, blocked)';
