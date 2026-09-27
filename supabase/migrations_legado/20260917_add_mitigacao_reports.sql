-- Relatório de Mitigação — primeiro dos 5 tipos de relatório a sair do
-- placeholder. Estrutura e ordem dos tópicos seguem exatamente o modelo em
-- PDF fornecido pela escola (cabeçalho + 8 seções em sequência bloqueada).
CREATE TABLE IF NOT EXISTS mitigacao_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  reference_period text,
  guia_responsavel text,
  status text NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO')),
  -- Maior seção já liberada (1 a 8) — a seção N só é editável quando
  -- current_step >= N. Avança pra N+1 automaticamente ao salvar o rascunho
  -- da seção N (nunca pode "pular" seção sem salvar a anterior).
  current_step int NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 8),
  entrada text,
  socializacao text,
  foco_interesses text,
  alimentacao text,
  sono text,
  normalizacao text,
  pontuacoes_gerais text,
  conclusao text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mitigacao_reports_student ON mitigacao_reports(student_id, status);
CREATE INDEX IF NOT EXISTS idx_mitigacao_reports_school ON mitigacao_reports(school_id);

ALTER TABLE mitigacao_reports ENABLE ROW LEVEL SECURITY;

-- Professora: cria e edita só os próprios rascunhos, dos alunos das próprias
-- turmas. Uma vez que o status sai de RASCUNHO (revisado pela coordenação/
-- direção), a professora perde a permissão de editar.
DROP POLICY IF EXISTS "Professores leem relatorios de mitigacao de suas turmas" ON mitigacao_reports;
CREATE POLICY "Professores leem relatorios de mitigacao de suas turmas"
ON mitigacao_reports FOR SELECT
USING (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

DROP POLICY IF EXISTS "Professores criam relatorios de mitigacao" ON mitigacao_reports;
CREATE POLICY "Professores criam relatorios de mitigacao"
ON mitigacao_reports FOR INSERT
WITH CHECK (
  public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND author_id = auth.uid()
  AND school_id = public.get_my_school_id()
  AND student_id IN (
    SELECT id FROM students WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id()
  )
);

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
  AND school_id = public.get_my_school_id()
);

DROP POLICY IF EXISTS "Professores excluem seus proprios rascunhos de mitigacao" ON mitigacao_reports;
CREATE POLICY "Professores excluem seus proprios rascunhos de mitigacao"
ON mitigacao_reports FOR DELETE
USING (
  public.get_my_role() = 'teacher'
  AND author_id = auth.uid()
  AND status = 'RASCUNHO'
);

-- Admin: qualquer um pode LER (acompanhamento geral), mas só Coordenação e
-- Direção Pedagógica podem EDITAR — nunca criar um relatório do zero, é
-- sempre a professora quem inicia.
DROP POLICY IF EXISTS "Admins leem relatorios de mitigacao da escola" ON mitigacao_reports;
CREATE POLICY "Admins leem relatorios de mitigacao da escola"
ON mitigacao_reports FOR SELECT
USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "Coordenacao e Direcao editam relatorios de mitigacao" ON mitigacao_reports;
CREATE POLICY "Coordenacao e Direcao editam relatorios de mitigacao"
ON mitigacao_reports FOR UPDATE
USING (
  public.get_my_role() = 'admin'
  AND public.get_my_departamento() IN ('coordenacao', 'diretoria_pedagogica')
  AND school_id = public.get_my_school_id()
)
WITH CHECK (
  public.get_my_role() = 'admin'
  AND public.get_my_departamento() IN ('coordenacao', 'diretoria_pedagogica')
  AND school_id = public.get_my_school_id()
);

-- Família: só o relatório PUBLICADO do próprio filho.
DROP POLICY IF EXISTS "Familias leem relatorios de mitigacao publicados dos filhos" ON mitigacao_reports;
CREATE POLICY "Familias leem relatorios de mitigacao publicados dos filhos"
ON mitigacao_reports FOR SELECT
USING (
  public.get_my_role() = 'family'
  AND status = 'PUBLICADO'
  AND (
    student_id IN (SELECT student_id FROM student_guardians WHERE guardian_id = auth.uid())
    OR student_id IN (SELECT id FROM students WHERE family_id = auth.uid())
  )
);
