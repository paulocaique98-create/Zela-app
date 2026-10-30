-- Em produção o terceiro plano se chamava "Completo Volume". Passa a se chamar Avançado,
-- mantendo id, preços, itens e contratações.
update public.zela_planos
   set nome = 'Avançado', ordem = 3
 where nome = 'Completo Volume' and modalidade = 'pacote';
