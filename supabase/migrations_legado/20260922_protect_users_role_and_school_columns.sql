-- Corrige uma escalação de privilégio real (achada em revisão de segurança):
-- a RLS "Admins acessam usuarios da escola" é FOR ALL sem WITH CHECK
-- explícito, então o Postgres reusa a mesma condição do USING (school_id =
-- minha escola AND meu role = admin) também pra UPDATE. Isso valida só quem
-- está fazendo a alteração — nunca o NOVO valor da coluna role/school_id da
-- linha alterada. Resultado: qualquer admin podia chamar a API do Supabase
-- direto (fora da tela, que só oferece family/admin/teacher no dropdown) e
-- se autopromover (ou promover outro usuário da própria escola) a
-- 'developer' — o cargo de maior privilégio, tratado como super-admin
-- cross-escola em várias Edge Functions e no DeveloperPanel. Isso quebra
-- totalmente o isolamento entre escolas (tenants).
--
-- Estende a mesma trigger que já protege chat_visibilidade_total e
-- is_primary_admin (20260905_protect_admin_privilege_columns.sql) pra
-- também bloquear mudanças em role e school_id, a menos que quem esteja
-- fazendo o UPDATE já seja developer.
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

  -- role e school_id definem quem o usuário É e a QUE ESCOLA ele pertence —
  -- só o suporte (developer) pode alterar isso, nunca um admin de escola,
  -- nem mesmo o admin principal.
  IF (NEW.role IS DISTINCT FROM OLD.role)
     OR (NEW.school_id IS DISTINCT FROM OLD.school_id) THEN
    SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'developer' THEN
      RAISE EXCEPTION 'Apenas o suporte pode alterar o cargo ou a escola de um usuário';
    END IF;
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

-- A trigger já existe (criada em 20260905_protect_admin_privilege_columns.sql)
-- apontando pra essa mesma função; só precisamos garantir que ela continua
-- lá, já que CREATE OR REPLACE FUNCTION acima já atualiza o comportamento.
DROP TRIGGER IF EXISTS trigger_protect_admin_privilege_columns ON users;
CREATE TRIGGER trigger_protect_admin_privilege_columns
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION public.protect_admin_privilege_columns();
