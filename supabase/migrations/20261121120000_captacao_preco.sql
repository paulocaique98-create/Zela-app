-- Captação (CRM): preço inicial do módulo (fora de pacotes, como estoque e ocorrências).
-- Valor provisório de R$ 1,50 por aluno; o Zela ajusta depois pelo Portal do Dev.
-- on conflict do nothing: não sobrescreve um preço já definido.
insert into public.zela_modulo_precos (item_id, tipo_cobranca, valor, custo_estimado, chaves)
values ('captacao', 'por_aluno', 1.50, 0.10, array['captacao'])
on conflict (item_id) do nothing;
