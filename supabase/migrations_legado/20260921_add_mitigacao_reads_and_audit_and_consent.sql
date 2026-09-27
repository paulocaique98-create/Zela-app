-- Sugestões implementadas: (2) leitura individual + notificação de
-- publicação, (3) log de auditoria mínimo, (6) consentimento LGPD de
-- biometria facial.

-- (2) Leitura individual do relatório de Mitigação por responsável — mesmo
-- padrão já usado no sistema antigo de relatórios (report_reads).
CREATE TABLE IF NOT EXISTS mitigacao_report_reads (
  report_id uuid NOT NULL REFERENCES mitigacao_reports(id) ON DELETE CASCADE,
  family_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, family_user_id)
);
ALTER TABLE mitigacao_report_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Familias gerenciam suas proprias leituras de mitigacao" ON mitigacao_report_reads;
CREATE POLICY "Familias gerenciam suas proprias leituras de mitigacao"
ON mitigacao_report_reads FOR ALL
USING (public.get_my_role() = 'family' AND family_user_id = auth.uid())
WITH CHECK (
  public.get_my_role() = 'family'
  AND family_user_id = auth.uid()
  AND report_id IN (SELECT id FROM mitigacao_reports WHERE status = 'PUBLICADO')
);

-- (3) Log de auditoria mínimo — ações administrativas sensíveis (publicar,
-- arquivar, excluir). Sem log de leitura, só de mudança de estado.
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school ON audit_logs(school_id, created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins leem audit logs da escola" ON audit_logs;
CREATE POLICY "Admins leem audit logs da escola"
ON audit_logs FOR SELECT
USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

-- Qualquer usuário autenticado (admin ou professor) pode inserir um registro
-- de auditoria da própria ação, sempre com o próprio id como autor — nunca em
-- nome de outra pessoa, e sempre da própria escola.
DROP POLICY IF EXISTS "Usuarios registram suas proprias acoes de auditoria" ON audit_logs;
CREATE POLICY "Usuarios registram suas proprias acoes de auditoria"
ON audit_logs FOR INSERT
WITH CHECK (
  actor_id = auth.uid()
  AND school_id = public.get_my_school_id()
);

-- (6) Consentimento LGPD pro cadastro de biometria facial.
ALTER TABLE authorized_persons ADD COLUMN IF NOT EXISTS biometric_consent_at timestamptz;
