import { createAsaasClient } from './asaas.ts';
import { notifyAdmins } from './notifyAdmins.ts';

// Eventos fiscais do Asaas (INVOICE_*): ramo paralelo ao de pagamento, porque o payload traz
// `invoice` no lugar de `payment`. Segue o mesmo princípio do pagamento: do evento só se
// aproveita o id da nota; os dados vêm do Asaas, com a chave da própria escola.
//
// O campo com o motivo do erro (INVOICE_ERROR) não é documentado publicamente; por isso são
// aceitos alguns nomes prováveis até a Fase 0 no sandbox confirmar o certo.

const STATUS_VALIDOS = ['SCHEDULED', 'SYNCHRONIZED', 'AUTHORIZED', 'PROCESSING_CANCELLATION', 'CANCELED', 'CANCELLATION_DENIED', 'ERROR'];

const STATUS_DO_EVENTO: Record<string, string> = {
  INVOICE_CREATED: 'SCHEDULED',
  INVOICE_UPDATED: 'SCHEDULED',
  INVOICE_SYNCHRONIZED: 'SYNCHRONIZED',
  INVOICE_AUTHORIZED: 'AUTHORIZED',
  INVOICE_PROCESSING_CANCELLATION: 'PROCESSING_CANCELLATION',
  INVOICE_CANCELED: 'CANCELED',
  INVOICE_CANCELLATION_DENIED: 'CANCELLATION_DENIED',
  INVOICE_ERROR: 'ERROR',
};

export function ehEventoFiscal(eventType: unknown): boolean {
  return typeof eventType === 'string' && eventType.startsWith('INVOICE_');
}

// Status final: o do Asaas quando é um dos que guardamos; senão o que o evento indica.
export function statusDaNota(eventType: string, invoiceStatus: unknown): string {
  if (eventType === 'INVOICE_ERROR') return 'ERROR';
  if (typeof invoiceStatus === 'string' && STATUS_VALIDOS.includes(invoiceStatus)) return invoiceStatus;
  return STATUS_DO_EVENTO[eventType] || 'SCHEDULED';
}

function texto(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

function urlSegura(v: unknown): string | null {
  const t = texto(v, 500);
  return t && /^https:\/\//i.test(t) ? t : null;
}

// deno-lint-ignore no-explicit-any
export function motivoDoErro(invoice: any): string | null {
  return texto(invoice?.statusDescription, 500)
    ?? texto(invoice?.errorMessage, 500)
    ?? texto(invoice?.error?.message, 500)
    ?? texto(invoice?.description, 500);
}

// deno-lint-ignore no-explicit-any
export async function processInvoiceEvent(adminClient: any, webhookEventRow: any) {
  const { id: webhookEventId, school_id: schoolId, event_type: eventType, payload } = webhookEventRow;
  const invoiceId = payload?.invoice?.id;
  if (typeof invoiceId !== 'string' || invoiceId.length < 5 || invoiceId.length > 80) {
    return { processed: false, reason: 'evento fiscal sem invoice.id' };
  }

  const { data: apiKey, error: keyError } = await adminClient.rpc('get_school_gateway_secret', { p_school_id: schoolId, p_gateway: 'asaas' });
  if (keyError) throw keyError;
  if (!apiKey) return { processed: false, reason: 'escola sem chave do Asaas' };

  // deno-lint-ignore no-explicit-any
  const invoice: any = await createAsaasClient(apiKey).getInvoice(invoiceId);
  const status = statusDaNota(eventType, invoice?.status);
  const erro = status === 'ERROR' ? (motivoDoErro(invoice) ?? motivoDoErro(payload.invoice) ?? 'O Asaas não informou o motivo.') : null;

  const paymentId = typeof invoice?.payment === 'string' ? invoice.payment : null;
  let chargeId: string | null = null;
  let contractId: string | null = null;
  if (paymentId) {
    const { data: charge } = await adminClient
      .from('financial_charges')
      .select('id, contract_id')
      .eq('school_id', schoolId)
      .eq('gateway_payment_id', paymentId)
      .maybeSingle();
    chargeId = charge?.id ?? null;
    contractId = charge?.contract_id ?? null;
  }

  const { data: anterior } = await adminClient
    .from('financial_invoices')
    .select('status')
    .eq('school_id', schoolId)
    .eq('gateway_invoice_id', invoiceId)
    .maybeSingle();

  const valor = Number(invoice?.value);
  const { error: upsertError } = await adminClient.from('financial_invoices').upsert({
    school_id: schoolId,
    contract_id: contractId,
    charge_id: chargeId,
    gateway_invoice_id: invoiceId,
    status,
    invoice_number: texto(invoice?.number, 40),
    validation_code: texto(invoice?.validationCode, 80),
    pdf_url: urlSegura(invoice?.pdfUrl),
    xml_url: urlSegura(invoice?.xmlUrl),
    value_cents: Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) : null,
    error_reason: erro,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'school_id,gateway_invoice_id' });
  if (upsertError) throw upsertError;

  if (chargeId) {
    await adminClient.from('financial_charge_events').insert({
      charge_id: chargeId,
      event_type: `nfse_${status.toLowerCase()}`,
      source: 'webhook',
      webhook_event_id: webhookEventId ?? null,
      metadata: { invoice_id: invoiceId, status },
    });
  }

  // Avisa a Gestão uma vez por mudança para ERRO (reenvio do mesmo evento não repete o aviso).
  if (status === 'ERROR' && anterior?.status !== 'ERROR') {
    try {
      await notifyAdmins(adminClient, {
        schoolId,
        type: 'nfse_erro',
        message: 'Uma nota fiscal de mensalidade deu erro. Veja o motivo em Configurações › Financeiro › Nota fiscal.',
        pushTitle: 'Nota fiscal com erro',
        pushBody: 'Uma nota de mensalidade precisa de correção.',
        pushTag: 'nfse-erro',
        roles: ['gestao'],
      });
    } catch (e) {
      console.error('[processInvoiceEvent] aviso à Gestão falhou:', e);
    }
  }

  return { processed: true, chargeId: chargeId ?? undefined };
}
