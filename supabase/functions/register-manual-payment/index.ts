import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { sendFamilyNotification, centsToBRL } from '../_shared/sendFamilyNotification.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';

// Baixa manual (Portal da Gestão · Financeiro · Recebimentos e Conciliação):
// pagamento recebido por fora do Asaas (dinheiro, PIX direto na conta da
// escola, transferência). Primeiro avisa o Asaas ("recebido em dinheiro") --
// senão ele continuaria cobrando a família -- e só depois dá baixa no Zela,
// com trilha em financial_charge_events e audit_logs. Se o Asaas recusar,
// nada muda no Zela (os dois lados nunca divergem).
//
// Permissão: financeiro.baixa_manual (Gestão sempre; admin se a Gestão
// liberar em Permissões).
const METHODS = ['cash', 'pix', 'transfer', 'other'] as const;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: allowed, error: permError } = await userClient.rpc('has_permission', { p_permission: 'financeiro.baixa_manual' });
    if (permError) throw permError;
    if (!allowed) throw new Error('Acesso negado: sem permissão para registrar pagamentos.');

    const { data: callerData } = await adminClient.from('users').select('school_id').eq('id', caller.id).single();
    const schoolId = callerData?.school_id;
    if (!schoolId) throw new Error('Usuário sem escola vinculada.');

    const { data: rateLimitOk } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:register-manual-payment:${caller.id}`, p_limit: 60, p_window_seconds: 300,
    });
    if (rateLimitOk === false) {
      return new Response(JSON.stringify({ error: 'Muitos registros em pouco tempo. Aguarde alguns minutos.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { charge_id, payment_date, amount_cents, method, note, receipt_path } = await req.json();
    if (!charge_id || !payment_date || !amount_cents || !method) {
      throw new Error('Campos obrigatórios: cobrança, data, valor e forma de pagamento.');
    }
    if (!Number.isInteger(amount_cents) || amount_cents <= 0) throw new Error('Valor inválido.');
    if (!METHODS.includes(method)) throw new Error('Forma de pagamento inválida.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) throw new Error('Data inválida.');

    const { data: charge, error: chargeError } = await adminClient
      .from('financial_charges')
      .select('id, school_id, status, gateway, gateway_payment_id, amount_cents, family_id, student_id')
      .eq('id', charge_id)
      .maybeSingle();
    if (chargeError) throw chargeError;
    if (!charge || charge.school_id !== schoolId) throw new Error('Cobrança não encontrada.');
    if (!['PENDING', 'AWAITING_PAYMENT', 'OVERDUE'].includes(charge.status)) {
      throw new Error('Esta cobrança não está em aberto.');
    }

    if (charge.gateway === 'asaas' && charge.gateway_payment_id) {
      const { data: apiKey, error: keyError } = await adminClient.rpc('get_school_gateway_secret', { p_school_id: schoolId, p_gateway: 'asaas' });
      if (keyError) throw keyError;
      if (!apiKey) throw new Error('A escola não tem conta Asaas configurada.');
      await createAsaasClient(apiKey).receiveInCash(charge.gateway_payment_id, {
        paymentDate: payment_date,
        value: amount_cents / 100,
        notifyCustomer: false,
      });
    }

    const { error: updateError } = await adminClient
      .from('financial_charges')
      .update({ status: 'PAID', paid_at: `${payment_date}T12:00:00Z`, payment_method: method, updated_at: new Date().toISOString() })
      .eq('id', charge.id);
    if (updateError) throw updateError;

    await adminClient.from('financial_charge_events').insert({
      charge_id: charge.id,
      event_type: 'MANUAL_RECEIPT',
      source: 'admin_manual',
      metadata: { method, note: note || null, receipt_path: receipt_path || null, amount_cents, payment_date, by: caller.id },
    });
    await adminClient.from('audit_logs').insert({
      school_id: schoolId, actor_id: caller.id, action: 'register_manual_payment', entity_type: 'financial_charge',
      entity_id: charge.id, details: { method, amount_cents, payment_date },
    });

    try {
      if (charge.family_id) {
        await sendFamilyNotification(adminClient, {
          schoolId, familyId: charge.family_id, studentId: charge.student_id, type: 'financeiro',
          message: `Pagamento confirmado: ${centsToBRL(amount_cents)}`,
          pushTitle: 'Pagamento confirmado',
          pushBody: `Recebemos seu pagamento de ${centsToBRL(amount_cents)}. Obrigado!`,
          pushTag: 'financeiro-pagamento-confirmado',
        });
      }
    } catch (notifyErr) {
      console.error('[register-manual-payment] Erro ao notificar família:', notifyErr);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    await logEdgeError(adminClient, 'register-manual-payment', (err as Error)?.message || String(err));
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
