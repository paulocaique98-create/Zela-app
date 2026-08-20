-- O commit "v1.4.1: correção RLS attendance_logs para 2º Responsável, histórico de
-- check-in/out visível para todos os guardiões" (67a1273) foi aplicado direto no
-- dashboard do Supabase e nunca chegou a este repositório — as policies existentes
-- em 20260714174500_rls_policies.sql e 20260720_fix_rls_recursion.sql só liberam
-- SELECT para quem é o family_id exato do log, deixando o 2º Responsável sem ver o
-- histórico dos próprios filhos. Esta migração reproduz a correção de forma versionada.

DROP POLICY IF EXISTS "Guardioes veem logs dos proprios filhos" ON attendance_logs;
CREATE POLICY "Guardioes veem logs dos proprios filhos"
ON attendance_logs FOR SELECT
USING (
  public.get_my_role() = 'family'
  AND (
    auth.uid() = family_id
    OR student_id IN (
      SELECT student_id FROM student_guardians WHERE guardian_id = auth.uid()
    )
  )
);
