import { supabase } from './supabase';

// Push do Plano de aula: enviado avisa a Coordenação, devolvido avisa a
// professora. Best-effort: falha aqui não deve travar o envio ou a revisão.
export async function notifyPlanoAula(planId) {
  try {
    const { error } = await supabase.functions.invoke('notify-plano-aula', { body: { plan_id: planId } });
    if (error) console.warn('[notifyPlanoAula] Falha ao notificar:', error.message);
  } catch (err) {
    console.warn('[notifyPlanoAula] Falha ao notificar:', err);
  }
}
