-- P1.5 (Prompt Mestre de Evolução) — Observabilidade backend básica.
--
-- Hoje só o frontend tem captura de erro (client_error_logs, caseira).
-- Erros de Edge Functions ficam invisíveis — crítico pro fluxo financeiro
-- (webhooks do Asaas, criação de cobrança/contrato, lembretes), onde uma
-- falha silenciosa significa dinheiro não sincronizado ou família não
-- avisada, sem NENHUM jeito de saber que aconteceu.
CREATE TABLE IF NOT EXISTS public.edge_function_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  function_name text NOT NULL,
  level text NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn')),
  message text NOT NULL,
  -- Resumo do contexto (ids relevantes, nunca payload bruto/segredo) --
  -- mesma disciplina de client_error_logs, nunca guardar dado sensível.
  context jsonb,
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_function_logs_created_at ON public.edge_function_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_function_name ON public.edge_function_logs (function_name);

ALTER TABLE public.edge_function_logs ENABLE ROW LEVEL SECURITY;
-- Só developer lê — mesmo padrão de cron_job_logs/payment_webhook_events,
-- é dado operacional interno.
CREATE POLICY "developer le edge_function_logs"
  ON public.edge_function_logs FOR SELECT
  USING (public.get_my_role() = 'developer');

-- Chamada via RPC (PostgREST) pelas próprias Edge Functions -- caminho
-- comprovadamente confiável neste projeto, mesmo padrão de
-- log_cron_job_run (P0.1).
CREATE OR REPLACE FUNCTION public.log_edge_function_error(
  p_function_name text, p_level text, p_message text, p_context jsonb, p_school_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.edge_function_logs (function_name, level, message, context, school_id)
  VALUES (p_function_name, COALESCE(p_level, 'error'), p_message, p_context, p_school_id);
$$;

-- Achado (repetido nesta mesma sessão, P0.1/P0.2): Postgres concede
-- EXECUTE a PUBLIC por padrão na criação da função -- GRANT explícito
-- pra service_role/postgres NÃO revoga isso sozinho. REVOKE explícito
-- sempre, daqui pra frente, em toda função SECURITY DEFINER nova.
REVOKE EXECUTE ON FUNCTION public.log_edge_function_error(text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_edge_function_error(text, text, text, jsonb, uuid) TO postgres, service_role;
