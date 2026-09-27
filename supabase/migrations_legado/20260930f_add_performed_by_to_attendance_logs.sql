-- Guarda quem realizou o reconhecimento (facial ou PIN) que gerou aquele
-- check-in/check-out especifico -- ate agora essa informacao existia so
-- temporariamente em students.pending_requester_id, apagada assim que a
-- escola confirmava, entao nunca sobrava nenhum rastro de quem fez o quê.
-- Nome (nao so o id) para sobreviver a exclusao da conta do autorizado --
-- mesmo padrao ja usado em audit_logs.actor_name.
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS performed_by_name text;
