-- Correção de rumo na Fase 3 da Secretaria: o padrão já usado em
-- Financeiro/Correções de Presença é Gestão ESCREVE, Admin/Recepção só LÊ
-- -- a Fase 3 tinha ficado read-only por engano. Corrige agora: escrita de
-- cadastro de aluno passa a aceitar também 'gestao' (via can_write_gestao(),
-- que hoje ainda aceita admin OU gestao -- em paralelo de propósito, igual
-- fizemos com Financeiro, até validar e só depois cortar o Admin numa fase
-- futura).
alter policy "Atualizacao de estudantes" on public.students
  using (
    (get_my_role() = 'developer')
    or (can_write_gestao() and school_id = get_my_school_id())
    or (get_my_role() = 'family' and family_id = auth.uid())
  )
  with check (
    (get_my_role() = 'developer')
    or (can_write_gestao() and school_id = get_my_school_id())
    or (get_my_role() = 'family' and family_id = auth.uid())
  );

-- transfer_student_class tinha a mesma checagem de role travada dentro da
-- função (igual o bug já visto em approve_attendance_correction) -- corrige
-- pra aceitar gestao também.
create or replace function public.transfer_student_class(p_student_id uuid, p_new_turma text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_old_turma text;
begin
  select school_id, turma into v_school_id, v_old_turma from public.students where id = p_student_id;
  if v_school_id is null then raise exception 'Aluno não encontrado.'; end if;
  if not (public.get_my_role() = 'developer' or (public.can_write_gestao() and public.get_my_school_id() = v_school_id)) then
    raise exception 'Permissão negada.';
  end if;
  if p_new_turma is null or trim(p_new_turma) = '' then raise exception 'Informe a turma de destino.'; end if;
  if p_new_turma = v_old_turma then raise exception 'O aluno já está nesta turma.'; end if;

  update public.students set turma = p_new_turma where id = p_student_id;

  insert into public.student_transfers (school_id, student_id, from_class_name, to_class_name, reason, transferred_by)
  values (v_school_id, p_student_id, v_old_turma, p_new_turma, nullif(trim(coalesce(p_reason, '')), ''), auth.uid());
end;
$$;
