-- Fase 8 — Webhooks, ajustados pra Opção A (1 conta Asaas por escola,
-- decidida entre as Fases 7). Problema resolvido: o Asaas não manda "de
-- qual escola é esse evento" no payload — cada escola configura seu
-- PRÓPRIO webhook (mesma URL do Zela, `authToken` diferente por escola).
-- A gente descobre a escola comparando o token recebido contra os
-- segredos guardados (reaproveita o MESMO mecanismo de Vault já criado
-- pra chave de API — só um "gateway" lógico diferente: 'asaas_webhook').

-- Permite o novo "gateway" lógico na mesma tabela já existente (não cria
-- tabela nova pra isso, reaproveita a estrutura da Fase 7).
ALTER TABLE public.school_gateway_accounts DROP CONSTRAINT IF EXISTS school_gateway_accounts_gateway_check;
ALTER TABLE public.school_gateway_accounts ADD CONSTRAINT school_gateway_accounts_gateway_check
  CHECK (gateway IN ('asaas', 'asaas_webhook'));

-- Descobre qual escola é dona de um token de webhook — SECURITY DEFINER
-- (só assim acessa vault.decrypted_secrets), GRANT só pra service_role
-- (só a Edge Function de webhook chama isso, nunca um client comum).
-- A comparação roda inteira dentro do Postgres — o valor decifrado nunca
-- precisa ser devolvido pra fora só pra ser comparado no Deno.
CREATE OR REPLACE FUNCTION public.find_school_by_webhook_token(p_gateway text, p_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sga.school_id
  FROM public.school_gateway_accounts sga
  JOIN vault.decrypted_secrets ds ON ds.id = sga.vault_secret_id
  WHERE sga.gateway = p_gateway AND ds.decrypted_secret = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_school_by_webhook_token(text, text) TO service_role;

-- payment_webhook_events ganha school_id — resolvida pelo token (acima),
-- nunca confiada a partir do payload em si (o Asaas não manda isso, e
-- mesmo se mandasse não devia ser confiável vindo de fora). Idempotência
-- passa a ser por escola também — mais correto pra multi-tenant (um
-- gateway_event_id de uma conta nunca deveria colidir com o de outra, mas
-- escopar por escola remove qualquer dependência dessa suposição).
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);

ALTER TABLE public.payment_webhook_events DROP CONSTRAINT IF EXISTS payment_webhook_events_gateway_gateway_event_id_key;
ALTER TABLE public.payment_webhook_events ADD CONSTRAINT payment_webhook_events_school_gateway_event_key
  UNIQUE (school_id, gateway, gateway_event_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_school ON public.payment_webhook_events(school_id);
