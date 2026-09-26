-- Fase 6 (Transferências) do módulo Secretaria — parte "para outra escola".
--
-- Escopo combinado com o usuário: aqui é SAÍDA do aluno da Zela (foi pra uma
-- escola de fora do sistema), não migração entre escolas que também usam a
-- Zela — isso é bem mais simples e não mexe em tenant/school_id do aluno.
-- Evolução de turma dentro da mesma escola já existe (transfer_student_class,
-- Fase 3/RLS).
--
-- student_transfers hoje só modela troca de turma (to_class_name NOT NULL).
-- Estende pra também guardar saída externa, sem tocar nas linhas existentes.
alter table public.student_transfers
  add column transfer_type text not null default 'turma',
  add column destination_school_name text;

alter table public.student_transfers
  add constraint student_transfers_transfer_type_check
  check (transfer_type in ('turma', 'saida_externa'));

alter table public.student_transfers
  alter column to_class_name drop not null;

alter table public.student_transfers
  add constraint student_transfers_saida_externa_shape_check
  check (
    (transfer_type = 'turma' and to_class_name is not null and destination_school_name is null)
    or
    (transfer_type = 'saida_externa' and to_class_name is null and destination_school_name is not null)
  );

-- Marca enrollment_status='transferido' e registra o histórico -- NUNCA
-- mexe em turma/status operacional/school_id, só o novo campo de matrícula.
-- Não é lido pelo fluxo de autoatendimento (mesma garantia da Fase 3), então
-- não afeta check-in/check-out de quem ainda estiver ativo.
create or replace function public.transfer_student_to_external_school(p_student_id uuid, p_destination_school_name text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_turma text;
begin
  select school_id, turma into v_school_id, v_turma from public.students where id = p_student_id;
  if v_school_id is null then raise exception 'Aluno não encontrado.'; end if;
  if not (public.get_my_role() = 'developer' or (public.get_my_role() in ('admin', 'gestao') and public.get_my_school_id() = v_school_id)) then
    raise exception 'Permissão negada.';
  end if;
  if p_destination_school_name is null or trim(p_destination_school_name) = '' then
    raise exception 'Informe o nome da escola de destino.';
  end if;

  update public.students set enrollment_status = 'transferido' where id = p_student_id;

  insert into public.student_transfers (school_id, student_id, from_class_name, to_class_name, transfer_type, destination_school_name, reason, transferred_by)
  values (v_school_id, p_student_id, v_turma, null, 'saida_externa', trim(p_destination_school_name), nullif(trim(coalesce(p_reason, '')), ''), auth.uid());
end;
$$;
