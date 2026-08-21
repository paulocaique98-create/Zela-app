-- Fase 5: Modelos de Relatório configuráveis pelo admin. O modelo define só a
-- ESTRUTURA (seções sugeridas); o relatório preenchido (reports/report_sections,
-- próxima migração) copia essas seções no momento da criação — editar o modelo
-- depois nunca corrompe relatórios já criados.
CREATE TABLE IF NOT EXISTS report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  report_type text NOT NULL DEFAULT 'DESEMPENHO_EVOLUCAO',
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  section_type text NOT NULL DEFAULT 'CUSTOM', -- PRACTICAL_LIFE | COGNITIVE_ACADEMIC | SOCIOEMOTIONAL | CUSTOM
  instructions text,
  sort_order int NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_report_template_sections_template ON report_template_sections(template_id, sort_order);

ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_template_sections ENABLE ROW LEVEL SECURITY;

-- Admin gerencia os modelos da própria escola.
DROP POLICY IF EXISTS "Admins gerenciam modelos de relatorio da escola" ON report_templates;
CREATE POLICY "Admins gerenciam modelos de relatorio da escola"
ON report_templates FOR ALL
USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
WITH CHECK (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

-- Professor só lê os modelos ativos (pra criar um relatório a partir deles).
DROP POLICY IF EXISTS "Professores leem modelos ativos da escola" ON report_templates;
CREATE POLICY "Professores leem modelos ativos da escola"
ON report_templates FOR SELECT
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND is_active = true
);

-- Seções seguem a mesma regra de acesso do template dono (admin ALL, professor SELECT).
DROP POLICY IF EXISTS "Admins gerenciam secoes de modelo da escola" ON report_template_sections;
CREATE POLICY "Admins gerenciam secoes de modelo da escola"
ON report_template_sections FOR ALL
USING (
  public.get_my_role() = 'admin'
  AND template_id IN (SELECT id FROM report_templates WHERE school_id = public.get_my_school_id())
)
WITH CHECK (
  public.get_my_role() = 'admin'
  AND template_id IN (SELECT id FROM report_templates WHERE school_id = public.get_my_school_id())
);

DROP POLICY IF EXISTS "Professores leem secoes de modelos ativos" ON report_template_sections;
CREATE POLICY "Professores leem secoes de modelos ativos"
ON report_template_sections FOR SELECT
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND template_id IN (
    SELECT id FROM report_templates
    WHERE school_id = public.get_my_school_id() AND is_active = true
  )
);
