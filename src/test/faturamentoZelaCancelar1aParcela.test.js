import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Faturamento 12.12: 1ª parcela não paga vira SUGESTÃO de cancelamento (nada cancela sozinho).
// Roda contra o Supabase LOCAL (Docker).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const diaBr = (offset) => new Date(Date.now() + offset * 86400000)
  .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

runIf('Sugestão de cancelar 1ª parcela não paga (12.12)', () => {
  const c = {};

  const contratar = async (schoolId) => {
    const { data: id, error } = await c.dev.client.rpc('contratar_plano_com_condicao', {
      p_school_id: schoolId, p_plano_id: c.plano, p_condicao: 'mensal', p_alunos: c.faixa,
    });
    if (error) throw error;
    const { data: cob } = await adminClient.from('zela_cobrancas').select('id').eq('contratacao_id', id).eq('numero', 1).single();
    return { ct: id, cob: cob.id };
  };
  const venc = (cob, status, offset) => adminClient.from('zela_cobrancas').update({ status, vencimento: diaBr(offset) }).eq('id', cob);
  const lista = async (client = c.dev.client) => client.rpc('zela_contratacoes_para_cancelar');
  const ids = (r) => (r.data || []).map(x => x.contratacao_id);

  beforeAll(async () => {
    c.schoolA = await createTestSchool();
    c.schoolB = await createTestSchool();
    for (const s of [c.schoolA, c.schoolB]) await adminClient.from('schools').update({ cnpj: '11222333000181', email: 'a@teste.com' }).eq('id', s);
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestao = await createTestUser({ role: 'gestao', schoolId: c.schoolA });
    const { data: plano } = await adminClient.from('zela_planos').select('id').eq('modalidade', 'pacote').eq('ativo', true).order('ordem').limit(1).single();
    c.plano = plano.id;
    const { data: faixa } = await adminClient.from('zela_pacote_faixas').select('faixa').eq('plano_id', plano.id).order('faixa').limit(1).maybeSingle();
    c.faixa = faixa?.faixa ?? 20;
    const { data: cfg } = await adminClient.from('zela_config_comercial').select('cancelar_1a_parcela_dias').eq('id', true).single();
    c.dias = cfg.cancelar_1a_parcela_dias;
    c.a = await contratar(c.schoolA);
    c.b = await contratar(c.schoolB);
  }, 120000);

  afterAll(async () => {
    for (const s of [c.schoolA, c.schoolB]) {
      if (!s) continue;
      await adminClient.from('school_contratacoes').delete().eq('school_id', s);
      await adminClient.from('school_feature_changes').delete().eq('school_id', s);
    }
    for (const u of [c.dev, c.gestao]) if (u?.id) await deleteTestUser(u.id);
    for (const s of [c.schoolA, c.schoolB]) if (s) await deleteTestSchool(s);
  }, 120000);

  it('padrão de 30 dias e contrato aguardando pagamento', async () => {
    expect(c.dias).toBe(30);
    const { data } = await adminClient.from('school_contratacoes').select('status').eq('id', c.a.ct).single();
    expect(data.status).toBe('aguardando_pagamento');
  });

  it('um dia antes do limite não lista; no dia exato lista, e nada é cancelado', async () => {
    await venc(c.a.cob, 'vencida', -(c.dias - 1));
    expect(ids(await lista())).not.toContain(c.a.ct);

    await venc(c.a.cob, 'pendente', -c.dias);
    const r = await lista();
    expect(r.error).toBeNull();
    const item = r.data.find(x => x.contratacao_id === c.a.ct);
    expect(item).toMatchObject({ school_id: c.schoolA, parcela_numero: 1, dias_atraso: c.dias, limite_dias: c.dias });

    await adminClient.rpc('zela_faturamento_rotina');
    const { data } = await adminClient.from('school_contratacoes').select('status').eq('id', c.a.ct).single();
    expect(data.status).toBe('aguardando_pagamento');
  });

  it('não lista se há parcela paga, nem contrato ativo ou cancelado', async () => {
    await venc(c.a.cob, 'paga', -60);
    expect(ids(await lista())).not.toContain(c.a.ct);

    await venc(c.a.cob, 'vencida', -60);
    expect(ids(await lista())).toContain(c.a.ct);

    await adminClient.rpc('zela_ativar_contratacao', { p_contratacao_id: c.a.ct });
    expect(ids(await lista())).not.toContain(c.a.ct);
  });

  it('respeita o valor configurado', async () => {
    await venc(c.b.cob, 'vencida', -10);
    expect(ids(await lista())).not.toContain(c.b.ct);
    await adminClient.from('zela_config_comercial').update({ cancelar_1a_parcela_dias: 7 }).eq('id', true);
    try {
      expect(ids(await lista())).toContain(c.b.ct);
    } finally {
      await adminClient.from('zela_config_comercial').update({ cancelar_1a_parcela_dias: c.dias }).eq('id', true);
    }
    const { error } = await adminClient.from('zela_config_comercial').update({ cancelar_1a_parcela_dias: 6 }).eq('id', true);
    expect(error).not.toBeNull();
  });

  it('só developer lê; Gestão da escola e anon recebem erro', async () => {
    const g = await lista(c.gestao.client);
    expect(g.error).not.toBeNull();
    expect(g.data ?? []).toHaveLength(0);
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321', process.env.VITE_SUPABASE_ANON_KEY);
    expect((await lista(anon)).error).not.toBeNull();
  });

  it('cancelar pelo RPC grava a trilha com quem cancelou', async () => {
    await venc(c.b.cob, 'vencida', -60);
    const r = await c.dev.client.rpc('zela_contratacao_cancelar_pendente', { p_contratacao_id: c.b.ct });
    expect(r.error).toBeNull();
    const { data } = await adminClient.from('zela_planos_historico').select('acao, changed_by, depois')
      .eq('tabela', 'school_contratacoes').eq('registro_id', c.b.ct);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ acao: 'CANCELAR', changed_by: c.dev.id });
    expect(data[0].depois.school_id).toBe(c.schoolB);
    expect(ids(await lista())).not.toContain(c.b.ct);
    await adminClient.from('zela_planos_historico').delete().eq('registro_id', c.b.ct);
  });
});
