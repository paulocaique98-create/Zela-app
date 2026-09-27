-- Feature: Matrículas/Rematrículas — fluxo de solicitação da família + aprovação do admin.
-- Cada solicitação carrega responsável financeiro, 2º responsável (opcional), N crianças
-- e autorizados como JSONB — não normalizado em tabelas próprias porque nada aqui precisa
-- ser consultado/filtrado individualmente fora da própria solicitação (é um "formulário
-- congelado" até o admin decidir).
CREATE TABLE IF NOT EXISTS matricula_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  responsavel_financeiro jsonb NOT NULL,
  segundo_responsavel jsonb,
  criancas jsonb NOT NULL DEFAULT '[]'::jsonb,
  autorizado jsonb,
  transporte_autorizados jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matricula_solicitacoes_school ON matricula_solicitacoes(school_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_matricula_solicitacoes_family ON matricula_solicitacoes(family_id, submitted_at DESC);

ALTER TABLE matricula_solicitacoes ENABLE ROW LEVEL SECURITY;

-- Família gerencia suas próprias solicitações, mas só pode editar/excluir enquanto
-- estiverem pendentes — depois de decidida, a solicitação vira histórico read-only.
DROP POLICY IF EXISTS "Familias gerenciam suas solicitacoes pendentes" ON matricula_solicitacoes;
CREATE POLICY "Familias gerenciam suas solicitacoes pendentes"
ON matricula_solicitacoes FOR ALL
USING (family_id = auth.uid() AND public.get_my_role() = 'family')
WITH CHECK (family_id = auth.uid() AND public.get_my_role() = 'family' AND status = 'pending');

DROP POLICY IF EXISTS "Familias veem suas solicitacoes" ON matricula_solicitacoes;
CREATE POLICY "Familias veem suas solicitacoes"
ON matricula_solicitacoes FOR SELECT
USING (family_id = auth.uid() AND public.get_my_role() = 'family');

-- Admins veem e decidem (aprovam/rejeitam) as solicitações da própria escola.
DROP POLICY IF EXISTS "Admins gerenciam solicitacoes da escola" ON matricula_solicitacoes;
CREATE POLICY "Admins gerenciam solicitacoes da escola"
ON matricula_solicitacoes FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Bucket privado para os documentos anexados (CPF, RG, comprovante de residência,
-- plano de saúde/SUS, cartão de vacina, certidão de nascimento).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'matriculas-docs',
  'matriculas-docs',
  false,
  15728640, -- 15MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path: {school_id}/{family_id}/{solicitacao_id}/{doc}-{arquivo}
DROP POLICY IF EXISTS "Familias gerenciam seus documentos de matricula" ON storage.objects;
CREATE POLICY "Familias gerenciam seus documentos de matricula"
ON storage.objects FOR ALL
USING (
  bucket_id = 'matriculas-docs'
  AND public.get_my_role() = 'family'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  AND (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'matriculas-docs'
  AND public.get_my_role() = 'family'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "Admins leem documentos de matricula da escola" ON storage.objects;
CREATE POLICY "Admins leem documentos de matricula da escola"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'matriculas-docs'
  AND public.get_my_role() = 'admin'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
);
