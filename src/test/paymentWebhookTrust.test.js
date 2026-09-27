import { describe, it, expect } from 'vitest';
import { SUPABASE_URL, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Auditoria de segurança 27/09/2026 · item 14. Com o token de webhook de
// uma escola em mãos (vazamento), dava pra forjar "pagamento recebido" e
// o Zela marcava a cobrança como paga sem consultar o Asaas.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('payment-webhook · evento forjado não dá baixa em cobrança', () => {
  it('token válido + evento "PAYMENT_RECEIVED" inventado: cobrança continua PENDING', async () => {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId });
    const token = `vitest-webhook-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const paymentId = `pay_vitest_${Date.now()}`;
    const { data: student } = await adminClient.from('students')
      .insert({ school_id: schoolId, family_id: family.id, name: 'Vitest Cobrança Webhook', turma: 'Nido' }).select('id').single();
    let chargeId;
    try {
      const { error: tokenErr } = await adminClient.rpc('set_school_gateway_secret', { p_school_id: schoolId, p_gateway: 'asaas_webhook', p_secret: token });
      expect(tokenErr).toBeNull();

      const { data: charge, error: chargeErr } = await adminClient.from('financial_charges').insert({
        school_id: schoolId, student_id: student.id, family_id: family.id, due_date: '2026-10-10', available_from: '2026-10-10',
        amount_cents: 85000, status: 'PENDING', gateway: 'asaas', gateway_payment_id: paymentId,
      }).select('id').single();
      expect(chargeErr).toBeNull();
      chargeId = charge.id;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'asaas-access-token': token },
        body: JSON.stringify({
          id: `evt_vitest_${Date.now()}`,
          event: 'PAYMENT_RECEIVED',
          payment: { id: paymentId, status: 'RECEIVED', value: 850, dueDate: '2026-10-10', billingType: 'PIX', paymentDate: '2026-09-27' },
        }),
      });
      expect(res.status).toBe(200);

      const { data: after } = await adminClient.from('financial_charges').select('status, paid_at').eq('id', chargeId).single();
      expect(after.status).toBe('PENDING');
      expect(after.paid_at).toBeNull();
    } finally {
      await adminClient.from('financial_charge_events').delete().eq('charge_id', chargeId);
      await adminClient.from('financial_charges').delete().eq('school_id', schoolId);
      await adminClient.from('payment_webhook_events').delete().eq('school_id', schoolId);
      await adminClient.from('school_gateway_accounts').delete().eq('school_id', schoolId);
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});
