import { supabase } from './supabase';

// Dispara notificação in-app + push pros responsáveis de UM aluno assim que
// o reconhecimento facial/PIN acontece no Autoatendimento (status vira
// pending_entry/pending_exit) — não espera a escola confirmar. Best-effort:
// um erro aqui não deve travar o fluxo de check-in/check-out no totem.
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
