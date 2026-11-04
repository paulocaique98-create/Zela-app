import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Faturamento do Zela, fase 4 (9B): ajustes na ficha do contrato. Roda contra o Supabase LOCAL (Docker).
const runIf = hasIntegrationCredentials ? describe : describe.skip;
const somaDias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

runIf('Ajustes do contrato (RPC e RLS)', () => {
  const c = {};

  beforeAll(async () => {
    c.escola = await createTestSchool();
    await adminClient.from('schools').update({ cnpj: '11222333000181', email: 'a@teste.com' }).eq('id', c.escola);
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestao = await createTestUser({ role: 'gestao', schoolId: c.escola });
    const { data: plano } = await adminClient.from('zela_planos').select('id').eq('modalidade', 'pacote').eq('ativo', true).order('ordem').limit(1).single();
    const { data: faixa } = await adminClient.from('zela_pacote_faixas').select('faixa').eq('plano_id', plano.id).order('faixa').limit(1).maybeSingle();
    const { data: id, error } = await c.dev.client.rpc('contratar_plano_com_condicao', {
      p_school_id: c.escola, p_plano_id: plano.id, p_condicao: 'anual_6x', p_alunos: faixa?.faixa ?? 20,
    });
    if (error) throw error;
    c.ct = id;
    const { data: cobs } = await c.dev.client.from('zela_cobrancas').select('id, numero, valor, valor_sistema').eq('contratacao_id', id).order('numero');
    c.cobs = cobs;
  }, 120000);

  afterAll(async () => {
    if (c.escola) {
      await adminClient.from('school_contratacoes').delete().eq('school_id', c.escola);
      await adminClient.from('school_feature_changes').delete().eq('school_id', c.escola);
    }
    for (const u of [c.dev, c.gestao]) if (u?.id) await deleteTestUser(u.id);
    if (c.escola) await deleteTestSchool(c.escola);
  }, 120000);

  it('a Gestão não executa nenhum ajuste nem lê a auditoria', async () => {
    const r1 = await c.gestao.client.rpc('zela_ajustar_vencimentos', { p_contratacao_id: c.ct, p_itens: [{ cobranca_id: c.cobs[1].id, vencimento: somaDias(40) }], p_motivo: 'teste' });
    expect(r1.error).not.toBeNull();
    const r2 = await c.gestao.client.rpc('zela_aplicar_desconto_mensalidade', { p_contratacao_id: c.ct, p_a_partir: 2, p_percentual: 5, p_motivo: 'teste' });
    expect(r2.error).not.toBeNull();
    const r3 = await c.gestao.client.rpc('zela_reparcelar_saldo', { p_contratacao_id: c.ct, p_cobranca_ids: [c.cobs[1].id], p_vencimentos: [somaDias(40)], p_motivo: 'teste' });
    expect(r3.error).not.toBeNull();
    const aud = await c.gestao.client.from('zela_cobranca_ajustes').select('id').limit(5);
    expect(aud.data ?? []).toHaveLength(0);
  });

  it('motivo é obrigatório e vencimento no passado é recusado', async () => {
    const sem = await c.dev.client.rpc('zela_ajustar_vencimentos', { p_contratacao_id: c.ct, p_itens: [{ cobranca_id: c.cobs[1].id, vencimento: somaDias(40) }], p_motivo: ' ' });
    expect(sem.error?.message).toMatch(/motivo/i);
    const passado = await c.dev.client.rpc('zela_ajustar_vencimentos', { p_contratacao_id: c.ct, p_itens: [{ cobranca_id: c.cobs[1].id, vencimento: somaDias(-2) }], p_motivo: 'teste' });
    expect(passado.error?.message).toMatch(/passado/i);
  });

  it('altera vencimentos e registra quem, quando, antes e depois', async () => {
    const venc = somaDias(45);
    const { data: id, error } = await c.dev.client.rpc('zela_ajustar_vencimentos', { p_contratacao_id: c.ct, p_itens: [{ cobranca_id: c.cobs[1].id, vencimento: venc }], p_motivo: 'pedido da escola' });
    expect(error).toBeNull();
    const { data: aj } = await c.dev.client.from('zela_cobranca_ajustes').select('tipo, motivo, antes, depois, feito_por, sincronizado_asaas').eq('id', id).single();
    expect(aj.tipo).toBe('vencimentos');
    expect(aj.feito_por).toBe(c.dev.id);
    expect(aj.sincronizado_asaas).toBe(false);
    expect(aj.depois[0].vencimento).toBe(venc);
    expect(aj.antes[0].vencimento).not.toBe(venc);
  });

  it('desconto só nas opções da configuração, não acumula e remove com 0', async () => {
    const fora = await c.dev.client.rpc('zela_aplicar_desconto_mensalidade', { p_contratacao_id: c.ct, p_a_partir: 3, p_percentual: 77, p_motivo: 'teste' });
    expect(fora.error?.message).toMatch(/opções/i);
    const a = await c.dev.client.rpc('zela_aplicar_desconto_mensalidade', { p_contratacao_id: c.ct, p_a_partir: 3, p_percentual: 10, p_motivo: 'negociação' });
    expect(a.error).toBeNull();
    const b = await c.dev.client.rpc('zela_aplicar_desconto_mensalidade', { p_contratacao_id: c.ct, p_a_partir: 3, p_percentual: 10, p_motivo: 'repetido' });
    expect(b.error).toBeNull();
    const { data: p3 } = await c.dev.client.from('zela_cobrancas').select('valor_sistema, valor_sistema_original').eq('id', c.cobs[2].id).single();
    expect(Math.round(Number(p3.valor_sistema) * 100)).toBe(Math.round(Number(c.cobs[2].valor_sistema) * 90));
    const zero = await c.dev.client.rpc('zela_aplicar_desconto_mensalidade', { p_contratacao_id: c.ct, p_a_partir: 3, p_percentual: 0, p_motivo: 'desfeito' });
    expect(zero.error).toBeNull();
    const { data: volta } = await c.dev.client.from('zela_cobrancas').select('valor_sistema, valor_sistema_original').eq('id', c.cobs[2].id).single();
    expect(Number(volta.valor_sistema)).toBe(Number(c.cobs[2].valor_sistema));
    expect(volta.valor_sistema_original).toBeNull();
  });

  it('parcela paga nunca muda (vencimento, reparcelamento e desconto)', async () => {
    const pg = await c.dev.client.rpc('zela_cobranca_marcar_paga', { p_cobranca_id: c.cobs[0].id, p_comprovante: 'teste' });
    expect(pg.error).toBeNull();
    const v = await c.dev.client.rpc('zela_ajustar_vencimentos', { p_contratacao_id: c.ct, p_itens: [{ cobranca_id: c.cobs[0].id, vencimento: somaDias(50) }], p_motivo: 'teste' });
    expect(v.error?.message).toMatch(/pode ser alterada/i);
    const r = await c.dev.client.rpc('zela_reparcelar_saldo', { p_contratacao_id: c.ct, p_cobranca_ids: [c.cobs[0].id], p_vencimentos: [somaDias(50)], p_motivo: 'teste' });
    expect(r.error).not.toBeNull();
    const d = await c.dev.client.rpc('zela_aplicar_desconto_mensalidade', { p_contratacao_id: c.ct, p_a_partir: 1, p_percentual: 10, p_motivo: 'teste' });
    expect(d.error).toBeNull();
    const { data: p1 } = await c.dev.client.from('zela_cobrancas').select('valor_sistema, status').eq('id', c.cobs[0].id).single();
    expect(p1.status).toBe('paga');
    expect(Number(p1.valor_sistema)).toBe(Number(c.cobs[0].valor_sistema));
  });

  it('reparcela o saldo mantendo o total e cancelando as parcelas antigas', async () => {
    const escolhidas = [c.cobs[3], c.cobs[4]];
    const { data: antes } = await c.dev.client.from('zela_cobrancas').select('valor').in('id', escolhidas.map(x => x.id));
    const total = antes.reduce((s, x) => s + Math.round(Number(x.valor) * 100), 0);
    const { data: rp, error } = await c.dev.client.rpc('zela_reparcelar_saldo', {
      p_contratacao_id: c.ct, p_cobranca_ids: escolhidas.map(x => x.id), p_vencimentos: [somaDias(60), somaDias(90), somaDias(120)], p_motivo: 'juntar e dividir',
    });
    expect(error).toBeNull();
    const { data: novas } = await c.dev.client.from('zela_cobrancas').select('numero, valor, status').in('id', rp.novas);
    expect(novas).toHaveLength(3);
    expect(novas.reduce((s, x) => s + Math.round(Number(x.valor) * 100), 0)).toBe(total);
    expect(Math.min(...novas.map(x => x.numero))).toBeGreaterThan(6);
    const { data: velhas } = await c.dev.client.from('zela_cobrancas').select('status').in('id', escolhidas.map(x => x.id));
    expect(velhas.every(x => x.status === 'cancelada')).toBe(true);
  });
});
