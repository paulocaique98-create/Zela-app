-- O plano da modalidade por aluno passa a se chamar "Avançado Volume".
-- Só o nome muda: modalidade, ativo (hoje desativado), id e contratações ficam como estão.
update public.zela_planos
   set nome = 'Avançado Volume'
 where modalidade = 'por_aluno' and nome = 'Por aluno';
