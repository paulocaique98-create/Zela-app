-- A assinatura da Diretora Pedagógica virou só texto (nome), sem upload de
-- imagem — remove a coluna que nunca chegou a ser usada de fato.
ALTER TABLE schools DROP COLUMN IF EXISTS director_signature_url;
