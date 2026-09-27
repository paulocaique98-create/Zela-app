-- Fase 4: Relatórios de Desempenho e Evolução — destinados à família. Separado
-- fisicamente de pedagogical_records (que é sempre interno): aqui a REGRA
-- ABSOLUTA é a inversa — nada é visível à família até ser explicitamente
-- publicado.
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  template_id uuid REFERENCES report_templates(id),
  template_version int,
  title text NOT NULL,
  reference_period text,
  author_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_student ON reports(student_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_school ON reports(school_id);

-- Seções MATERIALIZADAS (copiadas do template na criação do relatório) — uma
-- alteração posterior no template nunca afeta um relatório já criado.
CREATE TABLE IF NOT EXISTS report_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  section_type text NOT NULL DEFAULT 'CUSTOM',
  title text NOT NULL,
  content text,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_report_sections_report ON report_sections(report_id, sort_order);

-- Leitura individual por responsável — nunca uma flag global (uma família pode
-- ter 2 responsáveis; cada um tem seu próprio "lido").
CREATE TABLE IF NOT EXISTS report_reads (
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  family_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, family_user_id)
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_reads ENABLE ROW LEVEL SECURITY;

-- Admin: gerencia todos os relatórios da escola.
DROP POLICY IF EXISTS "Admins gerenciam relatorios da escola" ON reports;
CREATE POLICY "Admins gerenciam relatorios da escola"
ON reports FOR ALL
USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
WITH CHECK (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

-- Professor: gerencia relatórios só dos alunos das próprias turmas.
DROP POLICY IF EXISTS "Professores gerenciam relatorios dos alunos de suas turmas" ON reports;
CREATE POLICY "Professores gerenciam relatorios dos alunos de suas turmas"
ON reports FOR ALL
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
)
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

-- Família: só relatórios PUBLICADOS dos próprios filhos (1º ou 2º responsável).
-- REGRA ABSOLUTA: nenhuma policy concede acesso a RASCUNHO/ARQUIVADO.
DROP POLICY IF EXISTS "Familias leem relatorios publicados dos filhos" ON reports;
CREATE POLICY "Familias leem relatorios publicados dos filhos"
ON reports FOR SELECT
USING (
  public.get_my_role() = 'family'
  AND status = 'PUBLICADO'
  AND (
    student_id IN (SELECT student_id FROM student_guardians WHERE guardian_id = auth.uid())
    OR student_id IN (SELECT id FROM students WHERE family_id = auth.uid())
  )
);

-- report_sections segue a mesma regra de acesso do relatório dono.
DROP POLICY IF EXISTS "Admins gerenciam secoes de relatorio da escola" ON report_sections;
CREATE POLICY "Admins gerenciam secoes de relatorio da escola"
ON report_sections FOR ALL
USING (
  public.get_my_role() = 'admin'
  AND report_id IN (SELECT id FROM reports WHERE school_id = public.get_my_school_id())
)
WITH CHECK (
  public.get_my_role() = 'admin'
  AND report_id IN (SELECT id FROM reports WHERE school_id = public.get_my_school_id())
);

DROP POLICY IF EXISTS "Professores gerenciam secoes de seus relatorios" ON report_sections;
CREATE POLICY "Professores gerenciam secoes de seus relatorios"
ON report_sections FOR ALL
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND report_id IN (SELECT id FROM reports WHERE author_id = auth.uid())
)
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND report_id IN (SELECT id FROM reports WHERE author_id = auth.uid())
);

DROP POLICY IF EXISTS "Familias leem secoes de relatorios publicados" ON report_sections;
CREATE POLICY "Familias leem secoes de relatorios publicados"
ON report_sections FOR SELECT
USING (
  public.get_my_role() = 'family'
  AND report_id IN (
    SELECT id FROM reports
    WHERE status = 'PUBLICADO'
      AND (
        student_id IN (SELECT student_id FROM student_guardians WHERE guardian_id = auth.uid())
        OR student_id IN (SELECT id FROM students WHERE family_id = auth.uid())
      )
  )
);

-- report_reads: cada responsável só gerencia sua própria marcação de leitura,
-- e só pode marcar leitura de relatórios que ele de fato pode ver.
DROP POLICY IF EXISTS "Familias gerenciam suas proprias leituras de relatorio" ON report_reads;
CREATE POLICY "Familias gerenciam suas proprias leituras de relatorio"
ON report_reads FOR ALL
USING (public.get_my_role() = 'family' AND family_user_id = auth.uid())
WITH CHECK (
  public.get_my_role() = 'family'
  AND family_user_id = auth.uid()
  AND report_id IN (
    SELECT id FROM reports
    WHERE status = 'PUBLICADO'
      AND (
        student_id IN (SELECT student_id FROM student_guardians WHERE guardian_id = auth.uid())
        OR student_id IN (SELECT id FROM students WHERE family_id = auth.uid())
      )
  )
);

-- Admin/Professor podem ver quem já leu (métricas internas de acompanhamento).
DROP POLICY IF EXISTS "Admins leem status de leitura da escola" ON report_reads;
CREATE POLICY "Admins leem status de leitura da escola"
ON report_reads FOR SELECT
USING (
  public.get_my_role() = 'admin'
  AND report_id IN (SELECT id FROM reports WHERE school_id = public.get_my_school_id())
);

DROP POLICY IF EXISTS "Professores leem status de leitura de seus relatorios" ON report_reads;
CREATE POLICY "Professores leem status de leitura de seus relatorios"
ON report_reads FOR SELECT
USING (
  public.get_my_role() = 'teacher'
  AND report_id IN (SELECT id FROM reports WHERE author_id = auth.uid())
);
