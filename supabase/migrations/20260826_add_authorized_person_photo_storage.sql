-- Migração ADITIVA (fase 1 de 2) para tirar authorized_persons.photo_url de
-- base64-na-coluna e mover pro Supabase Storage — reduz o payload de toda
-- query que lê authorized_persons (login, totem, gestão de usuários).
--
-- REGRA: esta migração NÃO apaga, NÃO altera e NÃO depende de photo_url.
-- A coluna antiga continua existindo e sendo usada como fallback enquanto
-- os registros antigos não forem migrados (ver script de migração de dados,
-- que roda separado, depois, em lotes pequenos — não faz parte deste
-- arquivo). Reversível: DROP COLUMN photo_storage_path desfaz 100% disso.

ALTER TABLE authorized_persons
  ADD COLUMN IF NOT EXISTS photo_storage_path text;

COMMENT ON COLUMN authorized_persons.photo_storage_path IS
  'Path no bucket person-photos (formato {school_id}/{id}.jpg). Quando preenchido, tem prioridade sobre photo_url (legado, base64) na hora de exibir a foto.';

-- Bucket privado — mesmo padrão de segurança já usado em mural-fotos
-- (20260829_add_mural_fotos.sql): path com o school_id como primeira pasta,
-- acesso só via signed URL (nunca público), RLS valida o school_id do
-- usuário autenticado contra a pasta, não só o path em si.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'person-photos',
  'person-photos',
  false,
  5242880, -- 5MB — mais que suficiente pra uma foto de rosto, evita upload de arquivo gigante por engano
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Admin: lê/escreve/remove qualquer foto da PRÓPRIA escola (mesmo padrão do
-- mural). Cobre o cadastro assistido (AdminFaceEnrollment) e a remoção de
-- foto (AdminFaceEnrollment "Já Cadastrados").
DROP POLICY IF EXISTS "Admins gerenciam fotos de autorizados da escola" ON storage.objects;
CREATE POLICY "Admins gerenciam fotos de autorizados da escola"
ON storage.objects FOR ALL
USING (
  bucket_id = 'person-photos'
  AND public.get_my_role() = 'admin'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
)
WITH CHECK (
  bucket_id = 'person-photos'
  AND public.get_my_role() = 'admin'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
);

-- Família: só mexe na foto de um authorized_person que ELA MESMA é dona
-- (family_id = auth.uid()) — valida contra a tabela, não confia só no path,
-- exatamente como pedido (o nome do arquivo é {authorized_person_id}.jpg,
-- então "{school_id}/{id}.jpg" tem o UUID como segundo segmento do path,
-- com extensão — removida via regexp antes de comparar).
DROP POLICY IF EXISTS "Familias gerenciam fotos dos proprios autorizados" ON storage.objects;
CREATE POLICY "Familias gerenciam fotos dos proprios autorizados"
ON storage.objects FOR ALL
USING (
  bucket_id = 'person-photos'
  AND public.get_my_role() = 'family'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  AND EXISTS (
    SELECT 1 FROM authorized_persons ap
    WHERE ap.family_id = auth.uid()
      AND ap.id::text = regexp_replace(split_part(name, '/', 2), '\.[a-zA-Z0-9]+$', '')
  )
)
WITH CHECK (
  bucket_id = 'person-photos'
  AND public.get_my_role() = 'family'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  AND EXISTS (
    SELECT 1 FROM authorized_persons ap
    WHERE ap.family_id = auth.uid()
      AND ap.id::text = regexp_replace(split_part(name, '/', 2), '\.[a-zA-Z0-9]+$', '')
  )
);

-- Professor: só LÊ (nunca escreve) fotos de autorizados vinculados aos
-- alunos das próprias turmas — mesmo escopo já usado na policy de leitura
-- de authorized_persons (20260916_add_teacher_authorized_persons_rls.sql).
DROP POLICY IF EXISTS "Professores leem fotos de autorizados de suas turmas" ON storage.objects;
CREATE POLICY "Professores leem fotos de autorizados de suas turmas"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'person-photos'
  AND public.get_my_role() = 'teacher'
  AND public.get_my_teacher_status() = 'ativo'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  AND EXISTS (
    SELECT 1 FROM authorized_persons ap
    WHERE ap.id::text = regexp_replace(split_part(name, '/', 2), '\.[a-zA-Z0-9]+$', '')
      AND ap.family_id IN (
        SELECT family_id FROM students
        WHERE turma = ANY(public.get_my_turmas()) AND school_id = public.get_my_school_id() AND family_id IS NOT NULL
        UNION
        SELECT sg.guardian_id FROM student_guardians sg
        JOIN students s ON s.id = sg.student_id
        WHERE s.turma = ANY(public.get_my_turmas()) AND s.school_id = public.get_my_school_id()
      )
  )
);
