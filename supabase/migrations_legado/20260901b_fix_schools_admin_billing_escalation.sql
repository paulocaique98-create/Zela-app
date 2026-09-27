-- CRÍTICO — achado durante a varredura preventiva de policies conflitantes
-- (extensão da auditoria adversarial, motivada pelo mesmo padrão já achado
-- em pedagogical_method/turmas).
--
-- A policy "Admins editam a propria escola" não tinha NENHUMA restrição de
-- coluna — cobria também is_active, features_enabled, limits e plan.
-- Testado ao vivo e CONFIRMADO explorável: um admin comum conseguia:
--   1. Reativar a própria escola depois de desativada (bypass de
--      suspensão/inadimplência).
--   2. Auto-habilitar qualquer módulo contratado (ex.: "financeiro") sem
--      ter contrato pra isso.
--   3. Trocar o próprio plano de 'basic' pra 'pro' sozinho.
--   4. Inflar os próprios limites (ex.: autorizados_por_responsavel) sem
--      limite nenhum.
--
-- Correção: estende a trigger já criada pra pedagogical_method/turmas
-- (protect_school_pedagogical_columns) pra também proteger
-- is_active/features_enabled/limits/plan — são exatamente os campos que
-- controlam o modelo comercial/contratual da escola, e só fazem sentido
-- sendo alterados pelo developer (que gerencia o relacionamento comercial
-- com cada escola). Campos como nome/telefone/endereço/notas continuam
-- editáveis pelo admin normalmente.

CREATE OR REPLACE FUNCTION public.protect_school_pedagogical_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.pedagogical_method IS DISTINCT FROM OLD.pedagogical_method)
     OR (NEW.custom_config IS DISTINCT FROM OLD.custom_config)
     OR (NEW.turmas IS DISTINCT FROM OLD.turmas)
     OR (NEW.is_active IS DISTINCT FROM OLD.is_active)
     OR (NEW.features_enabled IS DISTINCT FROM OLD.features_enabled)
     OR (NEW.limits IS DISTINCT FROM OLD.limits)
     OR (NEW.plan IS DISTINCT FROM OLD.plan) THEN
    IF public.get_my_role() IS DISTINCT FROM 'developer' THEN
      RAISE EXCEPTION 'Apenas o suporte (developer) pode alterar essas configurações da escola (método pedagógico, turmas, status, módulos contratados, limites ou plano).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger já existe (criada na migration anterior) e já referencia esta
-- mesma função por nome -- CREATE OR REPLACE acima já é suficiente, não
-- precisa recriar a trigger.
