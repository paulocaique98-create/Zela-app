-- Planos do Zela passam a seguir a nomenclatura Básico, Padrão e Avançado.
-- Renomeia em vez de recriar: o id é mantido, então as contratações vigentes continuam ligadas ao plano.
-- Preços, itens e ciclos não mudam. O plano "Por aluno" fica desativado (não é apagado).

update public.zela_planos set nome = 'Básico',   ordem = 1, descricao = 'Plano base: entrada e saída, cadastros, comunicados, financeiro e contratos.'
  where nome = 'Essencial' and modalidade = 'pacote';
update public.zela_planos set nome = 'Padrão',   ordem = 2, descricao = 'Básico mais Pedagógico e Rotina e família.'
  where nome = 'Completo' and modalidade = 'pacote';
update public.zela_planos set nome = 'Avançado', ordem = 3, descricao = 'Padrão mais Chat, Prova de vida e Entrada por QR Code.'
  where nome = 'Premium' and modalidade = 'pacote';

update public.zela_planos set ativo = false
  where modalidade = 'por_aluno' and ativo = true;
