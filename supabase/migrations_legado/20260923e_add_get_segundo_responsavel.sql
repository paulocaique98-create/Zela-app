-- Achado da revisão de QA: fetchRematriculaData() em FamilyMatriculas.jsx
-- tentava ler o 2º responsável direto de `users` pelo client -- RLS bloqueia
-- silenciosamente (família só enxerga a própria linha em `users`), então o
-- pré-preenchimento nunca funcionava de verdade. Esta RPC valida que quem
-- chama é de fato responsável (financeiro ou não) de algum dos alunos
-- informados antes de devolver os dados do outro responsável -- sem isso,
-- SECURITY DEFINER abriria a possibilidade de qualquer family forjar
-- student_ids de outra família pra vazar dados de um responsável alheio.
CREATE OR REPLACE FUNCTION public.get_segundo_responsavel(p_student_ids uuid[])
RETURNS TABLE(name text, email text, phone text, doc_number text, profession text, civil_status text, documents jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM student_guardians sg WHERE sg.student_id = ANY(p_student_ids) AND sg.guardian_id = auth.uid()
    UNION
    SELECT 1 FROM students s WHERE s.id = ANY(p_student_ids) AND s.family_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.name, u.email, u.phone, u.doc_number, u.profession, u.civil_status, u.documents
  FROM student_guardians sg
  JOIN users u ON u.id = sg.guardian_id
  WHERE sg.student_id = ANY(p_student_ids)
  AND sg.is_financial = false
  AND sg.guardian_id <> auth.uid()
  LIMIT 1;
END;
$function$;
