-- Horas adicionais por aluno, por dia da semana -- pedido do usuário:
-- alguns alunos ficam mais tempo em dias específicos (ex.: segunda até
-- 17h em vez do ciclo normal de 15h). Hoje a tolerância de check-out e a
-- cobrança automática de hora extra (ver check-attendance-delays,
-- AdminRelatorioHorasExtras.jsx/attendanceUtils.js) usam um único
-- horário fixo (students.contracted_exit_time), igual todo dia -- sem
-- nenhuma noção de dia da semana. Esta migration só cria a base de
-- dados; a lógica de tolerância/cobrança que PASSA A LER esse campo é
-- alterada em código (Edge Function + attendanceUtils.js), não aqui.
--
-- Chaves em português sem acento (evita qualquer problema de
-- encoding/URL), fixas: segunda, terca, quarta, quinta, sexta, sabado,
-- domingo. Valor em horas, decimal (múltiplos de 0.5), 0 a 4.

CREATE OR REPLACE FUNCTION public.is_valid_extra_hours(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  v jsonb;
  n numeric;
BEGIN
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;

  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo') THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v) <> 'number' THEN
      RETURN false;
    END IF;
    n := v::text::numeric;
    IF n < 0 OR n > 4 THEN
      RETURN false;
    END IF;
    -- só múltiplos de 0.5 (30min) -- evita granularidade sem sentido prático
    IF n * 2 <> floor(n * 2) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

ALTER TABLE public.students ADD COLUMN extra_hours jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.students ADD CONSTRAINT students_extra_hours_valid CHECK (public.is_valid_extra_hours(extra_hours));

-- Proteção de escrita: só admin PRINCIPAL da escola (ou developer) pode
-- configurar horas adicionais -- mesmo padrão já usado pra
-- schools.turmas/login_image_url (protect_school_pedagogical_columns).
-- Cobre INSERT (aluno novo já criado com extra_hours preenchido burlando
-- a UI) e UPDATE. Sem isso, a policy "Admins acessam alunos da escola"
-- (FOR ALL, sem restrição de coluna) deixaria qualquer admin comum
-- configurar cobrança de hora extra pra qualquer aluno.
CREATE OR REPLACE FUNCTION public.protect_student_extra_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_primary_admin boolean;
  v_changed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role -- não restringido
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.extra_hours IS DISTINCT FROM '{}'::jsonb;
  ELSE
    v_changed := NEW.extra_hours IS DISTINCT FROM OLD.extra_hours;
  END IF;

  IF v_changed THEN
    IF public.get_my_role() = 'developer' THEN
      NULL; -- ok, developer sempre pode
    ELSIF public.get_my_role() = 'admin' THEN
      SELECT is_primary_admin INTO v_is_primary_admin FROM public.users WHERE id = auth.uid();
      IF v_is_primary_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Só o admin principal da escola pode configurar horas adicionais.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Só o admin principal da escola (ou o suporte) pode configurar horas adicionais.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_student_extra_hours_trigger ON public.students;
CREATE TRIGGER protect_student_extra_hours_trigger
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_student_extra_hours();
