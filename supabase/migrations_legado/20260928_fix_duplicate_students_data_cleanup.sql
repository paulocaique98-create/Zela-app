-- Correção de dados (não muda schema): 8 alunos estavam duplicados porque
-- cada responsável (pai e mãe, em contas separadas) se cadastrou de forma
-- independente e cada um criou sua própria cópia dos mesmos filhos, em vez
-- de serem vinculados como 1º/2º responsável do mesmo registro. Investigado
-- e confirmado com o usuário caso a caso (ver conversa sobre Emerson/Rosana
-- Galvão Graciliano, Barbara Barral Azoline, etc). Mantém sempre o registro
-- com histórico de check-in real (ou mais dados cadastrados, no empate), e
-- vincula o titular da cópia removida como 2º responsável (não financeiro,
-- para não alterar cobrança já configurada) do registro mantido.
BEGIN;

-- Preserva o único log de presença real do Vitor (duplicata da Lia) antes de apagar a duplicata
UPDATE attendance_logs SET student_id = 'b4f23ab5-65da-4681-86b5-cc7cd7b16471'
WHERE student_id = '7d9a6eab-d372-4d64-8ae8-a53aa5a9e589';

-- Remove as 9 cópias duplicadas vazias (sem check-in real / já migrado acima)
DELETE FROM students WHERE id IN (
  '1bb9097c-4fa1-4333-b78b-b1dcc47889c9', -- Davi sob Rosana
  'dfe96d57-4f2f-4e47-941c-f37e6eb8e3f8', -- Joana sob Emerson
  '12b87c3e-dfe9-4606-8d52-a58318b4743f', -- Barbara sob Patricia
  '7d9a6eab-d372-4d64-8ae8-a53aa5a9e589', -- Lia sob Vitor
  'd6b42b19-19aa-40af-95fb-4c1af7ea2f95', -- Lia sob Maria Elisa (login duplicado)
  'e51b2765-b65f-41b4-8584-c0c495178264', -- Luís Antônio sob Andressa
  'aa576f43-8bfa-4a03-8c66-79cb91a7fe57', -- Olivia sob Renan
  '71d4f7ff-1608-4898-8ac2-74441e570077', -- Pedro sob Marina
  '822e0bda-ade4-4132-99d0-6515cadacccc'  -- Mariana sob Juliana
);

-- Vincula o titular removido como 2º responsável (não financeiro) no registro mantido.
-- Mariana Fischer Rosa ficou de fora: o registro do Marcel já tinha a Juliana
-- vinculada (alguém já tinha corrigido esse caso manualmente antes) — só a
-- cópia duplicada dela é que sobrava, e já foi removida acima.
INSERT INTO student_guardians (student_id, guardian_id, school_id, is_primary, is_financial, relationship) VALUES
  ('603385e6-0664-4796-ab7c-9a258d85c4e2', '46dc98fd-aaed-43ac-94a9-bc9202ab7b85', '5135570d-d165-409e-beb1-fd3a620d89af', false, false, 'Mãe'),  -- Davi <- Rosana
  ('eb4f3672-940f-41ed-805a-7e659c473c07', '2604a975-af4c-454a-af35-708c3ef7099e', '5135570d-d165-409e-beb1-fd3a620d89af', false, false, 'Pai'),  -- Joana <- Emerson
  ('2e7acff7-a8fd-4ced-b267-31f771dfc090', '98177543-4904-4cd6-97dc-7a6965f9bf53', '5135570d-d165-409e-beb1-fd3a620d89af', false, false, 'Mãe'),  -- Barbara <- Patricia
  ('b4f23ab5-65da-4681-86b5-cc7cd7b16471', '2e70f9e9-a503-44cb-87be-7939c8256cc1', '5135570d-d165-409e-beb1-fd3a620d89af', false, false, 'Pai'),  -- Lia <- Vitor
  ('11bd8cd4-dc0c-4fd1-86f4-a76b9d74f0aa', '80732314-2e4d-49ff-9094-957ae99dc85d', '5135570d-d165-409e-beb1-fd3a620d89af', false, false, 'Mãe'),  -- Luís Antônio <- Andressa
  ('df88f4e9-06c9-4c75-be51-f88a94d31ef6', 'dc5973f0-08e5-489b-b85c-81b5025bd58c', '5135570d-d165-409e-beb1-fd3a620d89af', false, false, 'Pai'),  -- Olivia <- Renan
  ('1b185dad-b96f-4b74-9570-1d709f87ee90', '60d2d04e-8e9d-4fdf-bc11-ad4a612459c4', '5135570d-d165-409e-beb1-fd3a620d89af', false, false, 'Mãe')   -- Pedro <- Marina
ON CONFLICT (student_id, guardian_id) DO NOTHING;

COMMIT;
