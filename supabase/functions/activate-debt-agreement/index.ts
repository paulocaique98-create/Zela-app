import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { criarClienteAsaas } from '../_shared/financialContract.ts';
import { sendFamilyNotification } from '../_shared/sendFamilyNotification.ts';
import { brl } from '../_shared/debtAgreement.ts';

// Item 10: ativa o acordo depois que a família assinou o termo. Quem chama: a própria família
// financeira (logo após assinar) ou a Gestão da escola. O servidor confere a assinatura no banco,
// nunca confia no que o client diz. Ordem: cria as parcelas no Asaas, depois cancela as cobranças
// originais; qualquer falha desfaz o que já foi feito e o acordo continua aguardando assinatura.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRAVA_MINUTOS = 5;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  // deno-lint-ignore no-explicit-any
  let adminClient: any = null;
  let agreementId: string | null = null;
  let travaTomada = false;
  const novas: { paymentId: string; chargeId: string; installmentId: string }[] = [];
  const canceladasNoAsaas: string[] = [];
  // deno-lint-ignore no-explicit-any
  let asaas: any = null;

  const desfazer = async () => {
    for (const paymentId of canceladasNoAsaas) {
      try { await asaas.restorePayment(paymentId); } catch (e) { console.error('[activate-debt-agreement] restore falhou', paymentId, e); }
    }
    for (const n of novas) {
      try { await asaas.cancelPayment(n.paymentId); } catch (e) { console.error('[activate-debt-agreement] cancel falhou', n.paymentId, e); }
      await adminClient.from('debt_agreement_installments').update({ charge_id: null }).eq('id', n.installmentId);
      await adminClient.from('financial_charges').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', n.chargeId);
    }
    if (agreementId && travaTomada) {
      await adminClient.from('debt_agreements').update({ ativando_em: null }).eq('id', agreementId);
    }
  };

  try {
    adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData } = await adminClient.from('users').select('role, school_id').eq('id', caller.id).single();
    if (!callerData || !['gestao', 'family'].includes(callerData.role)) throw new Error('Acesso negado.');

    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:activate-debt-agreement:${caller.id}`, p_limit: 20, p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);

    const body = await req.json();
    if (!body.agreement_id || !UUID.test(String(body.agreement_id))) throw new Error('Informe o acordo.');

    const { data: acordo, error: acordoError } = await adminClient
      .from('debt_agreements')
      .select('id, school_id, guardian_id, student_id, status, valor_acordado_cents, parcelas, contract_id')
      .eq('id', body.agreement_id).maybeSingle();
    if (acordoError) throw acordoError;
    // Mesma mensagem para "não existe" e "não é seu": não revela acordos de outra escola ou família.
    const autorizado = acordo && (
      (callerData.role === 'gestao' && acordo.school_id === callerData.school_id)
      || (callerData.role === 'family' && acordo.guardian_id === caller.id)
    );
    if (!autorizado) throw new Error('Acordo não encontrado.');
    const schoolId = acordo.school_id;
    agreementId = acordo.id;

    if (acordo.status === 'ativo') return json({ agreement_id: acordo.id, status: 'ativo' });
    if (acordo.status !== 'aguardando_assinatura') throw new Error('Este acordo não está aguardando assinatura.');

    const { data: termo } = await adminClient
      .from('contract_documents').select('status, signed_at').eq('id', acordo.contract_id).eq('school_id', schoolId).maybeSingle();
    if (!termo || termo.status !== 'assinado' || !termo.signed_at) {
      throw new Error('A família ainda não assinou o termo do acordo.');
    }

    const limite = new Date(Date.now() - TRAVA_MINUTOS * 60000).toISOString();
    const { data: trava, error: travaError } = await adminClient
      .from('debt_agreements').update({ ativando_em: new Date().toISOString() })
      .eq('id', acordo.id).eq('status', 'aguardando_assinatura')
      .or(`ativando_em.is.null,ativando_em.lt.${limite}`)
      .select('id');
    if (travaError) throw travaError;
    if (!trava || trava.length === 0) throw new Error('A ativação deste acordo já está em andamento.');
    travaTomada = true;

    const { data: vinculos, error: vinculosError } = await adminClient
      .from('debt_agreement_charges')
      .select('charge_id, financial_charges(id, status, gateway_payment_id)')
      .eq('agreement_id', acordo.id).eq('ativa', true);
    if (vinculosError) throw vinculosError;
    // deno-lint-ignore no-explicit-any
    const originais = (vinculos || []).map((v: any) => v.financial_charges).filter(Boolean);
    if (originais.length === 0) throw new Error('O acordo não tem cobranças originais.');
    // deno-lint-ignore no-explicit-any
    if (originais.some((c: any) => c.status !== 'OVERDUE')) {
      throw new Error('Uma das cobranças do acordo mudou de situação (foi paga ou cancelada). Cancele este acordo e crie outro.');
    }

    const { data: parcelas, error: parcelasError } = await adminClient
      .from('debt_agreement_installments')
      .select('id, numero, amount_cents, due_date, charge_id')
      .eq('agreement_id', acordo.id).order('numero');
    if (parcelasError) throw parcelasError;
    // deno-lint-ignore no-explicit-any
    if ((parcelas || []).some((p: any) => p.charge_id)) throw new Error('As parcelas deste acordo já foram geradas.');

    const { data: guardian } = await adminClient
      .from('users').select('id, name, email, doc_number').eq('id', acordo.guardian_id).eq('school_id', schoolId).single();
    if (!guardian) throw new Error('Responsável financeiro não encontrado.');
    if (!guardian.doc_number) throw new Error('O responsável financeiro não tem CPF/CNPJ cadastrado.');

    asaas = await criarClienteAsaas(adminClient, schoolId, createAsaasClient);
    const customer = await asaas.createCustomer({
      name: guardian.name, cpfCnpj: guardian.doc_number, email: guardian.email || undefined,
    });

    // 1) Parcelas novas.
    // deno-lint-ignore no-explicit-any
    for (const p of (parcelas || []) as any[]) {
      const payment = await asaas.createPayment({
        customer: customer.id, billingType: 'UNDEFINED', value: p.amount_cents / 100, dueDate: p.due_date,
        description: `Acordo de dívida, parcela ${p.numero}/${acordo.parcelas}`,
        externalReference: `acordo:${acordo.id}:${p.numero}`,
      });
      const { data: charge, error: insertError } = await adminClient.from('financial_charges').insert({
        school_id: schoolId, contract_id: null, student_id: acordo.student_id, family_id: guardian.id,
        due_date: p.due_date, available_from: p.due_date, amount_cents: p.amount_cents, status: 'PENDING',
        gateway: 'asaas', gateway_payment_id: payment.id, payment_method: 'link',
        boleto_url: payment.bankSlipUrl || null, payment_link: payment.invoiceUrl || null,
      }).select('id').single();
      if (insertError) {
        try { await asaas.cancelPayment(payment.id); } catch (_) { /* melhor esforço */ }
        throw insertError;
      }
      novas.push({ paymentId: payment.id, chargeId: charge.id, installmentId: p.id });
      const { error: linkError } = await adminClient.from('debt_agreement_installments').update({ charge_id: charge.id }).eq('id', p.id);
      if (linkError) throw linkError;
      await adminClient.from('financial_charge_events').insert({
        charge_id: charge.id, event_type: 'created', source: 'admin_manual',
        metadata: { agreement_id: acordo.id, parcela: p.numero },
      });
    }

    // 2) Cobranças originais saem do Asaas.
    // deno-lint-ignore no-explicit-any
    for (const c of originais as any[]) {
      if (c.gateway_payment_id) {
        await asaas.cancelPayment(c.gateway_payment_id);
        canceladasNoAsaas.push(c.gateway_payment_id);
      }
    }

    // 3) Estado final no banco.
    const agora = new Date().toISOString();
    // deno-lint-ignore no-explicit-any
    const idsOriginais = originais.map((c: any) => c.id);
    const { error: cancelaError } = await adminClient
      .from('financial_charges').update({ status: 'CANCELLED', updated_at: agora }).in('id', idsOriginais).eq('school_id', schoolId);
    if (cancelaError) throw cancelaError;
    await adminClient.from('financial_charge_events').insert(
      // deno-lint-ignore no-explicit-any
      idsOriginais.map((id: any) => ({ charge_id: id, event_type: 'CANCELLED_BY_AGREEMENT', source: 'admin_manual', metadata: { agreement_id: acordo.id, by: caller.id } })),
    );
    const { error: ativoError } = await adminClient.from('debt_agreements')
      .update({ status: 'ativo', ativado_em: agora, ativando_em: null }).eq('id', acordo.id);
    if (ativoError) {
      await adminClient.from('financial_charges').update({ status: 'OVERDUE', updated_at: agora }).in('id', idsOriginais);
      throw ativoError;
    }

    await adminClient.from('audit_logs').insert({
      school_id: schoolId, actor_id: caller.id, action: 'activate_debt_agreement',
      entity_type: 'debt_agreement', entity_id: acordo.id,
      details: { parcelas: novas.length, cobrancas_canceladas: idsOriginais, valor_acordado_cents: acordo.valor_acordado_cents },
    });

    try {
      await sendFamilyNotification(adminClient, {
        schoolId, familyId: guardian.id, studentId: acordo.student_id, type: 'financeiro',
        message: `Acordo ativo: ${acordo.parcelas}x, total ${brl(acordo.valor_acordado_cents)}. Veja as parcelas em Financeiro.`,
        url: '/?tab=financeiro', pushTitle: 'Acordo de dívida ativo',
        pushBody: `${acordo.parcelas} parcelas, total ${brl(acordo.valor_acordado_cents)}`, pushTag: 'financeiro-acordo-ativo',
      });
    } catch (notifyErr) {
      console.error('[activate-debt-agreement] Erro ao notificar família:', notifyErr);
    }

    return json({ agreement_id: acordo.id, status: 'ativo', parcelas: novas.length });
  } catch (err) {
    if (adminClient && asaas) { try { await desfazer(); } catch (e) { console.error('[activate-debt-agreement] desfazer falhou', e); } }
    else if (adminClient && agreementId && travaTomada) {
      await adminClient.from('debt_agreements').update({ ativando_em: null }).eq('id', agreementId);
    }
    if (adminClient) await logEdgeError(adminClient, 'activate-debt-agreement', (err as Error).message || String(err), {}, null, 'warn');
    return json({ error: (err as Error).message }, 400);
  }
});
