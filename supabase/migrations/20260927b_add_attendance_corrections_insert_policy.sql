-- Faltou a política de INSERT em attendance_corrections na migração
-- original (20260925) — só a de SELECT foi criada. As RPCs são SECURITY
-- INVOKER de propósito (a RLS de quem chama continua valendo), então sem
-- essa policy todo INSERT feito por dentro delas era rejeitado: "new row
-- violates row-level security policy for table attendance_corrections".
DROP POLICY IF EXISTS "Admins inserem correcoes da propria escola" ON attendance_corrections;
CREATE POLICY "Admins inserem correcoes da propria escola"
ON attendance_corrections FOR INSERT
WITH CHECK (
  public.get_my_role() = 'admin'
  AND school_id = public.get_my_school_id()
  AND requested_by = auth.uid()
);

-- E a de UPDATE, usada pelas duas RPCs pra marcar status
-- applied/pending/approved/rejected e reviewed_by/reviewed_at.
DROP POLICY IF EXISTS "Admins atualizam correcoes da propria escola" ON attendance_corrections;
CREATE POLICY "Admins atualizam correcoes da propria escola"
ON attendance_corrections FOR UPDATE
USING (public.get_my_role() IN ('admin', 'developer') AND school_id = public.get_my_school_id())
WITH CHECK (public.get_my_role() IN ('admin', 'developer') AND school_id = public.get_my_school_id());
