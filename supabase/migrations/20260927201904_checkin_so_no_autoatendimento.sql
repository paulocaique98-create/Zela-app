-- Check-in/check-out centralizado no autoatendimento (decisão do usuário,
-- 27/09/2026). O responsável não registra mais entrada nem saída pelo
-- próprio celular -- antes, o botão "Registrar Saída" do portal da família
-- gravava a saída com o horário do APARELHO da família, que entra no
-- cálculo de hora extra.
--
-- Aqui a família perde, no banco, as duas permissões que tornavam isso
-- possível (mesmo chamando a API direto): alterar students e inserir em
-- attendance_logs. O aviso "Não irá hoje" (recado de ausência, não é
-- check-in/out) continua, por uma função própria e restrita.

drop policy if exists "Famílias atualizam check-in dos próprios filhos" on public.students;

alter policy "Atualizacao de estudantes" on public.students
  using ((get_my_role() = 'developer') or ((get_my_role() = any (array['admin', 'gestao'])) and (school_id = get_my_school_id())))
  with check ((get_my_role() = 'developer') or ((get_my_role() = any (array['admin', 'gestao'])) and (school_id = get_my_school_id())));

drop policy if exists "Guardioes inserem historico dos proprios filhos" on public.attendance_logs;

-- "Não irá hoje": só a família do aluno (titular ou responsável vinculado),
-- só antes da chegada (status idle), e só muda o status pra 'absent'.
create or replace function public.family_mark_student_absent(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student record;
begin
  if coalesce(public.get_my_role(), '') <> 'family' then
    raise exception 'Permissão negada.';
  end if;

  select id, family_id, status into v_student from students where id = p_student_id;
  if not found then
    raise exception 'Aluno não encontrado.';
  end if;
  if v_student.family_id is distinct from auth.uid() and not public.is_guardian_of(p_student_id) then
    raise exception 'Permissão negada.';
  end if;
  if v_student.status <> 'idle' then
    raise exception 'O aviso de ausência só pode ser dado antes da chegada do aluno.';
  end if;

  update students set status = 'absent' where id = p_student_id;
end;
$function$;

revoke execute on function public.family_mark_student_absent(uuid) from public, anon;
grant execute on function public.family_mark_student_absent(uuid) to authenticated;
