import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { criarClienteAsaas } from '../_shared/financialContract.ts';

// Ajuste do valor de UMA cobrança em aberto (04/10/2026): desconto pontual
// em um mês específico, ou correção de valor. Só a Gestão. O Asaas é
// atualizado primeiro; o Zela só muda depois que o Asaas aceitou. O valor
// original fica guardado e o motivo vai para a auditoria e para o histórico
// da cobrança (não fica visível para a família).
const ABERTAS = ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  let adminClient: ReturnType<typeof createClient> | null = null;
  try {
    adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users').select('role, school_id').eq('id', caller.id).single();
    if (dbCallerError || !callerData || callerData.role !== 'gestao') {
      throw new Error('Acesso negado: apenas a Gestão pode ajustar cobranças.');
    }
    const schoolId = callerData.school_id;

    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:adjust-charge:${caller.id}`,
      p_limit: 60,
      p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) return json({ error: 'Muitos ajustes em pouco tempo. Aguarde alguns minutos.' }, 429);

    const { charge_id, new_amount_cents, reason } = await req.json();
    if (!charge_id || !UUID.test(String(charge_id))) throw new Error('Informe a cobrança a ajustar.');
    if (!Number.isInteger(new_amount_cents) || new_amount_cents <= 0) throw new Error('O novo valor precisa ser maior que zero.');
    const motivo = String(reason || '').trim();
    if (motivo.length < 3) throw new Error('Informe o motivo do ajuste.');

    // Nunca confia em school_id vindo do client: a cobrança tem que ser da escola de quem chama.
    const { data: charge, error: chargeError } = await adminClient
      .from('financial_charges')
      .select('id, school_id, status, amount_cents, original_amount_cents, gateway_payment_id, student_id')
      .eq('id', charge_id)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (chargeError) throw chargeError;
    if (!charge) throw new Error('Cobrança não encontrada nesta escola.');
    if (!ABERTAS.includes(charge.status)) throw new Error('Só dá para ajustar cobranças em aberto (pendente, aguardando ou atrasada).');
    if (charge.amount_cents === new_amount_cents) throw new Error('O novo valor é igual ao atual.');

    if (charge.gateway_payment_id) {
      const asaas = await criarClienteAsaas(adminClient, schoolId, createAsaasClient);
      // deno-lint-ignore no-explicit-any
      await (asaas as any).updatePayment(charge.gateway_payment_id, { value: new_amount_cents / 100 });
    }

    const agora = new Date().toISOString();
    const { error: updateError } = await adminClient
      .from('financial_charges')
      .update({
        amount_cents: new_amount_cents,
        original_amount_cents: charge.original_amount_cents ?? charge.amount_cents,
        adjusted_at: agora,
        updated_at: agora,
      })
      .eq('id', charge.id);
    if (updateError) throw updateError;

    await adminClient.from('financial_charge_events').insert({
      charge_id: charge.id,
      event_type: 'AMOUNT_ADJUSTED',
      source: 'admin_manual',
      metadata: { from_cents: charge.amount_cents, to_cents: new_amount_cents, reason: motivo, by: caller.id },
    });
    await adminClient.from('audit_logs').insert({
      school_id: schoolId,
      actor_id: caller.id,
      action: 'adjust_charge_amount',
      entity_type: 'financial_charge',
      entity_id: charge.id,
      details: { from_cents: charge.amount_cents, to_cents: new_amount_cents, reason: motivo, student_id: charge.student_id },
    });

    return json({ charge_id: charge.id, amount_cents: new_amount_cents, original_amount_cents: charge.original_amount_cents ?? charge.amount_cents });
  } catch (err) {
    if (adminClient) await logEdgeError(adminClient, 'adjust-charge', (err as Error).message || String(err), {}, null, 'warn');
    return json({ error: (err as Error).message }, 400);
  }
});
