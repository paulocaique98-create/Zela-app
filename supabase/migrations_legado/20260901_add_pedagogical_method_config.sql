-- Flexibilidade de Método Pedagógico — Fase 1.
--
-- schools.turmas: lista de turmas/agrupamentos POR ESCOLA (text[], igual
-- ao formato já usado em users.turmas/get_my_turmas() — nenhuma mudança
-- de RLS ou de get_my_turmas() foi necessária, confirmado que ela já lê
-- direto de users.turmas, um array livre, sem depender da constante
-- global TURMAS nem de tabela de vínculo). Default '{}' = "não
-- configurado"; o client usa a constante TURMAS como fallback nesse caso
-- (compatibilidade com escolas existentes).
--
-- schools.pedagogical_method / custom_config: preferências de
-- terminologia/visibilidade de módulo. Sem tabela de métodos separada
-- por enquanto (só 2 métodos conhecidos hoje) — os defaults por método
-- vivem no client (src/lib/schoolConfig.js), não no banco.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS pedagogical_method text NOT NULL DEFAULT 'tradicional'
    CHECK (pedagogical_method IN ('tradicional', 'montessori', 'personalizado')),
  ADD COLUMN IF NOT EXISTS custom_config jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS turmas text[] NOT NULL DEFAULT '{}';

-- Achado durante a auditoria desta feature: a RLS de `schools` tem 2
-- policies permissivas de UPDATE simultâneas — "Admins editam a propria
-- escola" (admin OU developer da própria escola) e "Escolas so podem ser
-- modificadas por developers" (só developer). Como policies permissivas
-- do MESMO comando são combinadas com OR, admin JÁ CONSEGUE hoje
-- atualizar a própria escola via UPDATE direto (nome, logo, etc.) —
-- mesmo com a policy "só developer" também presente. A decisão desta
-- feature foi: só developer edita pedagogical_method/custom_config/
-- turmas (schools.turmas alimenta segmentação de mural/comunicados e
-- terminologia vista por todo mundo — um admin sem contexto técnico
-- pode gerar inconsistência sem querer). Mesmo padrão já usado em
-- protect_admin_privilege_columns (users) — trigger que barra só as
-- colunas sensíveis, sem tocar nas 2 policies existentes.
CREATE OR REPLACE FUNCTION public.protect_school_pedagogical_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Contexto service_role (Edge Functions/scripts administrativos) não
  -- tem auth.uid() -- já passa por fora da RLS, nada a proteger aqui.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.pedagogical_method IS DISTINCT FROM OLD.pedagogical_method)
     OR (NEW.custom_config IS DISTINCT FROM OLD.custom_config)
     OR (NEW.turmas IS DISTINCT FROM OLD.turmas) THEN
    IF public.get_my_role() IS DISTINCT FROM 'developer' THEN
      RAISE EXCEPTION 'Apenas o suporte (developer) pode alterar o método pedagógico ou as turmas da escola.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_school_pedagogical_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_school_pedagogical_columns_trigger ON public.schools;
CREATE TRIGGER protect_school_pedagogical_columns_trigger
  BEFORE UPDATE ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_school_pedagogical_columns();
