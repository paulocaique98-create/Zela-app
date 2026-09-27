-- P0.1 (item 2 do escopo) — Monitoramento mínimo dos crons críticos.
--
-- Tabela simples de log: cada execução relevante grava uma linha aqui.
-- Não é um scheduler novo nem substitui pg_cron — só dá visibilidade de
-- "rodou ou não rodou", que hoje não existe (só dava pra saber via
-- net._http_response, que não é feito pra consulta operacional e expira).
CREATE TABLE IF NOT EXISTS public.cron_job_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name text NOT NULL,
  status_code integer,
  success boolean NOT NULL,
  detail text,
  ran_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_job_logs ENABLE ROW LEVEL SECURITY;
-- Sem policy pra anon/authenticated — só developer lê (é dado operacional
-- interno, mesmo padrão de payment_webhook_events).
CREATE POLICY "developer le cron_job_logs"
  ON public.cron_job_logs FOR SELECT
  USING (public.get_my_role() = 'developer');

-- Função chamada VIA RPC (PostgREST) pelas próprias Edge Functions dos
-- crons, logo após terminarem — não de dentro do comando SQL do cron.
--
-- Achado durante esta implementação: a primeira tentativa foi ler
-- net._http_response DENTRO do próprio comando do cron (um DO block com
-- polling), pra logar o status do net.http_post no mesmo lugar. Não
-- funcionou de forma confiável — a resposta assíncrona do pg_net não
-- ficava visível pra leitura na mesma sessão/transação que disparou a
-- chamada, mesmo com polling de até 10s (o mesmo tipo de instabilidade de
-- leitura em sessão de SQL solta já documentado pro Vault). Solução:
-- cada Edge Function loga o PRÓPRIO resultado via RPC autenticado
-- (supabase.rpc(...), que passa por PostgREST — o único caminho
-- comprovadamente confiável neste projeto), e o comando do cron continua
-- simples, só disparando o net.http_post.
CREATE OR REPLACE FUNCTION public.log_cron_job_run(p_job_name text, p_status_code integer, p_detail text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.cron_job_logs (job_name, status_code, success, detail)
  VALUES (p_job_name, p_status_code, p_status_code IS NOT NULL AND p_status_code BETWEEN 200 AND 299, p_detail);
$$;

-- postgres: pra manter simetria com o resto do projeto (chamada direta via
-- SQL, se algum dia for necessário). service_role: caminho real usado
-- pelas Edge Functions via supabase.rpc(...).
GRANT EXECUTE ON FUNCTION public.log_cron_job_run(text, integer, text) TO postgres, service_role;

-- Query de verificação manual (item "alerta" do P0.1 — mínimo viável, sem
-- integração externa): se a última linha pra daily-reset-job não tiver
-- success=true com ran_at de hoje, o reset não rodou.
--
-- SELECT * FROM public.cron_job_logs
-- WHERE job_name = 'daily-reset-job'
-- ORDER BY ran_at DESC LIMIT 1;
