-- Fase 11 (ajuste) — desconto por ciclo deixa de ser da escola inteira e
-- passa a ser por RESPONSÁVEL financeiro específico (correção pedida pelo
-- usuário: uma família pode ter uma condição comercial diferente da outra,
-- e só faz sentido configurar o desconto depois que a família já está
-- cadastrada na escola).
--
-- Tabela estava vazia em produção (0 linhas) — sem necessidade de
-- migração de dado, só de schema.

ALTER TABLE public.financial_billing_discounts
  ADD COLUMN IF NOT EXISTS guardian_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

-- Nenhuma linha existente pra migrar (tabela vazia), então dá pra ir
-- direto para NOT NULL.
ALTER TABLE public.financial_billing_discounts
  ALTER COLUMN guardian_id SET NOT NULL;

ALTER TABLE public.financial_billing_discounts
  DROP CONSTRAINT IF EXISTS financial_billing_discounts_school_id_billing_cycle_key;

ALTER TABLE public.financial_billing_discounts
  ADD CONSTRAINT financial_billing_discounts_school_guardian_cycle_key
  UNIQUE (school_id, guardian_id, billing_cycle);

CREATE INDEX IF NOT EXISTS idx_financial_billing_discounts_guardian
  ON public.financial_billing_discounts(guardian_id);

-- RLS: mesmo padrão (admin FOR ALL na própria escola), mas agora reforçado
-- pra nunca aceitar um guardian_id de outra escola (mesmo padrão de
-- validação explícita de posse já usado em create-financial-contract —
-- nunca confia só na UI escolher certo).
DROP POLICY IF EXISTS "Admins gerenciam descontos da propria escola" ON public.financial_billing_discounts;
CREATE POLICY "Admins gerenciam descontos da propria escola"
ON public.financial_billing_discounts FOR ALL
USING (
  school_id = public.get_my_school_id()
  AND public.get_my_role() = 'admin'
)
WITH CHECK (
  school_id = public.get_my_school_id()
  AND public.get_my_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = guardian_id AND u.school_id = financial_billing_discounts.school_id AND u.role = 'family'
  )
);
