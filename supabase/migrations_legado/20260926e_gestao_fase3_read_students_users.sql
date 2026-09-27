-- Corrige outra lacuna achada testando a Fase 3: o relatório de Horas
-- Extras (e qualquer outro relatório que a Gestão venha a ter) precisa ler
-- nome/horário contratado do aluno (`students`) e nome do responsável
-- (`users`) pra calcular o excedente -- sem isso, a consulta embutida
-- (join) volta vazia e o cálculo não tem referência, dando sempre "sem
-- excedente".
--
-- Só LEITURA muda aqui. As policies de escrita de `students`/`users`
-- (cadastro, edição, exclusão) continuam admin/developer -- gerenciar
-- cadastro de aluno/usuário é e continua sendo trabalho da Recepção.
alter policy "Leitura de estudantes filtrada por tenant/familia" on public.students
  using (
    (get_my_role() = 'developer')
    or (can_read_gestao() and school_id = get_my_school_id())
    or (get_my_role() = 'family' and family_id = auth.uid())
    or (get_my_role() = 'family' and is_guardian_of(id))
  );

alter policy "Leitura de perfis de usuario" on public.users
  using (
    (get_my_role() = 'developer')
    or (can_read_gestao() and school_id = get_my_school_id())
    or (id = auth.uid())
    or (id in (select get_co_guardian_ids()))
  );
