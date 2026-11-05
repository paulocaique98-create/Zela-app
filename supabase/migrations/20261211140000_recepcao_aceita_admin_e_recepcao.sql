-- Fase C1 · Recepção: policies passam a aceitar 'admin' e 'recepcao' (aditivo).
-- Gerado do pg_policies local; nada fica mais permissivo para quem já é admin, e
-- 'recepcao' recebe exatamente o mesmo acesso, sempre preso ao school_id original.
-- Policies da Fase B (só SELECT) continuam só SELECT. C4 remove 'admin' depois.
drop policy if exists "Admins inserem correcoes da propria escola" on public.attendance_corrections;
create policy "Admins inserem correcoes da propria escola" on public.attendance_corrections as PERMISSIVE for INSERT to public
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text])) AND (school_id = get_my_school_id()) AND (requested_by = auth.uid())));

drop policy if exists "Família acessa logs dos filhos vinculados" on public.attendance_logs;
create policy "Família acessa logs dos filhos vinculados" on public.attendance_logs as PERMISSIVE for SELECT to authenticated
  using (((get_my_role() = 'developer'::text) OR ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())) OR ((get_my_role() = 'family'::text) AND (family_id = auth.uid())) OR ((get_my_role() = 'family'::text) AND (student_id IN ( SELECT student_guardians.student_id
   FROM student_guardians
  WHERE (student_guardians.guardian_id = auth.uid()))))));

drop policy if exists "Insercao de historico por admin ou developer" on public.attendance_logs;
create policy "Insercao de historico por admin ou developer" on public.attendance_logs as PERMISSIVE for INSERT to public
  with check (((get_my_role() = 'developer'::text) OR ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id()))));

drop policy if exists "Recepcao le aulas especiais da escola" on public.aulas_especiais;
create policy "Recepcao le aulas especiais da escola" on public.aulas_especiais as PERMISSIVE for SELECT to public
  using (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text]))));

drop policy if exists "Admins acessam autorizados da escola" on public.authorized_persons;
create policy "Admins acessam autorizados da escola" on public.authorized_persons as PERMISSIVE for ALL to public
  using (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text]))))
  with check (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text]))));

drop policy if exists "Recepcao le itens de cardapio da escola" on public.cardapio_itens;
create policy "Recepcao le itens de cardapio da escola" on public.cardapio_itens as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM cardapios c
  WHERE ((c.id = cardapio_itens.cardapio_id) AND (c.school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text]))))));

drop policy if exists "Recepcao le cardapios da escola" on public.cardapios;
create policy "Recepcao le cardapios da escola" on public.cardapios as PERMISSIVE for SELECT to public
  using (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text]))));

drop policy if exists "Admins enviam mensagens em horario comercial" on public.chat_messages;
create policy "Admins enviam mensagens em horario comercial" on public.chat_messages as PERMISSIVE for INSERT to public
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (sender_id = auth.uid()) AND ((((now() AT TIME ZONE 'America/Sao_Paulo'::text))::time without time zone >= '07:00:00'::time without time zone) AND (((now() AT TIME ZONE 'America/Sao_Paulo'::text))::time without time zone <= '19:00:00'::time without time zone)) AND (thread_id IN ( SELECT t.id
   FROM chat_threads t
  WHERE ((t.school_id = get_my_school_id()) AND (t.setor <> 'suporte_zela'::text) AND chat_pode(t.setor, 'responder'::text))))));

drop policy if exists "Admins enviam mensagens na propria thread de suporte" on public.chat_messages;
create policy "Admins enviam mensagens na propria thread de suporte" on public.chat_messages as PERMISSIVE for INSERT to public
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (sender_id = auth.uid()) AND (thread_id IN ( SELECT chat_threads.id
   FROM chat_threads
  WHERE ((chat_threads.family_id = auth.uid()) AND (chat_threads.setor = 'suporte_zela'::text))))));

drop policy if exists "Admins leem mensagens da propria thread de suporte" on public.chat_messages;
create policy "Admins leem mensagens da propria thread de suporte" on public.chat_messages as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (thread_id IN ( SELECT chat_threads.id
   FROM chat_threads
  WHERE ((chat_threads.family_id = auth.uid()) AND (chat_threads.setor = 'suporte_zela'::text))))));

drop policy if exists "Admins leem mensagens do proprio setor" on public.chat_messages;
create policy "Admins leem mensagens do proprio setor" on public.chat_messages as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (thread_id IN ( SELECT t.id
   FROM chat_threads t
  WHERE ((t.school_id = get_my_school_id()) AND (t.setor <> 'suporte_zela'::text) AND chat_pode(t.setor, 'ver'::text))))));

drop policy if exists "Admins acessam threads do proprio setor" on public.chat_threads;
create policy "Admins acessam threads do proprio setor" on public.chat_threads as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id()) AND (setor <> 'suporte_zela'::text) AND chat_pode(setor, 'ver'::text)))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id()) AND (setor <> 'suporte_zela'::text) AND chat_pode(setor, 'ver'::text)));

drop policy if exists "Admins gerenciam sua propria thread de suporte" on public.chat_threads;
create policy "Admins gerenciam sua propria thread de suporte" on public.chat_threads as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (setor = 'suporte_zela'::text) AND (family_id = auth.uid())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (setor = 'suporte_zela'::text) AND (family_id = auth.uid())));

drop policy if exists "Admins leem frequencia da escola" on public.class_attendance;
create policy "Admins leem frequencia da escola" on public.class_attendance as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admins gerenciam associacoes materia-turma da escola" on public.class_subjects;
create policy "Admins gerenciam associacoes materia-turma da escola" on public.class_subjects as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admins leem turmas normalizadas da escola" on public.classes;
create policy "Admins leem turmas normalizadas da escola" on public.classes as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Recepcao le comunicados da escola" on public.comunicados;
create policy "Recepcao le comunicados da escola" on public.comunicados as PERMISSIVE for SELECT to public
  using (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text]))));

drop policy if exists "Admins veem status diario da escola" on public.daily_attendance_status;
create policy "Admins veem status diario da escola" on public.daily_attendance_status as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admins gerenciam diario da propria escola" on public.diario_entries;
create policy "Admins gerenciam diario da propria escola" on public.diario_entries as PERMISSIVE for ALL to public
  using ((((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())) OR (get_my_role() = 'developer'::text)))
  with check ((((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())) OR (get_my_role() = 'developer'::text)));

