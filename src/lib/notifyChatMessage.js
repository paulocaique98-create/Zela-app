import { supabase } from './supabase';

// Dispara notificação (in-app quando o destinatário é família + push) sobre a
// mensagem mais recente de uma conversa do chat. Best-effort: um erro aqui não
// deve travar o envio da mensagem em si.
export async function notifyChatMessage(threadId) {
  try {
    const { error } = await supabase.functions.invoke('notify-chat-message', {
      body: { thread_id: threadId },
    });
    if (error) console.warn('[notifyChatMessage] Falha ao notificar:', error.message);
  } catch (err) {
    console.warn('[notifyChatMessage] Falha ao notificar:', err);
  }
}
