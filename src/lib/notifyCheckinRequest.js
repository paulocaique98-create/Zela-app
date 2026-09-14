import { supabase } from './supabase';

// Dispara notificação in-app + push pros responsáveis de UM aluno — tanto na
// SOLICITAÇÃO (status vira pending_entry/pending_exit, reconhecimento no
// Autoatendimento) quanto na CONFIRMAÇÃO de verdade (status vira
// in_school/left, ver App.jsx > updateStudentStatus). Best-effort: um erro
// aqui não deve travar o fluxo de check-in/check-out no totem.
export async function notifyCheckinRequest({ studentId, eventType }) {
  try {
    const { error } = await supabase.functions.invoke('notify-checkin-request', {
      body: { student_id: studentId, event_type: eventType },
    });
    if (error) console.warn('[notifyCheckinRequest] Falha ao notificar:', error.message);
  } catch (err) {
    console.warn('[notifyCheckinRequest] Falha ao notificar:', err);
  }
}
