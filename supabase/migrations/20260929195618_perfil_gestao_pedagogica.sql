-- Perfil Gestão Pedagógica (Coordenação e Direção) · 29/09/2026
-- Plano: PLANO_PERFIL_GESTAO_PEDAGOGICA.md
--
-- Tipo de conta novo, users.role = 'gestao_pedagogica', que entra no Portal
-- da Gestão com o menu reduzido. FECHADO POR PADRÃO: nenhuma regra de
-- segurança existente muda para ele; ele só recebe o que as regras
-- ADITIVAS abaixo dão (todas com o nome começando por "Gestao pedagogica").
-- Financeiro, contratos, notas fiscais, horas extras, permissões,
-- configurações e LGPD continuam só da Gestão. O teste
-- perfilGestaoPedagogica.test.js compara a lista de regras deste perfil com
-- a lista aprovada e quebra se aparecer qualquer regra nova.
--
-- Também fecha uma brecha antiga: a leitura de cobranças, contratos
-- financeiros e conta de pagamento aceitava qualquer conta da Recepção
-- (can_read_gestao = admin ou gestao). Agora exige a Gestão, ou a Recepção
-- com a permissão financeira dada pela Gestão.

-- ═══ 1. Funções de acesso ═══════════════════════════════════════════════

-- Conta da Gestão Pedagógica da escola informada.
create or replace function public.gp_da_escola(p_school_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  -- Escola vazia (de um lado ou do outro) nunca bate.
  select coalesce(public.get_my_role(), '') = 'gestao_pedagogica'
     and coalesce(p_school_id = public.get_my_school_id(), false);
$function$;

-- Turmas: Gestão, suporte e Gestão Pedagógica (antes usava a mesma checagem
-- das configurações da escola, que continua só da Gestão).
create or replace function public.can_manage_turmas()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.get_my_role(), '') in ('developer', 'gestao', 'gestao_pedagogica');
$function$;
revoke execute on function public.can_manage_turmas() from public, anon;
grant execute on function public.can_manage_turmas() to authenticated;

-- Leitura financeira: Gestão; Recepção só com permissão financeira dada pela
-- Gestão (Inadimplência, Relatório Financeiro ou gerar contratos, que lê os
-- valores do plano). Gestão Pedagógica nunca.
create or replace function public.can_read_financeiro()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case coalesce(public.get_my_role(), '')
    when 'gestao' then true
    when 'admin' then public.has_permission('financeiro.baixa_manual')
                   or public.has_permission('relatorios.financeiro.ver')
                   or public.has_permission('contratos.gerenciar')
    else false
  end;
$function$;
revoke execute on function public.can_read_financeiro() from public, anon;
grant execute on function public.can_read_financeiro() to authenticated;

alter policy "Admins leem cobrancas da propria escola" on public.financial_charges
  using ((school_id = get_my_school_id()) and can_read_financeiro());
alter policy "Admins leem contratos da propria escola" on public.financial_contracts
  using ((school_id = get_my_school_id()) and can_read_financeiro());
alter policy "Admin ve status do gateway da propria escola" on public.school_gateway_accounts
  using ((school_id = get_my_school_id()) and can_read_financeiro());

-- ═══ 2. Regras aditivas da Gestão Pedagógica ════════════════════════════

-- Secretaria e cadastros
create policy "Gestao pedagogica le alunos da escola" on public.students
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica cria alunos" on public.students
  for insert with check (gp_da_escola(school_id));
create policy "Gestao pedagogica edita alunos" on public.students
  for update using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));

create policy "Gestao pedagogica gerencia vinculos" on public.student_guardians
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia autorizados" on public.authorized_persons
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia documentos do aluno" on public.student_documents
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia matriculas" on public.matricula_solicitacoes
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica le ficha medica" on public.fichas_medicas
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica le transferencias" on public.student_transfers
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica le matriculas por ano" on public.enrollments
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica le anos letivos" on public.school_years
  for select using (gp_da_escola(school_id));

