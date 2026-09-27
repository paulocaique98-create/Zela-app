-- A confirmação de check-in/check-out passou a ser notificada pela mesma
-- Edge Function que já notifica a SOLICITAÇÃO (notify-checkin-request),
-- chamada direto de App.jsx > updateStudentStatus logo após o INSERT em
-- attendance_logs ter sucesso. Isso permite enviar push de verdade — o que
-- este trigger nunca conseguiu fazer (SQL puro não faz chamada HTTP pra um
-- serviço de push), então a família só via a notificação se o app estivesse
-- aberto e conectado ao Realtime no instante exato da confirmação.
--
-- A regra de "1º check-in fica silencioso" (students.first_checkin_at) foi
-- replicada dentro da Edge Function antes desta remoção — ver
-- supabase/functions/notify-checkin-request/index.ts.
DROP TRIGGER IF EXISTS trigger_notify_attendance ON attendance_logs;
DROP FUNCTION IF EXISTS notify_on_attendance();
