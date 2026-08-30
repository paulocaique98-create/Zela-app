-- Fase 6 — RLS e Isolamento Multi-Tenant do módulo financeiro.
-- Requisito do usuário: "o menu de Financeiro só pode ficar disponível no
-- perfil do Responsável Financeiro" — não é só uma questão de esconder um
-- botão na UI (isso sozinho seria só cosmético e não protegeria nada de
-- verdade). Reforça a própria RLS: um responsável só continua vendo dado
-- financeiro (contrato e cobranças) enquanto ELE continua sendo o
-- responsável financeiro ATUAL (student_guardians.is_financial = true) —
-- não basta ter sido o financial_guardian_id no momento da criação do
-- contrato. Se a escola revogar essa condição de um responsável (ex.:
-- disputa de guarda, troca de responsável financeiro), o acesso cai na
-- hora, mesmo pra contratos/cobranças antigos que ainda o referenciam
-- historicamente (ver FASE_2_MODELO_FINANCEIRO.md, desnormalização
-- deliberada por rastreabilidade).

-- Função reutilizável (mesmo padrão de get_my_role()/get_my_school_id()/
-- is_guardian_released() já usados no projeto) — também serve pro client
-- decidir se mostra o menu "Financeiro" (supabase.rpc('is_financial_guardian')),
-- embora isso seja só UX: a proteção de verdade é a RLS abaixo.
CREATE OR REPLACE FUNCTION public.is_financial_guardian()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians
    WHERE guardian_id = auth.uid() AND is_financial = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_financial_guardian() TO authenticated;

-- Reforça as 2 policies de leitura da família criadas na Fase 5, adicionando
-- a checagem extra. As condições já existentes (financial_guardian_id/
-- family_id = auth.uid()) continuam — isso é AND, não substituição.
DROP POLICY IF EXISTS "Familia le o proprio contrato" ON public.financial_contracts;
CREATE POLICY "Familia le o proprio contrato"
ON public.financial_contracts FOR SELECT
USING (
  public.get_my_role() = 'family'
  AND financial_guardian_id = auth.uid()
  AND public.is_financial_guardian()
);

DROP POLICY IF EXISTS "Familia le as proprias cobrancas" ON public.financial_charges;
CREATE POLICY "Familia le as proprias cobrancas"
ON public.financial_charges FOR SELECT
USING (
  public.get_my_role() = 'family'
  AND family_id = auth.uid()
  AND public.is_financial_guardian()
);
