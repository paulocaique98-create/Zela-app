-- Imagem de login por escola -- até aqui existia só uma imagem GLOBAL
-- (system_settings.login_image_url, editável só pelo developer em
-- ConfiguracoesPanel.jsx, ver 20260901i), a mesma pra qualquer escola.
-- Isso não deixa cada escola ter sua própria identidade visual na tela
-- de login.
--
-- Decisão de implementação: seguindo o mesmo padrão já usado em
-- `schools.logo_url` (base64 direto numa coluna text, não Storage +
-- signed URL) -- é a convenção já estabelecida no projeto pra imagem
-- de marca pequena, não sensível, e evita a complexidade extra de
-- bucket/Edge Function/signed URL pra um caso de uso decorativo. A
-- imagem global de system_settings vira o FALLBACK: usada quando
-- nenhum código de escola foi informado na tela de login, ou quando a
-- escola não tem imagem própria configurada.
--
-- Nova coluna schools.login_image_url, protegida pela mesma trigger de
-- pedagogical_columns, no mesmo grupo de permissão de `turmas` (admin
-- principal ou developer) -- é uma extensão natural da mesma decisão
-- de autonomia da escola (20260923).
ALTER TABLE public.schools ADD COLUMN login_image_url text;

CREATE OR REPLACE FUNCTION public.protect_school_pedagogical_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_primary_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role -- não restringido
  END IF;

  IF (NEW.pedagogical_method IS DISTINCT FROM OLD.pedagogical_method)
     OR (NEW.custom_config IS DISTINCT FROM OLD.custom_config)
     OR (NEW.is_active IS DISTINCT FROM OLD.is_active)
     OR (NEW.features_enabled IS DISTINCT FROM OLD.features_enabled)
     OR (NEW.limits IS DISTINCT FROM OLD.limits)
     OR (NEW.plan IS DISTINCT FROM OLD.plan) THEN
    IF public.get_my_role() IS DISTINCT FROM 'developer' THEN
      RAISE EXCEPTION 'Apenas o suporte (developer) pode alterar essas configurações da escola (método pedagógico, status, módulos contratados, limites ou plano).';
    END IF;
  END IF;

  IF (NEW.turmas IS DISTINCT FROM OLD.turmas) OR (NEW.login_image_url IS DISTINCT FROM OLD.login_image_url) THEN
    IF public.get_my_role() = 'developer' THEN
      -- ok, developer sempre pode
      NULL;
    ELSIF public.get_my_role() = 'admin' THEN
      SELECT is_primary_admin INTO v_is_primary_admin FROM public.users WHERE id = auth.uid();
      IF v_is_primary_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Só o admin principal da escola pode gerenciar as turmas ou a imagem de login.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Só o admin principal da escola (ou o suporte) pode gerenciar as turmas ou a imagem de login.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- RPC anônima pra tela de login: recebe o código público da escola
-- (mesmo formato ZLxxx já usado em get_turmas_by_school_code) e
-- devolve SÓ a imagem, ou null se não houver escola com esse código ou
-- a escola não tiver imagem própria configurada. SECURITY DEFINER
-- porque anon não tem (e não deve ter) SELECT direto em `schools` --
-- essa função é a única porta de entrada, e devolve estritamente um
-- valor (texto), nunca a linha inteira.
CREATE OR REPLACE FUNCTION public.get_school_login_image(p_school_code text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT login_image_url FROM public.schools WHERE school_code = upper(trim(p_school_code));
$$;

REVOKE ALL ON FUNCTION public.get_school_login_image(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_login_image(text) TO anon, authenticated;
