-- Reduz o mínimo mensal dos pacotes (opção A de 14/10/2026), para não pesar
-- nas escolas pequenas. O preço por aluno não muda. Contratos já feitos não
-- são afetados: contratar_plano_escola grava o valor no momento da contratação.
-- O histórico (zela_hist_planos) registra o antes e o depois.
update public.zela_planos set minimo_mensal = 290 where nome = 'Essencial' and modalidade = 'pacote' and minimo_mensal = 450;
update public.zela_planos set minimo_mensal = 490 where nome = 'Completo'  and modalidade = 'pacote' and minimo_mensal = 790;
update public.zela_planos set minimo_mensal = 690 where nome = 'Premium'   and modalidade = 'pacote' and minimo_mensal = 990;
