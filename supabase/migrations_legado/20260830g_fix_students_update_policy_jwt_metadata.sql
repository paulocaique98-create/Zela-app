-- Fase 17 (Auditoria Final) — achado: a policy "Atualizacao de estudantes"
-- era a ÚNICA no projeto inteiro que confiava em auth.jwt()->'user_metadata'
-- em vez do padrão consistente (get_my_role()/get_my_school_id(), lidos de
-- public.users) usado em toda outra policy do sistema. user_metadata é
-- editável pelo próprio usuário via auth.updateUser() — confirmado numa
-- conta de teste real (o valor mudou de verdade no JWT), embora a
-- exploração ao vivo não tenha funcionado neste ambiente (possivelmente por
-- um Custom Access Token Hook configurado só no painel, fora do repo — não
-- confirmado com certeza). De qualquer forma, o padrão em si é frágil e
-- inconsistente — substituído pelo mesmo padrão confiável usado em todo o
-- resto do banco.
DROP POLICY IF EXISTS "Atualizacao de estudantes" ON public.students;
CREATE POLICY "Atualizacao de estudantes"
ON public.students FOR UPDATE
USING (
  public.get_my_role() = 'developer'
  OR (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
  OR (public.get_my_role() = 'family' AND family_id = auth.uid())
)
WITH CHECK (
  public.get_my_role() = 'developer'
  OR (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
  OR (public.get_my_role() = 'family' AND family_id = auth.uid())
);
