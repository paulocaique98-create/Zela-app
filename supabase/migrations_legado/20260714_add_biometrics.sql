-- 1. Create Nonces table for Challenge-Response
CREATE TABLE IF NOT EXISTS auth_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Delete nonces older than 5 minutes automatically (optional pg_cron, but we can do it via app logic or just rely on expires_at check)

-- 2. Add face_descriptor column to authorized_persons
ALTER TABLE authorized_persons 
ADD COLUMN IF NOT EXISTS face_descriptor text; -- Armazenará o array numérico JSON [0.1, 0.5, ...]

-- 3. (Optional) We can use pgvector if available, but for now we'll just store the JSON text array since Euclidean calculation in JS/Edge Function is fast enough for small datasets.
