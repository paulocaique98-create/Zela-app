import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';

// Fase 9 — Recorrência Automática, parte 1: Matrícula/contrato → plano
// financeiro → assinatura real no Asaas. Recorrência é nativa do Asaas
// (decisão da Fase 3) — esta function só cria a assinatura; o Asaas é quem
// gera cada cobrança individual no calendário certo (até 40/14/7 dias antes
// do vencimento, configurável na conta), disparando o webhook que a Fase 8
// já captura e que process-payment-webhook (parte 2 desta fase) sincroniza
// pra financial_charges.
//
// Padrão "reserva-antes-de-chamar-o-gateway" (Fase 4, risco 6.6): a linha
// em financial_contracts é inserida ANTES de qualquer chamada ao Asaas —
// isso usa o índice único parcial (só 1 contrato 'active' por aluno) como
// trava atômica contra corrida, sem nunca criar uma assinatura órfã no
// Asaas se a trava falhar. Se o Asaas falhar DEPOIS da reserva, o contrato
// é marcado 'cancelled' (nunca apagado — trilha de auditoria, seção 18 do
// escopo mestre) e o erro é devolvido ao admin.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let reservedContractId: string | null = null;
  let adminClient: ReturnType<typeof createClient> | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    adminClient = createClient(supabaseUrl, supabaseServiceKey);

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
      throw new Error('Acesso negado: apenas administradores podem criar contratos financeiros.');
    }
    const schoolId = callerData.school_id;

    // Rate limit (Fase 4, risco 6.11; implementado na Fase 15): cada chamada
    // cria um customer + subscription REAIS no Asaas — sem limite, uma conta
    // comprometida ou um bug de loop no client poderia gerar dezenas de
    // assinaturas reais rapidamente. Limite generoso porque criar contrato é
    // uma ação esporádica (matrícula), não uma tela usada em massa.
    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:create-financial-contract:${caller.id}`,
      p_limit: 20,
      p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitos contratos criados em pouco tempo. Aguarde alguns minutos.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { student_id, billing_cycle, base_monthly_amount_cents, first_due_date, billing_type, description } = await req.json();
    if (!student_id || !billing_cycle || !base_monthly_amount_cents || !first_due_date) {
      throw new Error('Campos obrigatórios: student_id, billing_cycle, base_monthly_amount_cents, first_due_date');
    }
    if (!['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY'].includes(billing_cycle)) {
      throw new Error('billing_cycle deve ser MONTHLY, QUARTERLY, SEMIANNUALLY ou YEARLY');
    }
    const paymentBillingType = billing_type || 'UNDEFINED';
    if (!['PIX', 'BOLETO', 'UNDEFINED'].includes(paymentBillingType)) {
      // Mesma restrição da Fase 7: nunca CREDIT_CARD com dado de cartão
      // passando pelo nosso backend — só checkout hospedado.
      throw new Error('billing_type deve ser PIX, BOLETO ou UNDEFINED');
    }

    // Nunca confia em school_id vindo do client — o aluno tem que ser
    // realmente da escola do admin que está chamando (Fase 4, risco 6.5/6.9).
    const { data: student, error: studentError } = await adminClient
      .from('students')
      .select('id, name, school_id')
      .eq('id', student_id)
      .eq('school_id', schoolId)
      .single();
    if (studentError || !student) throw new Error('Aluno não encontrado nesta escola.');

    // Resolve o responsável financeiro ATUAL (Fase 6: is_financial=true é a
    // fonte da verdade, não um campo solto).
    const { data: guardianLink, error: guardianLinkError } = await adminClient
      .from('student_guardians')
      .select('guardian_id')
      .eq('student_id', student_id)
      .eq('is_financial', true)
      .maybeSingle();
    if (guardianLinkError) throw guardianLinkError;
    if (!guardianLink) throw new Error('Este aluno não tem um responsável financeiro definido. Cadastre um em student_guardians antes de criar o contrato.');

    const { data: guardian, error: guardianError } = await adminClient
      .from('users')
      .select('id, name, email, doc_number, doc_type')
      .eq('id', guardianLink.guardian_id)
      .single();
    if (guardianError || !guardian) throw new Error('Responsável financeiro não encontrado.');
    if (!guardian.doc_number) throw new Error('O responsável financeiro não tem CPF/CNPJ cadastrado — obrigatório para criar a cobrança no Asaas.');

    // Desconto configurado pelo Admin — por RESPONSÁVEL financeiro
    // específico (ajuste da Fase 11: deixou de ser um % único pra escola
    // inteira, agora exige a família já cadastrada). SEMPRE recalculado no
    // servidor (Fase 4, risco 6.10: nunca aceitar amount_cents vindo do
    // client).
    const { data: discountRow } = await adminClient
      .from('financial_billing_discounts')
      .select('discount_percent')
      .eq('school_id', schoolId)
      .eq('guardian_id', guardian.id)
      .eq('billing_cycle', billing_cycle)
      .maybeSingle();
    const discountPercent = discountRow?.discount_percent ?? 0;

    const CYCLE_MONTHS: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUALLY: 6, YEARLY: 12 };
    const rawAmount = base_monthly_amount_cents * CYCLE_MONTHS[billing_cycle];
    const amountCents = Math.round(rawAmount * (1 - discountPercent / 100));

    // ── Reserva: insere ANTES de chamar o Asaas ──────────────────────────
    const { data: contract, error: insertError } = await adminClient
      .from('financial_contracts')
      .insert({
        school_id: schoolId,
        student_id,
        financial_guardian_id: guardian.id,
        billing_cycle,
        base_monthly_amount_cents,
        discount_percent_applied: discountPercent,
        amount_cents: amountCents,
        first_due_date,
        status: 'active',
        gateway: 'asaas',
        created_by: caller.id,
      })
      .select('id')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error('Este aluno já tem um contrato financeiro ativo. Cancele o contrato atual antes de criar um novo.');
      }
      throw insertError;
    }
    reservedContractId = contract.id;

    // ── Resolve a chave Asaas DESSA escola (Opção A) ─────────────────────
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

    const subscription = await asaas.createSubscription({
      customer: customer.id,
      billingType: paymentBillingType as 'PIX' | 'BOLETO' | 'UNDEFINED',
      value: amountCents / 100,
      nextDueDate: first_due_date,
      cycle: billing_cycle,
      description: description || `Mensalidade — ${student.name}`,
      externalReference: reservedContractId,
    });

    const { error: updateError } = await adminClient
      .from('financial_contracts')
      .update({
        gateway_customer_id: customer.id,
        gateway_subscription_id: subscription.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservedContractId);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      contract_id: reservedContractId,
      gateway_customer_id: customer.id,
      gateway_subscription_id: subscription.id,
      amount_cents: amountCents,
      billing_cycle,
      discount_percent_applied: discountPercent,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Se a reserva já tinha sido feita e o Asaas falhou depois, marca
    // 'cancelled' — nunca apaga (trilha de auditoria) e libera o aluno pra
    // uma nova tentativa (a constraint única só bloqueia contratos 'active').
    if (reservedContractId && adminClient) {
      await adminClient.from('financial_contracts').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', reservedContractId);
    }
    if (adminClient) {
      await logEdgeError(adminClient, 'create-financial-contract', err.message || String(err), { reservedContractId });
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
