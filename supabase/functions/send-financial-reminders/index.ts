import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { sendFamilyNotification, centsToBRL } from '../_shared/sendFamilyNotification.ts';

// Fase 13 — lembrete "2 dias antes do vencimento". Pensada pra rodar 1x/dia
// via pg_cron (mesmo mecanismo já usado por daily-reset/check-attendance-delays).
//
// Autenticação: NÃO compara contra nenhum segredo customizado guardado em
// Vault/env — a Fase 13 descobriu que ler segredos via SQL solto (a mesma
// sessão que um cron roda) decifra errado nesse projeto depois de um tempo,
// então nenhum padrão "Vault lookup dentro do cron" é confiável aqui. Em vez
// disso, confia na verificação de assinatura do JWT que o próprio gateway do
// Supabase já faz (verify_jwt = true, padrão) e só confere que o `role`
// dentro do token é `service_role` — não dá pra forjar isso sem a chave real
// (só decodifica o payload, nunca reverifica a assinatura de novo aqui, já
// que o gateway barra qualquer JWT mal assinado antes mesmo do código rodar).
function isServiceRoleToken(authHeader: string | null): boolean {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (!isServiceRoleToken(req.headers.get('Authorization'))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Vencimento daqui a exatamente 2 dias, ainda não lembrado, e ainda em
    // aberto (não faz sentido lembrar de algo já pago/cancelado).
    const target = new Date();
    target.setDate(target.getDate() + 2);
    const targetDate = target.toISOString().split('T')[0];

    const { data: charges, error } = await adminClient
      .from('financial_charges')
      .select('id, school_id, family_id, student_id, due_date, amount_cents, payment_link, boleto_url, pix_copy_paste, students:student_id(name)')
      .eq('due_date', targetDate)
      .in('status', ['PENDING', 'AWAITING_PAYMENT'])
      .is('reminder_sent_at', null);
    if (error) throw error;

    let reminded = 0;
    for (const charge of charges || []) {
      try {
        const amountLabel = centsToBRL(charge.amount_cents);
        const studentName = (charge as { students?: { name?: string } }).students?.name || 'seu filho(a)';
        await sendFamilyNotification(adminClient, {
          schoolId: charge.school_id,
          familyId: charge.family_id,
          studentId: charge.student_id,
          type: 'financeiro',
          message: `Lembrete: cobrança de ${studentName} no valor de ${amountLabel} vence em 2 dias (${charge.due_date}).`,
          pushTitle: 'Cobrança vence em 2 dias',
          pushBody: `${amountLabel} — vencimento ${charge.due_date}`,
          pushTag: 'financeiro-lembrete-vencimento',
        });
        await adminClient
          .from('financial_charges')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', charge.id);
        reminded++;
      } catch (chargeErr) {
        console.error(`[send-financial-reminders] Erro ao lembrar cobrança ${charge.id}:`, chargeErr);
      }
    }

    return new Response(JSON.stringify({ success: true, total: charges?.length || 0, reminded }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
