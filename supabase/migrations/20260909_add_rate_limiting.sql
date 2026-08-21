-- Infraestrutura genérica de rate limiting, reutilizável em qualquer ponto
-- sensível do sistema (login por PIN, envio de chat, Edge Functions de
-- criação/exclusão de conta). Tudo aplicado no banco — proteção client-side
-- sozinha (ex: o contador de tentativas do PIN, hoje só em useState do React)
-- não vale nada de segurança, já que recarregar a página zera o contador.

CREATE TABLE IF NOT EXISTS rate_limit_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time ON rate_limit_attempts(key, created_at);

-- Função genérica: registra uma tentativa para `p_key` e retorna false se já
-- houver `p_limit` ou mais tentativas nos últimos `p_window_seconds`.
--
-- IMPORTANTE: NÃO conceder EXECUTE para `authenticated`/`anon` de forma
-- irrestrita — como `p_key` é um parâmetro livre, um cliente malicioso
-- poderia chamar essa função usando a chave de outra pessoa só pra
-- "gastar" o limite dela (negação de serviço direcionada). Por isso, essa
-- função só é chamada:
--   1. Por funções SECURITY DEFINER que montam a chave a partir do próprio
--      contexto do usuário autenticado (ex: check_pin_login_rate_limit).
--   2. Por triggers (a chave vem de uma coluna já validada por RLS).
--   3. Por Edge Functions (service_role/authenticated), que montam a chave
--      a partir do id do caller já validado por JWT — nunca a partir de
--      input livre do cliente.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Limpeza oportunista das tentativas antigas dessa mesma chave — mantém a
  -- tabela pequena sem precisar de um job de limpeza separado.
  DELETE FROM rate_limit_attempts
  WHERE key = p_key AND created_at < now() - (p_window_seconds || ' seconds')::interval;

  SELECT count(*) INTO v_count
  FROM rate_limit_attempts
  WHERE key = p_key AND created_at > now() - (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_attempts (key) VALUES (p_key);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO authenticated, service_role;

-- ── PIN do Autoatendimento (AdminPasswordLogin) ──────────────────────────
-- Sem parâmetros: a chave é montada a partir da escola do próprio chamador
-- (get_my_school_id()), então o cliente não tem como escolher a chave — só
-- pode consultar o limite da PRÓPRIA escola. 5 tentativas a cada 30s,
-- mesmo número que já era usado (e ignorado) no controle client-side.
CREATE OR REPLACE FUNCTION public.check_pin_login_rate_limit()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.check_rate_limit('pin_login:' || public.get_my_school_id()::text, 5, 30);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_pin_login_rate_limit() TO authenticated;

-- ── Chat: limite de mensagens por remetente ──────────────────────────────
-- NEW.sender_id já é validado pelas policies de INSERT de chat_messages
-- (sender_id = auth.uid()), então usar esse valor pra montar a chave é
-- seguro — ninguém consegue "gastar" o limite de outra pessoa por aqui.
CREATE OR REPLACE FUNCTION public.enforce_chat_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.check_rate_limit('chat_send:' || NEW.sender_id::text, 20, 60) THEN
    RAISE EXCEPTION 'Muitas mensagens enviadas em pouco tempo. Aguarde um instante.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_chat_rate_limit ON chat_messages;
CREATE TRIGGER trigger_chat_rate_limit
BEFORE INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_chat_rate_limit();
