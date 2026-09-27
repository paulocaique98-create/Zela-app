-- Migration: Adicionar campos de endereço e documentos aos usuários (famílias)
-- Tabela alvo: users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS zip_code     TEXT,
  ADD COLUMN IF NOT EXISTS street       TEXT,
  ADD COLUMN IF NOT EXISTS number       TEXT,
  ADD COLUMN IF NOT EXISTS complement   TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS city         TEXT,
  ADD COLUMN IF NOT EXISTS state        TEXT,
  ADD COLUMN IF NOT EXISTS documents    JSONB,
  ADD COLUMN IF NOT EXISTS image_usage_accepted BOOLEAN DEFAULT NULL;
