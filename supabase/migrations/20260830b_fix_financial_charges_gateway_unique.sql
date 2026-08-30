-- Fase 9 — correção de bug encontrado em QA real: o índice único de
-- financial_charges.gateway_payment_id era PARCIAL (WHERE gateway_payment_id
-- IS NOT NULL), e o Postgres não permite que um ON CONFLICT (col1, col2)
-- simples mire num índice parcial — só funcionaria repetindo a mesma
-- cláusula WHERE no próprio ON CONFLICT, o que o upsert do supabase-js não
-- faz. Na prática nem precisava ser parcial: o Postgres já trata cada NULL
-- como nunca-igual-a-outro-NULL em constraints UNIQUE por padrão — então
-- uma constraint normal (não-parcial) já permite várias linhas com
-- gateway_payment_id NULL sem colidir, e ainda barra duplicidade real
-- quando o valor existe. Comportamento idêntico ao pretendido, só sem a
-- cláusula WHERE que quebrava o ON CONFLICT.
DROP INDEX IF EXISTS public.idx_financial_charges_gateway_payment;

ALTER TABLE public.financial_charges
  ADD CONSTRAINT financial_charges_gateway_payment_key UNIQUE (gateway, gateway_payment_id);
