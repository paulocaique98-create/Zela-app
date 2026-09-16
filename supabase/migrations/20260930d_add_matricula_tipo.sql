-- A tabela ja foi desenhada pensando em Matricula/Rematricula desde o
-- inicio (ver comentario da migration 20260831_add_matriculas.sql), mas a
-- tela da familia nunca distinguia os dois casos. Adiciona a coluna pra
-- marcar qual fluxo gerou a solicitacao -- default 'matricula' pra nao
-- alterar nada do que ja existe (toda solicitacao antiga fica como
-- matricula, comportamento identico ao de hoje).
ALTER TABLE matricula_solicitacoes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'matricula'
  CHECK (tipo IN ('matricula', 'rematricula'));
