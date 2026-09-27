-- Script para REMOVER recursos do Kiosk/Totem no Supabase
-- AVISO: Rode isso SOMENTE após garantir que o backup de DADOS da tabela kiosk_devices foi exportado.

-- 1. DROP DAS POLICIES
DROP POLICY IF EXISTS "Kiosks acessam authorized_persons da escola" ON public.authorized_persons;
DROP POLICY IF EXISTS "Kiosks acessam students da escola" ON public.students;
DROP POLICY IF EXISTS "Kiosks atualizam students da escola" ON public.students;
DROP POLICY IF EXISTS "Kiosks leem a propria escola" ON public.schools;
DROP POLICY IF EXISTS "Kiosks inserem historico" ON public.attendance_logs;

-- 2. DROP DA FUNCTION DE AUTENTICAÇÃO
DROP FUNCTION IF EXISTS public.get_kiosk_school_id();

-- 3. DROP DA TABELA EXCLUSIVA
-- O CASCADE cuidará de limpar referências se houver, mas a instrução pedia para não remover a coluna em outras tabelas.
-- Analisando o banco de dados do projeto, a tabela kiosk_devices não é referenciada como FK em nenhuma outra tabela (attendance_logs não armazena ID do kiosk).
DROP TABLE IF EXISTS public.kiosk_devices;
