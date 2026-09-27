// Auditoria de segurança 27/09/2026 (item 14). O webhook do Asaas é
// autenticado só por um token por escola: se esse token vazar, qualquer um
// monta um evento "pagamento recebido" com o valor que quiser. Por isso o
// conteúdo do evento passa a servir só pra dizer QUAL pagamento consultar
// -- status, valor, vencimento e o resto vêm sempre da consulta direta ao
// Asaas (GET /v3/payments/{id}, com a chave da própria escola).
//
// Sem nenhum import de propósito: roda igual no Deno (Edge Functions) e no
// vitest (src/test/trustedPayment.test.js).

export interface TrustedPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  billingType?: string;
  subscription?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  paymentDate?: string | null;
}

// deno-lint-ignore no-explicit-any
export function buildTrustedPayment(eventPayment: any, asaasPayment: any): TrustedPayment {
  if (!eventPayment?.id) {
    throw new Error('Evento sem identificação de pagamento.');
  }
  if (!asaasPayment?.id || asaasPayment.id !== eventPayment.id) {
    throw new Error(`Pagamento ${eventPayment.id} não confirmado pelo Asaas.`);
  }
  return {
    id: asaasPayment.id,
    status: asaasPayment.deleted === true ? 'DELETED' : asaasPayment.status,
    value: asaasPayment.value,
    dueDate: asaasPayment.dueDate,
    billingType: asaasPayment.billingType,
    subscription: asaasPayment.subscription ?? null,
    invoiceUrl: asaasPayment.invoiceUrl ?? null,
    bankSlipUrl: asaasPayment.bankSlipUrl ?? null,
    paymentDate: asaasPayment.paymentDate ?? asaasPayment.clientPaymentDate ?? null,
  };
}
