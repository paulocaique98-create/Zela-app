-- Básico passa a ser só o plano base (cadastros, entrada e saída, comunicados, financeiro e contratos),
-- coerente com o custo de R$ 1,50 por aluno da escada de preços por faixa. Pedagógico, Rotina, Histórico
-- escolar e BI continuam no Padrão e no Avançado. Só vale para contratações novas: contratações vigentes
-- guardam o próprio snapshot e os módulos já ligados nas escolas não mudam até uma nova contratação.
-- Quem quiser esses módulos no Básico contrata como adicional avulso (preço por aluno do módulo).
update public.zela_planos
   set itens = '{}',
       descricao = 'Plano base: entrada e saída, cadastros, comunicados, financeiro e contratos.'
 where nome = 'Básico' and modalidade = 'pacote' and itens <> '{}';
