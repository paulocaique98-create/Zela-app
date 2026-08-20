-- Calendário escolar: eventos com data (e opcionalmente hora), visíveis pra escola inteira.
CREATE TABLE IF NOT EXISTS eventos_calendario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  event_type text NOT NULL DEFAULT 'geral', -- 'geral' | 'feriado' | 'reuniao' | 'evento' | 'passeio'
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eventos_calendario_school_date ON eventos_calendario(school_id, event_date);

ALTER TABLE eventos_calendario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam eventos da escola" ON eventos_calendario;
CREATE POLICY "Admins gerenciam eventos da escola"
ON eventos_calendario FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Familias veem eventos da escola" ON eventos_calendario;
CREATE POLICY "Familias veem eventos da escola"
ON eventos_calendario FOR SELECT
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'family');
