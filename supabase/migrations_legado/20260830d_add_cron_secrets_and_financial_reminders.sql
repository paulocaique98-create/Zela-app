-- Fase 13 — Notificações Financeiras.
--
-- 1) Segredo dedicado para o novo cron de lembretes financeiros, guardado no
--    mesmo padrão Vault-backed já usado por school_gateway_accounts — só que
--    genérico (não amarrado a "gateway de escola"), pra reaproveitar em
--    qualquer cron futuro sem precisar de uma tabela nova a cada vez.
--    IMPORTANTE (achado durante a Fase 13): gravar direto via SQL solto
--    (supabase db query --linked, sessão postgres superuser) corrompe o
--    valor decifrado do Vault nesse projeto — causa ainda não identificada.
--    Só funciona chamando a função abaixo via PostgREST/RPC autenticado como
--    service_role (mesmo caminho que já funciona pra school_gateway_accounts).
CREATE TABLE IF NOT EXISTS public.cron_secrets (
  name text PRIMARY KEY,
  vault_secret_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_secrets ENABLE ROW LEVEL SECURITY;
-- Sem nenhuma policy: ninguém além de service_role (que ignora RLS) lê essa
-- tabela — nem sequer developer, é puramente técnico/interno.

CREATE OR REPLACE FUNCTION public.set_cron_secret(p_name text, p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_vault_id uuid;
BEGIN
  SELECT vault_secret_id INTO v_existing_vault_id FROM public.cron_secrets WHERE name = p_name;
  IF v_existing_vault_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_existing_vault_id;
    UPDATE public.cron_secrets
    SET vault_secret_id = vault.create_secret(p_secret, p_name || ':' || gen_random_uuid()::text, 'Segredo de cron: ' || p_name),
        updated_at = now()
    WHERE name = p_name;
  ELSE
    INSERT INTO public.cron_secrets (name, vault_secret_id)
    VALUES (p_name, vault.create_secret(p_secret, p_name || ':' || gen_random_uuid()::text, 'Segredo de cron: ' || p_name));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_cron_secret(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_cron_secret(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ds.decrypted_secret
  FROM public.cron_secrets cs
  JOIN vault.decrypted_secrets ds ON ds.id = cs.vault_secret_id
  WHERE cs.name = p_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_secret(text) TO service_role;

-- 2) Cobrança: marca quando o lembrete "2 dias antes do vencimento" já foi
--    enviado, pra nunca mandar duplicado mesmo se o cron rodar mais de uma
--    vez no mesmo dia por algum motivo.
ALTER TABLE public.financial_charges
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
