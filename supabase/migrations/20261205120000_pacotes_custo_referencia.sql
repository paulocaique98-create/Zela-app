-- Custo por aluno com que a escada de preços de cada pacote foi calculada. O Portal do Dev escala o
-- valor final de cada faixa pela razão entre o custo atual e este custo de referência, mantendo a
-- margem. Não altera preços, contratações nem a RPC contratar_plano_escola.
alter table public.zela_planos
  add column if not exists custo_referencia_faixas numeric(8,2)
  check (custo_referencia_faixas is null or custo_referencia_faixas > 0);

update public.zela_planos p set custo_referencia_faixas = 1.50
where p.nome = 'Básico' and p.modalidade = 'pacote' and p.custo_referencia_faixas is null
  and exists (select 1 from public.zela_pacote_faixas f where f.plano_id = p.id);
