-- Corrige bug de ambiguidade de coluna nas policies de storage.objects do
-- bucket person-photos, criadas em 20260826_add_authorized_person_photo_storage.sql.
--
-- BUG: dentro do EXISTS (SELECT ... FROM authorized_persons ap WHERE ...), a
-- referência não-qualificada a "name" era resolvida pelo Postgres para
-- authorized_persons.name (o NOME DA PESSOA, ex: "Paulo Caique de Paula
-- Santana") em vez de storage.objects.name (o CAMINHO DO ARQUIVO, ex:
-- "escola/pessoa.jpg"), porque authorized_persons também tem uma coluna
-- chamada "name" e o escopo mais interno vence na resolução do Postgres.
--
-- Efeito: split_part(name, '/', 2) sempre operava sobre o nome da pessoa
-- (que raramente contém "/"), retornando string vazia — o EXISTS nunca
-- encontrava o registro correspondente, e a policy nunca autorizava upload
-- de família. Confirmado em produção: erro real do Storage API
-- "new row violates row-level security policy" ao tentar cadastrar/trocar
-- foto pela conta de família (bypassed acidentalmente pela Fase 5 porque
-- aquela migração de dados usou a service role key, que ignora RLS).
--
-- FIX: qualifica explicitamente storage.objects.name na comparação, sem
-- alterar nenhuma outra condição de escopo (escola, dono do registro).

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
      AND ap.id::text = regexp_replace(split_part(storage.objects.name, '/', 2), '\.[a-zA-Z0-9]+$', '')
  )
)
WITH CHECK (
  bucket_id = 'person-photos'
  AND public.get_my_role() = 'family'
  AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  AND EXISTS (
    SELECT 1 FROM authorized_persons ap
    WHERE ap.family_id = auth.uid()
      AND ap.id::text = regexp_replace(split_part(storage.objects.name, '/', 2), '\.[a-zA-Z0-9]+$', '')
  )
);

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
    WHERE ap.id::text = regexp_replace(split_part(storage.objects.name, '/', 2), '\.[a-zA-Z0-9]+$', '')
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
