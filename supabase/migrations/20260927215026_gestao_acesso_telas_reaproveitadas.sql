-- Portal da Gestão reaproveita telas do Admin (Funcionários, Calendário,
-- Comunicados, Mural, Presença do Dia). As tabelas dessas telas só tinham
-- policy pra 'admin' -- a Gestão via tudo vazio.
--
-- Bug real publicado em 27/09/2026 (commit 4b57785): Cadastros ·
-- Funcionários na Gestão abria vazio e não deixava cadastrar funcionário
-- -- sem o cadastro do funcionário, não dava pra criar o acesso dos admins,
-- que é justamente o papel da Gestão na nova hierarquia.
--
-- Policies novas e separadas (as do admin não mudam): somam com as atuais.

create policy "Gestao gerencia funcionarios da escola"
on public.funcionarios for all
using ((school_id = get_my_school_id()) and (get_my_role() = 'gestao'))
with check ((school_id = get_my_school_id()) and (get_my_role() = 'gestao'));

create policy "Gestao gerencia eventos da escola"
on public.eventos_calendario for all
using ((school_id = get_my_school_id()) and (get_my_role() = 'gestao'))
with check ((school_id = get_my_school_id()) and (get_my_role() = 'gestao'));

create policy "Gestao gerencia comunicados da escola"
on public.comunicados for all
using ((school_id = get_my_school_id()) and (get_my_role() = 'gestao'))
with check ((school_id = get_my_school_id()) and (get_my_role() = 'gestao'));

create policy "Gestao gerencia fotos do mural da escola"
on public.mural_fotos for all
using ((school_id = get_my_school_id()) and (get_my_role() = 'gestao'))
with check ((school_id = get_my_school_id()) and (get_my_role() = 'gestao'));

create policy "Gestao le status diario da escola"
on public.daily_attendance_status for select
using ((school_id = get_my_school_id()) and (get_my_role() = 'gestao'));

drop policy if exists "Gestao gerencia objetos do mural da escola" on storage.objects;
create policy "Gestao gerencia objetos do mural da escola"
on storage.objects for all
using ((bucket_id = 'mural-fotos') and (get_my_role() = 'gestao') and ((storage.foldername(name))[1] = get_my_school_id()::text))
with check ((bucket_id = 'mural-fotos') and (get_my_role() = 'gestao') and ((storage.foldername(name))[1] = get_my_school_id()::text));

drop policy if exists "Gestao gerencia anexos de comunicados da escola" on storage.objects;
create policy "Gestao gerencia anexos de comunicados da escola"
on storage.objects for all
using ((bucket_id = 'comunicados-anexos') and (get_my_role() = 'gestao') and ((storage.foldername(name))[1] = get_my_school_id()::text))
with check ((bucket_id = 'comunicados-anexos') and (get_my_role() = 'gestao') and ((storage.foldername(name))[1] = get_my_school_id()::text));
