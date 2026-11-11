-- Preço avulso (por aluno/mês) dos módulos que estavam com valor 0:
-- plano de aula, avaliação institucional, dashboard, gestão de bolsas e histórico escolar.
-- Valores alinhados à faixa dos demais módulos do catálogo (R$ 1,00 a R$ 2,00) e ao mercado
-- de ERPs escolares. Só atualiza quem ainda está em 0: preço já ajustado pelo Portal do Dev
-- não é sobrescrito. Preços dos pacotes (Básico, Padrão, Avançado) não mudam.
update public.zela_modulo_precos p
set valor = v.valor, custo_estimado = v.custo
from (values
  ('plano_aula',              1.50, 0.10),
  ('avaliacao_institucional', 1.00, 0.10),
  ('bi_dashboards',           2.00, 0.15),
  ('bolsas',                  1.50, 0.10),
  ('historico_escolar',       1.50, 0.10)
) as v(item_id, valor, custo)
where p.item_id = v.item_id
  and p.valor = 0;
