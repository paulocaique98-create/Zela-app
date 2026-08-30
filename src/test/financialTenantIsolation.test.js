import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  createTestSchool,
  deleteTestSchool,
} from './supabaseTestHelpers.js';

// Teste de isolamento multi-tenant do módulo financeiro (Fases 1-16), no
// mesmo padrão de rlsTenantIsolation.test.js — escrito porque o financeiro
// lida com dinheiro e credencial de gateway (Asaas), a área mais grave se
// tivesse o mesmo tipo de bug já achado em students/authorized_persons.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Isolamento multi-tenant — módulo financeiro', () => {
  let schoolA, schoolB, adminA, adminB, familyA, familyB, studentA, contractA, chargeA;

  beforeAll(async () => {
    schoolA = await createTestSchool('Vitest Fin A');
    schoolB = await createTestSchool('Vitest Fin B');
    adminA = await createTestUser({ role: 'admin', schoolId: schoolA });
    adminB = await createTestUser({ role: 'admin', schoolId: schoolB });
    familyA = await createTestUser({ role: 'family', schoolId: schoolA, extra: { doc_type: 'cpf', doc_number: '11144477735' } });
    familyB = await createTestUser({ role: 'family', schoolId: schoolB, extra: { doc_type: 'cpf', doc_number: '52998224725' } });

    const { data: student, error: studentErr } = await adminClient
      .from('students')
      .insert({ name: 'Vitest Fin Aluno A', school_id: schoolA, family_id: familyA.id, turma: 'Infantil I' })
      .select('id')
      .single();
    if (studentErr) throw studentErr;
    studentA = student.id;

    await adminClient.from('student_guardians').insert({
      student_id: studentA, guardian_id: familyA.id, is_financial: true, school_id: schoolA,
    });

    const { data: contract, error: contractErr } = await adminClient
      .from('financial_contracts')
      .insert({
        school_id: schoolA,
        student_id: studentA,
        financial_guardian_id: familyA.id,
        billing_cycle: 'MONTHLY',
        base_monthly_amount_cents: 50000,
        amount_cents: 50000,
        first_due_date: '2026-12-01',
        status: 'active',
        gateway: 'asaas',
      })
      .select('id')
      .single();
    if (contractErr) throw contractErr;
    contractA = contract.id;

    const { data: charge, error: chargeErr } = await adminClient
      .from('financial_charges')
      .insert({
        school_id: schoolA,
        contract_id: contractA,
        student_id: studentA,
        family_id: familyA.id,
        due_date: '2026-12-01',
        available_from: '2026-12-01',
        amount_cents: 50000,
        status: 'PENDING',
        gateway: 'asaas',
        gateway_payment_id: `vitest_pay_${Date.now()}`,
      })
      .select('id')
      .single();
    if (chargeErr) throw chargeErr;
    chargeA = charge.id;

    await adminClient.from('financial_billing_discounts').insert({
      school_id: schoolA, guardian_id: familyA.id, billing_cycle: 'MONTHLY', discount_percent: 10,
    });

    await adminClient.rpc('set_cron_secret', { p_name: `vitest_gw_${schoolA}`, p_secret: 'chave-secreta-escola-a' });
    await adminClient.from('school_gateway_accounts').insert({
      school_id: schoolA, gateway: 'asaas',
      vault_secret_id: (await adminClient.from('cron_secrets').select('vault_secret_id').eq('name', `vitest_gw_${schoolA}`).single()).data.vault_secret_id,
    });
  });

  afterAll(async () => {
    await adminClient.from('school_gateway_accounts').delete().eq('school_id', schoolA);
    await adminClient.from('cron_secrets').delete().eq('name', `vitest_gw_${schoolA}`);
    await adminClient.from('financial_billing_discounts').delete().eq('school_id', schoolA);
    await adminClient.from('financial_charge_events').delete().eq('charge_id', chargeA);
    await adminClient.from('financial_charges').delete().eq('id', chargeA);
    await adminClient.from('financial_contracts').delete().eq('id', contractA);
    await adminClient.from('student_guardians').delete().eq('student_id', studentA);
    await adminClient.from('students').delete().eq('id', studentA);
    await deleteTestUser(adminA.id);
    await deleteTestUser(adminB.id);
    await deleteTestUser(familyA.id);
    await deleteTestUser(familyB.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  });

  describe('financial_contracts', () => {
    it('admin da Escola B não lê o contrato da Escola A', async () => {
      const { data } = await adminB.client.from('financial_contracts').select('id').eq('id', contractA);
      expect(data).toEqual([]);
    });

    it('admin da Escola B não atualiza o contrato da Escola A (ex: cancelar)', async () => {
      const { data } = await adminB.client.from('financial_contracts').update({ status: 'cancelled' }).eq('id', contractA).select();
      expect(data).toEqual([]);
      const { data: unchanged } = await adminClient.from('financial_contracts').select('status').eq('id', contractA).single();
      expect(unchanged.status).toBe('active');
    });

    it('admin da Escola B não exclui o contrato da Escola A', async () => {
      const { data } = await adminB.client.from('financial_contracts').delete().eq('id', contractA).select();
      expect(data).toEqual([]);
      const { data: stillThere } = await adminClient.from('financial_contracts').select('id').eq('id', contractA).maybeSingle();
      expect(stillThere).not.toBeNull();
    });

    it('família da Escola B (mesmo sendo responsável financeiro de verdade lá) não lê contrato da Escola A', async () => {
      const { data } = await familyB.client.from('financial_contracts').select('id').eq('id', contractA);
      expect(data).toEqual([]);
    });
  });

  describe('financial_charges', () => {
    it('admin da Escola B não lê a cobrança da Escola A', async () => {
      const { data } = await adminB.client.from('financial_charges').select('id').eq('id', chargeA);
      expect(data).toEqual([]);
    });

    it('admin da Escola B não marca a cobrança da Escola A como paga', async () => {
      const { data } = await adminB.client.from('financial_charges').update({ status: 'PAID' }).eq('id', chargeA).select();
      expect(data).toEqual([]);
      const { data: unchanged } = await adminClient.from('financial_charges').select('status').eq('id', chargeA).single();
      expect(unchanged.status).toBe('PENDING');
    });

    it('admin da Escola B não insere uma cobrança nova associada ao contrato da Escola A', async () => {
      const { error } = await adminB.client.from('financial_charges').insert({
        school_id: schoolA,
        contract_id: contractA,
        student_id: studentA,
        family_id: familyA.id,
        due_date: '2027-01-01',
        available_from: '2027-01-01',
        amount_cents: 50000,
        status: 'PENDING',
        gateway: 'asaas',
        gateway_payment_id: `vitest_invasor_${Date.now()}`,
      });
      expect(error).not.toBeNull();
    });

    it('família da Escola B não lê a cobrança da Escola A', async () => {
      const { data } = await familyB.client.from('financial_charges').select('id').eq('id', chargeA);
      expect(data).toEqual([]);
    });
  });

  describe('financial_billing_discounts', () => {
    it('admin da Escola B não lê a configuração de desconto da Escola A', async () => {
      const { data } = await adminB.client.from('financial_billing_discounts').select('id').eq('school_id', schoolA);
      expect(data).toEqual([]);
    });

    it('admin da Escola B não consegue gravar um desconto marcado como da Escola A', async () => {
      const { error } = await adminB.client.from('financial_billing_discounts').insert({
        school_id: schoolA, guardian_id: familyA.id, billing_cycle: 'YEARLY', discount_percent: 99,
      });
      expect(error).not.toBeNull();
    });
  });

  describe('school_gateway_accounts (status/config do gateway Asaas)', () => {
    it('admin da Escola B não vê se a Escola A tem gateway configurado', async () => {
      const { data } = await adminB.client.from('school_gateway_accounts').select('id').eq('school_id', schoolA);
      expect(data).toEqual([]);
    });

    it('a chave real da Escola A nunca é lida por caminho nenhum client-side — RPC direta continua bloqueada mesmo pra admin autenticado de outra escola', async () => {
      const { data, error } = await adminB.client.rpc('get_school_gateway_secret', { p_school_id: schoolA, p_gateway: 'asaas' });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    it('nem o admin DA PRÓPRIA escola A consegue ler a chave via RPC direta (só service_role, via Edge Function, pode)', async () => {
      const { data, error } = await adminA.client.rpc('get_school_gateway_secret', { p_school_id: schoolA, p_gateway: 'asaas' });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });
  });

  describe('payment_webhook_events e cron_secrets — só developer/service_role', () => {
    it('admin (de qualquer escola) não lê payment_webhook_events — é developer-only por design', async () => {
      const { data } = await adminA.client.from('payment_webhook_events').select('id').limit(1);
      expect(data).toEqual([]);
    });

    it('admin não lê cron_secrets — sem policy nenhuma pra client, só service_role', async () => {
      const { data, error } = await adminA.client.from('cron_secrets').select('*').limit(1);
      expect(data === null || data.length === 0 || error !== null).toBe(true);
    });
  });

  describe('usuário órfão (sem escola)', () => {
    it('não vê nenhum contrato, cobrança ou desconto financeiro de nenhuma escola', async () => {
      const orfao = await createTestUser({ role: 'family', schoolId: null });
      try {
        const [contracts, charges, discounts] = await Promise.all([
          orfao.client.from('financial_contracts').select('id'),
          orfao.client.from('financial_charges').select('id'),
          orfao.client.from('financial_billing_discounts').select('id'),
        ]);
        expect(contracts.data).toEqual([]);
        expect(charges.data).toEqual([]);
        expect(discounts.data).toEqual([]);
      } finally {
        await deleteTestUser(orfao.id);
      }
    });
  });
});