-- Usuários: lê a escola; cria e edita só famílias e professoras (nunca a
-- equipe). A própria conta continua pela regra "id = auth.uid()" de sempre.
create policy "Gestao pedagogica le usuarios da escola" on public.users
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica cria familias e professoras" on public.users
  for insert with check (gp_da_escola(school_id) and role in ('family', 'teacher'));
create policy "Gestao pedagogica edita familias e professoras" on public.users
  for update using (gp_da_escola(school_id) and role in ('family', 'teacher'))
  with check (gp_da_escola(school_id) and role in ('family', 'teacher'));

-- Histórico do aluno: só ações não financeiras.
create policy "Gestao pedagogica le historico do aluno" on public.audit_logs
  for select using (
    gp_da_escola(school_id)
    and entity_type = 'student'
    and action in ('update_student_profile', 'transfer_student_external', 'upload_student_document', 'delete_student_document')
  );

-- Presença (consulta; correções passam pelas funções do servidor)
create policy "Gestao pedagogica le presenca" on public.attendance_logs
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica le status diario" on public.daily_attendance_status
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica le correcoes de presenca" on public.attendance_corrections
  for select using (gp_da_escola(school_id));

-- Acadêmico
create policy "Gestao pedagogica le turmas normalizadas" on public.classes
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica le frequencia" on public.class_attendance
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica le registros pedagogicos" on public.pedagogical_records
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica le relatorios pedagogicos" on public.reports
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia materias" on public.subjects
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia materias por turma" on public.class_subjects
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia diario" on public.diario_entries
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia cardapios" on public.cardapios
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia itens de cardapio" on public.cardapio_itens
  for all using (exists (select 1 from public.cardapios c where c.id = cardapio_itens.cardapio_id and gp_da_escola(c.school_id)))
  with check (exists (select 1 from public.cardapios c where c.id = cardapio_itens.cardapio_id and gp_da_escola(c.school_id)));
create policy "Gestao pedagogica gerencia calendario" on public.eventos_calendario
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia aulas especiais" on public.aulas_especiais
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));

-- Mitigação: lê a escola; revisa, publica e exclui (a professora cria).
create policy "Gestao pedagogica le relatorios de mitigacao" on public.mitigacao_reports
  for select using (gp_da_escola(school_id));
create policy "Gestao pedagogica edita relatorios de mitigacao" on public.mitigacao_reports
  for update using (gp_da_escola(school_id) and get_my_departamento() in ('coordenacao', 'diretoria_pedagogica'))
  with check (gp_da_escola(school_id) and get_my_departamento() in ('coordenacao', 'diretoria_pedagogica'));
create policy "Gestao pedagogica exclui relatorios de mitigacao" on public.mitigacao_reports
  for delete using (gp_da_escola(school_id) and get_my_departamento() in ('coordenacao', 'diretoria_pedagogica'));

-- Comunicação
create policy "Gestao pedagogica gerencia comunicados" on public.comunicados
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));
create policy "Gestao pedagogica gerencia mural" on public.mural_fotos
  for all using (gp_da_escola(school_id)) with check (gp_da_escola(school_id));

-- Chat: mesmas regras de setor da Recepção.
create policy "Gestao pedagogica acessa conversas do proprio setor" on public.chat_threads
  for all using (
    gp_da_escola(school_id) and setor <> 'suporte_zela'
    and (get_my_chat_visibilidade_total() or setor = get_my_departamento()))
  with check (
    gp_da_escola(school_id) and setor <> 'suporte_zela'
    and (get_my_chat_visibilidade_total() or setor = get_my_departamento()));
create policy "Gestao pedagogica le mensagens do proprio setor" on public.chat_messages
  for select using (
    coalesce(get_my_role(), '') = 'gestao_pedagogica'
    and thread_id in (select t.id from public.chat_threads t
                       where t.school_id = get_my_school_id() and t.setor <> 'suporte_zela'
                         and (get_my_chat_visibilidade_total() or t.setor = get_my_departamento())));
