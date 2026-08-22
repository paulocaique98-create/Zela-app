-- Corrige gap de RLS encontrado na varredura de segurança: a policy de UPDATE
-- da professora verificava status = 'RASCUNHO' no USING (linha que ela pode
-- alcançar), mas não repetia essa condição no WITH CHECK (linha resultante).
-- Como o WITH CHECK só validava author_id/role/school, uma professora podia
-- fazer UPDATE ... SET status = 'PUBLICADO' diretamente via API e publicar o
-- próprio relatório pra família sem passar pela revisão da Coordenação/
-- Direção — quebrando a regra "professora preenche, coordenação publica".
DROP POLICY IF EXISTS "Professores editam seus proprios rascunhos de mitigacao" ON mitigacao_reports;
CREATE POLICY "Professores editam seus proprios rascunhos de mitigacao"
ON mitigacao_reports FOR UPDATE
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND status = 'RASCUNHO'
  AND school_id = public.get_my_school_id()
)
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND status = 'RASCUNHO'
  AND school_id = public.get_my_school_id()
);
