-- Migration: Adicionar campos completos de responsável e aluno
-- Executar no SQL Editor do Supabase

-- ─────────────────────────────────────────────────────────────────
-- Tabela USERS: novos campos do responsável
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone2        TEXT,
  ADD COLUMN IF NOT EXISTS doc_type      TEXT,          -- 'CPF' | 'RG' | 'CNH' | 'Passaporte'
  ADD COLUMN IF NOT EXISTS doc_number    TEXT,
  ADD COLUMN IF NOT EXISTS profession    TEXT,
  ADD COLUMN IF NOT EXISTS civil_status  TEXT,          -- 'Solteiro(a)' | ...
  ADD COLUMN IF NOT EXISTS guardian_type TEXT;          -- 'Responsável' | 'Responsável Financeiro'

-- ─────────────────────────────────────────────────────────────────
-- Tabela STUDENTS: novos campos do aluno
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS birth_date    DATE,
  ADD COLUMN IF NOT EXISTS turno         TEXT,          -- 'Matutino' | 'Vespertino' | 'Integral'
  ADD COLUMN IF NOT EXISTS periodo       TEXT,          -- '07:00 às 13:00' | ... ou personalizado
  ADD COLUMN IF NOT EXISTS medical_data  JSONB;         -- Ficha Médica (restrições, alergias, etc.)
