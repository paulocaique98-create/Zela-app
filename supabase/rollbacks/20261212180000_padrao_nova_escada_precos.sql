-- Rollback: volta o Padrão à escada anterior (custo R$ 1,85, preços de 20261208120000).
update public.zela_planos
   set custo_por_aluno = 1.85, custo_referencia_faixas = 1.85
 where nome = 'Padrão' and modalidade = 'pacote';

insert into public.zela_pacote_faixas (plano_id, faixa, valor_final)
select p.id, v.faixa, v.valor
from public.zela_planos p
cross join (values
  (50, 369), (60, 429), (70, 489), (80, 549), (90, 619), (100, 679),
  (120, 799), (140, 919), (160, 1049), (180, 1169), (200, 1289), (220, 1419), (240, 1539), (260, 1659),
  (280, 1789), (300, 1909), (320, 2029), (340, 2159), (360, 2279), (380, 2399), (400, 2529), (420, 2649),
  (440, 2769), (460, 2899), (480, 3019), (500, 3139),
  (550, 3449), (600, 3759), (650, 4069), (700, 4379), (750, 4689), (800, 4989), (850, 5289),
  (900, 5589), (950, 5879), (1000, 6179)
) as v(faixa, valor)
where p.nome = 'Padrão' and p.modalidade = 'pacote'
on conflict (plano_id, faixa) do update set valor_final = excluded.valor_final;