create policy "Gestao pedagogica envia mensagens em horario comercial" on public.chat_messages
  for insert with check (
    coalesce(get_my_role(), '') = 'gestao_pedagogica'
    and sender_id = auth.uid()
    and (now() at time zone 'America/Sao_Paulo')::time between time '07:00' and time '19:00'
    and thread_id in (select t.id from public.chat_threads t
                       where t.school_id = get_my_school_id() and t.setor <> 'suporte_zela'
                         and (get_my_chat_visibilidade_total() or t.setor = get_my_departamento())));
create policy "Gestao pedagogica gerencia a propria conversa de suporte" on public.chat_threads
  for all using (coalesce(get_my_role(), '') = 'gestao_pedagogica' and setor = 'suporte_zela' and family_id = auth.uid())
  with check (coalesce(get_my_role(), '') = 'gestao_pedagogica' and setor = 'suporte_zela' and family_id = auth.uid());
create policy "Gestao pedagogica le a propria conversa de suporte" on public.chat_messages
  for select using (
    coalesce(get_my_role(), '') = 'gestao_pedagogica'
    and thread_id in (select t.id from public.chat_threads t where t.family_id = auth.uid() and t.setor = 'suporte_zela'));
create policy "Gestao pedagogica escreve na propria conversa de suporte" on public.chat_messages
  for insert with check (
    coalesce(get_my_role(), '') = 'gestao_pedagogica'
    and sender_id = auth.uid()
    and thread_id in (select t.id from public.chat_threads t where t.family_id = auth.uid() and t.setor = 'suporte_zela'));

-- Configurações · Acadêmico (alerta de faltas). O gatilho da escola limita
-- as colunas que este perfil pode mudar (seção 3).
create policy "Gestao pedagogica ajusta alerta de faltas" on public.schools
  for update using (coalesce(get_my_role(), '') = 'gestao_pedagogica' and id = get_my_school_id())
  with check (coalesce(get_my_role(), '') = 'gestao_pedagogica' and id = get_my_school_id());

-- Arquivos
create policy "Gestao pedagogica gerencia arquivos de documentos do aluno" on storage.objects
  for all using (bucket_id = 'student-documents' and coalesce(get_my_role(), '') = 'gestao_pedagogica' and (storage.foldername(name))[1] = get_my_school_id()::text)
  with check (bucket_id = 'student-documents' and coalesce(get_my_role(), '') = 'gestao_pedagogica' and (storage.foldername(name))[1] = get_my_school_id()::text);
create policy "Gestao pedagogica gerencia anexos de comunicados" on storage.objects
  for all using (bucket_id = 'comunicados-anexos' and coalesce(get_my_role(), '') = 'gestao_pedagogica' and (storage.foldername(name))[1] = get_my_school_id()::text)
  with check (bucket_id = 'comunicados-anexos' and coalesce(get_my_role(), '') = 'gestao_pedagogica' and (storage.foldername(name))[1] = get_my_school_id()::text);
create policy "Gestao pedagogica gerencia fotos do mural" on storage.objects
  for all using (bucket_id = 'mural-fotos' and coalesce(get_my_role(), '') = 'gestao_pedagogica' and (storage.foldername(name))[1] = get_my_school_id()::text)
  with check (bucket_id = 'mural-fotos' and coalesce(get_my_role(), '') = 'gestao_pedagogica' and (storage.foldername(name))[1] = get_my_school_id()::text);
create policy "Gestao pedagogica gerencia fotos de autorizados" on storage.objects
  for all using (bucket_id = 'person-photos' and coalesce(get_my_role(), '') = 'gestao_pedagogica' and (storage.foldername(name))[1] = get_my_school_id()::text)
  with check (bucket_id = 'person-photos' and coalesce(get_my_role(), '') = 'gestao_pedagogica' and (storage.foldername(name))[1] = get_my_school_id()::text);
