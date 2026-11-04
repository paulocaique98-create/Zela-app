import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SUPABASE_URL, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// 12.12 ponta a ponta: contratação com 1ª parcela vencida há 30 dias entra na lista de sugestões; ao confirmar,
// o boleto é cancelado no Asaas (SANDBOX real) e depois a contratação no banco. Boleto cancelado não aceita
// pagamento e um evento de pagamento depois disso não ativa o contrato.
// Exige as mesmas variáveis e o `functions serve` descritos em zelaBillingFuncoes.test.js (ZELA_E2E=1).
const ligado = hasIntegrationCredentials && process.env.ZELA_E2E === '1' && process.env.ZELA_ASAAS_API_KEY && process.env.ZELA_BILLING_WEBHOOK_TOKEN;
const runIf = ligado ? describe : describe.skip;
const ASAAS = process.env.ZELA_ASAAS_API_KEY || '';
const TOKEN = process.env.ZELA_BILLING_WEBHOOK_TOKEN || '';
const BASE = 'https://api-sandbox.asaas.com/v3';
const diaBr = (offset) => new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

runIf('12.12 ponta a ponta: cancelar 1ª parcela não paga no Asaas sandbox', () => {
  const c = {};
  const fn = (nome, body, headers) => fetch(`${SUPABASE_URL}/functions/v1/${nome}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const criar = (body) => fn('create-zela-charge', body, { Authorization: `Bearer ${c.dev.session?.access_token ?? c.dev.token}` });
  const asaas = (path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { access_token: ASAAS, 'Content-Type': 'application/json', 'User-Agent': 'Zela-App' } }).then(async r => ({ http: r.status, ...(await r.json()) }));

  beforeAll(async () => {
    c.escola = await createTestSchool();
    await adminClient.from('schools').update({ cnpj: '11222333000181', email: 'faturamento@teste.com' }).eq('id', c.escola);
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    const { data: plano } = await adminClient.from('zela_planos').select('id').eq('modalidade', 'pacote').eq('ativo', true).order('ordem').limit(1).single();
    const { data: faixa } = await adminClient.from('zela_pacote_faixas').select('faixa').eq('plano_id', plano.id).order('faixa').limit(1).maybeSingle();
    const { data: id, error } = await c.dev.client.rpc('contratar_plano_com_condicao', {
      p_school_id: c.escola, p_plano_id: plano.id, p_condicao: 'anual_6x', p_alunos: faixa?.faixa ?? 20,
    });
    if (error) throw error;
    c.ct = id;
  }, 120000);

  afterAll(async () => {
    const { data: cobs } = await adminClient.from('zela_cobrancas').select('asaas_payment_id').eq('school_id', c.escola);
    for (const x of cobs || []) if (x.asaas_payment_id) await asaas(`/payments/${x.asaas_payment_id}`, { method: 'DELETE' }).catch(() => {});
    await adminClient.from('zela_billing_eventos').delete().like('event_id', 'evt_e2e_canc_%');
    await adminClient.from('zela_planos_historico').delete().eq('tabela', 'school_contratacoes').eq('registro_id', c.ct);
    await adminClient.from('school_contratacoes').delete().eq('school_id', c.escola);
    if (c.dev?.id) await deleteTestUser(c.dev.id);
    if (c.escola) await deleteTestSchool(c.escola);
  }, 120000);

  it('gera os links, deixa a 1ª parcela vencida há 30 dias e a contratação entra na lista', async () => {
    const r = await criar({ action: 'criar', contratacao_id: c.ct });
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    const { data: cobs } = await adminClient.from('zela_cobrancas').select('id, numero, asaas_payment_id').eq('contratacao_id', c.ct).order('numero');
    expect(cobs).toHaveLength(6);
    c.ids = cobs.map(x => x.asaas_payment_id);
    // Só o banco: o Asaas não aceita vencimento no passado ao criar, e a lista lê o banco.
    await adminClient.from('zela_cobrancas').update({ status: 'vencida', vencimento: diaBr(-30) }).eq('contratacao_id', c.ct).eq('numero', 1);
    const { data: lista, error } = await c.dev.client.rpc('zela_contratacoes_para_cancelar');
    expect(error).toBeNull();
    expect(lista.map(x => x.contratacao_id)).toContain(c.ct);
  }, 120000);

  it('confirmar cancela os 6 boletos no Asaas e depois a contratação no banco', async () => {
    const r = await criar({ action: 'cancelar_contratacao', contratacao_id: c.ct });
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);

    for (const id of c.ids) {
      const p = await asaas(`/payments/${id}`);
      expect(p.deleted === true || p.status === 'DELETED', `payment ${id}: ${JSON.stringify({ status: p.status, deleted: p.deleted })}`).toBe(true);
    }
    const { data: ct } = await adminClient.from('school_contratacoes').select('status').eq('id', c.ct).single();
    expect(ct.status).toBe('cancelada');
    const { data: cobs } = await adminClient.from('zela_cobrancas').select('status').eq('contratacao_id', c.ct);
    expect(cobs.every(x => x.status === 'cancelada')).toBe(true);
    const { data: hist } = await adminClient.from('zela_planos_historico').select('acao, changed_by').eq('tabela', 'school_contratacoes').eq('registro_id', c.ct);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ acao: 'CANCELAR', changed_by: c.dev.id });
    const { data: lista } = await c.dev.client.rpc('zela_contratacoes_para_cancelar');
    expect(lista.map(x => x.contratacao_id)).not.toContain(c.ct);
  }, 120000);

  it('boleto cancelado não aceita pagamento e o webhook de pagamento não ativa o contrato', async () => {
    const baixa = await asaas(`/payments/${c.ids[0]}/receiveInCash`, { method: 'POST', body: JSON.stringify({ paymentDate: diaBr(0), value: 1, notifyCustomer: false }) });
    expect(baixa.status).not.toBe('RECEIVED_IN_CASH');

    const w = await fn('zela-billing-webhook', { id: 'evt_e2e_canc_1', event: 'PAYMENT_RECEIVED', payment: { id: c.ids[0] } }, { 'asaas-access-token': TOKEN });
    expect(w.status).toBe(200);
    const { data: ct } = await adminClient.from('school_contratacoes').select('status').eq('id', c.ct).single();
    expect(ct.status).toBe('cancelada');
    const { data: escola } = await adminClient.from('schools').select('is_active').eq('id', c.escola).single();
    expect(escola.is_active).toBe(true);
    const { data: cobs } = await adminClient.from('zela_cobrancas').select('status').eq('contratacao_id', c.ct);
    expect(cobs.some(x => x.status === 'paga')).toBe(false);
  }, 120000);
});
