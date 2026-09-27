import { describe, it, expect } from 'vitest';
import { buildTrustedPayment } from '../../supabase/functions/_shared/trustedPayment.ts';

// Item 14 da auditoria: o webhook nunca confia no conteúdo do evento; só
// no que o próprio Asaas responde ao consultar o pagamento.
describe('buildTrustedPayment', () => {
  const asaasReal = {
    id: 'pay_123', status: 'PENDING', value: 850.5, dueDate: '2026-10-10', billingType: 'PIX',
    subscription: 'sub_1', invoiceUrl: 'https://asaas/i', bankSlipUrl: null, paymentDate: null,
  };

  it('evento forjado dizendo "RECEIVED" com outro valor: vale o status e o valor do Asaas', () => {
    const forjado = { id: 'pay_123', status: 'RECEIVED', value: 1, dueDate: '2020-01-01', paymentDate: '2026-09-27' };
    const trusted = buildTrustedPayment(forjado, asaasReal);
    expect(trusted.status).toBe('PENDING');
    expect(trusted.value).toBe(850.5);
    expect(trusted.dueDate).toBe('2026-10-10');
    expect(trusted.paymentDate).toBeNull();
  });

  it('pagamento confirmado de verdade pelo Asaas: usa os dados do Asaas', () => {
    const trusted = buildTrustedPayment({ id: 'pay_123' }, { ...asaasReal, status: 'RECEIVED', paymentDate: '2026-09-27' });
    expect(trusted.status).toBe('RECEIVED');
    expect(trusted.paymentDate).toBe('2026-09-27');
    expect(trusted.subscription).toBe('sub_1');
  });

  it('recusa quando o Asaas devolve outro pagamento ou nada', () => {
    expect(() => buildTrustedPayment({ id: 'pay_123' }, { ...asaasReal, id: 'pay_999' })).toThrow();
    expect(() => buildTrustedPayment({ id: 'pay_123' }, null)).toThrow();
    expect(() => buildTrustedPayment({}, asaasReal)).toThrow();
  });

  it('pagamento excluído no Asaas vira DELETED', () => {
    expect(buildTrustedPayment({ id: 'pay_123' }, { ...asaasReal, deleted: true }).status).toBe('DELETED');
  });
});
