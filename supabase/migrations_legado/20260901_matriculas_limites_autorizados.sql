-- Limite de autorizados configurável por escola (tela de suporte/DEV): quantos
-- "autorizados de retirada" cada responsável pode cadastrar na matrícula, e quantos
-- autorizados exclusivos de transporte. Básico = 2 por responsável + 1 de transporte.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS limits jsonb NOT NULL DEFAULT '{"autorizados_por_responsavel": 2, "autorizados_transporte": 1}'::jsonb;

-- Nenhuma solicitação foi enviada ainda (feature nova) — substitui a coluna
-- `autorizado` (objeto único) por `autorizados` (lista), pra suportar múltiplos
-- autorizados por responsável dentro do limite configurado.
ALTER TABLE matricula_solicitacoes DROP COLUMN IF EXISTS autorizado;
ALTER TABLE matricula_solicitacoes ADD COLUMN IF NOT EXISTS autorizados jsonb NOT NULL DEFAULT '[]'::jsonb;
