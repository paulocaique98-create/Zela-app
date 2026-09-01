-- CRÍTICO — achado durante a consolidação/revisão do item 2 (varredura de
-- policies conflitantes), investigando especificamente financial_* como
-- pedido pelo usuário depois do achado em `schools`.
--
-- `financial_charges` e `financial_contracts` tinham policies FOR ALL
-- pra admin (USING: school_id = get_my_school_id() AND role = 'admin'),
-- SEM NENHUMA restrição de coluna. Testado ao vivo e CONFIRMADO
-- explorável: um admin comum conseguia, via UPDATE direto (sem passar
-- por nenhuma Edge Function nem pelo Asaas):
--   1. Marcar a PRÓPRIA cobrança como 'PAID' sem pagar nada de verdade
--      (bypass total do fluxo de pagamento real).
--   2. Reescrever o valor da mensalidade de um contrato pra qualquer
--      valor (ex.: R$0,01), sem limite.
--
-- Confirmado que NENHUM código legítimo do frontend faz essas escritas:
-- toda a criação/atualização de cobrança e contrato passa por Edge
-- Functions com service_role (create-avulsa-charge,
-- create-financial-contract, payment-webhook/process-payment-webhook).
-- A ÚNICA escrita direta legítima achada foi em AdminFinanceiro.jsx:
-- cancelar um contrato (`UPDATE financial_contracts SET status =
-- 'cancelled'`) — mantida, com trigger restringindo exatamente a essa
-- transição.

-- financial_charges: admin nunca escreve aqui de verdade -- vira
-- somente-leitura pra admin (igual já era pra família).
DROP POLICY IF EXISTS "Admins gerenciam cobrancas da propria escola" ON public.financial_charges;
CREATE POLICY "Admins leem cobrancas da propria escola"
  ON public.financial_charges FOR SELECT
  USING (school_id = get_my_school_id() AND get_my_role() = 'admin');

-- financial_contracts: admin mantém leitura ampla, mas escrita agora só
-- é permitida se for exatamente "cancelar" (status -> 'cancelled', mais
-- nada mudando) -- reforçado por trigger (RLS WITH CHECK não compara
-- contra o valor antigo de outras colunas facilmente; trigger é o
-- padrão já usado no projeto pra isso, ver protect_admin_privilege_columns/
-- protect_school_pedagogical_columns).
DROP POLICY IF EXISTS "Admins gerenciam contratos da propria escola" ON public.financial_contracts;
CREATE POLICY "Admins leem contratos da propria escola"
  ON public.financial_contracts FOR SELECT
  USING (school_id = get_my_school_id() AND get_my_role() = 'admin');
CREATE POLICY "Admins cancelam contratos da propria escola"
  ON public.financial_contracts FOR UPDATE
  USING (school_id = get_my_school_id() AND get_my_role() = 'admin')
  WITH CHECK (school_id = get_my_school_id() AND get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.protect_financial_contract_admin_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role (Edge Functions) -- não restringido
  END IF;

  IF public.get_my_role() = 'admin' THEN
    IF NEW.status IS DISTINCT FROM 'cancelled'
       OR NEW.school_id IS DISTINCT FROM OLD.school_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.financial_guardian_id IS DISTINCT FROM OLD.financial_guardian_id
       OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
       OR NEW.base_monthly_amount_cents IS DISTINCT FROM OLD.base_monthly_amount_cents
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.first_due_date IS DISTINCT FROM OLD.first_due_date
       OR NEW.gateway IS DISTINCT FROM OLD.gateway
       OR NEW.gateway_subscription_id IS DISTINCT FROM OLD.gateway_subscription_id THEN
      RAISE EXCEPTION 'Admin só pode cancelar um contrato (status -> cancelled) -- nenhum outro campo pode ser alterado por aqui.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_financial_contract_admin_updates() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_financial_contract_admin_updates_trigger ON public.financial_contracts;
CREATE TRIGGER protect_financial_contract_admin_updates_trigger
  BEFORE UPDATE ON public.financial_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_financial_contract_admin_updates();
