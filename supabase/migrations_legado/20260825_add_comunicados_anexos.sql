-- Anexos (imagem, PDF, outros) em comunicados, via Supabase Storage.
ALTER TABLE comunicados ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Bucket privado — acesso controlado via RLS (não é público), path:
-- {school_id}/{comunicado_id}/{arquivo}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comunicados-anexos',
  'comunicados-anexos',
  false,
  15728640, -- 15MB por arquivo
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Admins da escola podem subir/gerenciar anexos dentro da própria pasta (1º segmento
-- do path = school_id).
DROP POLICY IF EXISTS "Admins gerenciam anexos de comunicados da escola" ON storage.objects;
CREATE POLICY "Admins gerenciam anexos de comunicados da escola"
ON storage.objects FOR ALL
USING (
  bucket_id = 'comunicados-anexos'
  AND public.get_my_role() = 'admin'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
)
WITH CHECK (
  bucket_id = 'comunicados-anexos'
  AND public.get_my_role() = 'admin'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
);

-- Famílias só leem (download) anexos da própria escola.
DROP POLICY IF EXISTS "Familias leem anexos de comunicados da escola" ON storage.objects;
CREATE POLICY "Familias leem anexos de comunicados da escola"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'comunicados-anexos'
  AND public.get_my_role() = 'family'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
);
