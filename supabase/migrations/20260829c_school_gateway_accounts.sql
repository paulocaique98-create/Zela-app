-- Fase 7 (revisão) — suporte a "1 conta Asaas por escola" (Opção A,
-- escolhida pelo usuário como caminho inicial; migração futura pra
-- subcontas+split — Opção B — fica pra quando o Zela tiver CNPJ próprio e
-- decidir cobrar comissão automática das escolas).
--
-- Problema resolvido: até aqui, ASAAS_API_KEY era um secret ÚNICO e GLOBAL
-- — todo dinheiro de todas as escolas cairia na mesma conta Asaas. Agora
-- cada escola guarda sua PRÓPRIA chave, no Vault (nunca em texto puro numa
-- tabela normal), e as Edge Functions resolvem qual chave usar por escola
-- a cada chamada.

CREATE TABLE IF NOT EXISTS public.school_gateway_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  gateway text NOT NULL CHECK (gateway IN ('asaas')),
  vault_secret_id uuid NOT NULL, -- referência ao segredo real, guardado em vault.secrets
  pix_key_registered boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, gateway)
);

CREATE INDEX IF NOT EXISTS idx_school_gateway_accounts_school ON public.school_gateway_accounts(school_id);

ALTER TABLE public.school_gateway_accounts ENABLE ROW LEVEL SECURITY;

-- Admin só CONFERE se a própria escola já tem gateway configurado — nunca
-- lê o valor da chave em si (essa tabela só guarda a referência ao Vault,
-- o valor real só sai via get_school_gateway_secret(), que é SECURITY
-- DEFINER e só concedida à service_role, nunca a um client autenticado).
DROP POLICY IF EXISTS "Admin ve status do gateway da propria escola" ON public.school_gateway_accounts;
CREATE POLICY "Admin ve status do gateway da propria escola"
ON public.school_gateway_accounts FOR SELECT
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Grava (cria ou atualiza) a chave de uma escola no Vault. SECURITY DEFINER
-- porque só assim consegue chamar vault.create_secret/update_secret (fora
-- do schema public); GRANT só pra service_role — nenhum client autenticado
-- (nem admin) pode chamar isso direto, só uma Edge Function confiável.
CREATE OR REPLACE FUNCTION public.set_school_gateway_secret(p_school_id uuid, p_gateway text, p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_vault_id uuid;
  v_secret_name text;
BEGIN
  v_secret_name := 'gateway_key:' || p_gateway || ':' || p_school_id::text;

  SELECT vault_secret_id INTO v_existing_vault_id
  FROM public.school_gateway_accounts
  WHERE school_id = p_school_id AND gateway = p_gateway;

  IF v_existing_vault_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_vault_id, p_secret);
    UPDATE public.school_gateway_accounts
    SET updated_at = now()
    WHERE school_id = p_school_id AND gateway = p_gateway;
  ELSE
    INSERT INTO public.school_gateway_accounts (school_id, gateway, vault_secret_id)
    VALUES (p_school_id, p_gateway, vault.create_secret(p_secret, v_secret_name, 'Chave API do gateway ' || p_gateway || ' — escola ' || p_school_id::text));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_school_gateway_secret(uuid, text, text) TO service_role;

-- Lê a chave real de uma escola (só a Edge Function, via service_role, tem
-- permissão de chamar isso — nunca exposta a um client comum).
CREATE OR REPLACE FUNCTION public.get_school_gateway_secret(p_school_id uuid, p_gateway text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ds.decrypted_secret
  FROM public.school_gateway_accounts sga
  JOIN vault.decrypted_secrets ds ON ds.id = sga.vault_secret_id
  WHERE sga.school_id = p_school_id AND sga.gateway = p_gateway;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_gateway_secret(uuid, text) TO service_role;
