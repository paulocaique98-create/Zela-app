-- Isenção de hora extra para alunos bolsistas (ex.: filhos de professores/
-- donos da escola) -- pedido do usuário: um aluno marcado aqui nunca gera
-- cobrança de hora extra, em nenhum horário de entrada/saída, independente
-- da tolerância configurada. Só o Admin principal/developer marca (ver
-- AdminUserRegistration.jsx > canManageExtraHours); a família nunca vê essa
-- marcação.
--
-- Retroativo por natureza: nenhuma cobrança fica "gravada" em lugar nenhum
-- -- Histórico e Relatório de Horas Extras recalculam tudo em tempo de
-- leitura (ver attendanceUtils.js > calcularHorasExtras/
-- calcularEntradaAntecipada) a partir de attendance_logs + contracted_*_time.
-- Então marcar isento aqui já isenta também as marcações passadas desse
-- aluno, sem precisar alterar nenhum registro histórico.
alter table public.students
  add column if not exists isento_hora_extra boolean not null default false;
