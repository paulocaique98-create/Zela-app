-- Achado investigando um login quebrado (Paulo Caique de Paula Santana):
-- excluir um usuário (edge function delete-user) apaga o Auth PRIMEIRO e só
-- depois o public.users -- se essa segunda etapa falhar, o Auth já foi
-- embora mas o perfil público fica pra trás, deixando a conta "pela
-- metade": ninguém mais consegue logar, mas o cadastro (aluno, vínculos,
-- fichas etc.) continua intacto, sem erro nenhum visível pra quem excluiu.
--
-- A causa: dezenas de colunas "quem fez isso" (autor, revisor, criado por,
-- corrigido por...) apontam pra users(id) sem nenhuma regra de exclusão
-- (NO ACTION) -- se a pessoa excluída já tiver criado UM registro
-- qualquer nessas tabelas (o que é o normal pra qualquer admin/professor/
-- responsável que já usou o sistema), o DELETE trava no meio do caminho.
--
-- Essas colunas são só rastro de auditoria ("quem fez"), não uma relação
-- que precisa impedir a exclusão do usuário -- por isso viram NULL, sem
-- travar nada. (Não mexe em financial_contracts.financial_guardian_id nem
-- financial_charges.family_id -- essas são posse de verdade, não
-- auditoria: não faz sentido uma cobrança ou contrato ficar "sem dono".)
alter table public.attendance_corrections alter column requested_by drop not null;
alter table public.cardapios alter column created_by drop not null;
alter table public.chat_messages alter column sender_id drop not null;
alter table public.comunicados alter column created_by drop not null;
alter table public.diario_entries alter column created_by drop not null;
alter table public.eventos_calendario alter column created_by drop not null;
alter table public.funcionarios alter column created_by drop not null;
alter table public.mitigacao_reports alter column author_id drop not null;
alter table public.mural_fotos alter column uploaded_by drop not null;
alter table public.pedagogical_records alter column author_id drop not null;
alter table public.report_templates alter column created_by drop not null;
alter table public.reports alter column author_id drop not null;

alter table public.attendance_corrections drop constraint attendance_corrections_reviewed_by_fkey, add constraint attendance_corrections_reviewed_by_fkey foreign key (reviewed_by) references public.users(id) on delete set null;
alter table public.attendance_corrections drop constraint attendance_corrections_requested_by_fkey, add constraint attendance_corrections_requested_by_fkey foreign key (requested_by) references public.users(id) on delete set null;
alter table public.attendance_logs drop constraint attendance_logs_corrected_by_fkey, add constraint attendance_logs_corrected_by_fkey foreign key (corrected_by) references public.users(id) on delete set null;
alter table public.attendance_logs drop constraint attendance_logs_recorded_by_fkey, add constraint attendance_logs_recorded_by_fkey foreign key (recorded_by) references public.users(id) on delete set null;
alter table public.aulas_especiais drop constraint aulas_especiais_created_by_fkey, add constraint aulas_especiais_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.cardapios drop constraint cardapios_created_by_fkey, add constraint cardapios_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.chat_messages drop constraint chat_messages_sender_id_fkey, add constraint chat_messages_sender_id_fkey foreign key (sender_id) references public.users(id) on delete set null;
alter table public.class_attendance drop constraint class_attendance_recorded_by_fkey, add constraint class_attendance_recorded_by_fkey foreign key (recorded_by) references public.users(id) on delete set null;
alter table public.comunicados drop constraint comunicados_created_by_fkey, add constraint comunicados_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.diario_entries drop constraint diario_entries_updated_by_fkey, add constraint diario_entries_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null;
alter table public.diario_entries drop constraint diario_entries_created_by_fkey, add constraint diario_entries_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.eventos_calendario drop constraint eventos_calendario_created_by_fkey, add constraint eventos_calendario_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.fichas_medicas drop constraint fichas_medicas_updated_by_fkey, add constraint fichas_medicas_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null;
alter table public.financial_billing_discounts drop constraint financial_billing_discounts_updated_by_fkey, add constraint financial_billing_discounts_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null;
alter table public.financial_contracts drop constraint financial_contracts_created_by_fkey, add constraint financial_contracts_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.funcionarios drop constraint funcionarios_created_by_fkey, add constraint funcionarios_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.kiosk_devices drop constraint kiosk_devices_created_by_fkey, add constraint kiosk_devices_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.matricula_solicitacoes drop constraint matricula_solicitacoes_reviewed_by_fkey, add constraint matricula_solicitacoes_reviewed_by_fkey foreign key (reviewed_by) references public.users(id) on delete set null;
alter table public.mitigacao_reports drop constraint mitigacao_reports_author_id_fkey, add constraint mitigacao_reports_author_id_fkey foreign key (author_id) references public.users(id) on delete set null;
alter table public.mural_fotos drop constraint mural_fotos_uploaded_by_fkey, add constraint mural_fotos_uploaded_by_fkey foreign key (uploaded_by) references public.users(id) on delete set null;
alter table public.pedagogical_records drop constraint pedagogical_records_author_id_fkey, add constraint pedagogical_records_author_id_fkey foreign key (author_id) references public.users(id) on delete set null;
alter table public.report_templates drop constraint report_templates_created_by_fkey, add constraint report_templates_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.reports drop constraint reports_author_id_fkey, add constraint reports_author_id_fkey foreign key (author_id) references public.users(id) on delete set null;
alter table public.school_gateway_accounts drop constraint school_gateway_accounts_created_by_fkey, add constraint school_gateway_accounts_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table public.student_transfers drop constraint student_transfers_transferred_by_fkey, add constraint student_transfers_transferred_by_fkey foreign key (transferred_by) references public.users(id) on delete set null;
alter table public.students drop constraint students_checkin_qr_created_by_fkey, add constraint students_checkin_qr_created_by_fkey foreign key (checkin_qr_created_by) references public.users(id) on delete set null;
alter table public.system_updates drop constraint system_updates_created_by_fkey, add constraint system_updates_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
