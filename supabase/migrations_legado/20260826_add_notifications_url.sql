-- Permite que uma notificação in-app carregue um destino de navegação
-- (ex: "/?tab=diario") — usado pelo sino do portal da família pra levar
-- direto até a tela relevante ao clicar, em vez de só mostrar o texto.
-- Já era passado como parâmetro pra Edge Function notify-families (usado só
-- no payload do push), mas nunca persistido na notificação in-app.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS url text;
