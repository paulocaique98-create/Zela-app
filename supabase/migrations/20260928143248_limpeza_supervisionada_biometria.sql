-- Limpeza SUPERVISIONADA da biometria facial (28/09/2026).
-- LGPD (minimização) e POLITICA_PRIVACIDADE_BASE.md, item 7: a biometria
-- das pessoas autorizadas ficava guardada mesmo depois que a família não
-- tinha mais nenhum aluno ativo (transferência, desligamento). Seguindo a
-- decisão de LGPD_RETENCAO.md, nada é apagado sozinho: a Gestão vê a lista
-- e confirma o que apagar.

-- A Gestão não tinha acesso ao armazenamento das fotos das pessoas
-- autorizadas (só admin e família) -- necessário para apagar as fotos.
drop policy if exists "Gestao gerencia fotos de autorizados da escola" on storage.objects;
create policy "Gestao gerencia fotos de autorizados da escola"
on storage.objects for all
using (bucket_id = 'person-photos' and coalesce(get_my_role(), '') = 'gestao' and (storage.foldername(name))[1] = get_my_school_id()::text)
with check (bucket_id = 'person-photos' and coalesce(get_my_role(), '') = 'gestao' and (storage.foldername(name))[1] = get_my_school_id()::text);

-- Pessoa autorizada com foto/biometria cuja família não tem aluno ativo na
-- escola (nem como responsável principal, nem como 2º responsável).
create or replace function public.biometria_sem_aluno_ativo(p_person_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from authorized_persons ap
    where ap.id = p_person_id
      and ap.school_id = p_school_id
      and (ap.face_descriptor is not null or ap.face_descriptor_v2 is not null
           or ap.photo_storage_path is not null or ap.photo_url is not null)
      and not exists (
        select 1 from students s
        where s.school_id = p_school_id
          and coalesce(s.enrollment_status, 'ativo') = 'ativo'
          and ap.family_id is not null
          and (s.family_id = ap.family_id
               or exists (select 1 from student_guardians sg where sg.student_id = s.id and sg.guardian_id = ap.family_id))
      )
  );
$function$;
revoke execute on function public.biometria_sem_aluno_ativo(uuid, uuid) from public, anon, authenticated;

create or replace function public.list_biometria_para_limpar()
returns table (
  person_id uuid,
  person_name text,
  relation text,
  family_name text,
  photo_storage_path text,
  biometric_consent_at timestamptz,
  alunos text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := public.get_my_school_id();
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode ver a limpeza de biometria.';
  end if;
  return query
  select ap.id, ap.name, ap.relation, u.name, ap.photo_storage_path, ap.biometric_consent_at,
    (select string_agg(s.name || ' (' || coalesce(s.enrollment_status, 'ativo') || ')', ', ' order by s.name)
       from students s
      where s.school_id = v_school_id
        and ap.family_id is not null
        and (s.family_id = ap.family_id
             or exists (select 1 from student_guardians sg where sg.student_id = s.id and sg.guardian_id = ap.family_id)))
  from authorized_persons ap
  left join users u on u.id = ap.family_id
  where ap.school_id = v_school_id
    and public.biometria_sem_aluno_ativo(ap.id, v_school_id)
  order by u.name nulls last, ap.name;
end;
$function$;
revoke execute on function public.list_biometria_para_limpar() from public, anon;
grant execute on function public.list_biometria_para_limpar() to authenticated;

-- Apaga a biometria das pessoas escolhidas, conferindo de novo no servidor
-- que continuam elegíveis (um aluno pode ter sido reativado no meio tempo).
-- Devolve os caminhos das fotos para a tela apagar do armazenamento.
create or replace function public.purge_biometria(p_person_ids uuid[])
returns table (person_id uuid, photo_storage_path text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := public.get_my_school_id();
  v_count integer;
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode apagar biometria.';
  end if;

  create temporary table _alvo on commit drop as
  select ap.id, ap.photo_storage_path
  from authorized_persons ap
  where ap.id = any(coalesce(p_person_ids, array[]::uuid[]))
    and public.biometria_sem_aluno_ativo(ap.id, v_school_id);

  update authorized_persons ap set
    face_descriptor = null,
    face_descriptor_v2 = null,
    face_descriptor_v2_status = null,
    photo_url = null,
    photo_storage_path = null,
    has_photo = false,
    biometric_consent_at = null
  from _alvo a
  where ap.id = a.id;
  get diagnostics v_count = row_count;

  insert into audit_logs (school_id, actor_id, action, entity_type, details)
  values (v_school_id, auth.uid(), 'purge_biometria', 'authorized_person',
          jsonb_build_object('pessoas', v_count, 'ids', (select coalesce(jsonb_agg(id), '[]'::jsonb) from _alvo)));

  return query select a.id, a.photo_storage_path from _alvo a;
end;
$function$;
revoke execute on function public.purge_biometria(uuid[]) from public, anon;
grant execute on function public.purge_biometria(uuid[]) to authenticated;
