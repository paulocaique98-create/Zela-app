-- Rate limiting pro reconhecimento facial do Autoatendimento — mesma
-- infraestrutura genérica já usada pro PIN (check_pin_login_rate_limit,
-- 20260909_add_rate_limiting.sql). O reconhecimento facial não tinha
-- NENHUMA proteção além do retry manual de câmera: alguém podia tentar
-- rosto atrás de rosto (o próprio, fotos impressas, foto na tela do
-- celular) sem limite nenhum, tentando forçar um falso positivo contra a
-- base de biometrias da escola.
--
-- Duas chaves separadas, cada uma escopada pela PRÓPRIA escola do chamador
-- (get_my_school_id() — o cliente não escolhe a chave, só consulta o limite
-- da própria escola, mesma garantia de segurança do check_pin_login_rate_limit):
--   - "recognition": cada tentativa de comparação facial (botão "Capturar e
--     Comparar", ou uma correspondência "unknown"/ambígua no loop ao vivo).
--     Tolerância maior que o confirm, porque é natural errar o enquadramento
--     algumas vezes num dia de movimento.
--   - "confirm": cada confirmação de check-in/check-out de verdade (grava em
--     attendance_logs) — compartilhado entre reconhecimento facial e PIN,
--     protege contra automação/abuso disparando marcações em série.

CREATE OR REPLACE FUNCTION public.check_kiosk_recognition_rate_limit()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.check_rate_limit('kiosk_recognition:' || public.get_my_school_id()::text, 40, 60);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_kiosk_recognition_rate_limit() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_kiosk_confirm_rate_limit()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.check_rate_limit('kiosk_confirm:' || public.get_my_school_id()::text, 60, 60);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_kiosk_confirm_rate_limit() TO authenticated;
