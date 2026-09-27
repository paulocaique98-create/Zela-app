-- Move o "Suporte Zela" do chat: deixa de ser iniciável pela família e passa a
-- ser iniciável por qualquer Admin da escola (Administrativo, Diretoria
-- Pedagógica, Coordenação ou Recepção — os 4 departamentos existentes, ou
-- seja, qualquer admin cadastrado). Sem restrição de horário comercial (quem
-- responde é o time Zela, não a escola).

-- 1. Família perde acesso a threads/mensagens de suporte_zela (não pode mais
-- criar nem ler) — os outros setores continuam iguais.
DROP POLICY IF EXISTS "Familias gerenciam suas proprias threads" ON chat_threads;
CREATE POLICY "Familias gerenciam suas proprias threads"
ON chat_threads FOR ALL
USING (family_id = auth.uid() AND public.get_my_role() = 'family' AND setor <> 'suporte_zela')
WITH CHECK (family_id = auth.uid() AND public.get_my_role() = 'family' AND setor <> 'suporte_zela');

DROP POLICY IF EXISTS "Familias leem e enviam mensagens das suas threads" ON chat_messages;
CREATE POLICY "Familias leem e enviam mensagens das suas threads"
ON chat_messages FOR SELECT
USING (
  public.get_my_role() = 'family'
  AND thread_id IN (SELECT id FROM chat_threads WHERE family_id = auth.uid() AND setor <> 'suporte_zela')
);

DROP POLICY IF EXISTS "Familias inserem mensagens nas suas threads" ON chat_messages;
CREATE POLICY "Familias inserem mensagens nas suas threads"
ON chat_messages FOR INSERT
WITH CHECK (
  public.get_my_role() = 'family'
  AND sender_id = auth.uid()
  AND thread_id IN (SELECT id FROM chat_threads WHERE family_id = auth.uid() AND setor <> 'suporte_zela')
);

-- 2. Admin passa a poder gerenciar sua PRÓPRIA thread de suporte_zela (uma por
-- admin, reaproveitando a coluna family_id como "quem iniciou a conversa" —
-- já existe UNIQUE(family_id, setor), então cada admin tem no máximo 1
-- conversa de suporte, igual ao padrão já usado pela família nos outros
-- setores).
DROP POLICY IF EXISTS "Admins gerenciam sua propria thread de suporte" ON chat_threads;
CREATE POLICY "Admins gerenciam sua propria thread de suporte"
ON chat_threads FOR ALL
USING (public.get_my_role() = 'admin' AND setor = 'suporte_zela' AND family_id = auth.uid())
WITH CHECK (public.get_my_role() = 'admin' AND setor = 'suporte_zela' AND family_id = auth.uid());

DROP POLICY IF EXISTS "Admins leem mensagens da propria thread de suporte" ON chat_messages;
CREATE POLICY "Admins leem mensagens da propria thread de suporte"
ON chat_messages FOR SELECT
USING (
  public.get_my_role() = 'admin'
  AND thread_id IN (SELECT id FROM chat_threads WHERE family_id = auth.uid() AND setor = 'suporte_zela')
);

-- Sem restrição de horário comercial aqui (diferente da policy de envio nos
-- setores normais) — o admin pode escrever pro Suporte Zela a qualquer hora.
DROP POLICY IF EXISTS "Admins enviam mensagens na propria thread de suporte" ON chat_messages;
CREATE POLICY "Admins enviam mensagens na propria thread de suporte"
ON chat_messages FOR INSERT
WITH CHECK (
  public.get_my_role() = 'admin'
  AND sender_id = auth.uid()
  AND thread_id IN (SELECT id FROM chat_threads WHERE family_id = auth.uid() AND setor = 'suporte_zela')
);
