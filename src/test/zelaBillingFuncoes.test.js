import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SUPABASE_URL, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// create-zela-charge e zela-billing-webhook contra o SANDBOX real do Asaas e o Supabase local.
// Exige: `npx supabase functions serve --env-file <arquivo>` com ZELA_ASAAS_API_KEY (sandbox) e
// ZELA_BILLING_WEBHOOK_TOKEN, e as mesmas variáveis neste processo (ZELA_E2E=1, ZELA_ASAAS_API_KEY,
// ZELA_BILLING_WEBHOOK_TOKEN). Fora disso o arquivo é ignorado.
const ligado = hasIntegrationCredentials && process.env.ZELA_E2E === '1' && process.env.ZELA_ASAAS_API_KEY && process.env.ZELA_BILLING_WEBHOOK_TOKEN;
const runIf = ligado ? describe : describe.skip;
const ASAAS = process.env.ZELA_ASAAS_API_KEY || '';
const TOKEN = process.env.ZELA_BILLING_WEBHOOK_TOKEN || '';
const BASE = 'https://api-sandbox.asaas.com/v3';

runIf('Faturamento do Zela: funções + Asaas sandbox', () => {
  const c = {};
  const fn = (nome, body, headers) => fetch(`${SUPABASE_URL}/functions/v1/${nome}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const criar = (user, body) => fn('create-zela-charge', body, { Authorization: `Bearer ${user.session?.access_token ?? user.token}` });
  const evento = (id, paymentId, event = 'PAYMENT_RECEIVED', token = TOKEN) => fn('zela-billing-webhook', { id, event, payment: { id: paymentId } }, { 'asaas-access-token': token });
  const asaas = (path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { access_token: ASAAS, 'Content-Type': 'application/json', 'User-Agent': 'Zela-App' } }).then(r => r.json());

  beforeAll(async () => {
    c.escola = await createTestSchool();
    await adminClient.from('schools').update({ cnpj: '11222333000181', email: 'faturamento@teste.com' }).eq('id', c.escola);
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestao = await createTestUser({ role: 'gestao', schoolId: c.escola });
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
    await adminClient.from('zela_billing_eventos').delete().like('event_id', 'evt_e2e_%');
    await adminClient.from('school_contratacoes').delete().eq('school_id', c.escola);
    for (const u of [c.dev, c.gestao]) if (u?.id) await deleteTestUser(u.id);
    if (c.escola) await deleteTestSchool(c.escola);
  }, 120000);

  it('a Gestão não gera cobranças; sem token também não', async () => {
    expect((await criar(c.gestao, { action: 'criar', contratacao_id: c.ct })).status).toBe(403);
    expect((await fn('create-zela-charge', { action: 'criar', contratacao_id: c.ct }, {})).status).toBe(401);
  });

  it('developer gera os 6 links; repetir não duplica', async () => {
    const r = await criar(c.dev, { action: 'criar', contratacao_id: c.ct });
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(j.criadas).toHaveLength(6);
    const r2 = await (await criar(c.dev, { action: 'criar', contratacao_id: c.ct })).json();
    expect(r2.criadas).toHaveLength(0);
    const { data } = await adminClient.from('zela_cobrancas').select('asaas_payment_id, invoice_url').eq('contratacao_id', c.ct);
    expect(new Set(data.map(x => x.asaas_payment_id)).size).toBe(6);
    expect(data.every(x => x.invoice_url)).toBe(true);
  }, 120000);

  it('webhook: token errado 401; evento de pagamento ainda pendente no Asaas não baixa nada', async () => {
    const { data: p1 } = await adminClient.from('zela_cobrancas').select('id, asaas_payment_id').eq('contratacao_id', c.ct).eq('numero', 1).single();
    expect((await evento('evt_e2e_x1', p1.asaas_payment_id, 'PAYMENT_RECEIVED', 'errado')).status).toBe(401);
    const r = await evento('evt_e2e_forjado', p1.asaas_payment_id);
    expect(r.status).toBe(200);
    const { data: cb } = await adminClient.from('zela_cobrancas').select('status').eq('id', p1.id).single();
    expect(cb.status).toBe('pendente');
  });

  it('pagamento real da 1ª parcela ativa a contratação; reenvio é idempotente', async () => {
    const { data: p1 } = await adminClient.from('zela_cobrancas').select('id, asaas_payment_id, valor').eq('contratacao_id', c.ct).eq('numero', 1).single();
    const baixa = await asaas(`/payments/${p1.asaas_payment_id}/receiveInCash`, { method: 'POST', body: JSON.stringify({ paymentDate: new Date().toISOString().slice(0, 10), value: Number(p1.valor), notifyCustomer: false }) });
    expect(baixa.status, JSON.stringify(baixa)).toBe('RECEIVED_IN_CASH');
    const r = await evento('evt_e2e_pago', p1.asaas_payment_id);
    expect(r.status).toBe(200);
    const { data: cb } = await adminClient.from('zela_cobrancas').select('status, paga_em').eq('id', p1.id).single();
    expect(cb.status).toBe('paga');
    const { data: ct } = await adminClient.from('school_contratacoes').select('status').eq('id', c.ct).single();
    expect(ct.status).toBe('ativa');
    const dup = await (await evento('evt_e2e_pago', p1.asaas_payment_id)).json();
    expect(dup.duplicate).toBe(true);
  }, 120000);

  it('novo vencimento e cancelamento de outra parcela refletem no Asaas', async () => {
    const { data: p2 } = await adminClient.from('zela_cobrancas').select('id, asaas_payment_id').eq('contratacao_id', c.ct).eq('numero', 2).single();
    const venc = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    const r = await criar(c.dev, { action: 'novo_vencimento', cobranca_id: p2.id, vencimento: venc });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect((await asaas(`/payments/${p2.asaas_payment_id}`)).dueDate).toBe(venc);
    expect((await criar(c.dev, { action: 'cancelar', cobranca_id: p2.id })).status).toBe(200);
    expect((await asaas(`/payments/${p2.asaas_payment_id}`)).deleted).toBe(true);
    const { data: cb } = await adminClient.from('zela_cobrancas').select('status').eq('id', p2.id).single();
    expect(cb.status).toBe('cancelada');
  }, 120000);
});

runIf('Faturamento do Zela: assinatura do Mensal só depois da 1ª parcela paga', () => {
  const c = {};
  const fn = (nome, body, headers) => fetch(`${SUPABASE_URL}/functions/v1/${nome}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const criar = (body) => fn('create-zela-charge', body, { Authorization: `Bearer ${c.dev.session?.access_token ?? c.dev.token}` });
  const evento = (id, paymentId) => fn('zela-billing-webhook', { id, event: 'PAYMENT_RECEIVED', payment: { id: paymentId } }, { 'asaas-access-token': TOKEN });
  const asaas = (path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { access_token: ASAAS, 'Content-Type': 'application/json', 'User-Agent': 'Zela-App' } }).then(r => r.json());
  const assinaturasNoAsaas = async () => ((await asaas(`/subscriptions?externalReference=${encodeURIComponent(`contratacao:${c.ct}`)}&limit=20`)).data || []).filter(x => !x.deleted);

  beforeAll(async () => {
    c.escola = await createTestSchool();
    await adminClient.from('schools').update({ cnpj: '11222333000181', email: 'faturamento@teste.com' }).eq('id', c.escola);
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    const { data: plano } = await adminClient.from('zela_planos').select('id').eq('modalidade', 'pacote').eq('ativo', true).order('ordem').limit(1).single();
    const { data: faixa } = await adminClient.from('zela_pacote_faixas').select('faixa').eq('plano_id', plano.id).order('faixa').limit(1).maybeSingle();
    const { data: id, error } = await c.dev.client.rpc('contratar_plano_com_condicao', {
      p_school_id: c.escola, p_plano_id: plano.id, p_condicao: 'mensal', p_alunos: faixa?.faixa ?? 20,
    });
    if (error) throw error;
    c.ct = id;
  }, 120000);

  afterAll(async () => {
    for (const s of await assinaturasNoAsaas().catch(() => [])) await asaas(`/subscriptions/${s.id}`, { method: 'DELETE' }).catch(() => {});
    const { data: cobs } = await adminClient.from('zela_cobrancas').select('asaas_payment_id').eq('school_id', c.escola);
    for (const x of cobs || []) if (x.asaas_payment_id) await asaas(`/payments/${x.asaas_payment_id}`, { method: 'DELETE' }).catch(() => {});
    await adminClient.from('zela_billing_eventos').delete().like('event_id', 'evt_e2e_m_%');
    await adminClient.from('school_contratacoes').delete().eq('school_id', c.escola);
    if (c.dev?.id) await deleteTestUser(c.dev.id);
    if (c.escola) await deleteTestSchool(c.escola);
  }, 120000);

  it('gerar links NÃO cria a assinatura', async () => {
    const r = await criar({ action: 'criar', contratacao_id: c.ct });
    expect(r.status).toBe(200);
    const { data: ct } = await adminClient.from('school_contratacoes').select('asaas_subscription_id').eq('id', c.ct).single();
    expect(ct.asaas_subscription_id).toBeNull();
    expect(await assinaturasNoAsaas()).toHaveLength(0);
  }, 120000);

  it('1ª parcela paga cria a assinatura uma única vez, mesmo com eventos repetidos e novo gerar links', async () => {
    const { data: p1 } = await adminClient.from('zela_cobrancas').select('asaas_payment_id, valor').eq('contratacao_id', c.ct).eq('numero', 1).single();
    const baixa = await asaas(`/payments/${p1.asaas_payment_id}/receiveInCash`, { method: 'POST', body: JSON.stringify({ paymentDate: new Date().toISOString().slice(0, 10), value: Number(p1.valor), notifyCustomer: false }) });
    expect(baixa.status, JSON.stringify(baixa)).toBe('RECEIVED_IN_CASH');
    expect((await evento('evt_e2e_m_1', p1.asaas_payment_id)).status).toBe(200);
    const { data: ct } = await adminClient.from('school_contratacoes').select('status, asaas_subscription_id').eq('id', c.ct).single();
    expect(ct.status).toBe('ativa');
    expect(ct.asaas_subscription_id).toBeTruthy();
    await evento('evt_e2e_m_2', p1.asaas_payment_id);
    await criar({ action: 'criar', contratacao_id: c.ct });
    const { data: depois } = await adminClient.from('school_contratacoes').select('asaas_subscription_id').eq('id', c.ct).single();
    expect(depois.asaas_subscription_id).toBe(ct.asaas_subscription_id);
    expect(await assinaturasNoAsaas()).toHaveLength(1);
  }, 120000);
});
