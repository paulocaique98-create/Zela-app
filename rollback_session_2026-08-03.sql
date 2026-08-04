-- ============================================================
-- ROLLBACK SQL — Zela Portal
-- Desfaz alterações feitas na sessão de 2026-08-03
-- até o Ponto de Restauração (v1.2.0)
--
-- ⚠️ LEIA ANTES DE EXECUTAR:
-- 1. Execute no SQL Editor do painel Supabase.
-- 2. Execute cada bloco em ordem (de cima para baixo).
-- 3. O bloco de DADOS DE TESTE remove apenas os registros
--    criados automaticamente pelo teste de QA. Verifique
--    antes se os e-mails listados são realmente de teste.
-- 4. O bloco de SCHEMA remove a coluna linked_family_id.
--    Se você JÁ TINHA essa coluna antes desta sessão,
--    NÃO execute esse bloco.
-- ============================================================


-- ============================================================
-- BLOCO 1: Remover dados de teste criados pelo browser agent
-- (Usuário "Test QA Admin", aluno "Student QA", etc.)
-- ⚠️ Confira os e-mails antes de executar!
-- ============================================================

-- 1a. Apaga o aluno de teste vinculado ao titular de teste
DELETE FROM public.students
WHERE name = 'Student QA'
  AND family_id IN (
    SELECT id FROM public.users WHERE email = 'qa.admin123@example.com'
  );

-- 1b. Apaga o registro de authorized_persons do titular de teste
DELETE FROM public.authorized_persons
WHERE family_id IN (
    SELECT id FROM public.users WHERE email = 'qa.admin123@example.com'
  );

-- 1c. Apaga o usuário secundário de teste (responsável)
-- Primeiro precisamos deletar no auth.users (feito pela Edge Function delete-user,
-- mas como é teste, podemos fazer direto pelo painel Auth do Supabase)
-- Aqui removemos apenas da tabela pública:
DELETE FROM public.users WHERE email = 'qa.sec123@example.com';

-- 1d. Apaga o usuário titular de teste
DELETE FROM public.users WHERE email = 'qa.admin123@example.com';

-- Nota: Para remover completamente os usuários do sistema de autenticação,
-- vá em Authentication > Users no painel do Supabase e delete manualmente:
--   qa.admin123@example.com
--   qa.sec123@example.com


-- ============================================================
-- BLOCO 2: Remover a coluna linked_family_id da tabela users
--
-- ⚠️ NÃO execute este bloco se a coluna existia antes
--    desta sessão ou se qualquer outro sistema já depende
--    dela. Isso é IRREVERSÍVEL.
-- ============================================================

-- 2a. Remove a constraint de FK antes de dropar a coluna
-- (caso tenha sido criada com nome automático)
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.users'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) ILIKE '%linked_family_id%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
    RAISE NOTICE 'FK constraint % removida.', constraint_name;
  ELSE
    RAISE NOTICE 'Nenhuma FK constraint para linked_family_id encontrada.';
  END IF;
END $$;

-- 2b. Remove a coluna
ALTER TABLE public.users
DROP COLUMN IF EXISTS linked_family_id;

-- Confirmação
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'linked_family_id';
-- Se a query acima retornar 0 linhas: coluna removida com sucesso ✅
