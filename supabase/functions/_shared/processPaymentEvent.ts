// Fase 9 — parte 2: sincroniza um evento cru de payment_webhook_events pra
// financial_charges (a cobrança "fica disponível" de verdade pro portal da
// família só depois desse passo). Compartilhado entre payment-webhook
// (chama isso logo após gravar um evento novo) e process-payment-webhook
// (reprocessamento manual/backfill).
//
// Nunca confia em nada do payload pra decidir A QUAL ESCOLA a cobrança
// pertence — isso já foi resolvido pelo token do webhook (Fase 8) antes de
// chegar aqui. Aqui só resolve A QUAL CONTRATO/COBRANÇA ela pertence: via
// gateway_subscription_id pra recorrência, ou via gateway_payment_id direto
// pra cobrança avulsa (Fase 16) — nunca aceito de fora, sempre um JOIN
// contra o nosso próprio banco (Fase 4, risco 6.9).
//
// Fase 13: também notifica a família (in-app + push) quando a cobrança é
// sincronizada pela 1ª vez (cobrança nova) ou quando o status vira PAID
// (pagamento confirmado) — nunca em nenhuma outra transição, pra não virar
// ruído.
import { sendFamilyNotification, centsToBRL } from './sendFamilyNotification.ts';

// Normaliza os status do Asaas pro vocabulário interno (Fase 2, seção 16 do
// escopo mestre — nunca strings soltas do gateway espalhadas pelo código).
const ASAAS_STATUS_MAP: Record<string, string> = {
  PENDING: 'PENDING',
  AWAITING_RISK_ANALYSIS: 'AWAITING_PAYMENT',
  RECEIVED: 'PAID',
  CONFIRMED: 'PAID',
  RECEIVED_IN_CASH: 'PAID',
  OVERDUE: 'OVERDUE',
  REFUNDED: 'REFUNDED',
  REFUND_REQUESTED: 'REFUNDED',
  CHARGEBACK_REQUESTED: 'REFUNDED',
  CHARGEBACK_DISPUTE: 'REFUNDED',
  DELETED: 'CANCELLED',
};

const ASAAS_BILLING_TYPE_MAP: Record<string, string> = {
  PIX: 'pix',
  BOLETO: 'boleto',
  CREDIT_CARD: 'credit_card',
  UNDEFINED: 'link',
};

export interface ProcessResult {
  processed: boolean;
  reason?: string;
  chargeId?: string;
}

// deno-lint-ignore no-explicit-any
export async function processPaymentEvent(adminClient: any, webhookEventRow: any): Promise<ProcessResult> {
  const { school_id: schoolId, event_type: eventType, payload } = webhookEventRow;
  const payment = payload?.payment;

  if (!payment || !payment.id) {
    return { processed: false, reason: 'evento sem objeto payment' };
  }

  const subscriptionId = payment.subscription;
  const mappedStatus = ASAAS_STATUS_MAP[payment.status] || 'PENDING';
  const paymentMethod = ASAAS_BILLING_TYPE_MAP[payment.billingType] || null;

  // Estado ANTES de qualquer escrita — só assim dá pra saber se é cobrança
  // nova ou se o status realmente MUDOU pra PAID (upsert sozinho não
  // diferencia isso).
  const { data: existingCharge } = await adminClient
    .from('financial_charges')
    .select('id, status, contract_id, student_id, family_id')
    .eq('gateway', 'asaas')
    .eq('gateway_payment_id', payment.id)
    .maybeSingle();

  let contractId: string | null = null;
  let studentId: string;
  let familyId: string;

  if (subscriptionId) {
    // Recorrência: resolve o contrato pela assinatura.
    const { data: contract, error: contractError } = await adminClient
      .from('financial_contracts')
      .select('id, student_id, financial_guardian_id')
      .eq('school_id', schoolId)
      .eq('gateway_subscription_id', subscriptionId)
      .maybeSingle();
    if (contractError) throw contractError;
    if (!contract) {
      return { processed: false, reason: `nenhum contrato encontrado para subscription ${subscriptionId} nesta escola` };
    }
    contractId = contract.id;
    studentId = contract.student_id;
    familyId = contract.financial_guardian_id;
  } else if (existingCharge) {
    // Cobrança avulsa (Fase 16) — sem assinatura, mas já existia uma linha
    // criada por create-avulsa-charge; só atualiza o status dela.
    contractId = existingCharge.contract_id;
    studentId = existingCharge.student_id;
    familyId = existingCharge.family_id;
  } else {
    // Cobrança avulsa cujo Payment nunca foi criado pelo nosso backend
    // (ex: teste manual direto no painel do Asaas) — não dá pra saber a
    // qual aluno/responsável associar, então não cria nada às cegas.
    return { processed: false, reason: 'cobrança avulsa não encontrada — crie primeiro via create-avulsa-charge' };
  }

  const { data: charge, error: upsertError } = await adminClient
    .from('financial_charges')
    .upsert({
      school_id: schoolId,
      contract_id: contractId,
      student_id: studentId,
      family_id: familyId,
      due_date: payment.dueDate,
      available_from: payment.dueDate, // já chegou via webhook = já está disponível agora
      amount_cents: Math.round((payment.value || 0) * 100),
      status: mappedStatus,
      gateway: 'asaas',
      gateway_payment_id: payment.id,
      payment_method: paymentMethod,
      payment_link: payment.invoiceUrl || null,
      boleto_url: payment.bankSlipUrl || null,
      paid_at: mappedStatus === 'PAID' ? (payment.paymentDate ? `${payment.paymentDate}T00:00:00Z` : new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'gateway,gateway_payment_id' })
    .select('id')
    .single();
  if (upsertError) throw upsertError;

  await adminClient.from('financial_charge_events').insert({
    charge_id: charge.id,
    event_type: eventType,
    source: 'webhook',
    webhook_event_id: webhookEventRow.id,
    metadata: { asaas_status: payment.status, mapped_status: mappedStatus },
  });

  await adminClient
    .from('payment_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', webhookEventRow.id);

  const isNewCharge = !existingCharge;
  const becamePaid = mappedStatus === 'PAID' && existingCharge?.status !== 'PAID';
  const amountLabel = centsToBRL(Math.round((payment.value || 0) * 100));

  try {
    if (isNewCharge) {
      await sendFamilyNotification(adminClient, {
        schoolId,
        familyId,
        studentId,
        type: 'financeiro',
        message: `Nova cobrança gerada: ${amountLabel} — vencimento ${payment.dueDate}`,
        pushTitle: 'Nova cobrança disponível',
        pushBody: `${amountLabel} — vencimento em ${payment.dueDate}`,
        pushTag: 'financeiro-nova-cobranca',
      });
    } else if (becamePaid) {
      await sendFamilyNotification(adminClient, {
        schoolId,
        familyId,
        studentId,
        type: 'financeiro',
        message: `Pagamento confirmado: ${amountLabel}`,
        pushTitle: 'Pagamento confirmado',
        pushBody: `Recebemos seu pagamento de ${amountLabel}. Obrigado!`,
        pushTag: 'financeiro-pagamento-confirmado',
      });
    }
  } catch (notifyErr) {
    // Falha ao notificar nunca deve derrubar a sincronização da cobrança em
    // si — a cobrança já está correta no banco, é só o aviso que falhou.
    console.error('[processPaymentEvent] Erro ao notificar família:', notifyErr);
  }

  return { processed: true, chargeId: charge.id };
}
