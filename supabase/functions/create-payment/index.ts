import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';

// Fase 7 — Integração segura com o gateway (Asaas), backend puro, SEM UI.
// Escopo desta function: provar que Customer → Payment → PIX/Boleto/Link
// funcionam de ponta a ponta a partir do nosso backend, em sandbox — NÃO
// grava nada em financial_contracts/financial_charges ainda (isso é
// trabalho da Fase 9, recorrência automática, que reaproveita este mesmo
// cliente Asaas em src/functions/_shared/asaas.ts).
//
// Mesmo padrão de autorização já usado no projeto: JWT do caller
// revalidado contra public.users antes de agir — só admin/developer.
//
// Multi-tenant (Opção A): a chave do Asaas é resolvida por escola via
// get_school_gateway_secret() — nunca um secret global único. Cada escola
// usa a PRÓPRIA conta, cadastrada antes via set-school-gateway-key.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users')
      .select('role, school_id')
      .eq('id', caller.id)
      .single();
    if (dbCallerError || !callerData || (callerData.role !== 'admin' && callerData.role !== 'developer')) {
      throw new Error('Acesso negado: apenas administradores podem criar cobranças.');
    }

    const { name, cpfCnpj, email, billingType, value, dueDate, description } = await req.json();
    if (!name || !cpfCnpj || !billingType || !value || !dueDate) {
      throw new Error('Campos obrigatórios: name, cpfCnpj, billingType, value, dueDate');
    }
    if (!['PIX', 'BOLETO', 'UNDEFINED'].includes(billingType)) {
      // CREDIT_CARD fora do escopo desta function por decisão da Fase 3:
      // cartão só via checkout hospedado (billingType=UNDEFINED + invoiceUrl),
      // nunca dado de cartão passando pelo nosso backend.
      throw new Error('billingType deve ser PIX, BOLETO ou UNDEFINED');
    }

    // Resolve a chave Asaas DESSA escola (nunca um secret global) — se a
    // escola ainda não configurou nenhuma conta, falha aqui com uma
    // mensagem clara, antes de qualquer chamada ao Asaas.
    const { data: apiKey, error: keyError } = await adminClient.rpc('get_school_gateway_secret', {
      p_school_id: callerData.school_id,
      p_gateway: 'asaas',
    });
    if (keyError) throw keyError;
    if (!apiKey) {
      throw new Error('Esta escola ainda não tem uma conta Asaas configurada. Configure em Configurações Financeiras antes de criar cobranças.');
    }
    const asaas = createAsaasClient(apiKey);

    // Customer: cria um novo a cada chamada por simplicidade nesta fase de
    // prova técnica — a Fase 9 vai decidir a estratégia de reaproveitar
    // gateway_customer_id já salvo em financial_contracts, em vez de
    // recriar toda vez.
    const customer = await asaas.createCustomer({ name, cpfCnpj, email });

    const payment = await asaas.createPayment({
      customer: customer.id,
      billingType,
      value,
      dueDate,
      description: description || 'Teste Fase 7 — sandbox',
    });

    const result: Record<string, unknown> = {
      customer_id: customer.id,
      payment_id: payment.id,
      status: payment.status,
      payment_link: payment.invoiceUrl || null,
      boleto_url: payment.bankSlipUrl || null,
    };

    if (billingType === 'PIX') {
      const pix = await asaas.getPixQrCode(payment.id);
      result.pix_qr_code = pix.encodedImage;
      result.pix_copy_paste = pix.payload;
      result.pix_expiration = pix.expirationDate;
    }

    if (billingType === 'BOLETO') {
      const boleto = await asaas.getBoletoIdentificationField(payment.id);
      result.boleto_identification_field = boleto.identificationField;
      result.boleto_barcode = boleto.barCode;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
