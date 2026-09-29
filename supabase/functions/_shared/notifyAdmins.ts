import { sendPush } from './push.ts';

// Hierarquia de 27/09/2026: a Gestão também recebe (é ela quem aprova
// cadastros e matrículas); antes só contas 'admin' eram avisadas.
//
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
    .in('role', ['admin', 'gestao', 'gestao_pedagogica'])
    .eq('status', 'active');
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

  await sendPush(adminClient, admins.map((a: { id: string }) => a.id), { title: pushTitle, body: pushBody, url: url || '/', tag: pushTag });
}
