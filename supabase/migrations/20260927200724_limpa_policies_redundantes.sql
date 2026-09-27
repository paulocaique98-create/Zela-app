-- Auditoria de segurança (27/09/2026) · item 13: limpeza de policies antigas.
--
-- Policies permissivas se SOMAM (OR). Uma policy antiga esquecida continua
-- liberando acesso mesmo depois que a regra nova corta -- foi a origem de
-- bugs na migração Admin -> Gestão. Aqui só sai o que é COMPROVADAMENTE
-- coberto por outra policy que concede exatamente o mesmo acesso: ninguém
-- ganha nem perde nada.

-- students: admin já tem SELECT ("Leitura de estudantes..." via
-- can_read_gestao), INSERT ("Criacao de estudantes..."), UPDATE
-- ("Atualizacao de estudantes") e DELETE ("Exclusao de estudantes"), todos
-- com o mesmo filtro de escola.
drop policy if exists "Admins acessam alunos da escola" on public.students;

-- fichas_medicas: "Gestao le ficha medica da escola" usa can_read_gestao(),
-- que já inclui admin, com o mesmo filtro de escola.
drop policy if exists "Admins leem ficha medica da escola" on public.fichas_medicas;

-- attendance_logs (INSERT): "Insercao de historico por admin ou developer"
-- já cobre admin da própria escola. "Impedir insert direto..." era uma
-- policy PERMISSIVA com WITH CHECK false -- não impedia nada (permissivas
-- somam), só confundia quem lia.
drop policy if exists "Admins inserem historico da escola" on public.attendance_logs;
drop policy if exists "Impedir insert direto no histórico (Apenas Edge Function)" on public.attendance_logs;

-- authorized_persons: "Acesso completo a pessoas autorizadas" (FOR ALL)
-- misturava 3 perfis. Admin já coberto por "Admins acessam autorizados da
-- escola"; família já coberta por "Famílias acessam próprios autorizados"
-- (conferido: nenhum autorizado tem escola diferente da família). Só o
-- suporte (developer) dependia dela -- vira uma policy própria.
drop policy if exists "Acesso completo a pessoas autorizadas" on public.authorized_persons;
create policy "Suporte acessa autorizados"
on public.authorized_persons for all
using (get_my_role() = 'developer')
with check (get_my_role() = 'developer');

-- schools: "Escolas so podem ser modificadas por developers" (FOR ALL,
-- developer) já cobre criar, ver e editar pelo suporte.
drop policy if exists "Developer pode criar escolas" on public.schools;
drop policy if exists "Developer pode ver todas as escolas" on public.schools;
drop policy if exists "Developer pode editar escolas" on public.schools;
