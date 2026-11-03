-- Faturamento do Zela Edu: assinatura recorrente do Asaas (PLANO_FATURAMENTO_ZELA.md, perguntas 9 e 10).
-- Análise de segurança: só uma coluna aditiva em school_contratacoes. Sem nova policy, sem nova função e sem
-- mexer em RLS: a escola continua lendo só o próprio contrato (policies existentes) e a gravação continua só
-- pelo servidor (Edge Function create-zela-charge, com service role). O id da assinatura não dá acesso a nada
-- sem a chave do Asaas, que fica só no secret ZELA_ASAAS_API_KEY.
-- Não destrutiva: contratos atuais ficam com null (sem assinatura).

alter table public.school_contratacoes
  add column if not exists asaas_subscription_id text;

create unique index if not exists school_contratacoes_asaas_subscription_uidx
  on public.school_contratacoes (asaas_subscription_id)
  where asaas_subscription_id is not null;
