-- Rollback: volta os 5 módulos ao preço 0 (só se ainda estiverem no valor definido pela migration).
update public.zela_modulo_precos p
set valor = 0, custo_estimado = 0
from (values
  ('plano_aula',              1.50),
  ('avaliacao_institucional', 1.00),
  ('bi_dashboards',           2.00),
  ('bolsas',                  1.50),
  ('historico_escolar',       1.50)
) as v(item_id, valor)
where p.item_id = v.item_id
  and p.valor = v.valor;
