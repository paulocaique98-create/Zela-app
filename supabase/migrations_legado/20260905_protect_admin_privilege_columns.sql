-- Corrige uma escalação de privilégio real: a RLS "Atualizacao de perfis de
-- usuario" permite qualquer admin atualizar QUALQUER usuário da própria
-- escola (inclusive a si mesmo), sem restrição por coluna. As colunas
-- chat_visibilidade_total e is_primary_admin (que controlam quem vê/responde
-- todos os setores do chat, e quem pode conceder isso a outros) só eram
-- protegidas no client (AdminUserRegistration.jsx só mostra o checkbox pro
-- admin principal) — qualquer admin podia chamar a API direto e se
-- autoconceder (ou conceder a um colega) visibilidade total do chat.
--
-- Trigger bloqueia a mudança dessas duas colunas a menos que quem estiver
-- fazendo o UPDATE já seja o admin principal (ou developer, que sempre pode).
CREATE OR REPLACE FUNCTION public.protect_admin_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_caller_primary boolean;
BEGIN
  -- auth.uid() é nulo em contexto de service_role (edge functions/scripts
  -- administrativos) — esses já passam por fora da RLS, então não há o que
  -- proteger aqui.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.chat_visibilidade_total IS DISTINCT FROM OLD.chat_visibilidade_total)
     OR (NEW.is_primary_admin IS DISTINCT FROM OLD.is_primary_admin) THEN
    SELECT role, is_primary_admin INTO v_caller_role, v_caller_primary
    FROM users WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'developer' AND NOT COALESCE(v_caller_primary, false) THEN
      RAISE EXCEPTION 'Apenas o admin principal da escola pode alterar essas permissões';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_admin_privilege_columns ON users;
CREATE TRIGGER trigger_protect_admin_privilege_columns
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION public.protect_admin_privilege_columns();
