-- Plano Avançado: nova escada de preços por faixa (50 a 1000 alunos) e custo por aluno de R$ 3,30
-- (R$ 2,60 do Padrão + R$ 0,70 de Ocorrências, Captação, Financeiro avançado, Régua de cobrança,
-- NFS-e, Biblioteca e Estoque). Custo e custo de referência ficam iguais: o preço da faixa não é
-- reescalado pelo custo. Só vale para novas contratações; contratações vigentes não mudam.
update public.zela_planos
   set custo_por_aluno = 3.30, custo_referencia_faixas = 3.30
 where nome = 'Avançado' and modalidade = 'pacote';

-- Financeiro avançado estava com custo estimado 0; passa a 0,10 como os demais módulos (só se ainda for 0).
update public.zela_modulo_precos set custo_estimado = 0.10
 where item_id = 'financeiro_avancado' and custo_estimado = 0;

insert into public.zela_pacote_faixas (plano_id, faixa, valor_final)
select p.id, v.faixa, v.valor
from public.zela_planos p
cross join (values
  (50, 719), (60, 839), (70, 959), (80, 1069), (90, 1189), (100, 1299),
  (120, 1529), (140, 1749), (160, 1959), (180, 2169), (200, 2379), (220, 2579), (240, 2779), (260, 2979),
  (280, 3169), (300, 3359), (320, 3549), (340, 3739), (360, 3929), (380, 4119), (400, 4299), (420, 4479),
  (440, 4669), (460, 4849), (480, 5019), (500, 5199),
  (550, 5639), (600, 6069), (650, 6489), (700, 6909), (750, 7319), (800, 7719), (850, 8129),
  (900, 8519), (950, 8909), (1000, 9299)
) as v(faixa, valor)
where p.nome = 'Avançado' and p.modalidade = 'pacote'
on conflict (plano_id, faixa) do update set valor_final = excluded.valor_final;
