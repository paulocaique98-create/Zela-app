-- Plano Padrão: nova escada de preços por faixa (50 a 1000 alunos) e custo por aluno de R$ 2,60
-- (R$ 2,20 do Básico + R$ 0,40 de Bolsas, Plano de aula, Avaliação institucional e Prova de vida).
-- Custo e custo de referência ficam iguais, então o preço da faixa não é reescalado pelo custo.
-- Só vale para novas contratações; contratações vigentes não mudam.
update public.zela_planos
   set custo_por_aluno = 2.60, custo_referencia_faixas = 2.60
 where nome = 'Padrão' and modalidade = 'pacote';

insert into public.zela_pacote_faixas (plano_id, faixa, valor_final)
select p.id, v.faixa, v.valor
from public.zela_planos p
cross join (values
  (50, 549), (60, 639), (70, 729), (80, 819), (90, 909), (100, 989),
  (120, 1169), (140, 1339), (160, 1509), (180, 1679), (200, 1839), (220, 1999), (240, 2159), (260, 2309),
  (280, 2459), (300, 2609), (320, 2759), (340, 2909), (360, 3059), (380, 3199), (400, 3349), (420, 3489),
  (440, 3629), (460, 3769), (480, 3909), (500, 4049),
  (550, 4399), (600, 4729), (650, 5069), (700, 5399), (750, 5729), (800, 6049), (850, 6369),
  (900, 6679), (950, 6989), (1000, 7299)
) as v(faixa, valor)
where p.nome = 'Padrão' and p.modalidade = 'pacote'
on conflict (plano_id, faixa) do update set valor_final = excluded.valor_final;
