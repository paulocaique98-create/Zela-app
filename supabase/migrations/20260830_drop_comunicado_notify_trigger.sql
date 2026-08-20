-- O trigger antigo notificava TODAS as famílias da escola, ignorando o
-- direcionamento por turma (adicionado depois em 20260824). A notificação
-- (in-app + push) passou a ser disparada pelo client, via edge function
-- notify-families, que já respeita as turmas selecionadas.
DROP TRIGGER IF EXISTS trigger_notify_comunicado ON comunicados;
DROP FUNCTION IF EXISTS notify_on_comunicado();
