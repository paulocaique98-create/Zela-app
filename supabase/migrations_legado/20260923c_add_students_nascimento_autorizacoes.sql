-- Gap estrutural encontrado ao revisar a importação da SenseKids: o
-- formulário de Matrícula/Rematrícula sempre coletou cidade de nascimento e
-- autorização de imagem/emergência médica, mas NENHUMA aprovação (nem a
-- normal, via approve_matricula, nem a nova approve_atualizacao_cadastral)
-- persistia isso em lugar nenhum -- os dados eram descartados depois da
-- aprovação. Sem essas colunas, era impossível pré-preencher a Rematrícula
-- com o que a família já tinha respondido antes.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cidade_nascimento text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS autorizacao_imagem boolean;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS autorizacao_emergencia_medica boolean;
