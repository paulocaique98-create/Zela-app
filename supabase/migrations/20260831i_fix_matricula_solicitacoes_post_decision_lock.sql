-- P2.4 (Prompt Mestre de Evolução) — achado real durante o teste
-- adversarial de matricula_solicitacoes.
--
-- A policy "Familias gerenciam suas solicitacoes pendentes" (FOR ALL)
-- tinha USING = family_id=auth.uid() AND role='family' — SEM checar
-- status. O WITH CHECK exigia status='pending' na linha NOVA, mas isso
-- só vale pra INSERT/UPDATE, nunca pra DELETE (que só usa USING). Ou
-- seja: depois que o admin já tinha aprovado ou rejeitado a solicitação
-- de matrícula, a família ainda conseguia:
--   1. DELETAR a própria solicitação já decidida (apaga a trilha de
--      auditoria da decisão do admin).
--   2. Em tese, dar UPDATE nela desde que a linha final voltasse pra
--      status='pending' (o WITH CHECK cobria esse caso específico, mas
--      o DELETE não tinha proteção nenhuma).
--
-- Testado ao vivo antes da correção: família apagou com sucesso a
-- própria solicitação com status='rejected'.
--
-- Correção: USING também exige status='pending' — família só pode gerir
-- (ler pra editar/apagar) a própria solicitação ENQUANTO ela ainda não
-- foi decidida pelo admin. Depois da decisão, a solicitação vira
-- somente-leitura pra família (a policy de SELECT separada,
-- "Familias veem suas solicitacoes", continua sem essa restrição —
-- leitura do resultado final sempre deve continuar disponível).

DROP POLICY IF EXISTS "Familias gerenciam suas solicitacoes pendentes" ON public.matricula_solicitacoes;

CREATE POLICY "Familias gerenciam suas solicitacoes pendentes"
  ON public.matricula_solicitacoes FOR ALL
  USING (family_id = auth.uid() AND get_my_role() = 'family' AND status = 'pending')
  WITH CHECK (family_id = auth.uid() AND get_my_role() = 'family' AND status = 'pending');
