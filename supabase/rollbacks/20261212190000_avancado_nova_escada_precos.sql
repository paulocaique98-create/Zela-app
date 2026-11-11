-- Rollback: volta o Avançado à escada anterior (custo R$ 2,25, preços de 20261208120000).
update public.zela_planos
   set custo_por_aluno = 2.25, custo_referencia_faixas = 2.25
 where nome = 'Avançado' and modalidade = 'pacote';

update public.zela_modulo_precos set custo_estimado = 0
 where item_id = 'financeiro_avancado' and custo_estimado = 0.10;

insert into public.zela_pacote_faixas (plano_id, faixa, valor_final)
select p.id, v.faixa, v.valor
from public.zela_planos p
cross join (values
  (50, 449), (60, 519), (70, 599), (80, 669), (90, 749), (100, 819),
  (120, 969), (140, 1119), (160, 1269), (180, 1419), (200, 1569), (220, 1719), (240, 1869), (260, 2019),
  (280, 2169), (300, 2319), (320, 2469), (340, 2619), (360, 2769), (380, 2919), (400, 3069), (420, 3219),
  (440, 3369), (460, 3519), (480, 3669), (500, 3819),
  (550, 4199), (600, 4569), (650, 4949), (700, 5319), (750, 5699), (800, 6069), (850, 6429),
  (900, 6789), (950, 7149), (1000, 7509)
) as v(faixa, valor)
where p.nome = 'Avançado' and p.modalidade = 'pacote'
on conflict (plano_id, faixa) do update set valor_final = excluded.valor_final;
