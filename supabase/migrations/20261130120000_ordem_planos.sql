-- Ordem dos planos: Básico, Padrão, Avançado e Avançado Volume.
update public.zela_planos set ordem = 1 where nome = 'Básico'   and modalidade = 'pacote';
update public.zela_planos set ordem = 2 where nome = 'Padrão'   and modalidade = 'pacote';
update public.zela_planos set ordem = 3 where nome in ('Avançado', 'Completo Volume') and modalidade = 'pacote';
update public.zela_planos set ordem = 4 where modalidade = 'por_aluno';
