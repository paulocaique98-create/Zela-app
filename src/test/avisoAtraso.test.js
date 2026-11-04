import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Aviso de atraso antes do bloqueio (meu_aviso_atraso). Roda no Supabase LOCAL.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Aviso de atraso da Gestão e da Recepção', () => {
  const c = {};

  beforeAll(async () => {
    c.A = await createTestSchool();
    c.B = await createTestSchool();
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestaoA = await createTestUser({ role: 'gestao', schoolId: c.A });
    c.adminA = await createTestUser({ role: 'admin', schoolId: c.A });
    c.teacherA = await createTestUser({ role: 'teacher', schoolId: c.A });
    c.familyA = await createTestUser({ role: 'family', schoolId: c.A });
    c.gestaoB = await createTestUser({ role: 'gestao', schoolId: c.B });
    const venc = new Date(Date.now() - 3 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const { data: plano } = await adminClient.from('zela_planos').select('id').limit(1).single();
    const { data: ct, error: e1 } = await adminClient.from('school_contratacoes').insert({
      school_id: c.A, plano_id: plano.id, ciclo: 'MENSAL', meses: 1, alunos_contratados: 10, itens: [], snapshot: {},
      valor_mensal: 100, valor_ciclo: 100, implantacao_base: 0, implantacao_final: 0, status: 'ativa',
      inicio: venc, fim: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10),
    }).select('id').single();
    if (e1) throw e1;
    const { data: cob, error: e2 } = await adminClient.from('zela_cobrancas').insert({
      school_id: c.A, contratacao_id: ct.id, tipo: 'parcela', numero: 1, competencia: venc, vencimento: venc,
      valor_sistema: 100, valor_implantacao: 0, status: 'vencida', invoice_url: 'https://pagar.exemplo/a',
    }).select('id').single();
    if (e2) throw e2;
    c.cob = cob.id;
  }, 120000);

  afterAll(async () => {
    for (const s of [c.A, c.B]) {
      if (!s) continue;
      await adminClient.from('zela_cobrancas').delete().eq('school_id', s);
      await adminClient.from('school_contratacoes').delete().eq('school_id', s);
      await adminClient.from('zela_bloqueios_log').delete().eq('school_id', s);
    }
    for (const u of [c.dev, c.gestaoA, c.adminA, c.teacherA, c.familyA, c.gestaoB]) if (u?.id) await deleteTestUser(u.id);
    for (const s of [c.A, c.B]) if (s) await deleteTestSchool(s);
  }, 120000);

  it('Gestão recebe parcela, valor, dias de atraso, data do bloqueio e link', async () => {
    const { data } = await c.gestaoA.client.rpc('meu_aviso_atraso');
    expect(data.role).toBe('gestao');
    expect(data.cobranca.valor).toBe(100);
    expect(data.cobranca.numero).toBe(1);
    expect(data.cobranca.dias_atraso).toBeGreaterThanOrEqual(3);
    expect(data.cobranca.bloqueio_em).toBeTruthy();
    expect(data.cobranca.invoice_url).toBe('https://pagar.exemplo/a');
  });

  it('Recepção recebe só a data do bloqueio, sem valor nem link', async () => {
    const { data } = await c.adminA.client.rpc('meu_aviso_atraso');
    expect(data.role).toBe('admin');
    expect(data.bloqueio_em).toBeTruthy();
    expect(data.cobranca).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/pagar\.exemplo|valor/);
  });

  it('professor, família e developer não recebem aviso', async () => {
    for (const u of [c.teacherA, c.familyA, c.dev]) {
      const { data } = await u.client.rpc('meu_aviso_atraso');
      expect(data).toBeNull();
    }
  });

  it('isolamento: Gestão da escola B não vê a cobrança da A', async () => {
    const { data } = await c.gestaoB.client.rpc('meu_aviso_atraso');
    expect(data).toBeNull();
  });

  it('fontes ficam fechadas para o app e anon não chama a RPC', async () => {
    const { error } = await c.gestaoA.client.rpc('zela_cobranca_vencida_da_escola', { p_school_id: c.B });
    expect(error).not.toBeNull();
  });

  it('escola suspensa: aviso nulo (aparece a tela de bloqueio)', async () => {
    await adminClient.from('schools').update({ is_active: false }).eq('id', c.A);
    const { data } = await c.gestaoA.client.rpc('meu_aviso_atraso');
    expect(data).toBeNull();
    await adminClient.from('schools').update({ is_active: true }).eq('id', c.A);
  });

  it('o aviso some quando o pagamento é confirmado', async () => {
    await adminClient.from('zela_cobrancas').update({ status: 'paga' }).eq('id', c.cob);
    const { data: g } = await c.gestaoA.client.rpc('meu_aviso_atraso');
    const { data: a } = await c.adminA.client.rpc('meu_aviso_atraso');
    expect(g).toBeNull();
    expect(a).toBeNull();
  });
});
