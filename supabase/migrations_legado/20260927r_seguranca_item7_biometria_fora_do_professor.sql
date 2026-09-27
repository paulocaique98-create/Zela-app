-- Auditoria de segurança (27/09/2026) · item 7 (alto, LGPD art. 11).
-- Provado em teste antes da correção (src/test/securityHardening.test.js).
--
-- O professor lia a linha inteira de authorized_persons dos responsáveis
-- das turmas dele -- inclusive face_descriptor/face_descriptor_v2
-- (biometria facial, dado sensível). A tela do professor só precisa de
-- nome, parentesco, foto e "tem biometria sim/não" (Monitor: quem pediu a
-- entrada/saída).
--
-- Correção sem tocar no caminho do totem (admin/reconhecimento facial
-- continuam lendo a tabela igual):
-- 1) o professor deixa de ter acesso direto à tabela;
-- 2) passa a receber a lista por get_teacher_authorized_persons(), sem
--    nenhuma coluna biométrica, com a MESMA regra de antes (famílias das
--    turmas dele, professor ativo);
-- 3) a policy das fotos (Storage) consultava a tabela com a permissão do
--    professor -- passa a usar teacher_can_see_authorized_person(), senão
--    as fotos sumiriam do Monitor.

create or replace function public.teacher_visible_family_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.family_id
  from students s
  where coalesce(public.get_my_role(), '') = 'teacher'
    and public.get_my_teacher_status() = 'ativo'
    and s.turma = any(public.get_my_turmas())
    and s.school_id = public.get_my_school_id()
    and s.family_id is not null
  union
  select sg.guardian_id
  from student_guardians sg
  join students s on s.id = sg.student_id
  where coalesce(public.get_my_role(), '') = 'teacher'
    and public.get_my_teacher_status() = 'ativo'
    and s.turma = any(public.get_my_turmas())
    and s.school_id = public.get_my_school_id();
$function$;

create or replace function public.get_teacher_authorized_persons()
returns table (
  id uuid, family_id uuid, name text, relation text, has_photo boolean,
  photo_storage_path text, status text, emergency_order integer,
  temporary_until date, has_biometrics boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select ap.id, ap.family_id, ap.name, ap.relation, ap.has_photo,
         ap.photo_storage_path, ap.status, ap.emergency_order,
         ap.temporary_until, (ap.face_descriptor is not null) as has_biometrics
  from authorized_persons ap
  where ap.school_id = public.get_my_school_id()
    and ap.family_id in (select public.teacher_visible_family_ids());
$function$;

create or replace function public.teacher_can_see_authorized_person(p_person_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from authorized_persons ap
    where ap.id::text = p_person_id
      and ap.school_id = public.get_my_school_id()
      and ap.family_id in (select public.teacher_visible_family_ids())
  );
$function$;

revoke execute on function public.teacher_visible_family_ids() from public, anon;
revoke execute on function public.get_teacher_authorized_persons() from public, anon;
revoke execute on function public.teacher_can_see_authorized_person(text) from public, anon;
grant execute on function public.teacher_visible_family_ids() to authenticated;
grant execute on function public.get_teacher_authorized_persons() to authenticated;
grant execute on function public.teacher_can_see_authorized_person(text) to authenticated;

drop policy if exists "Professores leem fotos de autorizados de suas turmas" on storage.objects;
create policy "Professores leem fotos de autorizados de suas turmas"
on storage.objects for select
using (
  bucket_id = 'person-photos'
  and get_my_role() = 'teacher'
  and get_my_teacher_status() = 'ativo'
  and (storage.foldername(name))[1] = get_my_school_id()::text
  and public.teacher_can_see_authorized_person(
    regexp_replace(split_part(name, '/', 2), '\.[a-zA-Z0-9]+$', '')
  )
);

drop policy if exists "Professores leem responsaveis dos alunos de suas turmas" on public.authorized_persons;
