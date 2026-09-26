-- Fase 3 (Grupo 2: Correções de Presença / Horas Extras) do plano de
-- migração Admin -> Portal da Gestão. Mesma lógica do Grupo 1 (migration
-- 20260926b): troca `get_my_role() = 'admin'` pelas funções reutilizáveis
-- can_read_gestao()/can_write_gestao() (hoje = admin OU gestao) -- ZERO
-- mudança de comportamento pra quem já é admin ou developer, só abre a
-- mesma porta pro role novo. Horas Extras não tem policy própria (é um
-- relatório calculado em cima de attendance_logs), por isso não aparece
-- aqui.
--
-- Só a fatia de CORREÇÃO MANUAL de attendance_logs é tocada -- leitura e
-- inserção do dia a dia (check-in normal) continuam intocadas, são
-- operação de recepção, não entram nesta migração.

alter policy "Admins leem correcoes da escola" on public.attendance_corrections
  using ((get_my_role() = 'developer' or can_read_gestao()) and school_id = get_my_school_id());

alter policy "Admins atualizam correcoes da propria escola" on public.attendance_corrections
  using ((get_my_role() = 'developer' or can_write_gestao()) and school_id = get_my_school_id())
  with check ((get_my_role() = 'developer' or can_write_gestao()) and school_id = get_my_school_id());

alter policy "Admins inserem correcoes da propria escola" on public.attendance_corrections
  with check (can_write_gestao() and school_id = get_my_school_id() and requested_by = auth.uid());

alter policy "Admins corrigem historico da escola" on public.attendance_logs
  using (school_id = get_my_school_id() and can_write_gestao())
  with check (school_id = get_my_school_id() and can_write_gestao());
