-- Substitui o modelo de "semana recorrente" por "cardápios" (lotes mensais) com
-- período de ativação/desativação opcional escolhido pela escola. Cada cardápio tem
-- vários itens (um por data + refeição).
DROP TABLE IF EXISTS cardapio_semanal;

CREATE TABLE IF NOT EXISTS cardapios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  ativacao_date date,   -- NULL = sem data de início definida (já vale desde já)
  desativacao_date date, -- NULL = sem data de fim definida (vale indefinidamente)
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cardapio_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cardapio_id uuid NOT NULL REFERENCES cardapios(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  refeicao text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  UNIQUE (cardapio_id, event_date, refeicao)
);

CREATE INDEX IF NOT EXISTS idx_cardapio_itens_cardapio ON cardapio_itens(cardapio_id);

ALTER TABLE cardapios ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardapio_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam cardapios da escola" ON cardapios;
CREATE POLICY "Admins gerenciam cardapios da escola"
ON cardapios FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Familias veem cardapios da escola" ON cardapios;
CREATE POLICY "Familias veem cardapios da escola"
ON cardapios FOR SELECT
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'family');

-- Itens seguem a permissão do cardápio "pai" (join por cardapio_id).
DROP POLICY IF EXISTS "Admins gerenciam itens de cardapio da escola" ON cardapio_itens;
CREATE POLICY "Admins gerenciam itens de cardapio da escola"
ON cardapio_itens FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cardapios c
    WHERE c.id = cardapio_itens.cardapio_id
    AND c.school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cardapios c
    WHERE c.id = cardapio_itens.cardapio_id
    AND c.school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin'
  )
);

DROP POLICY IF EXISTS "Familias veem itens de cardapio da escola" ON cardapio_itens;
CREATE POLICY "Familias veem itens de cardapio da escola"
ON cardapio_itens FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM cardapios c
    WHERE c.id = cardapio_itens.cardapio_id
    AND c.school_id = public.get_my_school_id()
    AND public.get_my_role() = 'family'
  )
);
