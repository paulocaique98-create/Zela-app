import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Faturamento do Zela (item 11): rotina diária. Carência exata, idempotência, pago e cancelado intocados,
// escola_liberada alinhada à suspensão e reativação ao pagar. Roda contra o Supabase LOCAL (Docker).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

// Mesma data que a rotina usa (America/Sao_Paulo).
const diaBr = (offset) => new Date(Date.now() + offset * 86400000)
  .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

runIf('Rotina de faturamento: vencida, carência, suspensão e reativação', () => {
  const c = {};

  beforeAll(async () => {
    c.school = await createTestSchool();
    await adminClient.from('schools').update({ cnpj: '11222333000181', email: 'a@teste.com' }).eq('id', c.school);
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    const { data: plano, error } = await adminClient.from('zela_planos').select('id').eq('modalidade', 'pacote').eq('ativo', true).order('ordem').limit(1).single();
    if (error) throw error;
    const { data: faixa } = await adminClient.from('zela_pacote_faixas').select('faixa').eq('plano_id', plano.id).order('faixa').limit(1).maybeSingle();
    const { data: id, error: e2 } = await c.dev.client.rpc('contratar_plano_com_condicao', {
      p_school_id: c.school, p_plano_id: plano.id, p_condicao: 'mensal', p_alunos: faixa?.faixa ?? 20,
    });
    if (e2) throw e2;
    c.ct = id;
    await adminClient.rpc('zela_ativar_contratacao', { p_contratacao_id: id });
    const { data: cob } = await adminClient.from('zela_cobrancas').select('id').eq('contratacao_id', id).eq('numero', 1).single();
    c.cob = cob.id;
    const { data: cfg } = await adminClient.from('zela_config_comercial').select('carencia_dias').eq('id', true).single();
    c.carencia = cfg.carencia_dias;
  }, 120000);

  afterAll(async () => {
    if (c.school) {
      await adminClient.from('school_contratacoes').delete().eq('school_id', c.school);
      await adminClient.from('school_feature_changes').delete().eq('school_id', c.school);
    }
    if (c.dev?.id) await deleteTestUser(c.dev.id);
    if (c.school) await deleteTestSchool(c.school);
  }, 120000);

  const estado = async () => {
    const ct = await adminClient.from('school_contratacoes').select('status').eq('id', c.ct).single();
    const es = await adminClient.from('schools').select('is_active').eq('id', c.school).single();
    const lib = await adminClient.rpc('escola_liberada', { p_school_id: c.school });
    return { contrato: ct.data.status, ativa: es.data.is_active, liberada: lib.data };
  };
  const cobranca = (status, offset) => adminClient.from('zela_cobrancas')
    .update({ status, vencimento: diaBr(offset) }).eq('id', c.cob);

  it('pendente no prazo continua pendente; paga e cancelada nunca viram vencida', async () => {
    await cobranca('pendente', 5);
    await adminClient.rpc('zela_faturamento_rotina');
    expect((await adminClient.from('zela_cobrancas').select('status').eq('id', c.cob).single()).data.status).toBe('pendente');

    for (const st of ['paga', 'cancelada']) {
      await cobranca(st, -200);
      await adminClient.rpc('zela_faturamento_rotina');
      expect((await adminClient.from('zela_cobrancas').select('status').eq('id', c.cob).single()).data.status).toBe(st);
    }
    expect(await estado()).toEqual({ contrato: 'ativa', ativa: true, liberada: true });
  });

  it('um dia antes da carência não suspende; no dia exato da carência suspende', async () => {
    await cobranca('pendente', -(c.carencia - 1));
    await adminClient.rpc('zela_faturamento_rotina');
    expect(await estado()).toEqual({ contrato: 'ativa', ativa: true, liberada: true });

    await cobranca('vencida', -c.carencia);
    const r = await adminClient.rpc('zela_faturamento_rotina');
    expect(r.error).toBeNull();
    expect(r.data.suspensas).toBeGreaterThanOrEqual(1);
    expect(await estado()).toEqual({ contrato: 'suspensa', ativa: false, liberada: false });
  });

  it('rodar de novo não suspende outra vez nem muda nada (idempotente)', async () => {
    const r = await adminClient.rpc('zela_faturamento_rotina');
    expect(r.error).toBeNull();
    expect(r.data.suspensas).toBe(0);
    expect(await estado()).toEqual({ contrato: 'suspensa', ativa: false, liberada: false });
  });

  it('o developer paga a parcela vencida: contrato volta a ativa e a escola é liberada', async () => {
    const r = await c.dev.client.rpc('zela_cobranca_marcar_paga', { p_cobranca_id: c.cob });
    expect(r.error).toBeNull();
    expect(await estado()).toEqual({ contrato: 'ativa', ativa: true, liberada: true });
  });
});