drop policy if exists "Gestao e suporte leem o responsavel legal" on public.escola_responsavel_legal;
create policy "Gestao e suporte leem o responsavel legal" on public.escola_responsavel_legal as PERMISSIVE for SELECT to authenticated
  using (((get_my_role() = 'developer'::text) OR ((school_id = get_my_school_id()) AND (get_my_role() = 'gestao'::text)) OR ((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND has_permission('contratos.gerenciar'::text))));

drop policy if exists "Recepcao le eventos da escola" on public.eventos_calendario;
create policy "Recepcao le eventos da escola" on public.eventos_calendario as PERMISSIVE for SELECT to public
  using (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text]))));

drop policy if exists "Gestao e contratos leem a condicao da familia" on public.financial_guardian_conditions;
create policy "Gestao e contratos leem a condicao da familia" on public.financial_guardian_conditions as PERMISSIVE for SELECT to authenticated
  using (((school_id = get_my_school_id()) AND ((get_my_role() = 'gestao'::text) OR ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND has_permission('contratos.gerenciar'::text)))));

drop policy if exists "Admins leem funcionarios da escola" on public.funcionarios;
create policy "Admins leem funcionarios da escola" on public.funcionarios as PERMISSIVE for SELECT to authenticated
  using (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text]))));

drop policy if exists "Admin gerencia kiosks" on public.kiosk_devices;
create policy "Admin gerencia kiosks" on public.kiosk_devices as PERMISSIVE for ALL to public
  using (((get_my_role() = 'developer'::text) OR ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id()))))
  with check (((get_my_role() = 'developer'::text) OR ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id()))));

drop policy if exists "Admins leem relatorios de mitigacao da escola" on public.mitigacao_reports;
create policy "Admins leem relatorios de mitigacao da escola" on public.mitigacao_reports as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Coordenacao e Direcao editam relatorios de mitigacao" on public.mitigacao_reports;
create policy "Coordenacao e Direcao editam relatorios de mitigacao" on public.mitigacao_reports as PERMISSIVE for UPDATE to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (get_my_departamento() = ANY (ARRAY['coordenacao'::text, 'diretoria_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (get_my_departamento() = ANY (ARRAY['coordenacao'::text, 'diretoria_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Coordenacao e Direcao excluem relatorios de mitigacao" on public.mitigacao_reports;
create policy "Coordenacao e Direcao excluem relatorios de mitigacao" on public.mitigacao_reports as PERMISSIVE for DELETE to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (get_my_departamento() = ANY (ARRAY['coordenacao'::text, 'diretoria_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Recepcao le fotos do mural da escola" on public.mural_fotos;
create policy "Recepcao le fotos do mural da escola" on public.mural_fotos as PERMISSIVE for SELECT to public
  using (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text]))));

drop policy if exists "Admins veem notificacoes da escola" on public.notifications;
create policy "Admins veem notificacoes da escola" on public.notifications as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admins leem registros pedagogicos da escola" on public.pedagogical_records;
create policy "Admins leem registros pedagogicos da escola" on public.pedagogical_records as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admins leem status de leitura da escola" on public.report_reads;
create policy "Admins leem status de leitura da escola" on public.report_reads as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (report_id IN ( SELECT reports.id
   FROM reports
  WHERE (reports.school_id = get_my_school_id())))));

drop policy if exists "Admins gerenciam secoes de relatorio da escola" on public.report_sections;
create policy "Admins gerenciam secoes de relatorio da escola" on public.report_sections as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (report_id IN ( SELECT reports.id
   FROM reports
  WHERE (reports.school_id = get_my_school_id())))))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (report_id IN ( SELECT reports.id
   FROM reports
  WHERE (reports.school_id = get_my_school_id())))));

drop policy if exists "Admins gerenciam secoes de modelo da escola" on public.report_template_sections;
create policy "Admins gerenciam secoes de modelo da escola" on public.report_template_sections as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (template_id IN ( SELECT report_templates.id
   FROM report_templates
  WHERE (report_templates.school_id = get_my_school_id())))))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (template_id IN ( SELECT report_templates.id
   FROM report_templates
  WHERE (report_templates.school_id = get_my_school_id())))));

drop policy if exists "Admins gerenciam modelos de relatorio da escola" on public.report_templates;
create policy "Admins gerenciam modelos de relatorio da escola" on public.report_templates as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admins gerenciam relatorios da escola" on public.reports;
create policy "Admins gerenciam relatorios da escola" on public.reports as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admins editam a propria escola" on public.schools;
create policy "Admins editam a propria escola" on public.schools as PERMISSIVE for UPDATE to public
  using (((id = get_my_school_id()) AND (COALESCE(get_my_role(), ''::text) = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'developer'::text]))));

drop policy if exists "Admins gerenciam log de shadow mode da propria escola" on public.shadow_face_recognition_log;
create policy "Admins gerenciam log de shadow mode da propria escola" on public.shadow_face_recognition_log as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admin acessa vínculos da escola" on public.student_guardians;
create policy "Admin acessa vínculos da escola" on public.student_guardians as PERMISSIVE for ALL to authenticated
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admins leem historico de transferencias da escola" on public.student_transfers;
create policy "Admins leem historico de transferencias da escola" on public.student_transfers as PERMISSIVE for SELECT to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Atualizacao de estudantes" on public.students;
create policy "Atualizacao de estudantes" on public.students as PERMISSIVE for UPDATE to public
  using (((get_my_role() = 'developer'::text) OR ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text])) AND (school_id = get_my_school_id()))))
  with check (((get_my_role() = 'developer'::text) OR ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text])) AND (school_id = get_my_school_id()))));

drop policy if exists "Admins gerenciam materias da escola" on public.subjects;
create policy "Admins gerenciam materias da escola" on public.subjects as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admin e developer marcam propria leitura" on public.system_update_reads;
create policy "Admin e developer marcam propria leitura" on public.system_update_reads as PERMISSIVE for INSERT to authenticated
  with check (((user_id = auth.uid()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'developer'::text]))));

drop policy if exists "Admin e developer leem atualizacoes" on public.system_updates;
create policy "Admin e developer leem atualizacoes" on public.system_updates as PERMISSIVE for SELECT to authenticated
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'developer'::text])));

