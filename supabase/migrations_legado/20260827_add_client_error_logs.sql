-- Captura de erros de produção sem depender de serviço externo (opção
-- escolhida em vez do Sentry, por enquanto). Qualquer erro de render do
-- React (via ErrorBoundary) ou erro/rejeição não tratada no JS vira uma
-- linha aqui, com contexto pra diagnóstico — nunca bloqueia a UI se a
-- própria gravação falhar (ver src/lib/errorLogger.js).
CREATE TABLE IF NOT EXISTS public.client_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  stack text,
  component_stack text,
  url text,
  user_agent text,
  -- Sem FK pra users: o erro pode acontecer ANTES de qualquer login válido
  -- (ex: tela de Login quebrando), então precisa aceitar contexto vazio ou
  -- de uma sessão que nunca terminou de autenticar.
  user_id uuid,
  role text,
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_created ON public.client_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_logs_school ON public.client_error_logs(school_id);

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

-- Qualquer um (autenticado ou não) pode INSERIR um log de erro — precisa
-- funcionar mesmo pra quem ainda não conseguiu logar. Isso é só escrita de
-- diagnóstico (mensagem/stack), sem leitura de volta liberada pra ninguém
-- além do developer, então não expõe dado de uma escola pra outra.
DROP POLICY IF EXISTS "Qualquer um registra erros de cliente" ON public.client_error_logs;
CREATE POLICY "Qualquer um registra erros de cliente"
ON public.client_error_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Só developer lê — os logs podem conter fragmentos de URL/estado que só
-- faz sentido a equipe da Zela auditar, não os admins de cada escola.
DROP POLICY IF EXISTS "Developer le logs de erro" ON public.client_error_logs;
CREATE POLICY "Developer le logs de erro"
ON public.client_error_logs FOR SELECT
TO authenticated
USING (public.get_my_role() = 'developer');

-- Idem exclusão (limpeza de logs antigos/resolvidos) — só developer.
DROP POLICY IF EXISTS "Developer apaga logs de erro" ON public.client_error_logs;
CREATE POLICY "Developer apaga logs de erro"
ON public.client_error_logs FOR DELETE
TO authenticated
USING (public.get_my_role() = 'developer');
