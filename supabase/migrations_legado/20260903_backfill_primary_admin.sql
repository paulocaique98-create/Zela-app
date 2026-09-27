-- Backfill: escolas já existentes não tinham o conceito de "admin principal".
-- Elege o admin mais antigo (por data de criação no Auth) de cada escola como
-- is_primary_admin, com visibilidade total do chat — assim toda escola já
-- nasce com alguém habilitado a configurar departamentos dos demais admins.
WITH ranked_admins AS (
  SELECT u.id, u.school_id,
    ROW_NUMBER() OVER (PARTITION BY u.school_id ORDER BY au.created_at ASC) AS rn
  FROM users u
  JOIN auth.users au ON au.id = u.id
  WHERE u.role = 'admin'
)
UPDATE users
SET is_primary_admin = true, chat_visibilidade_total = true
WHERE id IN (SELECT id FROM ranked_admins WHERE rn = 1);
