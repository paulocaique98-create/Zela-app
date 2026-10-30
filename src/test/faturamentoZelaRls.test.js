import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Faturamento do Zela Edu (etapas A e B): contratação por condição, cobranças, ações do Portal do Dev e
// isolamento entre escolas. Roda contra o Supabase LOCAL (Docker).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Faturamento do Zela (RLS e RPC)', () => {
  const c = {};

  beforeAll(async () => {
    c.escolaA = await createTestSchool();
    c.escolaB = await createTestSchool();
    await adminClient.from('schools').update({ cnpj: '11222333000181', email: 'a@teste.com' }).eq('id', c.escolaA);
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestao = await createTestUser({ role: 'gestao', schoolId: c.escolaA });
    c.gestaoB = await createTestUser({ role: 'gestao', schoolId: c.escolaB });

    const { data: plano, error } = await adminClient.from('zela_planos').select('id').eq('modalidade', 'pacote').eq('ativo', true).order('ordem').limit(1).single();
    if (error) throw error;
    c.plano = plano.id;
    const { data: faixa } = await adminClient.from('zela_pacote_faixas').select('faixa').eq('plano_id', c.plano).order('faixa').limit(1).maybeSingle();
    c.alunos = faixa?.faixa ?? 20;
  }, 120000);

  afterAll(async () => {
    for (const s of [c.escolaA, c.escolaB]) {
      if (!s) continue;
      await adminClient.from('school_contratacoes').delete().eq('school_id', s);
      await adminClient.from('school_feature_changes').delete().eq('school_id', s);
    }
    for (const u of [c.dev, c.gestao, c.gestaoB]) if (u?.id) await deleteTestUser(u.id);
    for (const s of [c.escolaA, c.escolaB]) if (s) await deleteTestSchool(s);
  }, 120000);

  const contratar = (client, condicao = 'anual_6x') => client.rpc('contratar_plano_com_condicao', {
    p_school_id: c.escolaA, p_plano_id: c.plano, p_condicao: condicao, p_alunos: c.alunos,
  });

  it('só o developer contrata e a Gestão é recusada', async () => {
    const { error } = await contratar(c.gestao.client);
    expect(error).not.toBeNull();
  });

  it('contrata em 6x: 6 parcelas a cada 2 meses, soma igual ao total, contrato aguardando pagamento', async () => {
    const { data: id, error } = await contratar(c.dev.client);
    expect(error).toBeNull();
    c.ct = id;
    const { data: cobs } = await c.dev.client.from('zela_cobrancas').select('numero, vencimento, valor, status').eq('contratacao_id', id).order('numero');
    expect(cobs).toHaveLength(6);
    expect(cobs.every(x => x.status === 'pendente')).toBe(true);
    const { data: ct } = await adminClient.from('school_contratacoes').select('status, valor_ciclo, implantacao_final').eq('id', id).single();
    expect(ct.status).toBe('aguardando_pagamento');
    const soma = cobs.reduce((s, x) => s + Number(x.valor), 0);
    expect(Math.round(soma * 100)).toBe(Math.round((Number(ct.valor_ciclo) + Number(ct.implantacao_final)) * 100));
  });

  it('recusa uma 2ª contratação enquanto há uma aguardando pagamento', async () => {
    const { error } = await contratar(c.dev.client, 'mensal');
    expect(error?.message).toMatch(/aguardando pagamento/i);
  });

  it('escola B não vê as cobranças da escola A; a Gestão A vê só as dela', async () => {
    const b = await c.gestaoB.client.from('zela_cobrancas').select('id').limit(50);
    expect(b.error).toBeNull();
    expect(b.data).toHaveLength(0);
    const a = await c.gestao.client.from('zela_cobrancas').select('id, school_id').limit(50);
    expect(a.data.length).toBe(6);
    expect(a.data.every(x => x.school_id === c.escolaA)).toBe(true);
  });

  it('a Gestão não altera cobranças nem suspende', async () => {
    const { data: cobs } = await c.dev.client.from('zela_cobrancas').select('id').eq('contratacao_id', c.ct).order('numero');
    const r1 = await c.gestao.client.rpc('zela_cobranca_cancelar', { p_cobranca_id: cobs[2].id });
    const r2 = await c.gestao.client.rpc('zela_contratacao_suspender', { p_contratacao_id: c.ct });
    expect(r1.error).not.toBeNull();
    expect(r2.error).not.toBeNull();
    const w = await c.gestao.client.from('zela_cobrancas').update({ status: 'paga' }).eq('id', cobs[0].id).select('id');
    expect(w.data ?? []).toHaveLength(0);
  });

  it('baixa manual da 1ª parcela ativa a contratação; segunda baixa é recusada', async () => {
    const { data: cobs } = await c.dev.client.from('zela_cobrancas').select('id').eq('contratacao_id', c.ct).order('numero');
    const r = await c.dev.client.rpc('zela_cobranca_marcar_paga', { p_cobranca_id: cobs[0].id, p_comprovante: 'pix teste' });
    expect(r.error).toBeNull();
    const { data: ct } = await adminClient.from('school_contratacoes').select('status').eq('id', c.ct).single();
    expect(ct.status).toBe('ativa');
    const dupla = await c.dev.client.rpc('zela_cobranca_marcar_paga', { p_cobranca_id: cobs[0].id });
    expect(dupla.error).not.toBeNull();
  });

  it('novo vencimento e cancelamento só em cobrança em aberto; vencimento no passado é recusado', async () => {
    const { data: cobs } = await c.dev.client.from('zela_cobrancas').select('id').eq('contratacao_id', c.ct).order('numero');
    const passado = await c.dev.client.rpc('zela_cobranca_novo_vencimento', { p_cobranca_id: cobs[1].id, p_vencimento: '2020-01-01' });
    expect(passado.error).not.toBeNull();
    const futuro = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    expect((await c.dev.client.rpc('zela_cobranca_novo_vencimento', { p_cobranca_id: cobs[1].id, p_vencimento: futuro })).error).toBeNull();
    expect((await c.dev.client.rpc('zela_cobranca_cancelar', { p_cobranca_id: cobs[5].id })).error).toBeNull();
    expect((await c.dev.client.rpc('zela_cobranca_cancelar', { p_cobranca_id: cobs[0].id })).error).not.toBeNull();
  });

  it('suspender derruba a escola e reativar devolve o acesso', async () => {
    expect((await c.dev.client.rpc('zela_contratacao_suspender', { p_contratacao_id: c.ct })).error).toBeNull();
    let { data: s } = await adminClient.from('schools').select('is_active').eq('id', c.escolaA).single();
    expect(s.is_active).toBe(false);
    expect((await c.dev.client.rpc('zela_contratacao_reativar', { p_contratacao_id: c.ct })).error).toBeNull();
    ({ data: s } = await adminClient.from('schools').select('is_active').eq('id', c.escolaA).single());
    expect(s.is_active).toBe(true);
  });
});