drop policy if exists "Equipe gerencia trad_atribuicoes da escola" on public.trad_atribuicoes;
create policy "Equipe gerencia trad_atribuicoes da escola" on public.trad_atribuicoes as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_aulas da escola" on public.trad_aulas;
create policy "Equipe gerencia trad_aulas da escola" on public.trad_aulas as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_avaliacoes da escola" on public.trad_avaliacoes;
create policy "Equipe gerencia trad_avaliacoes da escola" on public.trad_avaliacoes as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_config_avaliacao da escola" on public.trad_config_avaliacao;
create policy "Equipe gerencia trad_config_avaliacao da escola" on public.trad_config_avaliacao as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_disciplinas da escola" on public.trad_disciplinas;
create policy "Equipe gerencia trad_disciplinas da escola" on public.trad_disciplinas as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_frequencia da escola" on public.trad_frequencia;
create policy "Equipe gerencia trad_frequencia da escola" on public.trad_frequencia as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_grade da escola" on public.trad_grade;
create policy "Equipe gerencia trad_grade da escola" on public.trad_grade as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_horarios da escola" on public.trad_horarios;
create policy "Equipe gerencia trad_horarios da escola" on public.trad_horarios as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_notas da escola" on public.trad_notas;
create policy "Equipe gerencia trad_notas da escola" on public.trad_notas as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_segmentos da escola" on public.trad_segmentos;
create policy "Equipe gerencia trad_segmentos da escola" on public.trad_segmentos as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe gerencia trad_series da escola" on public.trad_series;
create policy "Equipe gerencia trad_series da escola" on public.trad_series as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Equipe e professor gerenciam habilidades das tarefas" on public.trad_tarefa_habilidades;
create policy "Equipe e professor gerenciam habilidades das tarefas" on public.trad_tarefa_habilidades as PERMISSIVE for ALL to public
  using (((school_id = get_my_school_id()) AND ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) OR ((get_my_role() = 'teacher'::text) AND (get_my_teacher_status() = 'ativo'::text))) AND (tarefa_id IN ( SELECT t.id
   FROM trad_tarefas t
  WHERE (t.school_id = get_my_school_id())))))
  with check (((school_id = get_my_school_id()) AND ((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) OR ((get_my_role() = 'teacher'::text) AND (get_my_teacher_status() = 'ativo'::text))) AND (tarefa_id IN ( SELECT t.id
   FROM trad_tarefas t
  WHERE (t.school_id = get_my_school_id())))));

drop policy if exists "Equipe gerencia trad_tarefas da escola" on public.trad_tarefas;
create policy "Equipe gerencia trad_tarefas da escola" on public.trad_tarefas as PERMISSIVE for ALL to public
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'gestao'::text, 'gestao_pedagogica'::text])) AND (school_id = get_my_school_id())));

drop policy if exists "Admins leem trad_turmas da escola" on public.trad_turmas;
create policy "Admins leem trad_turmas da escola" on public.trad_turmas as PERMISSIVE for SELECT to authenticated
  using (((school_id = get_my_school_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text]))));

drop policy if exists "Insercao de usuarios por admin ou developer" on public.users;
create policy "Insercao de usuarios por admin ou developer" on public.users as PERMISSIVE for INSERT to public
  with check (((get_my_role() = 'developer'::text) OR ((get_my_role() = 'gestao'::text) AND (school_id = get_my_school_id()) AND (role = ANY (ARRAY['admin'::text, 'recepcao'::text, 'teacher'::text, 'family'::text])))));

drop policy if exists "Admins gerenciam fotos de autorizados da escola" on storage.objects;
create policy "Admins gerenciam fotos de autorizados da escola" on storage.objects as PERMISSIVE for ALL to public
  using (((bucket_id = 'person-photos'::text) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)))
  with check (((bucket_id = 'person-photos'::text) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));

drop policy if exists "Admins leem documentos de matricula da escola" on storage.objects;
create policy "Admins leem documentos de matricula da escola" on storage.objects as PERMISSIVE for SELECT to public
  using (((bucket_id = 'matriculas-docs'::text) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));

drop policy if exists "Recepcao le anexos de comunicados da escola" on storage.objects;
create policy "Recepcao le anexos de comunicados da escola" on storage.objects as PERMISSIVE for SELECT to public
  using (((bucket_id = 'comunicados-anexos'::text) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));

drop policy if exists "Recepcao le objetos do mural da escola" on storage.objects;
create policy "Recepcao le objetos do mural da escola" on storage.objects as PERMISSIVE for SELECT to public
  using (((bucket_id = 'mural-fotos'::text) AND (get_my_role() = ANY (ARRAY['admin'::text, 'recepcao'::text, 'recepcao'::text])) AND ((storage.foldername(name))[1] = (get_my_school_id())::text)));


