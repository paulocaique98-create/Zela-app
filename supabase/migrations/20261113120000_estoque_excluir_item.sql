-- Estoque: a Gestão e a Coordenação/Direção podem excluir um item CADASTRADO POR ENGANO.
-- Só vale para item sem movimentos: a chave estrangeira de stock_movements é
-- ON DELETE RESTRICT, então o banco recusa a exclusão de qualquer item com histórico
-- (para esses, a saída é deixar o item inativo). Só adiciona uma policy.
create policy "Estoque exclui itens da escola" on public.stock_items
  for delete using (school_id = public.get_my_school_id() and public.estoque_pode_gerenciar());
