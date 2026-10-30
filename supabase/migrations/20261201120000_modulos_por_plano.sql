-- Módulos de cada plano, na estrutura Básico, Padrão e Avançado (cada um inclui o anterior).
-- O plano base é sempre incluso e não entra na lista. Preços dos pacotes não mudam.

-- Módulos que ainda não tinham linha de preço (o banco exige a linha para entrar num plano).
-- Valor 0: o preço avulso deve ser definido no portal do dev antes de vender fora de pacote.
insert into public.zela_modulo_precos (item_id, tipo_cobranca, valor, custo_estimado, chaves) values
  ('bi_dashboards',          'por_aluno', 0, 0, array['bi_dashboards']),
  ('bolsas',                 'por_aluno', 0, 0, array['bolsas']),
  ('historico_escolar',      'por_aluno', 0, 0, array['historico_escolar']),
  ('plano_aula',             'por_aluno', 0, 0, array['plano_aula']),
  ('avaliacao_institucional','por_aluno', 0, 0, array['avaliacao_institucional'])
on conflict (item_id) do nothing;

update public.zela_planos set itens = array['pedagogico','rotina','historico_escolar','bi_dashboards']
  where nome = 'Básico' and modalidade = 'pacote';

update public.zela_planos set itens = array['pedagogico','rotina','historico_escolar','bi_dashboards',
  'bolsas','plano_aula','avaliacao_institucional','chat','qr','liveness']
  where nome = 'Padrão' and modalidade = 'pacote';

update public.zela_planos set itens = array['pedagogico','rotina','historico_escolar','bi_dashboards',
  'bolsas','plano_aula','avaliacao_institucional','chat','qr','liveness',
  'ocorrencias','captacao','financeiro_avancado','regua_cobranca','nfse','biblioteca','estoque']
  where nome in ('Avançado', 'Completo Volume') and modalidade = 'pacote';
