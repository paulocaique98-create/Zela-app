-- Fase 5 do plano de migração Admin -> Portal da Gestão: aperta a
-- ESCRITA (aprovar/criar/editar) dos Grupos 1 (Financeiro) e 2 (Correções
-- de Presença/Horas Extras) só pra role='gestao'. Leitura continua igual
-- (can_read_gestao() não muda -- admin/Recepção mantém visibilidade,
-- decisão confirmada na Fase 4).
--
-- Validado antes deste corte: conta gestao real provisionada na ZL001
-- (financeiro.sense@gmail.com), aprovação de correção de presença e
-- relatório de Horas Extras testados com sucesso por ela.
create or replace function public.can_write_gestao()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.get_my_role() = 'gestao';
$$;
