-- Responsável financeiro escolhido POR ALUNO (29/09/2026).
--
-- Caso real: irmãos em que cada pai recebe bolsa e precisa da cobrança (e,
-- no futuro, da nota fiscal) no próprio nome. O contrato já é por aluno e
-- usa o responsável com student_guardians.is_financial = true
-- (create-financial-contract, create-avulsa-charge): o cliente no Asaas é
-- criado com nome/CPF/e-mail dessa pessoa, o desconto (bolsa) é o dela e a
-- cobrança aparece no portal dela. Faltava a escola poder escolher.

-- No máximo UM responsável financeiro por aluno. As funções de cobrança leem
-- "o" financeiro com maybeSingle(): dois quebrariam a criação do contrato.
create unique index if not exists student_guardians_um_financeiro_por_aluno
  on public.student_guardians (student_id)
  where is_financial;

-- Troca o responsável financeiro de um aluno, com todas as conferências no
-- servidor: pessoa já vinculada ao aluno, com CPF/CNPJ (obrigatório para a
-- cobrança) e sem contrato em andamento (a assinatura já está no nome da
-- outra pessoa: trocar exige cancelar e criar outro contrato em Contratos).
create or replace function public.set_student_financial_guardian(p_student_id uuid, p_guardian_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce(public.get_my_role(), '');
  v_school_id uuid;
  v_nome text;
  v_doc text;
  v_anterior uuid;
begin
  if v_role not in ('admin', 'gestao') then
    raise exception 'Só a Recepção ou a Gestão podem escolher o responsável financeiro.';
  end if;

  select school_id into v_school_id from students where id = p_student_id;
  if v_school_id is null or v_school_id is distinct from public.get_my_school_id() then
    raise exception 'Aluno não encontrado nesta escola.';
  end if;

  if not exists (select 1 from student_guardians where student_id = p_student_id and guardian_id = p_guardian_id) then
    raise exception 'Esta pessoa não é responsável por este aluno.';
  end if;

  select guardian_id into v_anterior from student_guardians where student_id = p_student_id and is_financial;
  if v_anterior = p_guardian_id then
    return;
  end if;

  select name, doc_number into v_nome, v_doc from users where id = p_guardian_id;
  if coalesce(trim(v_doc), '') = '' then
    raise exception 'Cadastre o CPF de % antes de torná-lo responsável financeiro (a cobrança sai no CPF dele).', v_nome;
  end if;

  if exists (select 1 from financial_contracts where student_id = p_student_id and status in ('active', 'paused')) then
    raise exception 'Este aluno já tem contrato de mensalidade em andamento. Para trocar quem paga, cancele o contrato em Contratos e crie um novo no nome da outra pessoa.';
  end if;

  update student_guardians set is_financial = false where student_id = p_student_id and is_financial;
  update student_guardians set is_financial = true where student_id = p_student_id and guardian_id = p_guardian_id;

  insert into audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
  values (v_school_id, auth.uid(), 'set_student_financial_guardian', 'student', p_student_id,
          jsonb_build_object('de', v_anterior, 'para', p_guardian_id, 'nome', v_nome));
end;
$function$;
revoke execute on function public.set_student_financial_guardian(uuid, uuid) from public, anon;
grant execute on function public.set_student_financial_guardian(uuid, uuid) to authenticated;
