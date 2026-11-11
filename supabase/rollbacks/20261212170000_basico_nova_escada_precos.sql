-- Rollback: volta o Básico à escada anterior (custo R$ 1,50, preços de 20261204120000).
update public.zela_planos
   set custo_por_aluno = 1.50, custo_referencia_faixas = 1.50
 where nome = 'Básico' and modalidade = 'pacote';

insert into public.zela_pacote_faixas (plano_id, faixa, valor_final)
select p.id, v.faixa, v.valor
from public.zela_planos p
cross join (values
  (50, 299), (60, 349), (70, 399), (80, 449), (90, 499), (100, 549),
  (120, 649), (140, 749), (160, 849), (180, 949), (200, 1049), (220, 1149), (240, 1249), (260, 1349),
  (280, 1449), (300, 1549), (320, 1649), (340, 1749), (360, 1849), (380, 1949), (400, 2049), (420, 2149),
  (440, 2249), (460, 2349), (480, 2449), (500, 2549),
  (550, 2799), (600, 3049), (650, 3299), (700, 3549), (750, 3799), (800, 4049), (850, 4289),
  (900, 4529), (950, 4769), (1000, 5009)
) as v(faixa, valor)
where p.nome = 'Básico' and p.modalidade = 'pacote'
on conflict (plano_id, faixa) do update set valor_final = excluded.valor_final;
