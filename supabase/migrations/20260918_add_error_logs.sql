-- Fase A do PLANO_LOGGING_ERROS_PORTAL_DEV.md — schema aditivo, zero risco.
--
-- Hoje existem 3 sistemas de log fragmentados (client_error_logs,
-- edge_function_logs, cron_job_logs) sem UI unificada, e a maioria dos
-- catch espalhados pelo app só faz console.error (nunca persiste em lugar
-- consultável) -- incluindo TODO o pipeline de reconhecimento facial, que
-- hoje não registra nenhuma falha real (motivação original deste plano:
-- reclamações de responsáveis não conseguindo ser reconhecidos no totem,
-- sem nenhum dado de campo pra saber a causa).
--
-- Esta tabela é o destino de toda instrumentação NOVA (reconhecimento
-- facial primeiro, depois edge functions sem cobertura e catches soltos do
-- app). client_error_logs/edge_function_logs/cron_job_logs continuam
-- existindo e funcionando exatamente como hoje -- nada é migrado ainda
-- (Fase F do plano, opcional, só depois de tudo validado).
CREATE TABLE IF NOT EXISTS public.error_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifica a origem e o tipo do erro, pra filtrar/agrupar na tela do
  -- Portal do Dev (Fase D).
  source         text NOT NULL CHECK (source IN ('client', 'edge_function', 'cron', 'business', 'face_recognition')),
  category       text NOT NULL,
  severity       text NOT NULL DEFAULT 'error' CHECK (severity IN ('warn', 'error', 'critical')),

  message        text NOT NULL,
  stack          text,
  context        jsonb,

  -- Quem/onde -- sem FK pra users: o erro pode ocorrer antes do login
  -- (mesmo raciocínio de client_error_logs).
  school_id      uuid REFERENCES public.schools(id),
  user_id        uuid,
  role           text,
  url            text,
  user_agent     text,

  -- Deduplicação: um erro repetitivo (ex: câmera de uma escola travando
  -- toda hora) vira 1 linha com contador, não 1 linha por ocorrência.
  fingerprint    text NOT NULL,
  occurrences    integer NOT NULL DEFAULT 1,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),

  -- Fluxo de triagem -- nenhuma das tabelas de log antigas tem isso hoje.
  -- Marcar como resolvido "reabre" o fingerprint: se o erro voltar depois
  -- de corrigido, vira um caso novo visível, não some dentro de uma linha
  -- antiga já resolvida (ver índice único parcial abaixo).
  resolved       boolean NOT NULL DEFAULT false,
  resolved_at    timestamptz,
  resolved_by    uuid,
  resolution_note text,

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Só pode haver 1 linha ABERTA (não resolvida) por fingerprint -- é o que
-- permite o ON CONFLICT da RPC abaixo incrementar o contador em vez de
-- duplicar. Uma vez resolvida, o próximo evento do mesmo fingerprint cria
-- uma linha nova (não conflita mais com a antiga, já resolvida).
CREATE UNIQUE INDEX IF NOT EXISTS idx_error_logs_fingerprint_open ON public.error_logs(fingerprint) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_school ON public.error_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_source_category ON public.error_logs(source, category);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity_unresolved ON public.error_logs(severity) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS idx_error_logs_context_gin ON public.error_logs USING gin(context);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Só developer lê/atualiza (mesmo padrão de client_error_logs/
-- edge_function_logs/cron_job_logs) -- é dado operacional interno, pode
-- conter fragmentos de URL/estado que não fazem sentido pra admin de escola.
DROP POLICY IF EXISTS "Developer le error_logs" ON public.error_logs;
CREATE POLICY "Developer le error_logs"
ON public.error_logs FOR SELECT
TO authenticated
USING (public.get_my_role() = 'developer');

-- UPDATE só pra marcar como resolvido (resolved/resolved_at/resolved_by/
-- resolution_note) -- também só developer, via tela do Portal do Dev.
DROP POLICY IF EXISTS "Developer resolve error_logs" ON public.error_logs;
CREATE POLICY "Developer resolve error_logs"
ON public.error_logs FOR UPDATE
TO authenticated
USING (public.get_my_role() = 'developer')
WITH CHECK (public.get_my_role() = 'developer');

-- Nenhuma policy de INSERT/DELETE direto -- toda escrita passa pela RPC
-- log_error() abaixo (SECURITY DEFINER), que valida os enums e trunca os
-- campos antes de gravar. anon/authenticated recebem EXECUTE (não INSERT
-- na tabela) porque um erro de cliente pode ocorrer antes do login (mesmo
-- raciocínio de client_error_logs).
CREATE OR REPLACE FUNCTION public.log_error(
  p_source text,
  p_category text,
  p_message text,
  p_severity text DEFAULT 'error',
  p_stack text DEFAULT NULL,
  p_context jsonb DEFAULT NULL,
  p_school_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text := lower(coalesce(p_source, ''));
  v_severity text := lower(coalesce(p_severity, 'error'));
  v_message text := left(coalesce(p_message, '(sem mensagem)'), 2000);
  v_stack text := left(p_stack, 8000);
  v_category text := left(coalesce(p_category, 'unknown'), 200);
  v_fingerprint text;
  v_id uuid;
BEGIN
  IF v_source NOT IN ('client', 'edge_function', 'cron', 'business', 'face_recognition') THEN
    v_source := 'client';
  END IF;
  IF v_severity NOT IN ('warn', 'error', 'critical') THEN
    v_severity := 'error';
  END IF;

  v_fingerprint := md5(v_source || '|' || v_category || '|' || left(v_message, 300));

  INSERT INTO public.error_logs (
    source, category, severity, message, stack, context,
    school_id, user_id, role, url, user_agent, fingerprint
  )
  VALUES (
    v_source, v_category, v_severity, v_message, v_stack, p_context,
    p_school_id, p_user_id, p_role, p_url, p_user_agent, v_fingerprint
  )
  ON CONFLICT (fingerprint) WHERE NOT resolved
  DO UPDATE SET
    occurrences = public.error_logs.occurrences + 1,
    last_seen_at = now(),
    -- Reaproveita a linha aberta, mas mantém os dados mais recentes do
    -- contexto/escola/usuário -- útil quando o mesmo fingerprint volta a
    -- acontecer em condições ligeiramente diferentes.
    context = COALESCE(EXCLUDED.context, public.error_logs.context),
    school_id = COALESCE(EXCLUDED.school_id, public.error_logs.school_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Mesmo achado de log_edge_function_error/log_cron_job_run (P0.1/P0.2):
-- Postgres concede EXECUTE a PUBLIC por padrão na criação da função --
-- REVOKE explícito sempre, GRANT só pra quem precisa gravar.
REVOKE EXECUTE ON FUNCTION public.log_error(text, text, text, text, text, jsonb, uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_error(text, text, text, text, text, jsonb, uuid, uuid, text, text, text) TO anon, authenticated, service_role;
