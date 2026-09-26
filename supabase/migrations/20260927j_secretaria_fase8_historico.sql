-- Fase 8 (Integrações/histórico) do módulo Secretaria — decidido na Fase 2:
-- reaproveitar audit_logs/logAction() em vez de criar um sistema de
-- histórico novo. A leitura de audit_logs hoje só aceita 'admin' (herdado
-- de antes da Gestão existir) -- estende pra can_read_gestao() (permanente,
-- mesmo padrão dos outros módulos: admin nunca perde leitura).
alter policy "Admins leem audit logs da escola" on public.audit_logs
  using (can_read_gestao() and school_id = get_my_school_id());
