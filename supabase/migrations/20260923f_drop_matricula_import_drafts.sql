-- A importação de matrículas antigas com IA (rascunhos revisáveis antes de
-- virar solicitação oficial) acabou sendo feita manualmente via chat nesta
-- mesma sessão, em vez de pelo botão "Importar com IA" -- o botão, o modal
-- e as Edge Functions (import-matricula-ai, send-matricula-draft) foram
-- removidos do app. Esta tabela não tem mais nenhum código lendo ou
-- escrevendo nela.
DROP TABLE IF EXISTS public.matricula_import_drafts;
