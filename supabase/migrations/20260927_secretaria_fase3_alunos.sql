-- Fase 3 (Alunos) do módulo Secretaria, dentro do Portal da Gestão.
--
-- 1. Situação de matrícula -- campo NOVO, separado de `students.status`
-- (que é presença operacional do dia: idle/in_school/left/absent/
-- pending_entry/pending_exit e é lido pelo totem/Autoatendimento o tempo
-- todo). `enrollment_status` nasce com DEFAULT 'ativo' pra toda linha
-- existente -- ninguém que já usa o sistema muda de comportamento, e o
-- totem/App.jsx não lê essa coluna em lugar nenhum, então o check-in/
-- check-out continua funcionando exatamente igual.
alter table public.students
  add column enrollment_status text not null default 'ativo'
  check (enrollment_status in ('ativo', 'inativo', 'transferido', 'cancelado'));

-- 2. Leitura pra Gestão nas tabelas que o perfil do aluno precisa mostrar
-- (ficha médica, autorizados, vínculos de responsável, solicitação de
-- matrícula de origem) -- policies NOVAS e aditivas, só leitura; não
-- tocam em nenhuma policy existente de admin/família/professor/kiosk.
create policy "Gestao le ficha medica da escola"
  on public.fichas_medicas
  for select
  using (school_id = get_my_school_id() and can_read_gestao());

create policy "Gestao le autorizados da escola"
  on public.authorized_persons
  for select
  using (school_id = get_my_school_id() and can_read_gestao());

create policy "Gestao le vinculos da escola"
  on public.student_guardians
  for select
  using (school_id = get_my_school_id() and can_read_gestao());

create policy "Gestao le solicitacoes da escola"
  on public.matricula_solicitacoes
  for select
  using (school_id = get_my_school_id() and can_read_gestao());
