-- Correção de bug real: a migration anterior (20260927b) reaproveitou
-- can_write_gestao() pra liberar escrita de aluno em paralelo (admin OU
-- gestao) -- só que essa função JÁ foi apertada pra só 'gestao' na Fase 5
-- do Financeiro/Correções (migration 20260926f). Resultado: admin comum
-- ficou com "Permissão negada" pra transferir turma, e a Secretaria de
-- Alunos ficou sem a janela de "os dois funcionam em paralelo" que tinha
-- sido pedida.
--
-- Cada módulo está numa fase diferente da migração Admin -> Gestão:
-- Financeiro/Correções já foram cortados (só gestao escreve); Alunos ainda
-- está começando (admin E gestao escrevem, até validar). Por isso aqui usa
-- a checagem direta (admin OU gestao), não a função compartilhada.
alter policy "Atualizacao de estudantes" on public.students
  using (
    (get_my_role() = 'developer')
    or (get_my_role() in ('admin', 'gestao') and school_id = get_my_school_id())
    or (get_my_role() = 'family' and family_id = auth.uid())
  )
  with check (
    (get_my_role() = 'developer')
    or (get_my_role() in ('admin', 'gestao') and school_id = get_my_school_id())
    or (get_my_role() = 'family' and family_id = auth.uid())
  );

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
  if not (public.get_my_role() = 'developer' or (public.get_my_role() in ('admin', 'gestao') and public.get_my_school_id() = v_school_id)) then
    raise exception 'Permissão negada.';
  end if;
  if p_new_turma is null or trim(p_new_turma) = '' then raise exception 'Informe a turma de destino.'; end if;
  if p_new_turma = v_old_turma then raise exception 'O aluno já está nesta turma.'; end if;

  update public.students set turma = p_new_turma where id = p_student_id;

  insert into public.student_transfers (school_id, student_id, from_class_name, to_class_name, reason, transferred_by)
  values (v_school_id, p_student_id, v_old_turma, p_new_turma, nullif(trim(coalesce(p_reason, '')), ''), auth.uid());
end;
$$;
