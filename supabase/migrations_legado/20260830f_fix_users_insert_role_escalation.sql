-- Fase 17 (Auditoria Final) — achado: a policy de INSERT em `users` só
-- restringia school_id (admin só insere na própria escola), mas nunca
-- restringia o valor de `role` sendo inserido — um admin conseguiria, via
-- INSERT direto (RLS, não Edge Function), criar uma linha com role=
-- 'developer' (super-admin cross-escola), desde que soubesse o id de um
-- auth.users já existente sem linha correspondente em public.users (cenário
-- de borda, mas real). A trigger protect_admin_privilege_columns já cobre
-- esse mesmo risco pra UPDATE — esta migration estende a mesma regra pro
-- INSERT, direto na policy (WITH CHECK), já que trigger BEFORE UPDATE não
-- roda em INSERT.
DROP POLICY IF EXISTS "Insercao de usuarios por admin ou developer" ON public.users;
CREATE POLICY "Insercao de usuarios por admin ou developer"
ON public.users FOR INSERT
WITH CHECK (
  public.get_my_role() = 'developer'
  OR (
    public.get_my_role() = 'admin'
    AND school_id = public.get_my_school_id()
    AND role IN ('admin', 'teacher', 'family')
  )
);
