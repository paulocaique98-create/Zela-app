-- Rotina e família no portal do Professor (Diário, Mural de Fotos, Cardápio).
-- Só policies novas e aditivas: nada é apagado e nenhuma policy existente muda.
-- Professor ativo, sempre limitado à escola dele e às turmas dele
-- (get_my_turmas()), nunca a escola inteira:
--  * diario_entries: ler e lançar só dos alunos das turmas dele.
--  * mural_fotos: ver as fotos marcadas para alguma turma dele e as que ele
--    mesmo publicou; publicar/alterar/apagar só com turmas dentro das dele e
--    só as próprias (nunca "todas as turmas", turmas NULL).
--  * storage mural-fotos: enviar na pasta da escola; ler e apagar só objetos
--    de uma foto que a policy acima já deixa ele ver.
--  * cardapios e cardapio_itens: só leitura, da escola dele.

drop policy if exists "Professores gerenciam diario das suas turmas" on public.diario_entries;
create policy "Professores gerenciam diario das suas turmas" on public.diario_entries
  for all
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and student_id in (
      select s.id from public.students s
      where s.school_id = get_my_school_id() and s.turma = any (get_my_turmas())
    )
  )
  with check (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and student_id in (
      select s.id from public.students s
      where s.school_id = get_my_school_id() and s.turma = any (get_my_turmas())
    )
  );

drop policy if exists "Professores veem fotos do mural das suas turmas" on public.mural_fotos;
create policy "Professores veem fotos do mural das suas turmas" on public.mural_fotos
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and (uploaded_by = auth.uid() or (turmas is not null and turmas && get_my_turmas()))
  );

drop policy if exists "Professores publicam fotos no mural das suas turmas" on public.mural_fotos;
create policy "Professores publicam fotos no mural das suas turmas" on public.mural_fotos
  for insert
  with check (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and uploaded_by = auth.uid()
    and turmas is not null and cardinality(turmas) > 0
    and turmas <@ get_my_turmas()
  );

drop policy if exists "Professores apagam as proprias fotos do mural" on public.mural_fotos;
create policy "Professores apagam as proprias fotos do mural" on public.mural_fotos
  for delete
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
    and uploaded_by = auth.uid()
  );

drop policy if exists "Professores enviam objetos do mural da escola" on storage.objects;
create policy "Professores enviam objetos do mural da escola" on storage.objects
  for insert
  with check (
    bucket_id = 'mural-fotos'
    and get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and (storage.foldername(name))[1] = get_my_school_id()::text
  );

drop policy if exists "Professores leem objetos do mural das suas turmas" on storage.objects;
create policy "Professores leem objetos do mural das suas turmas" on storage.objects
  for select
  using (
    bucket_id = 'mural-fotos'
    and get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.mural_fotos m
      where m.storage_path = storage.objects.name
        and m.school_id = get_my_school_id()
        and (m.uploaded_by = auth.uid() or (m.turmas is not null and m.turmas && get_my_turmas()))
    )
  );

drop policy if exists "Professores apagam objetos das proprias fotos do mural" on storage.objects;
create policy "Professores apagam objetos das proprias fotos do mural" on storage.objects
  for delete
  using (
    bucket_id = 'mural-fotos'
    and get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and (storage.foldername(name))[1] = get_my_school_id()::text
    and exists (
      select 1 from public.mural_fotos m
      where m.storage_path = storage.objects.name
        and m.school_id = get_my_school_id()
        and m.uploaded_by = auth.uid()
    )
  );

drop policy if exists "Professores veem cardapios da escola" on public.cardapios;
create policy "Professores veem cardapios da escola" on public.cardapios
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and school_id = get_my_school_id()
  );

drop policy if exists "Professores veem itens de cardapio da escola" on public.cardapio_itens;
create policy "Professores veem itens de cardapio da escola" on public.cardapio_itens
  for select
  using (
    get_my_role() = 'teacher' and get_my_teacher_status() = 'ativo'
    and exists (
      select 1 from public.cardapios c
      where c.id = cardapio_itens.cardapio_id and c.school_id = get_my_school_id()
    )
  );
