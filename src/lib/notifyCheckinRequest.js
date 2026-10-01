import { supabase } from './supabase';
import { chamarFuncaoComSessao } from './sessao';

// Dispara notificação in-app + push pros responsáveis de UM aluno — tanto na
// SOLICITAÇÃO (status vira pending_entry/pending_exit, reconhecimento no
// Autoatendimento) quanto na CONFIRMAÇÃO de verdade (status vira
// in_school/left, ver App.jsx > updateStudentStatus). Best-effort: um erro
// aqui não deve travar o fluxo de check-in/check-out no totem.
// Sessão vencida ou encerrada em outro aparelho: renova e tenta de novo; se
// não der, o app pede login (src/lib/sessao.js), em vez de o aviso à família
// falhar em silêncio.
export async function notifyCheckinRequest({ studentId, eventType }) {
  try {
    const { error, mensagem } = await chamarFuncaoComSessao(supabase, 'notify-checkin-request', {
      body: { student_id: studentId, event_type: eventType },
    });
    if (error) console.warn('[notifyCheckinRequest] Falha ao notificar:', mensagem || error.message);
  } catch (err) {
    console.warn('[notifyCheckinRequest] Falha ao notificar:', err);
  }
}
