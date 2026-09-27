-- Guarda qual responsável (authorized_persons) fez a solicitação de
-- entrada/saída pendente, pra exibir a foto dele no Monitor de Solicitações.
-- Só é preenchido pelo fluxo de reconhecimento facial (o único que identifica
-- uma pessoa específica com foto) — login por senha/PIN autentica a conta da
-- família como um todo, sem uma pessoa/foto específica associada, então
-- permanece nulo nesse fluxo (o card do Monitor mostra um ícone genérico).
ALTER TABLE students ADD COLUMN IF NOT EXISTS pending_requester_id uuid REFERENCES authorized_persons(id) ON DELETE SET NULL;