-- Documentos enviados na matrícula: a própria Gestão também não lia (só a
-- Recepção); passa a ler junto.
create policy "Gestao pedagogica e Gestao leem documentos de matricula" on storage.objects
  for select using (bucket_id = 'matriculas-docs' and coalesce(get_my_role(), '') in ('gestao', 'gestao_pedagogica') and (storage.foldername(name))[1] = get_my_school_id()::text);

-- Achado lateral: o histórico de transferências só era lido pela Recepção;
-- a Gestão via o perfil do aluno sem as mudanças de turma.
create policy "Gestao le historico de transferencias" on public.student_transfers
  for select using (coalesce(get_my_role(), '') = 'gestao' and school_id = get_my_school_id());

-- ═══ 3. Funções e gatilhos que conferem o tipo de conta ═════════════════
-- Troca pontual do trecho que confere o papel, mantendo o resto de cada
-- função exatamente como está (falha se o trecho não for encontrado).
create or replace function pg_temp.trocar_trecho(p_fn regprocedure, p_de text, p_para text)
returns void
language plpgsql
as $function$
declare
  v_def text := pg_get_functiondef(p_fn);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'Trecho não encontrado em %: %', p_fn, p_de;
  end if;
  execute replace(v_def, p_de, p_para);
end;
$function$;

-- Correção de presença: pedir e lançar. O servidor segue decidindo: o que
-- não aumenta a cobrança aplica na hora; o que aumenta fica para a Gestão
-- aprovar (approve_attendance_correction continua só da Gestão).
select pg_temp.trocar_trecho(
  'public.request_attendance_correction(uuid, timestamp with time zone, text, text, integer, boolean, text)'::regprocedure,
  $$v_role not in ('admin', 'gestao')$$,
  $$v_role not in ('admin', 'gestao', 'gestao_pedagogica')$$);
select pg_temp.trocar_trecho(
  'public.request_attendance_manual_entry(uuid, text, timestamp with time zone, text, text, integer, boolean)'::regprocedure,
  $$coalesce(public.get_my_role(), '') <> 'admin'$$,
  $$coalesce(public.get_my_role(), '') not in ('admin', 'gestao_pedagogica')$$);

-- Remover marcação indevida de hoje (entrada ou saída "fantasma"): correção
-- aplicada na hora e que nunca gera cobrança. Roda com as permissões de quem
-- chama, então a regra abaixo deixa este perfil registrar SÓ correção
-- aplicada e sem aumento de cobrança.
select pg_temp.trocar_trecho(
  'public.delete_stale_attendance_marking(uuid, text, text, text)'::regprocedure,
  $$IF public.get_my_role() <> 'admin' THEN$$,
  $$IF coalesce(public.get_my_role(), '') NOT IN ('admin', 'gestao_pedagogica') THEN$$);
create policy "Gestao pedagogica registra correcao que nao gera cobranca" on public.attendance_corrections
  for insert with check (
    gp_da_escola(school_id) and requested_by = auth.uid()
    and increases_billing = false and status = 'applied');

-- Atualização cadastral, mudança de turma e transferência para outra escola.
select pg_temp.trocar_trecho(
  'public.approve_atualizacao_cadastral(uuid)'::regprocedure,
  $$(role = 'gestao' and school_id = v_solicitacao.school_id)$$,
  $$(role in ('gestao', 'gestao_pedagogica') and school_id = v_solicitacao.school_id)$$);
select pg_temp.trocar_trecho(
  'public.transfer_student_class(uuid, text, text)'::regprocedure,
  $$public.get_my_role() in ('admin', 'gestao')$$,
  $$public.get_my_role() in ('admin', 'gestao', 'gestao_pedagogica')$$);
select pg_temp.trocar_trecho(
  'public.transfer_student_to_external_school(uuid, text, text)'::regprocedure,
  $$v_role not in ('developer', 'gestao')$$,
  $$v_role not in ('developer', 'gestao', 'gestao_pedagogica')$$);

-- Turmas
select pg_temp.trocar_trecho('public.update_school_turmas(text[])'::regprocedure,
  'public.can_manage_school_settings()', 'public.can_manage_turmas()');
