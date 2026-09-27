-- Fase 3 (Grupo 1: Financeiro) do plano de migração Admin -> Portal da
-- Gestão. Troca `get_my_role() = 'admin'` pelas funções reutilizáveis
-- criadas na Fase 1 (can_read_gestao()/can_write_gestao()), que hoje
-- aceitam admin OU gestao -- ZERO mudança de comportamento pra quem já é
-- admin, só abre a mesma porta pro role novo. O aperto de verdade (só
-- gestao escreve) fica pra Fase 5, depois que a UI já estiver estável nos
-- dois portais em paralelo.

alter policy "Admins leem cobrancas da propria escola" on public.financial_charges
  using (school_id = get_my_school_id() and can_read_gestao());

alter policy "Admins leem contratos da propria escola" on public.financial_contracts
  using (school_id = get_my_school_id() and can_read_gestao());

alter policy "Admins cancelam contratos da propria escola" on public.financial_contracts
  using (school_id = get_my_school_id() and can_write_gestao())
  with check (school_id = get_my_school_id() and can_write_gestao());

alter policy "Admins gerenciam descontos da propria escola" on public.financial_billing_discounts
  using (school_id = get_my_school_id() and can_write_gestao())
  with check (
    school_id = get_my_school_id() and can_write_gestao()
    and exists (
      select 1 from users u
      where u.id = financial_billing_discounts.guardian_id
        and u.school_id = financial_billing_discounts.school_id
        and u.role = 'family'
    )
  );

alter policy "Admin ve status do gateway da propria escola" on public.school_gateway_accounts
  using (school_id = get_my_school_id() and can_read_gestao());
