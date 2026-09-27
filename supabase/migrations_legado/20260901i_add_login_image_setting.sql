-- Permite ao developer personalizar a imagem central da tela de login
-- (Login.jsx) — hoje um bloco de gradiente/ícone fixo, sem nenhuma
-- customização. Reaproveita exatamente o padrão já usado por
-- 'global_logo' (system_settings, chave-valor, texto/base64), editável
-- só por developer (mesma RLS já existente pra essa tabela).
--
-- Achado ao implementar: a tela de login é vista por usuários NÃO
-- autenticados (é o ponto de entrada, antes do login) — a policy de
-- leitura de system_settings hoje só libera pra 'authenticated'. Em vez
-- de abrir leitura de TODA a tabela pra anon (superfície maior que o
-- necessário, achado de exposição não-intencional é exatamente o padrão
-- de bug já caçado várias vezes nesta sessão), a policy nova é restrita
-- a essa UMA chave específica.
CREATE POLICY "Leitura publica da imagem de login (anon)"
  ON public.system_settings FOR SELECT
  TO anon
  USING (key = 'login_image_url');