select pg_temp.trocar_trecho('public.rename_school_turma(text, text)'::regprocedure,
  'public.can_manage_school_settings()', 'public.can_manage_turmas()');

-- Alunos (a Gestão Pedagógica edita todos os campos, como a Gestão) e
-- registro de erro crítico vindo da tela.
select pg_temp.trocar_trecho('public.restrict_family_student_updates()'::regprocedure,
  $$v_role in ('admin', 'gestao', 'developer')$$,
  $$v_role in ('admin', 'gestao', 'gestao_pedagogica', 'developer')$$);
select pg_temp.trocar_trecho(
  'public.log_error(text, text, text, text, text, jsonb, uuid, uuid, text, text, text, text)'::regprocedure,
  $$not in ('admin', 'gestao', 'developer')$$,
  $$not in ('admin', 'gestao', 'gestao_pedagogica', 'developer')$$);

-- Colunas protegidas da escola: turmas passam a ter checagem própria; a
-- Gestão Pedagógica só muda o alerta de faltas e as turmas.
create or replace function public.protect_school_pedagogical_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role -- não restringido
  END IF;

  IF (NEW.pedagogical_method IS DISTINCT FROM OLD.pedagogical_method)
     OR (NEW.custom_config IS DISTINCT FROM OLD.custom_config)
     OR (NEW.is_active IS DISTINCT FROM OLD.is_active)
     OR (NEW.features_enabled IS DISTINCT FROM OLD.features_enabled)
     OR (NEW.limits IS DISTINCT FROM OLD.limits)
     OR (NEW.plan IS DISTINCT FROM OLD.plan) THEN
    IF public.get_my_role() IS DISTINCT FROM 'developer' THEN
      RAISE EXCEPTION 'Apenas o suporte (developer) pode alterar essas configurações da escola (método pedagógico, status, módulos contratados, limites ou plano).';
    END IF;
  END IF;

  IF (NEW.turmas IS DISTINCT FROM OLD.turmas) AND NOT public.can_manage_turmas() THEN
    RAISE EXCEPTION 'Só a Gestão da escola (ou o suporte) pode gerenciar as turmas.';
  END IF;

  IF ((NEW.login_image_url IS DISTINCT FROM OLD.login_image_url)
     OR (NEW.billing_config IS DISTINCT FROM OLD.billing_config)
     OR (NEW.communication_config IS DISTINCT FROM OLD.communication_config))
     AND NOT public.can_manage_school_settings() THEN
    RAISE EXCEPTION 'Só a Gestão da escola (ou o suporte) pode gerenciar a imagem de login, a configuração de cobrança ou a de comunicação.';
  END IF;

  -- Gestão Pedagógica (29/09/2026): só o alerta de faltas e as turmas.
  IF coalesce(public.get_my_role(), '') = 'gestao_pedagogica'
     AND (to_jsonb(NEW) - array['absence_alert_config', 'turmas', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - array['absence_alert_config', 'turmas', 'updated_at']) THEN
    RAISE EXCEPTION 'A Coordenação e a Direção só podem alterar o alerta de faltas e as turmas da escola.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Colunas de privilégio das contas.
create or replace function public.protect_admin_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_role text;
  v_caller_school uuid;
begin
  -- auth.uid() é nulo em contexto de service_role (edge functions/scripts
  -- administrativos) e no trigger de troca de senha do Auth -- esses já
  -- passam por fora da RLS, então não há o que proteger aqui.
  if auth.uid() is null then
    return new;
  end if;

  -- role e school_id definem quem o usuário é e a QUE ESCOLA ele pertence --
  -- só o suporte (developer) pode alterar isso. Única exceção (29/09/2026):
  -- a Gestão alterna uma conta da PRÓPRIA escola entre Equipe (admin) e
  -- Gestão Pedagógica (Coordenação/Direção), nunca a própria conta.
  if (new.role is distinct from old.role)
     or (new.school_id is distinct from old.school_id) then
    select role, school_id into v_caller_role, v_caller_school from users where id = auth.uid();
    if v_caller_role = 'gestao'
       and new.id <> auth.uid()
       and new.school_id is not distinct from old.school_id
       and old.school_id = v_caller_school
       and old.role in ('admin', 'gestao_pedagogica')
       and new.role in ('admin', 'gestao_pedagogica') then
      null;
    elsif v_caller_role is distinct from 'developer' then
      raise exception 'Apenas o suporte pode alterar o cargo ou a escola de um usuário';
    end if;
  end if;

  if ((new.chat_visibilidade_total is distinct from old.chat_visibilidade_total)
      or (new.is_primary_admin is distinct from old.is_primary_admin))
     and not public.can_manage_school_settings() then
    raise exception 'Apenas a Gestão da escola pode alterar essas permissões';
  end if;

  -- Aprovação de cadastro: tirar uma conta de 'pending' é da Gestão; a
  -- Gestão Pedagógica aprova famílias e professoras.
  if old.status = 'pending' and new.status is distinct from 'pending'
     and not (coalesce(public.get_my_role(), '') in ('gestao', 'developer')
              or (coalesce(public.get_my_role(), '') = 'gestao_pedagogica' and new.role in ('family', 'teacher'))) then
    raise exception 'Só a Gestão pode aprovar cadastros pendentes.';
  end if;

  -- Ninguém desliga a própria troca obrigatória de senha por conta própria;
  -- ela só desliga quando a senha é trocada de verdade.
  if old.must_change_password = true
     and new.must_change_password = false
     and new.id = auth.uid() then
    raise exception 'Defina uma nova senha para continuar';
  end if;

  -- Colunas que definem ACESSO: quem não é da equipe de gestão da escola não
  -- altera no próprio cadastro (a escola continua alterando normalmente).
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

-- ═══ 4. Troca do tipo de acesso pela Gestão ═════════════════════════════
-- Passa uma conta de Coordenação/Direção entre Equipe (admin, portal da
-- Recepção) e Gestão Pedagógica (Portal da Gestão). Registrado na auditoria.
create or replace function public.set_staff_access_type(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_school_id uuid := public.get_my_school_id();
  v_alvo record;
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode mudar o tipo de acesso da equipe.';
  end if;
  if p_role not in ('admin', 'gestao_pedagogica') then
    raise exception 'Tipo de acesso inválido.';
  end if;
  select id, role, school_id, departamento, name into v_alvo from users where id = p_user_id;
  if v_alvo.id is null or v_alvo.school_id is distinct from v_school_id then
    raise exception 'Conta não encontrada nesta escola.';
  end if;
  if v_alvo.role not in ('admin', 'gestao_pedagogica') then
    raise exception 'Só contas da equipe (Recepção, Coordenação ou Direção) mudam de tipo por aqui.';
  end if;
  if p_role = 'gestao_pedagogica' and coalesce(v_alvo.departamento, '') not in ('coordenacao', 'diretoria_pedagogica') then
    raise exception 'Só contas da Coordenação ou da Diretoria Pedagógica podem ir para a Gestão Pedagógica.';
  end if;
  if v_alvo.role = p_role then
    return;
  end if;

  update users set role = p_role where id = p_user_id;

  insert into audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
  values (v_school_id, auth.uid(), 'set_staff_access_type', 'user', p_user_id,
          jsonb_build_object('nome', v_alvo.name, 'de', v_alvo.role, 'para', p_role));
end;
$function$;
revoke execute on function public.set_staff_access_type(uuid, text) from public, anon;
grant execute on function public.set_staff_access_type(uuid, text) to authenticated;

-- ═══ 5. Lista de regras por perfil (só para os testes) ══════════════════
create or replace function public.list_policies_for_role(p_role text)
returns table (schemaname text, tablename text, policyname text, cmd text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.schemaname::text, p.tablename::text, p.policyname::text, p.cmd::text
  from pg_policies p
  where (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ilike '%' || p_role || '%'
     or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ilike '%gp_da_escola%'
  order by 1, 2, 3;
$function$;
revoke execute on function public.list_policies_for_role(text) from public, anon, authenticated;
