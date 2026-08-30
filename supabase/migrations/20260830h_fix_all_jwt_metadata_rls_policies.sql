-- Fase 17 (Auditoria Final) — achado sistêmico: 10 policies em 7 tabelas
-- (attendance_logs, authorized_persons, kiosk_devices, medical_records,
-- schools, students, system_settings) confiavam em auth.jwt()->
-- 'user_metadata', que é editável pelo PRÓPRIO usuário via
-- auth.updateUser() — confirmado numa conta de teste real (o valor mudou de
-- verdade no JWT). A exploração ao vivo não funcionou neste ambiente
-- (possivelmente por um Custom Access Token Hook configurado só no painel,
-- fora do repo), mas o padrão em si é estruturalmente frágil e inconsistente
-- com o resto do banco, que usa get_my_role()/get_my_school_id() (lidos de
-- public.users, nunca do JWT do client). O caso mais grave: a policy de
-- SELECT de medical_records (ficha médica) nem checava o role do chamador —
-- só conferia se o school_id do JWT batia com a escola do dono da ficha,
-- teoricamente permitindo qualquer usuário autenticado ler fichas médicas de
-- qualquer escola só forjando esse campo.
--
-- Todas as 10 substituídas pelo mesmo padrão seguro já usado no resto do
-- sistema, preservando exatamente a mesma lógica de autorização de cada uma.

-- 1. attendance_logs — INSERT
DROP POLICY IF EXISTS "Insercao de historico por admin ou developer" ON public.attendance_logs;
CREATE POLICY "Insercao de historico por admin ou developer"
ON public.attendance_logs FOR INSERT
WITH CHECK (
  public.get_my_role() = 'developer'
  OR (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
);

-- 2. authorized_persons — FOR ALL
DROP POLICY IF EXISTS "Acesso completo a pessoas autorizadas" ON public.authorized_persons;
CREATE POLICY "Acesso completo a pessoas autorizadas"
ON public.authorized_persons FOR ALL
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

-- 3. kiosk_devices — FOR ALL
DROP POLICY IF EXISTS "Admin gerencia kiosks" ON public.kiosk_devices;
CREATE POLICY "Admin gerencia kiosks"
ON public.kiosk_devices FOR ALL
USING (
  public.get_my_role() = 'developer'
  OR (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
)
WITH CHECK (
  public.get_my_role() = 'developer'
  OR (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
);

-- 4. medical_records — FOR ALL (write)
DROP POLICY IF EXISTS "Modificacao de ficha medica por developer ou familia" ON public.medical_records;
CREATE POLICY "Modificacao de ficha medica por developer ou familia"
ON public.medical_records FOR ALL
USING (
  public.get_my_role() = 'developer'
  OR family_id = auth.uid()
)
WITH CHECK (
  public.get_my_role() = 'developer'
  OR family_id = auth.uid()
);

-- 5. medical_records — SELECT (achado mais grave: nem checava role do chamador)
DROP POLICY IF EXISTS "Leitura de ficha medica" ON public.medical_records;
CREATE POLICY "Leitura de ficha medica"
ON public.medical_records FOR SELECT
USING (
  public.get_my_role() = 'developer'
  OR family_id = auth.uid()
  OR (
    public.get_my_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = medical_records.family_id AND u.school_id = public.get_my_school_id()
    )
  )
);

-- 6. schools — FOR ALL (só developer)
DROP POLICY IF EXISTS "Escolas so podem ser modificadas por developers" ON public.schools;
CREATE POLICY "Escolas so podem ser modificadas por developers"
ON public.schools FOR ALL
USING (public.get_my_role() = 'developer')
WITH CHECK (public.get_my_role() = 'developer');

-- 7. schools — SELECT
DROP POLICY IF EXISTS "Leitura de escolas permitida para membros ou devs" ON public.schools;
CREATE POLICY "Leitura de escolas permitida para membros ou devs"
ON public.schools FOR SELECT
USING (
  public.get_my_role() = 'developer'
  OR id = public.get_my_school_id()
);

-- 8. students — DELETE
DROP POLICY IF EXISTS "Exclusao de estudantes" ON public.students;
CREATE POLICY "Exclusao de estudantes"
ON public.students FOR DELETE
USING (
  public.get_my_role() = 'developer'
  OR (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
);

-- 9. students — INSERT
DROP POLICY IF EXISTS "Criacao de estudantes por admin ou developer" ON public.students;
CREATE POLICY "Criacao de estudantes por admin ou developer"
ON public.students FOR INSERT
WITH CHECK (
  public.get_my_role() = 'developer'
  OR (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
);

-- 10. system_settings — FOR ALL (só developer)
DROP POLICY IF EXISTS "Modificacao de configuracoes globais apenas por developers" ON public.system_settings;
CREATE POLICY "Modificacao de configuracoes globais apenas por developers"
ON public.system_settings FOR ALL
USING (public.get_my_role() = 'developer')
WITH CHECK (public.get_my_role() = 'developer');
