-- Complemento da 20260927g: a policy de família só liberava UPDATE/DELETE
-- quando a linha JÁ estava com status='pending' (USING e WITH CHECK iguais)
-- -- ou seja, uma solicitação em changes_requested ficava travada, a família
-- não conseguia nem editar nem reenviar. Relaxa o USING pra aceitar também
-- changes_requested (linha de origem); o WITH CHECK continua travando o
-- resultado em 'pending' -- família nunca consegue setar approved/rejected
-- por conta própria, só devolver pra fila de análise.
alter policy "Familias gerenciam suas solicitacoes pendentes" on public.matricula_solicitacoes
  using (family_id = auth.uid() and get_my_role() = 'family' and status in ('pending', 'changes_requested'))
  with check (family_id = auth.uid() and get_my_role() = 'family' and status = 'pending');
