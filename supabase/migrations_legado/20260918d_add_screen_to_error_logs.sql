-- Fase C do PLANO_TELA_DE_ORIGEM_NOS_LOGS.md — schema aditivo, zero risco.
--
-- Guarda qual tela do app estava ativa quando o erro aconteceu (ex: 'kiosk'
-- = Autoatendimento, 'monitor' = Monitor, 'register' = Cadastro de Usuário).
-- Coluna própria (não só dentro de context jsonb) porque é uma dimensão de
-- filtro tão relevante quanto source/severity.
ALTER TABLE public.error_logs ADD COLUMN IF NOT EXISTS screen text;
CREATE INDEX IF NOT EXISTS idx_error_logs_screen ON public.error_logs(screen);

-- CREATE OR REPLACE não troca a assinatura de uma função -- adicionar um
-- parâmetro novo criaria uma SEGUNDA função sobrecarregada (overload) em
-- vez de substituir a antiga, o que deixaria o PostgREST em dúvida sobre
-- qual delas chamar. Precisa derrubar a versão antiga (11 parâmetros)
-- antes de criar a nova (12, com p_screen).
DROP FUNCTION IF EXISTS public.log_error(text, text, text, text, text, jsonb, uuid, uuid, text, text, text);

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
  p_user_agent text DEFAULT NULL,
  p_screen text DEFAULT NULL
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
    school_id, user_id, role, url, user_agent, screen, fingerprint
  )
  VALUES (
    v_source, v_category, v_severity, v_message, v_stack, p_context,
    p_school_id, p_user_id, p_role, p_url, p_user_agent, p_screen, v_fingerprint
  )
  ON CONFLICT (fingerprint) WHERE NOT resolved
  DO UPDATE SET
    occurrences = public.error_logs.occurrences + 1,
    last_seen_at = now(),
    context = COALESCE(EXCLUDED.context, public.error_logs.context),
    school_id = COALESCE(EXCLUDED.school_id, public.error_logs.school_id),
    screen = COALESCE(EXCLUDED.screen, public.error_logs.screen)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_error(text, text, text, text, text, jsonb, uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_error(text, text, text, text, text, jsonb, uuid, uuid, text, text, text, text) TO anon, authenticated, service_role;
