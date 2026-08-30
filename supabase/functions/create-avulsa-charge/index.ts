import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { sendFamilyNotification, centsToBRL } from '../_shared/sendFamilyNotification.ts';

// Fase 16 — cobrança avulsa (não-recorrente): taxa de matrícula, multa,
// material didático, qualquer cobrança pontual que não faz parte da
// mensalidade. Reaproveita o mesmo cliente Asaas da Fase 7 (createPayment,
// getPixQrCode, getBoletoIdentificationField) — antes disso só existia como
// prova técnica, nunca gravava nada em financial_charges nem aparecia em
// tela nenhuma.
//
// Diferente de create-financial-contract: não cria financial_contracts nem
// assinatura no Asaas — é um Payment avulso isolado, contract_id fica NULL
// (migração 20260830e). Status é gravado direto aqui (PENDING); a
// atualização pra PAID/OVERDUE/etc. continua vindo do webhook normalmente
// (processPaymentEvent agora sabe encontrar cobrança avulsa pelo
// gateway_payment_id quando não há subscription).
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
    if (dbCallerError || !callerData || callerData.role !== 'admin') {
      throw new Error('Acesso negado: apenas administradores podem criar cobranças.');
    }
    const schoolId = callerData.school_id;

    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:create-avulsa-charge:${caller.id}`,
      p_limit: 30,
      p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas cobranças criadas em pouco tempo. Aguarde alguns minutos.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { student_id, amount_cents, due_date, billing_type, description } = await req.json();
    if (!student_id || !amount_cents || !due_date) {
      throw new Error('Campos obrigatórios: student_id, amount_cents, due_date');
    }
    if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
      throw new Error('amount_cents deve ser um inteiro positivo (valor em centavos).');
    }
    const paymentBillingType = billing_type || 'UNDEFINED';
    if (!['PIX', 'BOLETO', 'UNDEFINED'].includes(paymentBillingType)) {
      throw new Error('billing_type deve ser PIX, BOLETO ou UNDEFINED');
    }

    // Nunca confia em school_id vindo do client — mesmo padrão de
    // create-financial-contract (Fase 4, risco 6.5/6.9).
    const { data: student, error: studentError } = await adminClient
      .from('students')
      .select('id, name, school_id')
      .eq('id', student_id)
      .eq('school_id', schoolId)
      .single();
    if (studentError || !student) throw new Error('Aluno não encontrado nesta escola.');

    const { data: guardianLink, error: guardianLinkError } = await adminClient
      .from('student_guardians')
      .select('guardian_id')
      .eq('student_id', student_id)
      .eq('is_financial', true)
      .maybeSingle();
    if (guardianLinkError) throw guardianLinkError;
    if (!guardianLink) throw new Error('Este aluno não tem um responsável financeiro definido.');

    const { data: guardian, error: guardianError } = await adminClient
      .from('users')
      .select('id, name, email, doc_number')
      .eq('id', guardianLink.guardian_id)
      .single();
    if (guardianError || !guardian) throw new Error('Responsável financeiro não encontrado.');
    if (!guardian.doc_number) throw new Error('O responsável financeiro não tem CPF/CNPJ cadastrado.');

    const { data: apiKey, error: keyError } = await adminClient.rpc('get_school_gateway_secret', {
      p_school_id: schoolId,
      p_gateway: 'asaas',
    });
    if (keyError) throw keyError;
    if (!apiKey) throw new Error('Esta escola ainda não tem uma conta Asaas configurada.');

    const asaas = createAsaasClient(apiKey);

    const customer = await asaas.createCustomer({
      name: guardian.name,
      cpfCnpj: guardian.doc_number,
      email: guardian.email || undefined,
    });

    const amountReais = amount_cents / 100;
    const payment = await asaas.createPayment({
      customer: customer.id,
      billingType: paymentBillingType as 'PIX' | 'BOLETO' | 'UNDEFINED',
      value: amountReais,
      dueDate: due_date,
      description: description || `Cobrança avulsa — ${student.name}`,
    });

    let pixCopyPaste: string | null = null;
    let pixQrCode: string | null = null;
    let boletoIdentificationField: string | null = null;
    let boletoBarcode: string | null = null;

    if (paymentBillingType === 'PIX') {
      const pix = await asaas.getPixQrCode(payment.id);
      pixCopyPaste = pix.payload;
      pixQrCode = pix.encodedImage;
    }
    if (paymentBillingType === 'BOLETO') {
      const boleto = await asaas.getBoletoIdentificationField(payment.id);
      boletoIdentificationField = boleto.identificationField;
      boletoBarcode = boleto.barCode;
    }

    const { data: charge, error: insertError } = await adminClient
      .from('financial_charges')
      .insert({
        school_id: schoolId,
        contract_id: null,
        student_id,
        family_id: guardian.id,
        due_date,
        available_from: due_date,
        amount_cents,
        status: 'PENDING',
        gateway: 'asaas',
        gateway_payment_id: payment.id,
        payment_method: paymentBillingType === 'UNDEFINED' ? 'link' : paymentBillingType.toLowerCase(),
        pix_qr_code: pixQrCode,
        pix_copy_paste: pixCopyPaste,
        boleto_url: payment.bankSlipUrl || null,
        boleto_barcode: boletoBarcode,
        boleto_identification_field: boletoIdentificationField,
        payment_link: payment.invoiceUrl || null,
      })
      .select('id')
      .single();
    if (insertError) throw insertError;

    await adminClient.from('financial_charge_events').insert({
      charge_id: charge.id,
      event_type: 'created',
      source: 'admin_manual',
      metadata: { billing_type: paymentBillingType },
    });

    try {
      await sendFamilyNotification(adminClient, {
        schoolId,
        familyId: guardian.id,
        studentId: student.id,
        type: 'financeiro',
        message: `Nova cobrança gerada: ${centsToBRL(amount_cents)} — vencimento ${due_date}`,
        pushTitle: 'Nova cobrança disponível',
        pushBody: `${centsToBRL(amount_cents)} — vencimento em ${due_date}`,
        pushTag: 'financeiro-nova-cobranca',
      });
    } catch (notifyErr) {
      console.error('[create-avulsa-charge] Erro ao notificar família:', notifyErr);
    }

    return new Response(JSON.stringify({
      charge_id: charge.id,
      gateway_payment_id: payment.id,
      amount_cents,
      payment_link: payment.invoiceUrl || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
