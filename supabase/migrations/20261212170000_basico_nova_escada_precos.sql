-- Plano Básico: nova escada de preços por faixa (50 a 1000 alunos) e custo por aluno de R$ 2,20
-- (base + Pedagógico, Rotina, Histórico escolar, Dashboard, Chat e Entrada por QR Code).
-- Custo e custo de referência ficam iguais, então o preço da faixa não é reescalado pelo custo.
-- Não muda contratações vigentes (elas guardam o valor contratado); só vale para novas contratações.
-- Itens do plano e preços avulsos dos módulos seguem pelo Portal do Dev.
update public.zela_planos
   set custo_por_aluno = 2.20, custo_referencia_faixas = 2.20
 where nome = 'Básico' and modalidade = 'pacote';

insert into public.zela_pacote_faixas (plano_id, faixa, valor_final)
select p.id, v.faixa, v.valor
from public.zela_planos p
cross join (values
  (50, 429), (60, 499), (70, 579), (80, 649), (90, 719), (100, 789),
  (120, 929), (140, 1069), (160, 1199), (180, 1329), (200, 1459), (220, 1589), (240, 1709), (260, 1829),
  (280, 1949), (300, 2069), (320, 2189), (340, 2309), (360, 2429), (380, 2549), (400, 2669), (420, 2789),
  (440, 2909), (460, 3019), (480, 3139), (500, 3249),
  (550, 3529), (600, 3809), (650, 4079), (700, 4349), (750, 4609), (800, 4879), (850, 5139),
  (900, 5389), (950, 5649), (1000, 5899)
) as v(faixa, valor)
where p.nome = 'Básico' and p.modalidade = 'pacote'
on conflict (plano_id, faixa) do update set valor_final = excluded.valor_final;
