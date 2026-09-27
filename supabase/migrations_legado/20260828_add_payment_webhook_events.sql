-- Esqueleto genérico de captura de webhooks de gateway de pagamento (módulo
-- financeiro, Fase "infraestrutura" — antes da decisão de modelo/Fase 2).
-- Tabela agnóstica de gateway (coluna `gateway` identifica qual), pensada
-- só pra resolver idempotência de entrega: o gateway pode reenviar o mesmo
-- evento várias vezes, e a chave única (gateway, gateway_event_id) garante
-- que o segundo INSERT não duplica nada — a Edge Function usa
-- ON CONFLICT DO NOTHING e não repete processamento.
--
-- Nenhuma lógica de negócio (atualizar pagamento, mudar status) ainda —
-- isso é Fase 8. Por enquanto só grava o evento cru pra auditoria/replay.
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  gateway_event_id text NOT NULL,
  event_type text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (gateway, gateway_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_received ON public.payment_webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_unprocessed ON public.payment_webhook_events(processed_at) WHERE processed_at IS NULL;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Só developer lê (mesmo padrão já usado em client_error_logs) — é dado de
-- auditoria/depuração interna, não algo que admin de escola ou família
-- precise ver diretamente. A Edge Function grava via service role, que
-- sempre bypassa RLS — nenhuma policy de INSERT é necessária pra ela.
DROP POLICY IF EXISTS "Developer le eventos de webhook de pagamento" ON public.payment_webhook_events;
CREATE POLICY "Developer le eventos de webhook de pagamento"
ON public.payment_webhook_events FOR SELECT
TO authenticated
USING (public.get_my_role() = 'developer');
