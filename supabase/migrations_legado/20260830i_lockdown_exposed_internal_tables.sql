-- Fase 17 (Auditoria Final) — achado CRÍTICO, correção de emergência: 4
-- tabelas internas sem RLS E com os GRANTs padrão do Supabase intactos
-- (anon + authenticated com SELECT/INSERT/UPDATE/DELETE/TRUNCATE) estavam
-- 100% públicas, sem exigir NENHUM login. Confirmado ao vivo: uma chamada
-- sem token nenhum, só a apikey pública, retornou uma FOTO REAL em base64
-- de _fase8_backup_photo_url (tabela de backup de uma migração antiga, Fase
-- 8, nunca destinada a ser acessada por nenhum client).
--
-- Nenhuma dessas 4 tabelas tem uso legítimo do lado do client — são todas
-- internas (backup de migração, tabela legada, contador de rate limit) —
-- então a correção é revogar TODO o acesso de anon/authenticated (não só
-- habilitar RLS, que sozinha não bastaria enquanto os GRANTs de tabela
-- continuassem de pé — RLS e GRANT são camadas independentes no Postgres).
-- Só service_role (que ignora RLS/GRANT por natureza) continua acessando,
-- exatamente como já acontece hoje pra outras tabelas internas do projeto.

REVOKE ALL ON public._fase8_backup_photo_url FROM anon, authenticated;
REVOKE ALL ON public.history_records FROM anon, authenticated;
REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.rate_limit_attempts FROM anon, authenticated;

ALTER TABLE public._fase8_backup_photo_url ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- Sem nenhuma policy criada de propósito — com GRANT revogado e RLS
-- habilitada, o acesso fica bloqueado nas duas camadas para anon/
-- authenticated; só service_role (Edge Functions/scripts administrativos)
-- continua lendo/escrevendo normalmente.
