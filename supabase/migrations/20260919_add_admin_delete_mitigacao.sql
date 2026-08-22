-- Permite à Coordenação/Direção Pedagógica excluir um relatório de Mitigação
-- diretamente da lista do Admin (além de arquivar, que já era possível via
-- UPDATE de status). Sem essa policy, o DELETE seria negado pela RLS mesmo
-- com um botão na UI.
DROP POLICY IF EXISTS "Coordenacao e Direcao excluem relatorios de mitigacao" ON mitigacao_reports;
CREATE POLICY "Coordenacao e Direcao excluem relatorios de mitigacao"
ON mitigacao_reports FOR DELETE
USING (
  public.get_my_role() = 'admin'
  AND public.get_my_departamento() IN ('coordenacao', 'diretoria_pedagogica')
  AND school_id = public.get_my_school_id()
);
