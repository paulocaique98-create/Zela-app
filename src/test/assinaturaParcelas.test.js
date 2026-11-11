import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials, SUPABASE_URL, ANON_KEY } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Assinatura no portal da escola (minhas_parcelas_zela). Roda no Supabase LOCAL.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Parcelas do Zela no portal da Gestão', () => {
  const c = {};
  const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  beforeAll(async () => {
    c.A = await createTestSchool();
    c.B = await createTestSchool();
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestaoA = await createTestUser({ role: 'gestao', schoolId: c.A });
    c.adminA = await createTestUser({ role: 'recepcao', schoolId: c.A });
    c.teacherA = await createTestUser({ role: 'teacher', schoolId: c.A });
    c.familyA = await createTestUser({ role: 'family', schoolId: c.A });
    c.gestaoB = await createTestUser({ role: 'gestao', schoolId: c.B });
    const { data: plano } = await adminClient.from('zela_planos').select('id').limit(1).single();
    const { data: ct, error: e1 } = await adminClient.from('school_contratacoes').insert({
      school_id: c.A, plano_id: plano.id, ciclo: 'MENSAL', meses: 1, alunos_contratados: 10, itens: [], snapshot: {},
      valor_mensal: 100, valor_ciclo: 100, implantacao_base: 0, implantacao_final: 0, status: 'ativa',
      inicio: dia(-40), fim: dia(300),
    }).select('id').single();
    if (e1) throw e1;
    const base = { school_id: c.A, contratacao_id: ct.id, tipo: 'parcela', valor_sistema: 100, valor_implantacao: 0 };
    const { error: e2 } = await adminClient.from('zela_cobrancas').insert([
      { ...base, numero: 1, competencia: dia(-35), vencimento: dia(-35), status: 'paga', asaas_payment_id: 'pay_seg_1', invoice_url: 'https://pagar.exemplo/1', comprovante: 'segredo-interno' },
      { ...base, numero: 2, competencia: dia(-5), vencimento: dia(-5), status: 'vencida', asaas_payment_id: 'pay_seg_2', invoice_url: 'https://pagar.exemplo/2' },
      { ...base, numero: 3, competencia: dia(25), vencimento: dia(25), status: 'pendente', asaas_payment_id: 'pay_seg_3', invoice_url: 'https://pagar.exemplo/3' },
    ]);
    if (e2) throw e2;
  }, 120000);

  afterAll(async () => {
    for (const s of [c.A, c.B]) {
      if (!s) continue;
      await adminClient.from('zela_cobrancas').delete().eq('school_id', s);
      await adminClient.from('school_contratacoes').delete().eq('school_id', s);
    }
    for (const u of [c.dev, c.gestaoA, c.adminA, c.teacherA, c.familyA, c.gestaoB]) if (u?.id) await deleteTestUser(u.id);
    for (const s of [c.A, c.B]) if (s) await deleteTestSchool(s);
  }, 120000);

  it('Gestão vê todas as parcelas da própria escola, em ordem de vencimento', async () => {
    const { data, error } = await c.gestaoA.client.rpc('minhas_parcelas_zela');
    expect(error).toBeNull();
    expect(data.map(p => p.numero)).toEqual([1, 2, 3]);
    expect(data.map(p => p.status)).toEqual(['paga', 'vencida', 'pendente']);
  });

  it('link só nas parcelas em aberto e sem ids do Asaas nem comprovante', async () => {
    const { data } = await c.gestaoA.client.rpc('minhas_parcelas_zela');
    expect(data[0].invoice_url).toBeNull();
    expect(data[1].invoice_url).toBe('https://pagar.exemplo/2');
    expect(data[2].invoice_url).toBe('https://pagar.exemplo/3');
    expect(JSON.stringify(data)).not.toMatch(/pay_seg|segredo-interno|asaas|comprovante|marcada_paga/);
  });

  it('Recepção, professor, família e developer recebem lista vazia', async () => {
    for (const u of [c.adminA, c.teacherA, c.familyA, c.dev]) {
      const { data, error } = await u.client.rpc('minhas_parcelas_zela');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it('isolamento: Gestão da escola B não vê as parcelas da A', async () => {
    const { data } = await c.gestaoB.client.rpc('minhas_parcelas_zela');
    expect(data).toEqual([]);
  });

  it('anon não chama a RPC', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await anon.rpc('minhas_parcelas_zela');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('escola suspensa: a Gestão ainda vê as parcelas e o link da vencida', async () => {
    await adminClient.from('schools').update({ is_active: false }).eq('id', c.A);
    const { data } = await c.gestaoA.client.rpc('minhas_parcelas_zela');
    await adminClient.from('schools').update({ is_active: true }).eq('id', c.A);
    expect(data).toHaveLength(3);
    expect(data[1].invoice_url).toBe('https://pagar.exemplo/2');
  });
});
