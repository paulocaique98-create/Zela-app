import webpush from 'npm:web-push@3.6.7';

// Notifica TODOS os admins de uma escola (in-app + push) — mesmo padrão
// de sendFamilyNotification.ts, generalizado pra N destinatários em vez
// de 1. Reaproveita a coluna `notifications.family_id` como "id do
// destinatário" (a RLS de leitura de admin já é escopada por school_id,
// não por family_id — mas a de UPDATE/leitura-própria exige
// auth.uid() = family_id, então cada admin precisa da própria linha pra
// poder marcar como lida).
//
// deno-lint-ignore no-explicit-any
export async function notifyAdmins(adminClient: any, params: {
  schoolId: string;
  type: string;
  message: string;
  url?: string;
  pushTitle: string;
  pushBody: string;
  pushTag: string;
}) {
  const { schoolId, type, message, url, pushTitle, pushBody, pushTag } = params;

  const { data: admins, error: adminsError } = await adminClient
    .from('users')
    .select('id')
    .eq('school_id', schoolId)
    .eq('role', 'admin');
  if (adminsError) throw adminsError;
  if (!admins || admins.length === 0) return;

  const rows = admins.map((a: { id: string }) => ({
    school_id: schoolId,
    family_id: a.id, // destinatário real é o admin, reaproveitando a coluna
    type,
    message,
    url: url ?? null,
  }));
  await adminClient.from('notifications').insert(rows);

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return;

  const adminIds = admins.map((a: { id: string }) => a.id);
  const { data: subscriptions } = await adminClient
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', adminIds);
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
