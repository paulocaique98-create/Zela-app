-- Escada de preços por faixa (50 a 1000 alunos) do Padrão e do Avançado, no mesmo padrão do Básico.
-- Padrão parte de R$ 1,85 por aluno e Avançado de R$ 2,25; o custo informado também é o custo de
-- referência, então o valor final gravado já é o da escada. Imposto continua o da simulação (15%).
-- Só dados de preço do Portal do Dev; não altera RLS, policies, RPCs nem contratações vigentes
-- (elas guardam o próprio snapshot). Reaplicável: faixas existentes não são sobrescritas.

-- Padrão: custo de R$ 1,85 por aluno; escada do Básico escalada por 1.85/1,50 (final terminando em 9).
update public.zela_planos set custo_por_aluno = 1.85, custo_referencia_faixas = 1.85
  where nome = 'Padrão' and modalidade = 'pacote';

insert into public.zela_pacote_faixas (plano_id, faixa, valor_final)
select p.id, v.faixa, v.valor
from public.zela_planos p
cross join (values
  (50, 369), (60, 429), (70, 489), (80, 549), (90, 619), (100, 679),
  (120, 799), (140, 919), (160, 1049), (180, 1169), (200, 1289), (220, 1419),
  (240, 1539), (260, 1659), (280, 1789), (300, 1909), (320, 2029), (340, 2159),
  (360, 2279), (380, 2399), (400, 2529), (420, 2649), (440, 2769), (460, 2899),
  (480, 3019), (500, 3139), (550, 3449), (600, 3759), (650, 4069), (700, 4379),
  (750, 4689), (800, 4989), (850, 5289), (900, 5589), (950, 5879), (1000, 6179)
) as v(faixa, valor)
where p.nome = 'Padrão' and p.modalidade = 'pacote'
on conflict (plano_id, faixa) do nothing;

-- Avançado: custo de R$ 2,25 por aluno; escada do Básico escalada por 2.25/1,50 (final terminando em 9).
update public.zela_planos set custo_por_aluno = 2.25, custo_referencia_faixas = 2.25
  where nome = 'Avançado' and modalidade = 'pacote';

insert into public.zela_pacote_faixas (plano_id, faixa, valor_final)
select p.id, v.faixa, v.valor
from public.zela_planos p
cross join (values
  (50, 449), (60, 519), (70, 599), (80, 669), (90, 749), (100, 819),
  (120, 969), (140, 1119), (160, 1269), (180, 1419), (200, 1569), (220, 1719),
  (240, 1869), (260, 2019), (280, 2169), (300, 2319), (320, 2469), (340, 2619),
  (360, 2769), (380, 2919), (400, 3069), (420, 3219), (440, 3369), (460, 3519),
  (480, 3669), (500, 3819), (550, 4199), (600, 4569), (650, 4949), (700, 5319),
  (750, 5699), (800, 6069), (850, 6429), (900, 6789), (950, 7149), (1000, 7509)
) as v(faixa, valor)
where p.nome = 'Avançado' and p.modalidade = 'pacote'
on conflict (plano_id, faixa) do nothing;
