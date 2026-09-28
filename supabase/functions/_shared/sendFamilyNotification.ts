import { sendPush } from './push.ts';

// Fase 13 — notificação in-app + push pra família, sempre no mesmo formato.
// Compartilhado entre processPaymentEvent (cobrança criada/paga) e
// send-financial-reminders (lembrete de vencimento) — mesmo padrão de envio
// já usado em notify-chat-message, só extraído pra não triplicar o código.
//
// deno-lint-ignore no-explicit-any
export async function sendFamilyNotification(adminClient: any, params: {
  schoolId: string;
  familyId: string;
  studentId?: string | null;
  type: string;
  message: string;
  url?: string;
  pushTitle: string;
  pushBody: string;
  pushTag: string;
}) {
  const { schoolId, familyId, studentId, type, message, url, pushTitle, pushBody, pushTag } = params;

  await adminClient.from('notifications').insert({
    school_id: schoolId,
    family_id: familyId,
    student_id: studentId ?? null,
    type,
    message,
    url: url ?? null,
  });

  await sendPush(adminClient, [familyId], { title: pushTitle, body: pushBody, url: url || '/', tag: pushTag });
}

export function centsToBRL(cents: number): string {
  return ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
