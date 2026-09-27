-- Corrige uma inconsistência de segurança: a tabela mural_fotos já restringe
-- a visibilidade da família por turma (turmas IS NULL ou bate com a turma de
-- algum filho), mas a policy de leitura do Storage só verificava a escola —
-- ou seja, uma família com o storage_path exato de uma foto de outra turma
-- conseguia gerar signed URL e baixar o arquivo, mesmo sem acesso à linha.
--
-- Fix: a policy de Storage agora exige que exista uma linha em mural_fotos
-- com esse storage_path que a família também teria permissão de ver pela
-- regra normal da tabela — Storage deixa de confiar só na pasta da escola.
DROP POLICY IF EXISTS "Familias leem objetos do mural da escola" ON storage.objects;
CREATE POLICY "Familias leem objetos do mural da escola"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'mural-fotos'
  AND public.get_my_role() = 'family'
  AND EXISTS (
    SELECT 1 FROM mural_fotos mf
    WHERE mf.storage_path = storage.objects.name
      AND mf.school_id = public.get_my_school_id()
      AND (
        mf.turmas IS NULL
        OR mf.turmas && (
          SELECT COALESCE(array_agg(DISTINCT s.turma), ARRAY[]::text[])
          FROM students s
          JOIN student_guardians sg ON sg.student_id = s.id
          WHERE sg.guardian_id = auth.uid()
        )
        OR mf.turmas && (
          SELECT COALESCE(array_agg(DISTINCT turma), ARRAY[]::text[])
          FROM students WHERE family_id = auth.uid()
        )
      )
  )
);
