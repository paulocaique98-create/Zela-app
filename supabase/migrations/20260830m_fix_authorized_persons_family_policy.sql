-- Fase 17 (Auditoria Final) — achado adicional, descoberto pelos próprios
-- testes automatizados: a policy "Famílias acessam próprios autorizados"
-- (authorized_persons) só checava family_id = auth.uid(), sem NENHUMA
-- validação de school_id — qualquer usuário autenticado (mesmo role=family
-- legítimo) podia inserir uma "pessoa autorizada" alegando pertencer a
-- QUALQUER escola, não só a própria. Como essa tabela decide quem tem
-- permissão de retirar uma criança (inclusive com biometria facial), isso é
-- um risco de segurança física real, não só de dado.
DROP POLICY IF EXISTS "Famílias acessam próprios autorizados" ON public.authorized_persons;
CREATE POLICY "Famílias acessam próprios autorizados"
ON public.authorized_persons FOR ALL
USING (
  auth.uid() = family_id
  AND school_id = public.get_my_school_id()
)
WITH CHECK (
  auth.uid() = family_id
  AND school_id = public.get_my_school_id()
);

-- Mesmo padrão, mesmo achado, em students: "Famílias acessam próprios
-- filhos" também só checava family_id, sem school_id — FOR ALL (inclui
-- INSERT), então uma família mal-intencionada podia inserir um aluno FALSO
-- em QUALQUER escola só usando o próprio uid como family_id.
DROP POLICY IF EXISTS "Famílias acessam próprios filhos" ON public.students;
CREATE POLICY "Famílias acessam próprios filhos"
ON public.students FOR ALL
USING (
  auth.uid() = family_id
  AND school_id = public.get_my_school_id()
)
WITH CHECK (
  auth.uid() = family_id
  AND school_id = public.get_my_school_id()
);
