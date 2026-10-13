-- Remove o item "App com a marca da escola" (decisão de 13/10/2026: não haverá app por escola).
-- Só apaga a linha de preço se ela estiver desativada e nenhum plano nem contratação a usar.
-- Não mexe em RLS, policies nem em outras tabelas. Reversível: basta reinserir a linha.
do $$
begin
  if exists (select 1 from public.zela_planos where 'app_marca' = any(itens))
     or exists (select 1 from public.school_contratacoes where 'app_marca' = any(itens)) then
    raise exception 'app_marca ainda é usado por plano ou contratação; remoção cancelada';
  end if;

  delete from public.zela_modulo_precos
  where item_id = 'app_marca' and ativo = false;
end
$$;