-- ============ Funções ============
-- has_permission: 'recepcao' usa, até a C2, as permissões gravadas para 'admin'
-- (school_role_permissions tem CHECK role in ('admin','teacher') e default_roles
-- só lista 'admin'). Mesmo conjunto de permissões, sem ampliar nada.
create or replace function public.has_permission(p_permission text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when coalesce(public.get_my_role(), '') in ('developer', 'gestao') then true
    when coalesce(public.get_my_role(), '') not in ('admin', 'recepcao', 'teacher') then false
    else coalesce(
      (select srp.granted from public.school_role_permissions srp
        where srp.school_id = public.get_my_school_id()
          and srp.role = case when public.get_my_role() = 'recepcao' then 'admin' else public.get_my_role() end
          and srp.permission = p_permission),
      (select (case when public.get_my_role() = 'recepcao' then 'admin' else public.get_my_role() end) = any(pc.default_roles)
        from public.permission_catalog pc
        where pc.permission = p_permission),
      false)
  end;
$function$;

create or replace function public.can_read_financeiro()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case coalesce(public.get_my_role(), '')
    when 'gestao' then true
    when 'admin' then public.has_permission('financeiro.baixa_manual')
                   or public.has_permission('relatorios.financeiro.ver')
                   or public.has_permission('contratos.gerenciar')
    when 'recepcao' then public.has_permission('financeiro.baixa_manual')
                   or public.has_permission('relatorios.financeiro.ver')
                   or public.has_permission('contratos.gerenciar')
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION public.can_read_gestao()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.get_my_role() in ('admin', 'recepcao', 'gestao');
$function$
;

CREATE OR REPLACE FUNCTION public.chat_destinatarios(p_school uuid, p_setor text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select u.id from public.users u
   where u.school_id = p_school
     and u.role in ('admin', 'recepcao', 'gestao_pedagogica', 'gestao')
     and public.chat_pode_user(u.id, p_school, p_setor, 'ver');
$function$
;

CREATE OR REPLACE FUNCTION public.chat_pode_user(p_user uuid, p_school uuid, p_setor text, p_acao text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_acao in ('ver', 'responder')
    and p_setor in ('administrativo', 'diretoria_pedagogica', 'coordenacao', 'recepcao')
    and p_school is not null
    and exists (
      select 1 from public.users u
       where u.id = p_user
         and u.school_id = p_school
         and (
           u.role = 'gestao'
           or (u.role in ('admin', 'recepcao', 'gestao_pedagogica') and (
                coalesce(u.chat_visibilidade_total, false)
                or coalesce(
                  (select a.pode_ver and (p_acao = 'ver' or a.pode_responder)
                     from public.chat_acesso_setor a
                    where a.school_id = p_school and a.perfil = u.departamento and a.setor = p_setor),
                  u.departamento = p_setor,
                  false)))
         )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.conta_vinculada_ativa(p_origem uuid, p_destino uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_origem <> p_destino
     and not exists (select 1 from public.users o where o.id = p_origem and o.role in ('admin', 'recepcao'))
     and public.conta_pode_ser_vinculada(p_origem)
     and public.conta_pode_ser_vinculada(p_destino)
     and exists (
       select 1 from public.contas_vinculadas a
       join public.contas_vinculadas b on b.grupo = a.grupo
       where a.user_id = p_origem and b.user_id = p_destino
     );
$function$
;

CREATE OR REPLACE FUNCTION public.delete_stale_attendance_marking(p_student_id uuid, p_event_type text, p_reason_code text, p_reason_detail text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_student record;
  v_original_time timestamptz;
  v_has_real_log boolean;
  v_correction_id uuid;
BEGIN
  IF coalesce(public.get_my_role(), '') NOT IN ('admin', 'recepcao', 'gestao_pedagogica') THEN
    RAISE EXCEPTION 'Só administradores podem remover marcações de presença';
  END IF;
  IF p_event_type NOT IN ('entry', 'exit') THEN
    RAISE EXCEPTION 'Tipo de evento inválido';
  END IF;
  IF COALESCE(p_reason_code, '') = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório';
  END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;
  IF v_student.school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'Aluno não pertence à sua escola';
  END IF;

  v_original_time := CASE WHEN p_event_type = 'entry' THEN v_student.today_entry_at ELSE v_student.today_exit_at END;
  IF v_original_time IS NULL THEN
    RAISE EXCEPTION 'Não há marcação de % hoje para remover', p_event_type;
  END IF;

  -- Trava de segurança: se já existe um log de verdade pra esse tipo hoje,
  -- isso não é uma marcação fantasma — é um registro real, que deve ser
  -- editado (horário/tipo) pelo fluxo normal de correção, nunca apagado.
  SELECT EXISTS (
    SELECT 1 FROM attendance_logs al
    WHERE al.deleted_at IS NULL AND al.student_id = p_student_id
      AND al.event_type = p_event_type
      AND (al.event_time AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ) INTO v_has_real_log;
  IF v_has_real_log THEN
    RAISE EXCEPTION 'Já existe um registro confirmado de % hoje — use a correção de horário/tipo, não a remoção', p_event_type;
  END IF;

  IF p_event_type = 'entry' THEN
    UPDATE students SET today_entry = NULL, today_entry_at = NULL WHERE id = p_student_id;
  ELSE
    UPDATE students SET today_exit = NULL, today_exit_at = NULL WHERE id = p_student_id;
  END IF;

  INSERT INTO attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, action_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) VALUES (
    v_student.school_id, NULL, p_student_id, p_event_type, 'delete',
    v_original_time, NULL, p_reason_code, p_reason_detail,
    0, false, auth.uid(), 'applied'
  )
  RETURNING id INTO v_correction_id;

  RETURN jsonb_build_object('correction_id', v_correction_id, 'status', 'applied');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_student_qr_token(p_student_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_school_id uuid;
  v_new_token uuid;
  v_payload text;
  v_signature text;
BEGIN
  IF public.get_my_role() not in ('admin', 'recepcao') THEN
    RAISE EXCEPTION 'Apenas administradores podem gerar QR de check-in.';
  END IF;

  SELECT school_id INTO v_school_id
  FROM public.students
  WHERE id = p_student_id;

  IF v_school_id IS NULL OR v_school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'Aluno não encontrado nesta escola.';
  END IF;

  v_new_token := gen_random_uuid();

  UPDATE public.students
  SET checkin_qr_token = v_new_token,
      checkin_qr_created_at = now(),
      checkin_qr_created_by = auth.uid()
  WHERE id = p_student_id;

  v_payload := v_school_id::text || '.' || v_new_token::text;
  v_signature := encode(hmac(v_payload::bytea, public._qr_hmac_key()::bytea, 'sha256'), 'hex');

  -- Formato "ZL1.<school_id>.<token>.<assinatura>" -- versão explícita no
  -- prefixo (ZL1) pra permitir trocar o formato/algoritmo no futuro sem
  -- quebrar QRs antigos já impressos (o validador decide pelo prefixo).
  RETURN 'ZL1.' || v_payload || '.' || v_signature;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_student_guardians(student_uuid uuid)
 RETURNS TABLE(guardian_id uuid, relationship text, is_financial boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sg.guardian_id, sg.relationship, sg.is_financial
  FROM student_guardians sg
  WHERE sg.student_id = student_uuid
    AND (
      public.is_guardian_of(student_uuid)
      OR (
        public.get_my_role() IN ('admin', 'recepcao', 'developer')
        AND EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.id = student_uuid AND s.school_id = public.get_my_school_id()
        )
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.historico_pode_emitir()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.historico_modulo_ligado()
     and case
           when coalesce(public.get_my_role(), '') in ('gestao', 'gestao_pedagogica') then true
           when coalesce(public.get_my_role(), '') in ('admin', 'recepcao') then public.has_permission('historico.emitir')
           else false
         end;
$function$
;

CREATE OR REPLACE FUNCTION public.lancar_saida_pendente(p_student_id uuid, p_exit_time timestamp with time zone, p_reason_code text, p_reason_detail text DEFAULT NULL::text, p_minutes_delta integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := coalesce(public.get_my_role(), '');
  v_school uuid := public.get_my_school_id();
  v_student record;
  v_day date;
  v_last record;
  v_increases boolean;
  v_status text;
  v_log_id uuid;
  v_correction_id uuid;
begin
  if v_role not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica') then
    raise exception 'Sem permissão para lançar saída';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo é obrigatório';
  end if;
  if p_exit_time is null then
    raise exception 'Informe o horário';
  end if;

  -- Trava o aluno: duas pessoas lançando ao mesmo tempo não duplicam a saída.
  select * into v_student from students where id = p_student_id for update;
  if not found then
    raise exception 'Aluno não encontrado';
  end if;
  if v_student.school_id is distinct from v_school then
    raise exception 'Aluno não pertence à sua escola';
  end if;

  v_day := (p_exit_time at time zone 'America/Sao_Paulo')::date;
  if v_day >= (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A saída precisa ser de um dia anterior a hoje';
  end if;

  select al.event_type, al.event_time into v_last
  from attendance_logs al
  where al.student_id = p_student_id
    and al.deleted_at is null
    and (al.event_time at time zone 'America/Sao_Paulo')::date = v_day
  order by al.event_time desc, al.id desc
  limit 1;
  if not found or v_last.event_type <> 'entry' then
    raise exception 'Este aluno não tem entrada sem saída neste dia';
  end if;
  if p_exit_time <= v_last.event_time then
    raise exception 'A saída precisa ser depois da entrada';
  end if;
  if exists (
    select 1 from attendance_corrections ac
    where ac.student_id = p_student_id
      and ac.event_type = 'exit'
      and ac.status = 'pending'
      and (ac.new_event_time at time zone 'America/Sao_Paulo')::date = v_day
  ) then
    raise exception 'Já existe uma solicitação de saída aguardando aprovação para este dia';
  end if;

  v_increases := public.attendance_charge_cents(p_student_id, 'exit', p_exit_time) > 0;
  v_status := case
    when v_increases and v_role <> 'gestao' then 'pending'
    when v_increases then 'approved'
    else 'applied'
  end;

  if v_status <> 'pending' then
    v_log_id := public._apply_attendance_manual_entry(
      v_student.school_id, p_student_id, 'exit', p_exit_time,
      p_reason_code, p_reason_detail
    );
  end if;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status,
    reviewed_by, reviewed_at
  ) values (
    v_student.school_id, v_log_id, p_student_id, 'exit',
    null, p_exit_time, p_reason_code, p_reason_detail,
    coalesce(p_minutes_delta, 0), v_increases, auth.uid(), v_status,
    case when v_status = 'approved' then auth.uid() end,
    case when v_status = 'approved' then now() end
  )
  returning id into v_correction_id;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leads_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return new;
  end if;

  if new.responsavel_id is not null and not exists (
    select 1 from public.users u
     where u.id = new.responsavel_id and u.school_id = new.school_id
       and u.role in ('gestao', 'gestao_pedagogica', 'admin', 'recepcao')
  ) then
    raise exception 'Responsável pelo lead deve ser da equipe da escola';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.anonimizado_em := null;
    if new.etapa = 'perdido' then
      if length(btrim(coalesce(new.motivo_perda, ''))) = 0 then
        raise exception 'Informe o motivo da perda';
      end if;
      new.perdido_em := now();
    end if;
    if new.etapa = 'matriculado' then new.convertido_em := now(); end if;
    return new;
  end if;

  if new.id <> old.id or new.school_id <> old.school_id then
    raise exception 'Identidade do lead não pode ser alterada';
  end if;
  if old.anonimizado_em is not null then
    raise exception 'Lead anonimizado não pode ser alterado';
  end if;
  new.anonimizado_em := null;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.consentimento_em := old.consentimento_em;
  new.updated_at := now();

  if new.etapa = 'perdido' then
    if length(btrim(coalesce(new.motivo_perda, ''))) = 0 then
      raise exception 'Informe o motivo da perda';
    end if;
    if old.etapa <> 'perdido' then new.perdido_em := now(); else new.perdido_em := old.perdido_em; end if;
  else
    new.perdido_em := null;
    new.motivo_perda := null;
  end if;
  if new.etapa = 'matriculado' then
    new.convertido_em := coalesce(old.convertido_em, now());
  else
    new.convertido_em := null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.library_emprestar(p_copy_id uuid, p_borrower_type text, p_student_id uuid, p_user_id uuid, p_devolver_ate date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_school uuid := public.get_my_school_id();
  v_copy record;
  v_id uuid;
begin
  if v_school is null or not public.library_pode_gerenciar() then
    raise exception 'Sem permissão para registrar empréstimos';
  end if;
  if p_devolver_ate is null or p_devolver_ate < current_date or p_devolver_ate > current_date + 180 then
    raise exception 'A data de devolução deve ser de hoje até 180 dias';
  end if;

  select c.id, c.ativo, c.estado into v_copy
    from public.library_copies c where c.id = p_copy_id and c.school_id = v_school;
  if not found then raise exception 'Exemplar não encontrado'; end if;
  if not v_copy.ativo or v_copy.estado = 'perdido' then
    raise exception 'Este exemplar não está disponível para empréstimo';
  end if;

  if p_borrower_type = 'aluno' then
    if p_user_id is not null or p_student_id is null
       or not exists (select 1 from public.students s where s.id = p_student_id and s.school_id = v_school) then
      raise exception 'Aluno não encontrado nesta escola';
    end if;
  elsif p_borrower_type = 'funcionario' then
    if p_student_id is not null or p_user_id is null
       or not exists (select 1 from public.users u
                       where u.id = p_user_id and u.school_id = v_school
                         and u.role in ('admin', 'recepcao', 'teacher', 'gestao', 'gestao_pedagogica', 'financeiro')) then
      raise exception 'Funcionário não encontrado nesta escola';
    end if;
  else
    raise exception 'Tipo de tomador inválido';
  end if;

  begin
    insert into public.library_loans (school_id, copy_id, borrower_type, student_id, user_id, devolver_ate, registrado_por)
    values (v_school, p_copy_id, p_borrower_type, p_student_id, p_user_id, p_devolver_ate, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Este exemplar já está emprestado';
  end;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.library_pode_gerenciar()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.library_modulo_ligado()
     and case
           when coalesce(public.get_my_role(), '') in ('gestao', 'gestao_pedagogica') then true
           when coalesce(public.get_my_role(), '') in ('admin', 'recepcao', 'teacher') then public.has_permission('biblioteca.gerenciar')
           else false
         end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_saidas_pendentes(p_date date DEFAULT NULL::date)
 RETURNS TABLE(student_id uuid, student_name text, turma text, entry_log_id uuid, entry_time timestamp with time zone, recorded_by_name text, awaiting_approval boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := coalesce(public.get_my_role(), '');
  v_school uuid := public.get_my_school_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_day date := coalesce(p_date, (now() at time zone 'America/Sao_Paulo')::date - 1);
begin
  if v_school is null then
    raise exception 'Sem escola associada';
  end if;
  if v_role not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica')
     and not (v_role = 'teacher' and public.get_my_teacher_status() = 'ativo') then
    raise exception 'Sem permissão para ver saídas pendentes';
  end if;
  -- Só dias já encerrados: hoje o aluno ainda pode estar na escola.
  if v_day >= v_today then
    raise exception 'Informe um dia anterior a hoje';
  end if;

  return query
  with ultimo as (
    select distinct on (al.student_id)
      al.student_id, al.id, al.event_type, al.event_time, al.performed_by_name
    from attendance_logs al
    where al.student_id in (select st.id from students st where st.school_id = v_school)
      and al.deleted_at is null
      and (al.event_time at time zone 'America/Sao_Paulo')::date = v_day
    order by al.student_id, al.event_time desc, al.id desc
  )
  select
    s.id,
    s.name,
    s.turma,
    u.id,
    u.event_time,
    u.performed_by_name,
    exists (
      select 1 from attendance_corrections ac
      where ac.student_id = s.id
        and ac.school_id = v_school
        and ac.event_type = 'exit'
        and ac.status = 'pending'
        and (ac.new_event_time at time zone 'America/Sao_Paulo')::date = v_day
    )
  from ultimo u
  join students s on s.id = u.student_id
  where u.event_type = 'entry'
    and s.school_id = v_school
    and (v_role <> 'teacher' or s.turma = any(coalesce(public.get_my_turmas(), '{}'::text[])))
  order by s.turma nulls last, s.name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_contas_vinculadas()
 RETURNS TABLE(user_id uuid, name text, role text, departamento text, escola text, alunos text[], nao_lidas integer, atual boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with meu as (
    select grupo from public.contas_vinculadas where user_id = auth.uid()
  )
  select u.id, u.name, u.role, u.departamento, s.name,
         coalesce((
           select array_agg(distinct split_part(st.name, ' ', 1) order by split_part(st.name, ' ', 1))
           from public.students st
           where coalesce(st.enrollment_status, 'ativo') = 'ativo'
             and (st.family_id = u.id or exists (
               select 1 from public.student_guardians sg where sg.student_id = st.id and sg.guardian_id = u.id))
         ), array[]::text[]),
         case when u.role = 'family' and u.id <> auth.uid() then (
           select count(*)::int from public.notifications n where n.family_id = u.id and n.read_at is null
         ) else 0 end,
         u.id = auth.uid()
  from meu
  join public.contas_vinculadas c on c.grupo = meu.grupo
  join public.users u on u.id = c.user_id
  left join public.schools s on s.id = u.school_id
  where public.meu_acesso_liberado()
    and not exists (select 1 from public.users o where o.id = auth.uid() and o.role in ('admin', 'recepcao'))
    and (u.id = auth.uid() or public.conta_pode_ser_vinculada(u.id))
  order by (u.id = auth.uid()) desc, u.role, s.name;
$function$
;

CREATE OR REPLACE FUNCTION public.log_error(p_source text, p_category text, p_message text, p_severity text DEFAULT 'error'::text, p_stack text DEFAULT NULL::text, p_context jsonb DEFAULT NULL::jsonb, p_school_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_role text DEFAULT NULL::text, p_url text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_screen text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source text := lower(coalesce(p_source, ''));
  v_severity text := lower(coalesce(p_severity, 'error'));
  v_message text := left(coalesce(p_message, '(sem mensagem)'), 2000);
  v_stack text := left(p_stack, 8000);
  v_category text := left(coalesce(p_category, 'unknown'), 200);
  v_school_id uuid := p_school_id;
  v_user_id uuid := p_user_id;
  v_role text := p_role;
  v_is_server boolean := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role';
  v_ip text;
  v_fingerprint text;
  v_id uuid;
begin
  if v_source not in ('client', 'edge_function', 'cron', 'business', 'face_recognition') then
    v_source := 'client';
  end if;
  if v_severity not in ('warn', 'error', 'critical') then
    v_severity := 'error';
  end if;

  if not v_is_server then
    v_user_id := auth.uid();
    v_role := public.get_my_role();
    v_school_id := public.get_my_school_id();

    if v_severity = 'critical' and coalesce(v_role, '') not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica', 'developer') then
      v_severity := 'error';
    end if;

    if auth.uid() is null then
      v_ip := split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', 'desconhecido'), ',', 1);
      if not public.check_rate_limit('log_error:anon:' || trim(v_ip), 60, 60) then
        return null;
      end if;
    end if;
  end if;

  v_fingerprint := md5(v_source || '|' || v_category || '|' || left(v_message, 300));

  insert into public.error_logs (
    source, category, severity, message, stack, context,
    school_id, user_id, role, url, user_agent, screen, fingerprint
  )
  values (
    v_source, v_category, v_severity, v_message, v_stack, p_context,
    v_school_id, v_user_id, v_role, p_url, p_user_agent, p_screen, v_fingerprint
  )
  on conflict (fingerprint) where not resolved
  do update set
    occurrences = public.error_logs.occurrences + 1,
    last_seen_at = now(),
    context = coalesce(excluded.context, public.error_logs.context),
    school_id = coalesce(excluded.school_id, public.error_logs.school_id),
    screen = coalesce(excluded.screen, public.error_logs.screen)
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mapa_edita_escola(p_school_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.get_my_role(), '') in ('admin', 'recepcao', 'gestao_pedagogica')
     and coalesce(public.get_my_departamento(), '') in ('coordenacao', 'diretoria_pedagogica')
     and coalesce(p_school_id = public.get_my_school_id(), false);
$function$
;

CREATE OR REPLACE FUNCTION public.mapa_le_escola(p_school_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.get_my_role(), '') in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica')
     and coalesce(p_school_id = public.get_my_school_id(), false);
$function$
;

CREATE OR REPLACE FUNCTION public.meu_aviso_atraso()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_school uuid;
  v_cob jsonb;
begin
  select u.role, u.school_id into v_role, v_school from public.users u where u.id = auth.uid();
  if v_role not in ('gestao', 'admin', 'recepcao') or v_school is null or not public.escola_liberada(v_school) then
    return null;
  end if;

  v_cob := public.zela_cobranca_vencida_da_escola(v_school);
  if v_cob is null then
    return null;
  end if;

  if v_role = 'gestao' then
    return jsonb_build_object('role', v_role, 'cobranca', v_cob);
  end if;
  return jsonb_build_object('role', v_role, 'bloqueio_em', v_cob -> 'bloqueio_em');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_admin_privilege_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       and old.role in ('admin', 'recepcao', 'gestao_pedagogica')
       and new.role in ('admin', 'recepcao', 'gestao_pedagogica') then
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
     and coalesce(public.get_my_role(), '') not in ('admin', 'recepcao', 'gestao', 'developer')
     and (new.turmas is distinct from old.turmas
          or new.teacher_status is distinct from old.teacher_status
          or new.status is distinct from old.status
          or new.departamento is distinct from old.departamento) then
    raise exception 'Esses dados do seu cadastro só podem ser alterados pela escola.';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_financial_contract_admin_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role (Edge Functions) -- não restringido
  END IF;

  IF public.get_my_role() in ('admin', 'recepcao') THEN
    IF NEW.status IS DISTINCT FROM 'cancelled'
       OR NEW.school_id IS DISTINCT FROM OLD.school_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.financial_guardian_id IS DISTINCT FROM OLD.financial_guardian_id
       OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
       OR NEW.base_monthly_amount_cents IS DISTINCT FROM OLD.base_monthly_amount_cents
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.first_due_date IS DISTINCT FROM OLD.first_due_date
       OR NEW.gateway IS DISTINCT FROM OLD.gateway
       OR NEW.gateway_subscription_id IS DISTINCT FROM OLD.gateway_subscription_id THEN
      RAISE EXCEPTION 'Admin só pode cancelar um contrato (status -> cancelled) -- nenhum outro campo pode ser alterado por aqui.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.request_account_deletion(p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user record;
  v_id uuid;
begin
  if not public.meu_acesso_liberado() then
    raise exception 'Acesso suspenso por pendência financeira.' using errcode = '42501';
  end if;
  select id, name, email, role, school_id into v_user from users where id = auth.uid();
  if v_user.id is null or v_user.school_id is null then
    raise exception 'Conta não encontrada.';
  end if;
  if v_user.role not in ('family', 'teacher', 'admin', 'recepcao') then
    raise exception 'A conta da Gestão só pode ser encerrada pelo suporte do Zela.';
  end if;
  if exists (select 1 from account_deletion_requests where user_id = v_user.id and status = 'pendente') then
    raise exception 'Você já tem um pedido de exclusão em andamento.';
  end if;

  insert into account_deletion_requests (school_id, user_id, user_name, user_email, user_role, reason)
  values (v_user.school_id, v_user.id, v_user.name, v_user.email, v_user.role, nullif(trim(coalesce(p_reason, '')), ''))
  returning id into v_id;

  insert into audit_logs (school_id, actor_id, action, entity_type, entity_id, details)
  values (v_user.school_id, v_user.id, 'request_account_deletion', 'user', v_user.id, jsonb_build_object('request_id', v_id));

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_attendance_correction(p_log_id uuid, p_new_event_time timestamp with time zone, p_reason_code text, p_reason_detail text, p_minutes_delta integer, p_increases_billing boolean, p_new_event_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_log record;
  v_correction_id uuid;
  v_status text;
  v_role text := coalesce(public.get_my_role(), '');
  v_final_type text;
  v_increases boolean;
begin
  if v_role not in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica') then
    raise exception 'Só administradores podem corrigir presença';
  end if;

  select * into v_log from attendance_logs where id = p_log_id and deleted_at is null;
  if not found then
    raise exception 'Registro de presença não encontrado';
  end if;
  if v_log.school_id is distinct from public.get_my_school_id() then
    raise exception 'Registro não pertence à sua escola';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo da correção é obrigatório';
  end if;
  if p_new_event_type is not null and p_new_event_type not in ('entry', 'exit') then
    raise exception 'Tipo de evento inválido';
  end if;
  if p_new_event_time is null then
    raise exception 'Informe o novo horário';
  end if;

  v_final_type := coalesce(p_new_event_type, v_log.event_type);
  v_increases := coalesce(p_increases_billing, true)
    or v_final_type <> v_log.event_type
    or public.attendance_charge_cents(v_log.student_id, v_final_type, p_new_event_time)
       > public.attendance_charge_cents(v_log.student_id, v_log.event_type, v_log.event_time);
  v_status := case when v_increases then 'pending' else 'applied' end;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type, new_event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) values (
    v_log.school_id, p_log_id, v_log.student_id, v_log.event_type, p_new_event_type,
    v_log.event_time, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, v_increases, auth.uid(), v_status
  )
  returning id into v_correction_id;

  if v_status = 'applied' then
    perform public._apply_attendance_correction(p_log_id, p_new_event_time, p_new_event_type);
  end if;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_attendance_manual_entry(p_student_id uuid, p_event_type text, p_new_event_time timestamp with time zone, p_reason_code text, p_reason_detail text, p_minutes_delta integer, p_increases_billing boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student record;
  v_correction_id uuid;
  v_log_id uuid;
  v_status text;
  v_increases boolean;
begin
  if coalesce(public.get_my_role(), '') not in ('admin', 'recepcao', 'gestao_pedagogica') then
    raise exception 'Só administradores podem lançar presença manualmente';
  end if;
  if p_event_type is null or p_event_type not in ('entry', 'exit') then
    raise exception 'Tipo de evento inválido';
  end if;
  if coalesce(p_reason_code, '') = '' then
    raise exception 'Motivo é obrigatório';
  end if;
  if p_new_event_time is null then
    raise exception 'Informe o horário';
  end if;

  select * into v_student from students where id = p_student_id;
  if not found then
    raise exception 'Aluno não encontrado';
  end if;
  if v_student.school_id is distinct from public.get_my_school_id() then
    raise exception 'Aluno não pertence à sua escola';
  end if;

  -- Lançamento novo: "antes" não havia cobrança por esse registro.
  v_increases := coalesce(p_increases_billing, true)
    or public.attendance_charge_cents(p_student_id, p_event_type, p_new_event_time) > 0;
  v_status := case when v_increases then 'pending' else 'applied' end;

  if v_status = 'applied' then
    v_log_id := public._apply_attendance_manual_entry(
      v_student.school_id, p_student_id, p_event_type, p_new_event_time,
      p_reason_code, p_reason_detail
    );
  end if;

  insert into attendance_corrections (
    school_id, attendance_log_id, student_id, event_type,
    original_event_time, new_event_time, reason_code, reason_detail,
    minutes_delta, increases_billing, requested_by, status
  ) values (
    v_student.school_id, v_log_id, p_student_id, p_event_type,
    null, p_new_event_time, p_reason_code, p_reason_detail,
    p_minutes_delta, v_increases, auth.uid(), v_status
  )
  returning id into v_correction_id;

  return jsonb_build_object('correction_id', v_correction_id, 'status', v_status);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.require_password_change_school(p_roles text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_school_id uuid := public.get_my_school_id();
  v_count integer;
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode exigir a troca de senha.';
  end if;
  update users set must_change_password = true
  where school_id = v_school_id
    and role = any(coalesce(p_roles, array[]::text[]))
    and role in ('admin', 'recepcao', 'teacher', 'family')
    and id <> auth.uid()
    and must_change_password = false;
  get diagnostics v_count = row_count;

  insert into audit_logs (school_id, actor_id, action, entity_type, details)
  values (v_school_id, auth.uid(), 'require_password_change', 'user', jsonb_build_object('roles', p_roles, 'contas', v_count));
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restrict_admin_student_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  if (v_role is distinct from 'admin' and v_role is distinct from 'recepcao') then
    return new;
  end if;
  if (to_jsonb(new) - v_permitidas) is distinct from (to_jsonb(old) - v_permitidas) then
    raise exception 'A Recepção só registra entrada e saída; os demais dados do aluno são alterados pela Gestão, Coordenação ou Direção.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restrict_family_student_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  if v_role in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica', 'developer') then
    return new;
  end if;
  if (to_jsonb(new) - v_checkin_columns) is distinct from (to_jsonb(old) - v_checkin_columns) then
    raise exception 'A família só pode registrar entrada e saída; os demais dados do aluno são alterados pela escola.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_staff_access_type(p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_school_id uuid := public.get_my_school_id();
  v_alvo record;
begin
  if coalesce(public.get_my_role(), '') <> 'gestao' or v_school_id is null then
    raise exception 'Só a Gestão pode mudar o tipo de acesso da equipe.';
  end if;
  if p_role not in ('admin', 'recepcao', 'gestao_pedagogica') then
    raise exception 'Tipo de acesso inválido.';
  end if;
  select id, role, school_id, departamento, name into v_alvo from users where id = p_user_id;
  if v_alvo.id is null or v_alvo.school_id is distinct from v_school_id then
    raise exception 'Conta não encontrada nesta escola.';
  end if;
  if v_alvo.role not in ('admin', 'recepcao', 'gestao_pedagogica') then
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_student_financial_guardian(p_student_id uuid, p_guardian_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := coalesce(public.get_my_role(), '');
  v_school_id uuid;
  v_nome text;
  v_doc text;
  v_anterior uuid;
begin
  if v_role not in ('admin', 'recepcao', 'gestao') then
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
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_student_class(p_student_id uuid, p_new_turma text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_school_id uuid;
  v_old_turma text;
begin
  select school_id, turma into v_school_id, v_old_turma from public.students where id = p_student_id;
  if v_school_id is null then raise exception 'Aluno não encontrado.'; end if;
  if not (public.get_my_role() = 'developer' or (public.get_my_role() in ('admin', 'recepcao', 'gestao', 'gestao_pedagogica') and public.get_my_school_id() = v_school_id)) then
    raise exception 'Permissão negada.';
  end if;
  if p_new_turma is null or trim(p_new_turma) = '' then raise exception 'Informe a turma de destino.'; end if;
  if p_new_turma = v_old_turma then raise exception 'O aluno já está nesta turma.'; end if;

  update public.students set turma = p_new_turma where id = p_student_id;

  insert into public.student_transfers (school_id, student_id, from_class_name, to_class_name, reason, transferred_by)
  values (v_school_id, p_student_id, v_old_turma, p_new_turma, nullif(trim(coalesce(p_reason, '')), ''), auth.uid());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_checkin_qr(p_payload text)
 RETURNS TABLE(student_id uuid, student_name text, student_school_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_parts text[];
  v_school_id uuid;
  v_token uuid;
  v_signature text;
  v_expected_signature text;
BEGIN
  IF public.get_my_role() not in ('admin', 'recepcao') THEN
    RAISE EXCEPTION 'Apenas o totem administrativo pode validar QR de check-in.';
  END IF;

  v_parts := string_to_array(p_payload, '.');

  IF array_length(v_parts, 1) <> 4 OR v_parts[1] <> 'ZL1' THEN
    RAISE EXCEPTION 'QR Code inválido.';
  END IF;

  v_school_id := v_parts[2]::uuid;
  v_token := v_parts[3]::uuid;
  v_signature := v_parts[4];

  v_expected_signature := encode(
    hmac((v_parts[2] || '.' || v_parts[3])::bytea, public._qr_hmac_key()::bytea, 'sha256'),
    'hex'
  );

  IF v_signature <> v_expected_signature THEN
    RAISE EXCEPTION 'QR Code inválido ou adulterado.';
  END IF;

  IF v_school_id <> public.get_my_school_id() THEN
    RAISE EXCEPTION 'QR Code não pertence a esta escola.';
  END IF;

  RETURN QUERY
  SELECT s.id, s.name, s.school_id
  FROM public.students s
  WHERE s.checkin_qr_token = v_token
    AND s.school_id = v_school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR Code não encontrado nesta escola.';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.vincular_contas(p_a uuid, p_b uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ga uuid;
  v_gb uuid;
  v_novo uuid;
  v_total int;
begin
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'Escolha uma conta diferente da que está aberta.';
  end if;
  if exists (select 1 from public.users where id = p_a and role in ('admin', 'recepcao')) then
    raise exception 'A conta da Recepção não vincula outras contas.';
  end if;
  if not public.conta_pode_ser_vinculada(p_a) or not public.conta_pode_ser_vinculada(p_b) then
    raise exception 'Esta conta não pode ser vinculada.';
  end if;

  select grupo into v_ga from public.contas_vinculadas where user_id = p_a;
  select grupo into v_gb from public.contas_vinculadas where user_id = p_b;
  if v_ga is not null and v_ga = v_gb then
    return v_ga;
  end if;

  select count(*) into v_total from (
    select user_id from public.contas_vinculadas where grupo in (v_ga, v_gb)
    union select p_a union select p_b
  ) t;
  if v_total > 5 then
    raise exception 'Limite de 5 contas vinculadas atingido.';
  end if;

  v_novo := coalesce(v_ga, v_gb, gen_random_uuid());
  update public.contas_vinculadas set grupo = v_novo where grupo in (v_ga, v_gb);
  insert into public.contas_vinculadas (user_id, grupo) values (p_a, v_novo), (p_b, v_novo)
  on conflict (user_id) do update set grupo = excluded.grupo;
  return v_novo;
end;
$function$
;

