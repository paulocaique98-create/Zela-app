-- Auditoria de segurança (27/09/2026) · achado durante o item 11. Provado
-- em teste antes da correção (src/test/securityHardening.test.js).
--
-- "Família acessa próprios vínculos" era FOR ALL sem WITH CHECK -- o
-- USING valia também pra gravar: guardian_id = auth.uid() bastava pra
-- INSERIR. Qualquer família se vinculava como responsável de QUALQUER
-- aluno (sabendo o id) e passava a ver os dados da criança via
-- is_guardian_of; o 2º responsável também se promovia a financeiro.
--
-- No app, a família só LÊ e REMOVE vínculos (titular tira o 2º responsável
-- em FamilyGerenciarResponsaveis.jsx). Criar/alterar vínculo é sempre feito
-- pela escola (admin/gestão) ou por Edge Function com service_role.

drop policy if exists "Família acessa próprios vínculos" on public.student_guardians;

create policy "Família lê próprios vínculos"
on public.student_guardians for select
using ((guardian_id = auth.uid()) or (student_id in (select students.id from students where students.family_id = auth.uid())));

create policy "Família remove vínculos dos próprios filhos"
on public.student_guardians for delete
using ((guardian_id = auth.uid()) or (student_id in (select students.id from students where students.family_id = auth.uid())));
