-- A migração base (20260714174500_rls_policies.sql) bloqueia todo INSERT direto em
-- attendance_logs ("WITH CHECK (false)"). A política que reabria isso para o fluxo de
-- totem ("Kiosks inserem historico") foi removida em 20260720_drop_kiosk_feature.sql,
-- quando o totem passou a usar a própria sessão autenticada do admin (ver comentário em
-- AdminKioskFullscreen.jsx) em vez de um dispositivo pareado via get_kiosk_school_id().
-- Sem uma policy nova, App.jsx (updateStudentStatus) e QRCodeScanner passam a falhar
-- silenciosamente ao inserir o log de check-in/check-out.

DROP POLICY IF EXISTS "Admins inserem historico da escola" ON attendance_logs;
CREATE POLICY "Admins inserem historico da escola"
ON attendance_logs FOR INSERT
WITH CHECK (
  school_id = public.get_my_school_id()
  AND public.get_my_role() = 'admin'
);

-- Responsáveis (1º ou 2º) só podem inserir log dos próprios filhos, e o family_id do
-- log deve ser o próprio usuário autenticado.
DROP POLICY IF EXISTS "Guardioes inserem historico dos proprios filhos" ON attendance_logs;
CREATE POLICY "Guardioes inserem historico dos proprios filhos"
ON attendance_logs FOR INSERT
WITH CHECK (
  public.get_my_role() = 'family'
  AND family_id = auth.uid()
  AND student_id IN (
    SELECT student_id FROM student_guardians WHERE guardian_id = auth.uid()
  )
);
