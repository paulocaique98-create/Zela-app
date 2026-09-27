-- FASE F do plano de migração de reconhecimento facial — tabela aditiva
-- pura para o "modo observador": registra o que o motor candidato (Human)
-- diria sobre o MESMO frame que o motor atual (face-api.js) já confirmou de
-- verdade, sem influenciar em nada a decisão real de check-in.
--
-- Nenhuma coluna existente é alterada. Nenhuma policy existente é tocada.
-- Escopo idêntico ao já usado em authorized_persons: admin só enxerga/insere
-- dados da própria escola.

CREATE TABLE IF NOT EXISTS shadow_face_recognition_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  faceapi_matched_person_id uuid,       -- quem o motor ATUAL (face-api.js) confirmou de verdade
  human_matched_person_id uuid,          -- quem o motor candidato (Human) teria escolhido
  human_similarity numeric,              -- similaridade de cosseno do melhor match do Human (pode ser null se nenhum rosto detectado)
  agree boolean,                         -- true se os dois motores concordaram na mesma pessoa
  human_detection_ms integer             -- tempo de detecção do Human nesse frame, para medir performance real
);

COMMENT ON TABLE shadow_face_recognition_log IS
  'Fase F (modo observador) do plano de migração de face-api.js para @vladmandic/human. Só leitura/análise — nunca influencia o check-in real.';

ALTER TABLE shadow_face_recognition_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam log de shadow mode da propria escola" ON shadow_face_recognition_log;
CREATE POLICY "Admins gerenciam log de shadow mode da propria escola"
ON shadow_face_recognition_log FOR ALL
USING (
  public.get_my_role() = 'admin'
  AND school_id = public.get_my_school_id()
)
WITH CHECK (
  public.get_my_role() = 'admin'
  AND school_id = public.get_my_school_id()
);
