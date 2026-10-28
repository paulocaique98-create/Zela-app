-- Recepção (role 'admin') passa a SÓ CONSULTAR cadastros. Quem cria e edita
-- usuários, alunos, funcionários e turmas é a Gestão, a Coordenação e a Direção
-- (decisão do produto, 28/10/2026). Antes só a tela escondia os botões; aqui o
-- banco passa a barrar de verdade.
--
-- O que NÃO muda (a Recepção precisa para operar o dia):
--  * leitura de tudo o que lia (policies SELECT intactas);
--  * students: UPDATE continua, mas só nas colunas do check-in (trigger abaixo);
--  * authorized_persons: ALL continua (cadastro de rosto no totem e na recepção);
--  * users: a própria linha (id = auth.uid()) continua editável por ela.
-- Funções SECURITY DEFINER e service_role (current_user <> 'authenticated')
-- não são afetadas pelo trigger.

-- 1) students: Recepção não cria nem apaga aluno.
alter policy "Criacao de estudantes por admin ou developer" on public.students
  with check (
    get_my_role() = 'developer'
    or (get_my_role() = 'gestao' and school_id = get_my_school_id())
  );

alter policy "Exclusao de estudantes" on public.students
  using (
    get_my_role() = 'developer'
    or (get_my_role() = 'gestao' and school_id = get_my_school_id())
  );

-- 2) students: Recepção só atualiza as colunas do check-in e checkout.
create or replace function public.restrict_admin_student_updates()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_permitidas text[] := array[
    'status', 'today_entry', 'today_exit', 'today_entry_at', 'today_exit_at',
    'pending_requester_id', 'updated_at'
  ];
  v_role text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  select role into v_role from public.users where id = auth.uid();
  if v_role is distinct from 'admin' then
    return new;
  end if;
  if (to_jsonb(new) - v_permitidas) is distinct from (to_jsonb(old) - v_permitidas) then
    raise exception 'A Recepção só registra entrada e saída; os demais dados do aluno são alterados pela Gestão, Coordenação ou Direção.';
  end if;
  return new;
end;
$$;

drop trigger if exists restrict_admin_student_updates_trigger on public.students;
create trigger restrict_admin_student_updates_trigger
  before update on public.students
  for each row execute function public.restrict_admin_student_updates();

-- 3) users: Recepção não cria conta nem edita a de outras pessoas.
alter policy "Insercao de usuarios por admin ou developer" on public.users
  with check (
    get_my_role() = 'developer'
    or (
      get_my_role() = 'gestao'
      and school_id = get_my_school_id()
      and role = any (array['admin'::text, 'teacher'::text, 'family'::text])
    )
  );

alter policy "Atualizacao de perfis de usuario" on public.users
  using (
    get_my_role() = 'developer'
    or (get_my_role() = 'gestao' and school_id = get_my_school_id())
    or id = auth.uid()
  );

-- 4) funcionarios: Recepção continua lendo, mas não escreve.
drop policy if exists "Admins gerenciam funcionarios da escola" on public.funcionarios;
create policy "Admins leem funcionarios da escola" on public.funcionarios
  for select to authenticated
  using (school_id = get_my_school_id() and get_my_role() = 'admin');

-- 5) trad_turmas: idem (gestão e coordenação/direção gerenciam; Recepção só lê).
alter policy "Equipe gerencia trad_turmas da escola" on public.trad_turmas
  using (get_my_role() = any (array['gestao'::text, 'gestao_pedagogica'::text]) and school_id = get_my_school_id())
  with check (get_my_role() = any (array['gestao'::text, 'gestao_pedagogica'::text]) and school_id = get_my_school_id());

create policy "Admins leem trad_turmas da escola" on public.trad_turmas
  for select to authenticated
  using (school_id = get_my_school_id() and get_my_role() = 'admin');
