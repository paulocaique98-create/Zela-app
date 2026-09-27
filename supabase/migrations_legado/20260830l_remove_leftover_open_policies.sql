-- Fase 17 (Auditoria Final) — achado adicional, descoberto pelos próprios
-- testes automatizados de regressão escritos nesta fase (prova do valor da
-- suíte: pegou um bug real que a revisão manual anterior não tinha achado).
--
-- "Leitura livre de escolas" em `schools` era uma policy solta com
-- `USING (true)`, sem restrição de role nenhuma — confirmado ao vivo: uma
-- chamada SEM login retornava telefone e CNPJ reais de todas as escolas.
-- As outras 3 policies de SELECT já cobrem 100% dos casos legítimos
-- (developer vê tudo, membro vê a própria via get_my_school_id(), kiosk vê
-- a própria via device token) — esta era puro resíduo.
DROP POLICY IF EXISTS "Leitura livre de escolas" ON public.schools;

-- "Usuários veem apenas sua própria escola" é redundante com "Leitura de
-- escolas permitida para membros ou devs" (mesma regra, escrita 2x em
-- migrations diferentes) — não é perigosa, mas também não tem razão de
-- existir duas vezes. Removendo a duplicata mais antiga/menos completa
-- (não cobre developer).
DROP POLICY IF EXISTS "Usuários veem apenas sua própria escola" ON public.schools;
