import { supabase } from './supabase';

// Dispara notificação in-app + push para as famílias da escola (ou só das
// turmas informadas) depois que o admin publica algo novo. Best-effort: um
// erro aqui não deve travar o fluxo de quem está criando o conteúdo.
export async function notifyFamilies({ type, title, message, url, turmas, familyIds }) {
  try {
    const { error } = await supabase.functions.invoke('notify-families', {
      body: { type, title, message, url, turmas: turmas || null, family_ids: familyIds || null },
    });
    if (error) console.warn('[notifyFamilies] Falha ao notificar:', error.message);
  } catch (err) {
    console.warn('[notifyFamilies] Falha ao notificar:', err);
  }
}
