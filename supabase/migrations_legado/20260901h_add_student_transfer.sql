-- P3.2 (núcleo acadêmico) — Transferência de turma (recorte inicial de
-- "rematrícula/transferência"). Escopo deliberadamente reduzido, mesma
-- disciplina das decisões anteriores desta sessão:
--
-- "Rematrícula" completa (renovação de matrícula pra um NOVO ano letivo)
-- exigiria a entidade `academic_years`, que não existe e não foi
-- decidida — ficaria maior que o núcleo acadêmico já construído hoje
-- inteiro. O que É construído agora, e já entrega valor real: mover um
-- aluno de turma dentro da mesma escola (progressão de idade,
-- reorganização, correção de cadastro), com trilha de auditoria. Isso
-- NÃO exige a normalização completa de turmas (Fase 2 da trilha B,
-- ainda não decidida) -- continua usando students.turma (texto), só com
-- histórico de mudança registrado.

CREATE TABLE public.student_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_class_name text,
  to_class_name text NOT NULL,
  reason text,
  transferred_by uuid REFERENCES public.users(id),
  transferred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_transfers_school_id ON public.student_transfers (school_id);
CREATE INDEX idx_student_transfers_student_id ON public.student_transfers (student_id);

ALTER TABLE public.student_transfers ENABLE ROW LEVEL SECURITY;

-- Só leitura pra admin da própria escola -- nenhuma policy de escrita
-- (só a RPC abaixo grava, via SECURITY DEFINER).
CREATE POLICY "Admins leem historico de transferencias da escola"
  ON public.student_transfers FOR SELECT
  USING (get_my_role() = 'admin' AND school_id = get_my_school_id());

-- RPC atômica: atualiza students.turma E grava o log de auditoria numa
-- operação só, com motivo opcional. SECURITY DEFINER porque
-- student_transfers não tem policy de INSERT pra ninguém -- a função
-- replica manualmente a checagem que a RLS de students já faz (admin da
-- MESMA escola do aluno), mesmo padrão já usado em delete_school_and_users.
CREATE OR REPLACE FUNCTION public.transfer_student_class(p_student_id uuid, p_new_turma text, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_old_turma text;
BEGIN
  SELECT school_id, turma INTO v_school_id, v_old_turma FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado.';
  END IF;
  IF public.get_my_role() IS DISTINCT FROM 'admin' OR public.get_my_school_id() IS DISTINCT FROM v_school_id THEN
    RAISE EXCEPTION 'Permissão negada.';
  END IF;
  IF p_new_turma IS NULL OR trim(p_new_turma) = '' THEN
    RAISE EXCEPTION 'Informe a turma de destino.';
  END IF;
  IF p_new_turma = v_old_turma THEN
    RAISE EXCEPTION 'O aluno já está nesta turma.';
  END IF;

  UPDATE public.students SET turma = p_new_turma WHERE id = p_student_id;

  INSERT INTO public.student_transfers (school_id, student_id, from_class_name, to_class_name, reason, transferred_by)
  VALUES (v_school_id, p_student_id, v_old_turma, p_new_turma, NULLIF(trim(COALESCE(p_reason, '')), ''), auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_student_class(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_student_class(uuid, text, text) TO authenticated;
