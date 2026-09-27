-- Mural de Fotos: galeria de imagens por escola, via Supabase Storage (bucket
-- separado do de anexos de comunicados, mesmo padrão de RLS).
CREATE TABLE IF NOT EXISTS mural_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  turmas text[], -- NULL = visível pra todas as turmas
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mural_fotos_school ON mural_fotos(school_id, created_at DESC);

ALTER TABLE mural_fotos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam fotos do mural da escola" ON mural_fotos;
CREATE POLICY "Admins gerenciam fotos do mural da escola"
ON mural_fotos FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Família só vê fotos gerais (turmas IS NULL) ou de turma de algum filho seu —
-- mesmo padrão usado em comunicados.
DROP POLICY IF EXISTS "Familias veem fotos do mural da escola" ON mural_fotos;
CREATE POLICY "Familias veem fotos do mural da escola"
ON mural_fotos FOR SELECT
USING (
  school_id = public.get_my_school_id()
  AND public.get_my_role() = 'family'
  AND (
    turmas IS NULL
    OR turmas && (
      SELECT COALESCE(array_agg(DISTINCT s.turma), ARRAY[]::text[])
      FROM students s
      JOIN student_guardians sg ON sg.student_id = s.id
      WHERE sg.guardian_id = auth.uid()
    )
    OR turmas && (
      SELECT COALESCE(array_agg(DISTINCT turma), ARRAY[]::text[])
      FROM students WHERE family_id = auth.uid()
    )
  )
);

-- Bucket privado — acesso controlado via RLS, path: {school_id}/{arquivo}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mural-fotos',
  'mural-fotos',
  false,
  10485760, -- 10MB por foto
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins gerenciam objetos do mural da escola" ON storage.objects;
CREATE POLICY "Admins gerenciam objetos do mural da escola"
ON storage.objects FOR ALL
USING (
  bucket_id = 'mural-fotos'
  AND public.get_my_role() = 'admin'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
)
WITH CHECK (
  bucket_id = 'mural-fotos'
  AND public.get_my_role() = 'admin'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
);

DROP POLICY IF EXISTS "Familias leem objetos do mural da escola" ON storage.objects;
CREATE POLICY "Familias leem objetos do mural da escola"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'mural-fotos'
  AND public.get_my_role() = 'family'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
);
