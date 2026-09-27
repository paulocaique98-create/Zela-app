-- Fase 16 — cobrança avulsa (não-recorrente) passa a ser uma feature real,
-- não só prova técnica. Uma cobrança avulsa não tem contrato/assinatura no
-- Asaas por trás — só um Payment isolado — então contract_id precisa
-- aceitar NULL. UNIQUE(contract_id, due_date) continua funcionando: NULL
-- nunca colide com NULL em constraints UNIQUE por padrão do Postgres, então
-- várias cobranças avulsas no mesmo vencimento nunca são bloqueadas
-- indevidamente (não fazia sentido bloquear isso pra cobrança avulsa, só
-- pra recorrência, que já é resolvida pelo contract_id real).
ALTER TABLE public.financial_charges
  ALTER COLUMN contract_id DROP NOT NULL;
