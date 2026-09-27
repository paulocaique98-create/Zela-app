-- Auditoria de segurança (27/09/2026) · itens 4 e 5 (altos). Provados em
-- teste antes da correção (src/test/securityHardening.test.js).
--
-- Item 4: o usuário podia editar QUALQUER coluna da própria linha em users;
-- o trigger só protegia role/school_id/chat_visibilidade_total/
-- is_primary_admin. Professor se dava todas as turmas (20 policies dependem
-- de get_my_turmas/get_my_teacher_status) e se reativava; família pendente
-- se aprovava sozinha (status). Agora essas colunas só mudam pela escola.
--
-- Item 5: a policy da família em students era FOR ALL. A família podia se
-- isentar de hora extra, esticar o horário contratado (os dois entram no
-- cálculo de horas extras), mudar turma/situação, criar aluno e APAGAR o
-- filho (cascade leva presença, fichas, contratos). A família continua
-- precisando atualizar students no check-in pelo app (solicitar entrada/
-- saída, "Registrar Saída") -- então só essas colunas ficam liberadas pra
-- ela, e qualquer outra (inclusive colunas futuras) fica travada.

-- ── Item 4 ─────────────────────────────────────────────────────────────
create or replace function public.protect_admin_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_role text;
  v_caller_primary boolean;
begin
  -- auth.uid() é nulo em contexto de service_role (edge functions/scripts
  -- administrativos) e no trigger de troca de senha do Auth -- esses já
  -- passam por fora da RLS, então não há o que proteger aqui.
  if auth.uid() is null then
    return new;
  end if;

  -- role e school_id definem quem o usuário É e a QUE ESCOLA ele pertence —
  -- só o suporte (developer) pode alterar isso, nunca um admin de escola,
  -- nem mesmo o admin principal.
  if (new.role is distinct from old.role)
     or (new.school_id is distinct from old.school_id) then
    select role into v_caller_role from users where id = auth.uid();

    if v_caller_role is distinct from 'developer' then
      raise exception 'Apenas o suporte pode alterar o cargo ou a escola de um usuário';
    end if;
  end if;

  if (new.chat_visibilidade_total is distinct from old.chat_visibilidade_total)
     or (new.is_primary_admin is distinct from old.is_primary_admin) then
    select role, is_primary_admin into v_caller_role, v_caller_primary
    from users where id = auth.uid();

    if v_caller_role is distinct from 'developer' and not coalesce(v_caller_primary, false) then
      raise exception 'Apenas o admin principal da escola pode alterar essas permissões';
    end if;
  end if;

  -- Ninguém desliga a própria troca obrigatória de senha por conta própria;
  -- ela só desliga quando a senha é trocada de verdade.
  if old.must_change_password = true
     and new.must_change_password = false
     and new.id = auth.uid() then
    raise exception 'Defina uma nova senha para continuar';
  end if;

  -- Colunas que definem ACESSO: professor/família não alteram no próprio
  -- cadastro (a escola continua alterando normalmente).
  if new.id = auth.uid()
     and coalesce(public.get_my_role(), '') not in ('admin', 'gestao', 'developer')
     and (new.turmas is distinct from old.turmas
          or new.teacher_status is distinct from old.teacher_status
          or new.status is distinct from old.status
          or new.departamento is distinct from old.departamento) then
    raise exception 'Esses dados do seu cadastro só podem ser alterados pela escola.';
  end if;

  return new;
end;
$function$;

-- ── Item 5 ─────────────────────────────────────────────────────────────
drop policy if exists "Famílias acessam próprios filhos" on public.students;

create policy "Famílias leem próprios filhos"
on public.students for select
using ((auth.uid() = family_id) and (school_id = get_my_school_id()));

create policy "Famílias atualizam check-in dos próprios filhos"
on public.students for update
using ((auth.uid() = family_id) and (school_id = get_my_school_id()))
with check ((auth.uid() = family_id) and (school_id = get_my_school_id()));

-- SECURITY INVOKER de propósito: current_user precisa ser o papel real de
-- quem gravou. Gravação direta pela API = 'authenticated'; funções internas
-- SECURITY DEFINER (correção de presença etc.) rodam como dono e não são
-- afetadas.
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
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if coalesce(public.get_my_role(), '') <> 'family' then
    return new;
  end if;
  if (to_jsonb(new) - v_checkin_columns) is distinct from (to_jsonb(old) - v_checkin_columns) then
    raise exception 'A família só pode registrar entrada e saída; os demais dados do aluno são alterados pela escola.';
  end if;
  return new;
end;
$function$;

drop trigger if exists restrict_family_student_updates_trigger on public.students;
create trigger restrict_family_student_updates_trigger
before update on public.students
for each row
execute function public.restrict_family_student_updates();
