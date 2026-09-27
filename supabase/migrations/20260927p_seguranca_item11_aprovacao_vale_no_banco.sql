-- Auditoria de segurança (27/09/2026) · item 11 (médio). Provado em teste
-- antes da correção (src/test/securityHardening.test.js).
--
-- users.status = 'pending' (autocadastro, matrícula pública, importação em
-- lote aguardando a escola) só era barrado na TELA de login (Login.jsx). O
-- token de acesso já era válido e get_my_role() devolvia 'family', então
-- quem chamasse a API direto tinha acesso de família aprovada -- e o
-- autocadastro deixa escolher a turma da criança (conteúdo por turma:
-- mural de fotos, comunicados, diário).
--
-- Agora o papel só vale com a conta ativa. Todas as contas atuais estão
-- 'active' (conferido antes de aplicar), e o default da coluna é 'active'.

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select role from public.users
  where id = auth.uid() and coalesce(status, 'active') = 'active';
$function$;

-- A trava do item 5 usava get_my_role(): com o papel vazio, uma família
-- pendente escaparia dela. Passa a ler o papel direto do cadastro e só
-- libera a equipe da escola.
create or replace function public.restrict_family_student_updates()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_checkin_columns text[] := array[
    'status', 'today_entry', 'today_exit', 'today_entry_at', 'today_exit_at', 'pending_requester_id'
  ];
  v_role text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  select role into v_role from public.users where id = auth.uid();
  if v_role in ('admin', 'gestao', 'developer') then
    return new;
  end if;
  if (to_jsonb(new) - v_checkin_columns) is distinct from (to_jsonb(old) - v_checkin_columns) then
    raise exception 'A família só pode registrar entrada e saída; os demais dados do aluno são alterados pela escola.';
  end if;
  return new;
end;
$function$;
