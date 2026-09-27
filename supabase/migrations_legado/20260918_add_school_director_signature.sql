-- Dados usados no rodapé dos relatórios impressos (Cidade/data + assinatura
-- eletrônica da Diretora Pedagógica): configurados uma vez em Configurações
-- da Escola e reaproveitados em todo relatório gerado.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS director_name text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS director_signature_url text;
