import webpush from 'npm:web-push@3.6.7';

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

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return;

  const { data: subscriptions } = await adminClient
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', familyId);
  if (!subscriptions?.length) return;

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({ title: pushTitle, body: pushBody, url: url || '/', tag: pushTag });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await adminClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }
}

export function centsToBRL(cents: number): string {
  return ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
