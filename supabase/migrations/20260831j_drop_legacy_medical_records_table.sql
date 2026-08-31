-- P2.5 (LGPD — minimização de dados) — remove tabela legada morta.
--
-- `medical_records` (0 linhas, nunca referenciada em src/) é resíduo de
-- uma versão anterior/em inglês do que hoje é `fichas_medicas`
-- (português, ativamente usada pelo produto). Como está vazia, apagar
-- não perde nenhum dado real.
--
-- NÃO aplicada automaticamente nesta sessão — ver LGPD_RETENCAO.md
-- seção 5, aguardando autorização explícita antes de rodar.

DROP TABLE IF EXISTS public.medical_records;
