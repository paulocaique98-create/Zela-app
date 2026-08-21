-- Feature: Chat interno por setor (Administrativo, Diretoria Pedagógica,
-- Coordenação, Recepção) + Suporte Zela (vai para o time developer da
-- plataforma, cruzando escolas). Cada família tem no máximo 1 thread por
-- setor. Resposta da escola só é permitida em horário comercial (07h-19h,
-- horário de Brasília) — Suporte Zela não tem essa restrição, pois quem
-- responde é o time da Zela, não a escola.

-- 1. Campos de roteamento no admin: departamento fixo + flag de "vê tudo",
-- concedida pelo admin fundador (is_primary_admin) da escola.
ALTER TABLE users ADD COLUMN IF NOT EXISTS departamento text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_visibilidade_total boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_primary_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_my_departamento()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT departamento FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_chat_visibilidade_total()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(chat_visibilidade_total, false) FROM users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_departamento() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_chat_visibilidade_total() TO authenticated;

-- 2. Threads: 1 por família+setor.
CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  setor text NOT NULL CHECK (setor IN ('administrativo', 'diretoria_pedagogica', 'coordenacao', 'recepcao', 'suporte_zela')),
  family_last_read_at timestamptz,
  staff_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, setor)
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_school_setor ON chat_threads(school_id, setor);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Familias gerenciam suas proprias threads" ON chat_threads;
CREATE POLICY "Familias gerenciam suas proprias threads"
ON chat_threads FOR ALL
USING (family_id = auth.uid() AND public.get_my_role() = 'family')
WITH CHECK (family_id = auth.uid() AND public.get_my_role() = 'family');

-- Admin só vê/atualiza (last_read) threads do próprio setor (ou todos, se tiver
-- visibilidade total) — nunca as de suporte_zela, que são exclusivas do developer.
DROP POLICY IF EXISTS "Admins acessam threads do proprio setor" ON chat_threads;
CREATE POLICY "Admins acessam threads do proprio setor"
ON chat_threads FOR ALL
USING (
  public.get_my_role() = 'admin'
  AND school_id = public.get_my_school_id()
  AND setor <> 'suporte_zela'
  AND (public.get_my_chat_visibilidade_total() OR setor = public.get_my_departamento())
)
WITH CHECK (
  public.get_my_role() = 'admin'
  AND school_id = public.get_my_school_id()
  AND setor <> 'suporte_zela'
  AND (public.get_my_chat_visibilidade_total() OR setor = public.get_my_departamento())
);

DROP POLICY IF EXISTS "Developer acessa threads de suporte" ON chat_threads;
CREATE POLICY "Developer acessa threads de suporte"
ON chat_threads FOR ALL
USING (public.get_my_role() = 'developer' AND setor = 'suporte_zela')
WITH CHECK (public.get_my_role() = 'developer' AND setor = 'suporte_zela');

-- 3. Mensagens
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  sender_role text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Familias leem e enviam mensagens das suas threads" ON chat_messages;
CREATE POLICY "Familias leem e enviam mensagens das suas threads"
ON chat_messages FOR SELECT
USING (
  public.get_my_role() = 'family'
  AND thread_id IN (SELECT id FROM chat_threads WHERE family_id = auth.uid())
);

CREATE POLICY "Familias inserem mensagens nas suas threads"
ON chat_messages FOR INSERT
WITH CHECK (
  public.get_my_role() = 'family'
  AND sender_id = auth.uid()
  AND thread_id IN (SELECT id FROM chat_threads WHERE family_id = auth.uid())
);

-- Admin só lê/envia nas threads do próprio setor (ou todas, com visibilidade
-- total) — e só pode ENVIAR dentro do horário comercial de Brasília (07h-19h).
DROP POLICY IF EXISTS "Admins leem mensagens do proprio setor" ON chat_messages;
CREATE POLICY "Admins leem mensagens do proprio setor"
ON chat_messages FOR SELECT
USING (
  public.get_my_role() = 'admin'
  AND thread_id IN (
    SELECT id FROM chat_threads
    WHERE school_id = public.get_my_school_id()
      AND setor <> 'suporte_zela'
      AND (public.get_my_chat_visibilidade_total() OR setor = public.get_my_departamento())
  )
);

DROP POLICY IF EXISTS "Admins enviam mensagens em horario comercial" ON chat_messages;
CREATE POLICY "Admins enviam mensagens em horario comercial"
ON chat_messages FOR INSERT
WITH CHECK (
  public.get_my_role() = 'admin'
  AND sender_id = auth.uid()
  AND (now() AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN TIME '07:00' AND TIME '19:00'
  AND thread_id IN (
    SELECT id FROM chat_threads
    WHERE school_id = public.get_my_school_id()
      AND setor <> 'suporte_zela'
      AND (public.get_my_chat_visibilidade_total() OR setor = public.get_my_departamento())
  )
);

DROP POLICY IF EXISTS "Developer acessa mensagens de suporte" ON chat_messages;
CREATE POLICY "Developer acessa mensagens de suporte"
ON chat_messages FOR ALL
USING (
  public.get_my_role() = 'developer'
  AND thread_id IN (SELECT id FROM chat_threads WHERE setor = 'suporte_zela')
)
WITH CHECK (
  public.get_my_role() = 'developer'
  AND sender_id = auth.uid()
  AND thread_id IN (SELECT id FROM chat_threads WHERE setor = 'suporte_zela')
);

-- 4. updated_at automático na thread a cada mensagem nova (facilita ordenar por
-- "mais recente" sem precisar de join/agregação no client).
CREATE OR REPLACE FUNCTION public.touch_chat_thread()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_touch_chat_thread ON chat_messages;
CREATE TRIGGER trigger_touch_chat_thread
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_chat_thread();
