-- Qualidade da foto de biometria (01/10/2026)
--
-- Diagnóstico: a foto de cadastro era guardada com no máximo 480 px (JPEG
-- 82%) e o descritor do motor Human (face_descriptor_v2) foi gerado em lote
-- a partir dessas fotos pequenas; no modo observador o Human confundiu
-- pessoas de famílias diferentes 127 vezes. Agora o cadastro usa a resolução
-- máxima da câmera, confere a qualidade e gera o v2 ao vivo.
--
-- foto_qualidade guarda só NÚMEROS da foto (nunca a imagem):
--   largura_px, altura_px  · resolução da foto
--   rosto_px               · largura do rosto na foto
--   brilho                 · média de 0 a 255 na região do rosto
--   nitidez                · variância do Laplaciano na região do rosto
--   avaliado_em, origem    · quando e de onde ('cadastro' ou 'analise')
alter table public.authorized_persons
  add column if not exists foto_qualidade jsonb;

comment on column public.authorized_persons.foto_qualidade is
  'Números de qualidade da foto de biometria (resolução, tamanho do rosto, brilho, nitidez). Nunca a imagem.';

comment on column public.authorized_persons.face_descriptor_v2_status is
  'PENDING | GENERATED (lote, a partir da foto guardada) | GENERATED_LIVE (cadastro, vários quadros da câmera) | FAILED_NO_FACE | FAILED_LOW_QUALITY | FAILED_ERROR';
